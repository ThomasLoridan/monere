import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validate, notFound } from '@monere/shared';
import { prisma } from '../db.js';
import { audit } from '../audit.js';

/** Administration — registered as an encapsulated plugin, admin-only. */
export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req, reply) => {
    await app.requireAdmin(req, reply);
  });

  app.get('/admin/stats', async () => {
    const [users, verified, premium, admins, alerts, activeSessions] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { emailVerified: true } }),
      prisma.user.count({ where: { premium: true } }),
      prisma.user.count({ where: { role: 'admin' } }),
      prisma.priceAlert.count({ where: { active: true } }),
      prisma.refreshToken.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    ]);
    return { users, verified, premium, admins, alerts, activeSessions };
  });

  app.get('/admin/users', async (req) => {
    const q = validate(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        search: z.string().trim().max(254).optional(),
      }),
      req.query,
    );
    const where = q.search ? { email: { contains: q.search.toLowerCase() } } : {};
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          email: true,
          role: true,
          premium: true,
          emailVerified: true,
          disabled: true,
          createdAt: true,
          lastLoginAt: true,
        },
      }),
    ]);
    return { total, page: q.page, pageSize: q.pageSize, users };
  });

  app.patch('/admin/users/:id', async (req) => {
    const params = validate(z.object({ id: z.string().cuid() }), req.params);
    const body = validate(
      z.object({
        role: z.enum(['user', 'admin']).optional(),
        premium: z.boolean().optional(),
        disabled: z.boolean().optional(),
      }),
      req.body,
    );
    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target) throw notFound('Utilisateur introuvable');

    const user = await prisma.user.update({ where: { id: params.id }, data: body });
    if (body.disabled) {
      // Disabling an account revokes all its sessions immediately
      await prisma.refreshToken.updateMany({
        where: { userId: params.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    audit('admin.user.update', req, {
      userId: req.user.sub,
      detail: { target: params.id, ...body },
    });
    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        premium: user.premium,
        disabled: user.disabled,
      },
    };
  });

  app.get('/admin/audit', async (req) => {
    const q = validate(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(50),
        action: z.string().trim().max(64).optional(),
      }),
      req.query,
    );
    const where = q.action ? { action: { startsWith: q.action } } : {};
    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { user: { select: { email: true } } },
      }),
    ]);
    return {
      total,
      page: q.page,
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        email: l.user?.email ?? null,
        detail: JSON.parse(l.detail),
        ip: l.ip,
        createdAt: l.createdAt,
      })),
    };
  });
}
