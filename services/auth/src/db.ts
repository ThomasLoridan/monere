import { PrismaClient } from '@prisma/client';

/** Single Prisma client per process. Parameterized queries by construction —
 *  no string-concatenated SQL anywhere in this codebase. */
export const prisma = new PrismaClient();
