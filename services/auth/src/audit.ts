import type { FastifyRequest } from 'fastify';
import { prisma } from './db.js';

/** Fire-and-forget audit trail — auth events, admin actions, security signals. */
export function audit(
  action: string,
  req: FastifyRequest,
  opts: { userId?: string; detail?: Record<string, unknown> } = {},
): void {
  void prisma.auditLog
    .create({
      data: {
        action,
        userId: opts.userId ?? null,
        detail: JSON.stringify(opts.detail ?? {}),
        ip: req.ip,
      },
    })
    .catch((err) => req.log.warn({ err }, 'audit write failed'));
}
