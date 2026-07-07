import { buildService, startService, getEnv, getCache, validate, notFound } from '@monere/shared';
import { z } from 'zod';
import { getCongress, EU_EXPLANATION } from './congress.js';
import { get13F, getInsiderActivity } from './edgar.js';
import { INVESTORS, INSIDER_COMPANIES, investorById, insiderCompany } from './registry.js';

const env = getEnv();
await getCache();

const app = await buildService({ name: 'smart', port: env.SMART_PORT });

// ── Route interne (service-à-service) : derniers dépôts du Congrès ──
app.register(async (scoped) => {
  scoped.addHook('onRequest', async (req, reply) => {
    await scoped.requireInternal(req, reply);
  });
  scoped.get('/internal/congress/latest', async () => {
    const data = await getCongress();
    return {
      members: data.members.map((m) => ({
        id: m.id,
        name: m.name,
        lastFiled: m.lastFiled,
        filingCount: m.filingCount,
      })),
    };
  });
});

app.register(async (scoped) => {
  scoped.addHook('onRequest', async (req, reply) => {
    await scoped.requireAuth(req, reply);
  });

  /** All congress members with recent STOCK Act trades (Senate + House). */
  scoped.get('/smart/congress', async (req) => {
    const q = validate(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(5).max(100).default(30),
        search: z.string().trim().max(80).optional(),
      }),
      req.query,
    );
    const data = await getCongress();
    const filtered = q.search
      ? data.members.filter((m) => m.name.toLowerCase().includes(q.search!.toLowerCase()))
      : data.members;
    return {
      total: filtered.length,
      page: q.page,
      members: filtered
        .slice((q.page - 1) * q.pageSize, q.page * q.pageSize)
        .map(({ filings, ...summary }) => ({ ...summary, recentFilings: filings.slice(0, 3) })),
      sources: data.sources,
      partial: data.partial,
      note: data.note,
    };
  });

  scoped.get('/smart/congress/:id', async (req) => {
    const params = validate(z.object({ id: z.string().trim().max(80) }), req.params);
    const data = await getCongress();
    const member = data.members.find((m) => m.id === params.id);
    if (!member) throw notFound('Membre du Congrès introuvable dans les déclarations récentes');
    return { member, sources: data.sources };
  });

  /** EU officials: honest explanation + official sources (no trade data exists). */
  scoped.get('/smart/europe', async () => EU_EXPLANATION);

  /** Billionaires / superinvestors / hedge funds — live 13F from EDGAR. */
  scoped.get('/smart/investors', async (req) => {
    const q = validate(
      z.object({ kind: z.enum(['billionaires', 'funds', 'all']).default('all') }),
      req.query,
    );
    const defs = INVESTORS.filter((i) => q.kind === 'all' || i.kind === q.kind);
    const results = await Promise.allSettled(defs.map((d) => get13F(d.cik, 8)));
    return {
      investors: defs.map((d, i) => {
        const r = results[i];
        return {
          ...d,
          filing: r?.status === 'fulfilled' ? r.value : null,
          error: r?.status === 'rejected' ? 'Données EDGAR momentanément indisponibles' : null,
        };
      }),
    };
  });

  scoped.get('/smart/investors/:id', async (req) => {
    const params = validate(z.object({ id: z.string().trim().max(40) }), req.params);
    const def = investorById(params.id);
    if (!def) throw notFound('Investisseur inconnu');
    const filing = await get13F(def.cik, 20);
    return { ...def, filing };
  });

  /** Insider (Form 4) activity for tracked companies. */
  scoped.get('/smart/insiders', async () => ({ companies: INSIDER_COMPANIES }));

  scoped.get('/smart/insiders/:ticker', async (req) => {
    const params = validate(
      z.object({ ticker: z.string().trim().toUpperCase().max(12) }),
      req.params,
    );
    const company = insiderCompany(params.ticker);
    if (!company) {
      throw notFound(
        `Suivi insiders non configuré pour ${params.ticker} — sociétés disponibles : ${INSIDER_COMPANIES.map((c) => c.ticker).join(', ')}`,
      );
    }
    return getInsiderActivity(company.cik);
  });
});

await startService(app, 'smart', env.SMART_PORT);
