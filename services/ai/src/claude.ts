/**
 * Anthropic integration — official SDK, structured outputs, adaptive thinking.
 * Hard rule enforced by the system prompt: the model may ONLY use the sourced
 * data we inject; every claim must reference one of the provided URLs.
 */
import Anthropic from '@anthropic-ai/sdk';
import { getEnv, upstreamUnavailable } from '@monere/shared';

let client: Anthropic | undefined;

export function hasAnthropicKey(): boolean {
  return Boolean(getEnv().ANTHROPIC_API_KEY);
}

function getClient(): Anthropic {
  const env = getEnv();
  if (!env.ANTHROPIC_API_KEY) {
    throw upstreamUnavailable(
      'Fonctions IA indisponibles — ajoutez ANTHROPIC_API_KEY dans .env (console.anthropic.com)',
      'NO_API_KEY',
    );
  }
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

const SYSTEM = `Tu es l'assistant d'analyse de Monere, une application de suivi des marchés financiers.

Règles absolues :
- Tu ne t'appuies QUE sur les données fournies dans le message (cotations, actualités avec URLs, historique d'earnings). Tu n'utilises JAMAIS tes connaissances générales pour affirmer un fait de marché.
- Chaque affirmation factuelle doit citer sa source : l'URL exacte fournie dans les données.
- Si les données fournies sont insuffisantes pour répondre, dis-le explicitement plutôt que de compléter.
- Tu n'es pas un conseiller financier : aucune recommandation d'achat/vente. Tu présentes des scénarios et des faits sourcés.
- Réponds en français, de façon concise et structurée.`;

export interface NewsDigestItem {
  headline: string;
  whyItMatters: string;
  potentialImpact: 'positive' | 'negative' | 'incertain';
  source: string;
  sourceUrl: string;
}

export interface OutlookHorizon {
  horizon: '1j' | '3j' | '5j' | '1M' | '3M';
  scenario: string;
}

export interface NewsDigest {
  overview: string;
  items: NewsDigestItem[];
  outlook: { horizons: OutlookHorizon[]; caveat: string };
  dataQuality: string;
}

const DIGEST_SCHEMA = {
  type: 'object',
  properties: {
    overview: {
      type: 'string',
      description:
        "Synthèse en 2-3 phrases des actualités récentes susceptibles d'impacter le cours",
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          headline: { type: 'string' },
          whyItMatters: {
            type: 'string',
            description: 'Pourquoi cette info peut impacter le cours',
          },
          potentialImpact: { type: 'string', enum: ['positive', 'negative', 'incertain'] },
          source: { type: 'string' },
          sourceUrl: { type: 'string', description: "URL exacte de l'article fourni" },
        },
        required: ['headline', 'whyItMatters', 'potentialImpact', 'source', 'sourceUrl'],
        additionalProperties: false,
      },
    },
    outlook: {
      type: 'object',
      description:
        "Perspectives d'évolution possibles du cours, déduites UNIQUEMENT des actualités citées",
      properties: {
        horizons: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              horizon: { type: 'string', enum: ['1j', '3j', '5j', '1M', '3M'] },
              scenario: {
                type: 'string',
                description:
                  'Scénario qualitatif pour cet horizon fondé sur les actualités citées ; si les sources ne permettent rien de dire, écrire explicitement « aucun signal dans les sources »',
              },
            },
            required: ['horizon', 'scenario'],
            additionalProperties: false,
          },
        },
        caveat: {
          type: 'string',
          description:
            'Rappel des limites : scénarios qualitatifs issus des seules actualités citées, pas une prédiction ni un conseil en investissement',
        },
      },
      required: ['horizons', 'caveat'],
      additionalProperties: false,
    },
    dataQuality: {
      type: 'string',
      description: 'Note sur la fraîcheur/complétude des données utilisées',
    },
  },
  required: ['overview', 'items', 'outlook', 'dataQuality'],
  additionalProperties: false,
} as const;

