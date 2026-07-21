/**
 * Lien public stable : lance un tunnel Cloudflare éphémère vers le frontend
 * (http://localhost:5173, qui proxifie /api vers le gateway) puis publie la
 * nouvelle URL dans docs/app-url.json via l'API GitHub. La page GitHub Pages
 * https://thomasloridan.github.io/monere/ lit ce fichier et redirige : le lien
 * partagé ne change jamais, même quand l'URL du tunnel change.
 *
 * Prérequis (une fois) :
 *  1. GitHub → repo monere → Settings → Pages → « Deploy from a branch »,
 *     branche main, dossier /docs.
 *  2. Un token fine-grained (Settings → Developer settings → Tokens) limité au
 *     repo monere avec la permission « Contents: Read and write », mis dans
 *     .env : GITHUB_TOKEN=github_pat_…
 *
 * Usage : npm run share   (la stack doit tourner : npm run dev)
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = process.env.MONERE_REPO || 'ThomasLoridan/monere';
const PAGES_URL = `https://${REPO.split('/')[0].toLowerCase()}.github.io/${REPO.split('/')[1]}/`;
const TARGET = process.env.SHARE_TARGET || 'http://localhost:5173';

// Charge GITHUB_TOKEN depuis .env si absent de l'environnement
function envToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const envPath = path.join(root, '.env');
  if (!existsSync(envPath)) return null;
  const m = readFileSync(envPath, 'utf8').match(/^GITHUB_TOKEN=(.+)$/m);
  return m ? m[1].trim() : null;
}

async function publishUrl(url) {
  // Copie locale : la page démo (docs/index.html) lit ce fichier — utile en
  // local et gardé en phase avec la version publiée sur GitHub Pages.
  try {
    writeFileSync(
      path.join(root, 'docs', 'app-url.json'),
      JSON.stringify({ url, updatedAt: new Date().toISOString() }, null, 2) + '\n',
    );
  } catch {
    /* non bloquant */
  }
  const token = envToken();
  if (!token) {
    console.log('\n⚠ GITHUB_TOKEN absent de .env — URL non publiée sur GitHub Pages.');
    console.log('  Ajoutez un token fine-grained (Contents: Read/write sur le repo) pour');
    console.log(`  que ${PAGES_URL} redirige automatiquement vers le tunnel.\n`);
    return;
  }
  const api = `https://api.github.com/repos/${REPO}/contents/docs/app-url.json`;
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'monere-share',
  };
  // sha actuel (requis pour la mise à jour)
  let sha;
  const cur = await fetch(api, { headers });
  if (cur.ok) sha = (await cur.json()).sha;
  const body = {
    message: `share: URL du tunnel → ${url}`,
    content: Buffer.from(
      JSON.stringify({ url, updatedAt: new Date().toISOString() }, null, 2),
    ).toString('base64'),
    ...(sha ? { sha } : {}),
  };
  const res = await fetch(api, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    console.error(
      `✗ Publication GitHub échouée (${res.status}) : ${(await res.text()).slice(0, 200)}`,
    );
    return;
  }
  console.log(`✓ URL publiée — lien stable : ${PAGES_URL}`);
}

function startTunnel() {
  console.log(`→ Tunnel Cloudflare vers ${TARGET}…`);
  const proc = spawn('cloudflared', ['tunnel', '--url', TARGET], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let announced = false;
  const onData = (buf) => {
    const text = buf.toString();
    const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !announced) {
      announced = true;
      console.log(`✓ Tunnel actif : ${m[0]}`);
      publishUrl(m[0]).catch((err) => console.error('✗ publication :', err.message));
    }
  };
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);
  proc.on('exit', (code) => {
    console.log(`Tunnel terminé (code ${code}) — relance dans 5 s…`);
    announced = false;
    setTimeout(startTunnel, 5000);
  });
  return proc;
}

if (!process.env.PATH.includes('.local/bin')) {
  process.env.PATH = `${process.env.HOME}/.local/bin:${process.env.PATH}`;
}
startTunnel();
