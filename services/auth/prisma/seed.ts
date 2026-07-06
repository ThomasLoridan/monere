/**
 * Seed — creates the bootstrap admin account.
 * The generated password is printed ONCE to the console; change it after
 * first login (Compte → Sécurité, or POST /auth/password-reset).
 */
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@monere.local';

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (existing) {
    console.log(`Admin ${ADMIN_EMAIL} existe déjà — seed ignoré.`);
    return;
  }
  const password = randomBytes(12).toString('base64url');
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash,
      role: 'admin',
      emailVerified: true,
      premium: true,
      premiumSince: new Date(),
    },
  });
  console.log('┌──────────────────────────────────────────────────────────┐');
  console.log('│  COMPTE ADMINISTRATEUR CRÉÉ (affiché une seule fois)     │');
  console.log(`│  Email        : ${ADMIN_EMAIL.padEnd(41)}│`);
  console.log(`│  Mot de passe : ${password.padEnd(41)}│`);
  console.log('│  → Connectez-vous puis changez ce mot de passe.          │');
  console.log('│  → Espace admin : http://localhost:5173/#/admin          │');
  console.log('└──────────────────────────────────────────────────────────┘');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