/** Résumé des actualités importantes pour une action, avec sources citées. */
export async function summarizeNews(input: {
  ticker: string;
  name: string | null;
  quote: {
    price: number;
    changePct: number | null;
    currency: string | null;
    delayed: boolean;
  } | null;
  news: Array<{ headline: string; summary: string; source: string; url: string; hoursAgo: number }>;
}): Promise<NewsDigest> {
  const env = getEnv();
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 4000, // sortie courte et structurée — maîtrise des coûts
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: DIGEST_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `Voici les données réelles pour ${input.ticker}${input.name ? ` (${input.name})` : ''} :

COTATION ACTUELLE : ${input.quote ? `${input.quote.price} ${input.quote.currency ?? ''} (${input.quote.changePct?.toFixed(2) ?? '?'}% aujourd'hui)${input.quote.delayed ? ' [données différées ~15 min]' : ' [temps réel]'}` : 'indisponible'}

ACTUALITÉS RÉCENTES (7 derniers jours, sources réelles) :
${input.news.length === 0 ? 'AUCUNE — réponds que les données sont indisponibles.' : input.news.map((n, i) => `${i + 1}. [${n.source}] il y a ${n.hoursAgo}h — ${n.headline}\n   Résumé: ${n.summary.slice(0, 300)}\n   URL: ${n.url}`).join('\n')}

Sélectionne les 3 à 5 actualités les plus susceptibles d'impacter le cours de bourse, explique pourquoi, et cite l'URL exacte de chacune.

Termine par des perspectives d'évolution possibles du cours aux horizons 1j, 3j, 5j, 1M et 3M, déduites UNIQUEMENT des actualités citées ci-dessus (catalyseurs datés, tendances sectorielles mentionnées, etc.). Pour chaque horizon : un scénario qualitatif d'une ou deux phrases. Si les sources ne permettent rien d'affirmer pour un horizon, écris « aucun signal dans les sources ». N'invente ni chiffre ni objectif de cours ; ce ne sont pas des prédictions ni des conseils.`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw upstreamUnavailable('La requête a été déclinée par le modèle', 'AI_REFUSAL');
  }
  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw upstreamUnavailable('Réponse IA vide', 'AI_EMPTY');
  return JSON.parse(text.text) as NewsDigest;
}

/** Analyse de scénario pour le simulateur — texte structuré, jamais un conseil. */
export async function simulatorInsight(input: {
  ticker: string;
  name: string | null;
  quote: { price: number; changePct: number | null; currency: string | null } | null;
  params: { amount: number; leverage: number; horizonDays: number; direction: 'long' | 'short' };
  earnings: {
    upcoming: Array<{
      date: string;
      quarter: string;
      consensus: { eps: number | null; revenue: number | null };
    }>;
    stats: { beatRatePct: number | null; avgSurprisePct: number | null; quarters: number } | null;
    pastImpacts: Array<{ date: string; d1Pct: number | null; d2Pct: number | null }>;
  } | null;
  news: Array<{ headline: string; source: string; url: string; hoursAgo: number }>;
}): Promise<{ analysis: string }> {
  const env = getEnv();
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: `L'utilisateur configure une simulation ${input.params.direction === 'long' ? 'achat (long)' : 'vente à découvert (short)'} sur ${input.ticker}${input.name ? ` (${input.name})` : ''} :
- Montant : ${input.params.amount} — Levier : ×${input.params.leverage} — Horizon : ${input.params.horizonDays} jours

DONNÉES RÉELLES DISPONIBLES :
Cotation : ${input.quote ? `${input.quote.price} ${input.quote.currency ?? ''} (${input.quote.changePct?.toFixed(2) ?? '?'}% aujourd'hui)` : 'indisponible'}
Earnings à venir : ${input.earnings?.upcoming.length ? input.earnings.upcoming.map((e) => `${e.quarter} le ${e.date} (consensus EPS ${e.consensus.eps ?? '?'})`).join(' ; ') : 'aucun dans la fenêtre connue'}
Historique battre/manquer : ${input.earnings?.stats ? `${input.earnings.stats.beatRatePct ?? '?'}% de beats sur ${input.earnings.stats.quarters} trimestres (surprise moyenne ${input.earnings.stats.avgSurprisePct ?? '?'}%)` : 'indisponible'}
Impacts des derniers earnings (J-1→J+1) : ${input.earnings?.pastImpacts.length ? input.earnings.pastImpacts.map((p) => `${p.date}: ${p.d2Pct ?? '?'}%`).join(' ; ') : 'indisponible'}
Actualités récentes : ${
          input.news.length
            ? input.news
                .slice(0, 6)
                .map((n) => `[${n.source}] ${n.headline} (${n.url})`)
                .join(' | ')
            : 'aucune'
        }

En te basant UNIQUEMENT sur ces données :
1. Décris les facteurs de risque et de volatilité pertinents pour cet horizon (cite les sources).
2. Explique l'effet mécanique du levier ×${input.params.leverage} sur les gains ET les pertes, avec un exemple chiffré basé sur la volatilité historique des earnings fournie.
3. Signale ce que les données ne permettent PAS de savoir.
Termine par un rappel qu'il ne s'agit pas d'un conseil en investissement. Maximum 300 mots.`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw upstreamUnavailable('La requête a été déclinée par le modèle', 'AI_REFUSAL');
  }
  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw upstreamUnavailable('Réponse IA vide', 'AI_EMPTY');
  return { analysis: text.text };
}
