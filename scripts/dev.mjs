#!/usr/bin/env node
/**
 * Monere dev orchestrator — `npm run dev`
 *
 * 1. Bootstraps .env from .env.example on first run (generates strong secrets).
 * 2. Detects Docker: if the daemon is up → starts Postgres+Redis containers
 *    (MONERE_MODE=docker). Otherwise falls back to SQLite + in-memory cache
 *    (MONERE_MODE=local) so the stack runs with zero system dependencies.
 * 3. Prepares the database (prisma generate / db push / seed).
 * 4. Starts every micro-service (tsx watch) + the Vite frontend.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');

// ── 1. .env bootstrap ────────────────────────────────────────
if (!existsSync(envPath)) {
  let tpl = readFileSync(path.join(root, '.env.example'), 'utf8');
  tpl = tpl
    .replace(
      'JWT_SECRET=change-me-openssl-rand-hex-32',
      `JWT_SECRET=${randomBytes(32).toString('hex')}`,
    )
    .replace(
      'INTERNAL_API_KEY=change-me-openssl-rand-hex-32',
      `INTERNAL_API_KEY=${randomBytes(32).toString('hex')}`,
    )
    .replace(
      'POSTGRES_PASSWORD=change-me-strong-postgres-password',
      `POSTGRES_PASSWORD=${randomBytes(16).toString('hex')}`,
    )
    .replace(
      'S3_SECRET_KEY=change-me-minio-secret',
      `S3_SECRET_KEY=${randomBytes(16).toString('hex')}`,
    );
  writeFileSync(envPath, tpl);
  console.log('✓ .env créé depuis .env.example (secrets générés).');
  console.log(
    '  → Ajoutez vos clés FINNHUB_API_KEY / ANTHROPIC_API_KEY / RESEND_API_KEY dans .env\n',
  );
}

// Parse .env into process env for children
const envFile = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

// ── 2. Docker detection ─────────────────────────────────────
const dockerUp = spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
let mode = envFile.MONERE_MODE || 'local';
if (mode === 'docker' && !dockerUp) {
  console.log(
    '⚠ MONERE_MODE=docker mais Docker est indisponible → bascule en mode local (SQLite + cache mémoire).',
  );
  mode = 'local';
} else if (mode === 'local' && dockerUp) {
  console.log(
    'ℹ Docker détecté. Passez MONERE_MODE=docker dans .env pour utiliser Postgres + Redis.',
  );
}

if (mode === 'docker') {
  console.log('→ Démarrage de Postgres + Redis (docker compose)…');
  const r = spawnSync('docker', ['compose', 'up', '-d', 'postgres', 'redis'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const childEnv = {
  ...process.env,
  ...envFile,
  MONERE_MODE: mode,
  ...(mode === 'local'
    ? { DATABASE_URL: 'file:./dev.db' }
    : {
        DATABASE_URL:
          envFile.DATABASE_URL?.startsWith('postgresql') && envFile.DATABASE_URL
            ? envFile.DATABASE_URL
            : `postgresql://monere_auth:${envFile.AUTH_DB_PASSWORD || 'monere_auth_pw'}@localhost:5432/monere?schema=identity`,
      }),
};

// ── 3. Database prep ─────────────────────────────────────────
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env: childEnv, ...opts });
  if (r.status !== 0) {
    console.error(`✗ ${cmd} ${args.join(' ')} a échoué`);
    process.exit(r.status ?? 1);
  }
};
console.log('→ Build du package partagé…');
run('npm', ['run', 'build', '-w', 'packages/shared']);

console.log(
  `→ Base de données (${mode === 'local' ? 'SQLite' : 'Postgres'}) : generate + push + seed…`,
);
run('npm', ['run', 'db:prepare', '-w', 'services/auth']);

// ── 4. Start everything ──────────────────────────────────────
const services = [
  ['auth', 'services/auth', 36],
  ['market', 'services/market', 35],
  ['news', 'services/news', 33],
  ['earnings', 'services/earnings', 32],
  ['smart', 'services/smart', 31],
  ['ai', 'services/ai', 95],
  ['gateway', 'services/gateway', 96],
  ['web', 'apps/web', 92],
];

console.log('\n→ Lancement des micro-services + frontend…');
console.log('  Gateway  : http://localhost:' + (childEnv.GATEWAY_PORT || 8080));
console.log('  Frontend : http://localhost:' + (childEnv.WEB_PORT || 5173) + '\n');

const children = [];
for (const [name, dir, color] of services) {
  const child = spawn('npm', ['run', 'dev'], {
    cwd: path.join(root, dir),
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const prefix = `\x1b[${color}m[${name.padEnd(8)}]\x1b[0m `;
  const pipe = (stream, out) =>
    stream.on('data', (buf) =>
      String(buf)
        .split('\n')
        .filter(Boolean)
        .forEach((l) => out.write(prefix + l + '\n')),
    );
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (code !== null && code !== 0) console.error(`${prefix}exited with code ${code}`);
  });
  children.push(child);
}

// ── Tunnel public automatique (lien stable GitHub Pages) ─────
// `npm run dev` suffit : si cloudflared est installé, le tunnel démarre et
// l'URL est publiée sur la page https://thomasloridan.github.io/monere/.
// Désactivable avec MONERE_NO_TUNNEL=1.
if (!process.env.MONERE_NO_TUNNEL) {
  const cfPath = `${process.env.HOME}/.local/bin:${process.env.PATH}`;
  const hasCf =
    spawnSync('cloudflared', ['--version'], {
      stdio: 'ignore',
      env: { ...process.env, PATH: cfPath },
    }).status === 0;
  if (hasCf) {
    const share = spawn('node', ['scripts/share.mjs'], {
      cwd: root,
      env: { ...childEnv, PATH: cfPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const prefix = `\x1b[94m[share   ]\x1b[0m `;
    for (const stream of [share.stdout, share.stderr]) {
      stream.on('data', (buf) =>
        String(buf)
          .split('\n')
          .filter(Boolean)
          .forEach((l) => process.stdout.write(prefix + l + '\n')),
      );
    }
    children.push(share);
  } else {
    console.log(
      '  (cloudflared introuvable — pas de tunnel public ; installez-le pour activer le lien stable)',
    );
  }
}

const shutdown = () => {
  console.log('\n→ Arrêt des services…');
  for (const c of children) c.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
