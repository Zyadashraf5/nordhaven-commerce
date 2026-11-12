import type { Prisma } from '../../../generated/prisma/client';
import { AppError } from '../../../platform/http/app-error';

/** All credential writers acquire the owner row before touching tokens, MFA state or sessions. */
export async function lockCredentialOwner(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<{ readonly authVersion: number }> {
  await transaction.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
  const owner = await transaction.user.findUnique({
    where: { id: userId },
    select: { authVersion: true },
  });
  if (owner === null) throw AppError.unauthenticated();
  return owner;
}
