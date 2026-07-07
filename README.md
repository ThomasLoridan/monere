# Monere — Finance for traders

[![CI](https://github.com/ThomasLoridan/monere/actions/workflows/ci.yml/badge.svg)](https://github.com/ThomasLoridan/monere/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-installable-4F52D9)

Application de suivi des marchés : indices US/EU en temps réel, détail des actions
(graphiques réels, ratios, actualités sourcées), calendrier officiel des earnings
avec **alertes e-mail 1 semaine avant chaque publication**, simulateur assisté par
IA et suivi « smart money » (Congrès US, 13F, insiders).

> **Règle produit : pas de source, pas d'affichage.**
> Toutes les données sont réelles et citées à l'écran avec un lien (Finnhub,
> Yahoo Finance, SEC EDGAR, Chambre des représentants US). Quand une source est
> indisponible, l'app affiche « Données indisponibles » — jamais de données inventées.

---

## Fonctionnalités

- **Marchés** — S&P 500, Nasdaq 100, CAC 40, DAX, Euro Stoxx 50, FTSE 100 :
  cotations réelles, composition complète des indices, listing intégral des places.
- **Actions** — graphique 1J progressif (vide à l'ouverture, se remplit en séance),
  historiques 1S → 5A, ratios financiers, actualités liées aux articles originaux.
- **Earnings** — calendrier officiel (Finnhub US, Yahoo EU/UK), consensus,
  historique battre/manquer, dates de publication réelles via les dépôts **8-K de
  la SEC**, impact mesuré sur le cours (clôtures J-1 → J+1).
- **Alertes earnings** — un geste sur un résultat à venir, et vous recevez un
  **e-mail de rappel 7 jours avant** la publication + une notification in-app.
- **Alertes de prix** — seuils franchis, vérifiés toutes les 30 s sur cours réels.
- **Smart money** — transactions déclarées des membres de la Chambre des
  représentants US (PDF officiels), positions 13F des grands fonds, achats/ventes
  d'insiders (Form 4) — le tout depuis SEC EDGAR et disclosures-clerk.house.gov.
- **IA (Claude, Anthropic)** — résumés d'actualités et simulateur de stratégies,
  contraints aux données sourcées fournies : l'IA ne peut pas inventer un fait.
- **Comptes** — inscription avec code e-mail à usage unique, espace admin complet
  (stats, utilisateurs, audit, santé des services).
- **Phone-native + responsive** — PWA installable (iPhone/Android), shells dédiés
  téléphone / tablette / desktop, enveloppe Capacitor prête pour les stores.

## Démarrage rapide

```bash
npm install
npm run dev
```

`npm run dev` :

1. crée `.env` depuis `.env.example` au premier lancement (secrets forts générés) ;
2. détecte Docker : s'il tourne → Postgres + Redis en conteneurs ; sinon →
   **mode local sans dépendance** (SQLite + cache mémoire) ;
3. prépare la base (Prisma generate/push/seed) ;
4. lance les 7 micro-services + le frontend.

- Frontend : http://localhost:5173
- Gateway API : http://localhost:8080/api/health

### Clés API (dans `.env`)

| Variable | Service | Obtention | Sans la clé |
|---|---|---|---|
| `FINNHUB_API_KEY` | market, news, earnings | [finnhub.io](https://finnhub.io) — gratuit | Quotes via Yahoo (US quasi temps réel, EU différé) ; news/earnings US indisponibles |
| `ANTHROPIC_API_KEY` | ai | [console.anthropic.com](https://console.anthropic.com) | Fonctions IA désactivées proprement |
| `RESEND_API_KEY` | auth | [resend.com](https://resend.com) — gratuit 100/j | Code de vérification affiché dans l'app (dev uniquement) ; pas d'e-mails de rappel |

> Latence : US = temps réel (websocket Finnhub / quasi temps réel Yahoo).
> **Europe = différé ~15 min sur les plans gratuits** — affiché honnêtement avec un
> badge « différé ». Pour du ≤30 s sur Euronext/XETRA/LSE, brancher un plan payant :
> l'abstraction provider est prête (`services/market/src/providers/`).

## Accès administrateur

1. Le seed (premier `npm run dev`, ou `npm run db:seed`) crée le compte admin avec
   l'e-mail `ADMIN_EMAIL` de `.env` (défaut `admin@monere.local`).
2. **Le mot de passe est généré aléatoirement et affiché UNE SEULE FOIS** dans le
   terminal, dans un cadre bien visible.
3. Connectez-vous puis ouvrez **Réglages → Administration → Espace administrateur**,
   ou directement `http://localhost:5173/#/admin`.
4. Changez le mot de passe (« Mot de passe oublié » avec l'e-mail admin).

Chaque route `/api/admin/*` est protégée côté serveur par le rôle `admin` du JWT —
l'UI n'est qu'une fenêtre.

## Architecture micro-services

```
frontend (React PWA + Capacitor)
   │  /api/*
   ▼
gateway :8080        rate-limit global · CORS · headers sécurité · request-id
   ├── auth     :4001   comptes, code e-mail, JWT+rotation, watchlist, alertes prix
   │                    & earnings (rappel e-mail J-7), notifications, admin, audit
   ├── market   :4002   quotes (Finnhub WS + Yahoo), candles réels, composition,
   │                    ratios (Finnhub → repli Yahoo), SSE, job alertes prix
   ├── news     :4003   actualités réelles avec URLs (Finnhub → repli RSS Yahoo EU/UK)
   ├── earnings :4004   calendrier officiel (Finnhub US · Yahoo EU/UK), surprises EPS,
   │                    dates réelles SEC 8-K, impact réel J-1→J+1
   ├── smart    :4005   Chambre US (disclosures-clerk.house.gov), 13F & Form 4 (EDGAR)
   └── ai       :4006   Anthropic (résumés news sourcés, analyse simulateur)
        │
Postgres (Prisma, rôles moindre-privilège) · Redis (cache + rate-limit) · MinIO (fichiers)
```

Chaque requête suit : **frontend → gateway → service (auth → validation zod →
logique métier → base) → réponse.** Les routes `/internal/*` (service-à-service)
exigent `x-internal-key` et ne sont jamais proxifiées par le gateway.

### Chemin des données réelles

| Donnée | Source primaire | Repli réel | Lien affiché |
|---|---|---|---|
| Quotes US | Finnhub (websocket + REST) | Yahoo Finance | finnhub.io/quote/… |
| Quotes EU/UK, candles, indices | Yahoo Finance chart API | — | finance.yahoo.com/quote/… |
| Ratios financiers | Finnhub metrics (US) | Yahoo quoteSummary (EU/UK) | page key-statistics |
| Composition des indices | Finnhub (payant) | Wikipedia | page constituents |
| Actualités | Finnhub company/general news | RSS Yahoo par symbole (EU/UK) | **URL de l'article** |
| Calendrier earnings | Finnhub par symbole (US) | Yahoo calendarEvents (EU/UK) | finnhub + **page IR officielle** |
| Dates de publication US | SEC EDGAR — 8-K item 2.02 | — | **dépôt EDGAR officiel** |
| Impact cours ±1 j | Calculé sur candles Yahoo réels | — | source du cours |
| Congrès US (Chambre) | disclosures-clerk.house.gov (STOCK Act) | — | **PDF de déclaration officiel** |
| Sénat US | Pas de flux gratuit — expliqué dans l'app | — | portail officiel efdsearch |
| 13F / Form 4 | SEC EDGAR (data.sec.gov) | — | **dépôt EDGAR officiel** |
| Élus européens | *N'existe pas* — expliqué avec les textes officiels | — | europarl.europa.eu |

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | Stack complète en local (fallback SQLite sans Docker) |
| `npm run dev:docker` | Stack complète conteneurisée (`--profile full`) |
| `npm run infra:up` | Postgres + Redis seuls (dev hybride) |
| `npm test` / `npm run typecheck` / `npm run lint` | Qualité |
| `npm run backup` | Sauvegarde ponctuelle (pg_dump ou copie SQLite) dans `backups/` |
| `npm run db:seed` | (Re)crée l'admin si absent |
| `npm run cap:add:ios -w apps/web` | Génère le projet iOS natif (Capacitor) |

## Lien public stable (démo)

```bash
npm run dev     # la stack
npm run share   # tunnel Cloudflare + publication de l'URL
```

`npm run share` ouvre un tunnel vers le frontend et publie l'URL courante dans
[docs/app-url.json](docs/app-url.json). La page GitHub Pages
**https://thomasloridan.github.io/monere/** lit ce fichier et redirige : le lien
partagé ne change jamais, même quand le tunnel redémarre. Configuration (une fois) :

1. GitHub → Settings → Pages → « Deploy from a branch » → `main` / `/docs` ;
2. un token fine-grained (permission *Contents: Read and write* sur ce repo)
   dans `.env` : `GITHUB_TOKEN=github_pat_…`

> Le lien n'est actif que quand la stack tourne (la page l'indique sinon).

## CI/CD & images Docker

- **À chaque push** : lint, typecheck, tests, audit npm, build web, build des
  8 images Docker (GitHub Actions).
- **À chaque tag `v*`** : publication des images sur GitHub Container Registry —
  `ghcr.io/thomasloridan/monere-<service>` (gateway, auth, market, news, earnings,
  smart, ai, web).

### Backups

- Compose : le service `backup` fait un `pg_dump` gzip **toutes les 6 h**,
  rétention 14 jours (`backups/`). En prod, pousser ce dossier vers un stockage objet.
- Manuel : `npm run backup`.

### Monitoring

- `/health` et `/metrics` (Prometheus) sur chaque service ; agrégat sur
  `GET /api/health` ; Prometheus optionnel : `docker compose --profile monitoring up`.

## Mobile (Capacitor)

```bash
cd apps/web
npm run build
npm run cap:add:ios      # nécessite Xcode
npm run cap:sync
npx cap open ios
```

La même base tourne en PWA installable (manifest + service worker, l'API n'est
jamais mise en cache) et s'adapte téléphone / tablette / desktop.

## Documentation

- **[docs/BRD.md](docs/BRD.md)** — Business Requirements Document : exigences et
  statut, architecture détaillée, fonctionnement de chaque service avec ses cas
  limites, flux critiques, production, maintenance et évolution.
- **[docs/PRFAQ-Monere.docx](docs/PRFAQ-Monere.docx)** — PR/FAQ (communiqué de
  presse + FAQ externe/interne, format « working backwards »).
- [SECURITY.md](SECURITY.md) — modèle de sécurité complet.
- `docs/CREDENTIALS-LOCAL.md` — identifiants locaux (non versionné, chaque poste
  génère les siens via le seed).

## Sécurité

Voir [SECURITY.md](SECURITY.md). Résumé : argon2id, JWT 15 min + refresh tokens
rotatifs hachés (réutilisation = révocation de session), codes e-mail hachés avec
5 essais max/10 min, rate-limit strict sur `/auth/*`, validation zod sur chaque
route, requêtes 100 % Prisma (paramétrées), helmet + CORS allow-list, logs pino
avec secrets caviardés, rôles Postgres à moindre privilège, images Docker non-root.

## Limites connues (transparence)

- **Europe ≤30 s** : impossible gratuitement/légalement — différé ~15 min affiché.
- **Plan Finnhub gratuit** : couvre uniquement les États-Unis (403 ailleurs) —
  replis réels Yahoo/EDGAR intégrés, ou indisponibilité affichée.
- **Estimations par analyste nominatives** : données propriétaires (Refinitiv/LSEG) —
  l'app montre le consensus officiel + l'historique réel à la place.
- **Sénat US** : pas de flux gratuit — lien vers le portail officiel.
- **Élus européens** : aucune déclaration de transactions n'existe — expliqué dans l'app.
- **Paiement Premium** : statut serveur de démonstration, pas de PSP branché.
- **Cache mémoire en mode local** : mono-instance uniquement ; Redis dès que Docker tourne.
