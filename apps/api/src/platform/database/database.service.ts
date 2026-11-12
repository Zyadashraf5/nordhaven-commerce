import { assertSafeDatabaseTarget } from '../config/database-target';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../generated/prisma/client';
import { ENVIRONMENT_CONFIGURATION, type EnvironmentConfiguration } from '../config/environment';

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Database operation timed out')), timeoutMs);
    timer.unref();
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('Database operation failed'));
      },
    );
  });
}

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly client: PrismaClient;
  private readonly transactionContext = new AsyncLocalStorage<Prisma.TransactionClient>();
  private readonly commitContext = new AsyncLocalStorage<(() => Promise<void>)[]>();
  private readonly rollbackContext = new AsyncLocalStorage<(() => Promise<void>)[]>();

  public constructor(
    @Inject(ENVIRONMENT_CONFIGURATION) private readonly config: EnvironmentConfiguration,
  ) {
    assertSafeDatabaseTarget(config.databaseUrl);
    const adapter = new PrismaPg({ connectionString: config.databaseUrl });
    this.client = new PrismaClient({ adapter });
  }

  /**
   * The owned Prisma client.
   *
   * Feature modules access persistence exclusively through their own repositories, which receive
   * this client. No module may hand it to another module or query another module's tables.
   */
  public get prisma(): PrismaClient {
    const transaction = this.transactionContext.getStore();
    if (transaction === undefined) return this.client;
    // Repositories retain ownership of their tables. Only an explicit business unit of work
    // joins their callback transactions; unrelated asynchronous requests keep their own client.
    return new Proxy(this.client, {
      get: (_target, property) => {
        if (property === '$transaction') {
          return (operation: unknown) => {
            if (typeof operation !== 'function') {
              throw new Error('Batch transactions cannot join a business unit of work');
            }
            return (operation as (tx: Prisma.TransactionClient) => unknown)(transaction);
          };
        }
        const value: unknown = Reflect.get(transaction, property);
        return typeof value === 'function'
          ? (value as (...args: unknown[]) => unknown).bind(transaction)
          : value;
      },
    });
  }

  /** Runs database-only business work atomically across module-owned repositories. */
  public async transaction<T>(operation: () => Promise<T>): Promise<T> {
    if (this.transactionContext.getStore() !== undefined) return operation();
    const rollbackActions: (() => Promise<void>)[] = [];
    const commitActions: (() => Promise<void>)[] = [];
    let result: T;
    try {
      result = await this.client.$transaction(
        (tx) =>
          this.transactionContext.run(tx, () =>
            this.rollbackContext.run(rollbackActions, () =>
              this.commitContext.run(commitActions, operation),
            ),
          ),
        { maxWait: 10_000, timeout: 20_000 },
      );
    } catch (error) {
      // Refused business actions still need durable facts after their enclosing work rolls back.
      // These callbacks run outside the failed transaction; never register provider/network work.
      for (const action of rollbackActions) await action();
      throw error;
    }

    // Commit effects run outside the transaction/context. Their callers must persist recovery
    // intent before registering and handle delivery failure without pretending to roll back money.
    for (const action of commitActions) await action();
    return result;
  }

  public get inTransaction(): boolean {
    return this.transactionContext.getStore() !== undefined;
  }

  public afterCommit(action: () => Promise<void>): void {
    const actions = this.commitContext.getStore();
    if (actions === undefined)
      throw new Error('Commit effects require an active business transaction');
    actions.push(action);
  }

  public afterRollback(action: () => Promise<void>): void {
    const actions = this.rollbackContext.getStore();
    if (actions === undefined)
      throw new Error('Rollback facts require an active business transaction');
    actions.push(action);
  }

  /** Locks one business aggregate until its explicit unit of work commits or rolls back. */
  public async lock(key: string): Promise<void> {
    const tx = this.transactionContext.getStore();
    if (tx === undefined) throw new Error('Business locks require an active unit of work');
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
  }

  public async connectAndProbe(): Promise<void> {
    await withTimeout(this.client.$connect(), this.config.databaseStartupTimeoutMs);
    await this.probe(this.config.databaseStartupTimeoutMs);
  }

  public async probe(timeoutMs = this.config.databaseProbeTimeoutMs): Promise<void> {
    await withTimeout(this.client.$queryRaw`SELECT 1`, timeoutMs);
  }

  public async close(): Promise<void> {
    await this.client.$disconnect();
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.close();
  }
}
