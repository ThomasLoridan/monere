/**
 * Notifications automatiques smart money + actualités.
 *  - Smart money : un investisseur suivi (Congrès US) dépose une nouvelle
 *    déclaration de transaction (PTR) → notification in-app.
 *  - Actualités : une actualité « dernière minute » (<45 min) touche une
 *    valeur en favoris → notification in-app.
 * Les données viennent des services smart/news/market via les routes internes
 * (x-internal-key) — uniquement des sources réelles, jamais de contenu généré.
 * Déduplication par (utilisateur, titre) sur 48 h ; préférences notifPrefs
 * respectées (catégories « smart » et « news »).
 */
import { createLogger, fetchJson, getEnv } from '@monere/shared';
import { prisma } from './db.js';

const log = createLogger('notifier');

function base(svc: 'smart' | 'news' | 'market', port: number): string {
  return getEnv().MONERE_MODE === 'docker' ? `http://${svc}:${port}` : `http://localhost:${port}`;
}
function headers(): Record<string, string> {
  return { 'x-internal-key': getEnv().INTERNAL_API_KEY };
}

function parsePrefs(json: string): Record<string, boolean> {
  try {
    return JSON.parse(json) as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** Crée la notification si un même titre n'a pas déjà été envoyé sous 48 h. */
async function notifyOnce(
  userId: string,
  category: string,
  title: string,
  body: string,
  navScreen: string | null,
  navParams: Record<string, unknown>,
): Promise<void> {
  const dup = await prisma.notification.findFirst({
    where: { userId, title, createdAt: { gte: new Date(Date.now() - 48 * 3600_000) } },
    select: { id: true },
  });
  if (dup) return;
  await prisma.notification.create({
    data: { userId, category, title, body, navScreen, navParams: JSON.stringify(navParams) },
  });
}

/** Nouveaux dépôts PTR des élus suivis (fenêtre : 3 derniers jours). */
async function processSmartMoney(): Promise<void> {
  const follows = await prisma.followedInvestor.findMany({
    where: { kind: 'congress' },
    include: { user: { select: { id: true, notifPrefs: true, disabled: true } } },
  });
  if (follows.length === 0) return;

  const env = getEnv();
  const d = await fetchJson<{
    members: Array<{ id: string; name: string; lastFiled: string | null }>;
  }>(`${base('smart', env.SMART_PORT)}/internal/congress/latest`, {
    headers: headers(),
    timeoutMs: 30_000,
  });
  const cutoff = Date.now() - 3 * 86_400_000;
  const recent = new Map(
    d.members
      .filter((m) => m.lastFiled && new Date(m.lastFiled).getTime() >= cutoff)
      .map((m) => [m.id, m]),
  );
  if (recent.size === 0) return;

  for (const f of follows) {
    const m = recent.get(f.investorId);
    if (!m || f.user.disabled) continue;
    if (parsePrefs(f.user.notifPrefs).smart === false) continue;
    const dateFr = new Date(m.lastFiled!).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
    });
    await notifyOnce(
      f.userId,
      'smart',
      `${m.name} : nouvelle déclaration de transaction`,
      `Dépôt officiel (PTR) du ${dateFr} auprès de la Chambre des représentants. Ouvrez le suivi pour consulter le document original.`,
      'investor',
      { id: m.id, kind: 'congress' },
    );
  }
}

/** Actualités de dernière minute (<45 min) sur les valeurs en favoris. */
async function processBreakingNews(): Promise<void> {
  const watches = await prisma.watchlistItem.findMany({
    include: { user: { select: { id: true, notifPrefs: true, disabled: true } } },
  });
  if (watches.length === 0) return;

  const env = getEnv();
  // Mapping ticker app → symbole de place (MC → MC.PA) via le service market
  const uni = await fetchJson<{ stocks: Array<{ ticker: string; finnhub: string }> }>(
    `${base('market', env.MARKET_PORT)}/internal/universe`,
    { headers: headers(), timeoutMs: 15_000 },
  );
  const toVenue = new Map(uni.stocks.map((s) => [s.ticker, s.finnhub]));
  const symbols = [...new Set(watches.map((w) => toVenue.get(w.ticker) ?? w.ticker))].slice(0, 25);

  const d = await fetchJson<{
    items: Array<{ ticker?: string; headline: string; source: string; url: string }>;
  }>(
    `${base('news', env.NEWS_PORT)}/internal/breaking?symbols=${encodeURIComponent(symbols.join(','))}`,
    { headers: headers(), timeoutMs: 45_000 },
  );
  if (d.items.length === 0) return;

  const byVenue = new Map<string, typeof d.items>();
  for (const n of d.items) {
    if (!n.ticker) continue;
    (byVenue.get(n.ticker) ?? byVenue.set(n.ticker, []).get(n.ticker)!).push(n);
  }

  for (const w of watches) {
    if (w.user.disabled) continue;
    if (parsePrefs(w.user.notifPrefs).news === false) continue;
    const venue = toVenue.get(w.ticker) ?? w.ticker;
    for (const n of (byVenue.get(venue) ?? []).slice(0, 2)) {
      await notifyOnce(
        w.userId,
        'news',
        n.headline.slice(0, 140),
        `${n.source} — dernière minute sur ${w.ticker}. Ouvrez la fiche pour lire l'article (lien direct).`,
        'stock',
        { ticker: w.ticker, url: n.url },
      );
    }
  }
}

export async function processExternalNotifications(): Promise<void> {
  const results = await Promise.allSettled([processSmartMoney(), processBreakingNews()]);
  for (const [i, r] of results.entries()) {
    if (r.status === 'rejected') {
      log.warn({ err: r.reason }, i === 0 ? 'notifications smart money' : 'notifications news');
    }
  }
}
