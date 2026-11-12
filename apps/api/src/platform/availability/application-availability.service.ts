import { Injectable, Logger } from '@nestjs/common';

export type ApplicationAvailabilityState =
  | 'STARTING'
  | 'READY'
  | 'DEGRADED'
  | 'SHUTTING_DOWN'
  | 'STOPPED';

@Injectable()
export class ApplicationAvailabilityService {
  private readonly logger = new Logger(ApplicationAvailabilityService.name);
  private state: ApplicationAvailabilityState = 'STARTING';

  public getState(): ApplicationAvailabilityState {
    return this.state;
  }

  public markReady(): void {
    if (this.state === 'SHUTTING_DOWN' || this.state === 'STOPPED') return;
    this.transitionTo('READY');
  }

  public markDegraded(): void {
    if (this.state === 'READY' || this.state === 'DEGRADED') this.transitionTo('DEGRADED');
  }

  public beginShutdown(): void {
    if (this.state !== 'STOPPED') this.transitionTo('SHUTTING_DOWN');
  }

  public markStopped(): void {
    this.transitionTo('STOPPED');
  }

  public isReady(): boolean {
    return this.state === 'READY';
  }

  private transitionTo(next: ApplicationAvailabilityState): void {
    if (this.state === next) return;
    const previous = this.state;
    this.state = next;
    this.logger.log({ event: 'availability_transition', previous, next });
  }
}
