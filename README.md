# Monere — Finance for traders

Application de suivi des marchés : indices US/EU en temps réel, détail des actions
(graphs réels, ratios, actualités sourcées), calendrier des earnings officiel,
simulateur assisté par IA et suivi « smart money » (Congrès US, 13F, insiders).

**Toutes les données affichées sont réelles et sourcées** (Finnhub, Yahoo Finance,
SEC EDGAR, STOCK Act). Quand une source est indisponible, l'app affiche
« Données indisponibles » — jamais de données inventées.

---

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
| `FINNHUB_API_KEY` | market, news, earnings | [finnhub.io](https://finnhub.io) — gratuit | Quotes via Yahoo (US quasi temps réel, EU différé) ; news/earnings indisponibles |
| `ANTHROPIC_API_KEY` | ai | [console.anthropic.com](https://console.anthropic.com) | Fonctions IA désactivées proprement |
| `RESEND_API_KEY` | auth | [resend.com](https://resend.com) — gratuit 100/j | Le code de vérification s'affiche dans l'app (mode dev uniquement) |

> Latence des données : US = temps réel (websocket Finnhub / quasi temps réel Yahoo).
> **Europe = différé ~15 min sur les plans de données gratuits** — affiché honnêtement
> avec un badge « différé ». Pour du ≤30 s sur Euronext/XETRA, brancher un plan
> payant (EODHD, Finnhub premium) : l'abstraction provider est prête
> (`services/market/src/providers/`).

---

## Accès administrateur

1. Le seed (`npm run dev` au premier lancement, ou `npm run db:seed`) crée le compte
   admin avec l'e-mail `ADMIN_EMAIL` de `.env` (défaut `admin@monere.local`).
2. **Le mot de passe est généré aléatoirement et affiché UNE SEULE FOIS** dans le
   terminal, encadré ainsi :
   ```
   ┌──────────────────────────────────────────────┐
   │  COMPTE ADMINISTRATEUR CRÉÉ                  │
   │  Email        : admin@monere.local           │
   │  Mot de passe : <affiché une seule fois>     │
   └──────────────────────────────────────────────┘
   ```
3. Connectez-vous avec ces identifiants, puis ouvrez l'espace admin :
   - **Réglages → Administration → Espace administrateur**, ou
   - directement `http://localhost:5173/#/admin`.
4. Changez le mot de passe (Connexion → « Mot de passe oublié » avec l'e-mail admin).

L'espace admin donne : statistiques plateforme, gestion des utilisateurs
(désactiver / premium / promouvoir), journal d'audit, santé des micro-services.
Chaque route `/api/admin/*` est protégée côté serveur par le rôle `admin` du JWT —
l'UI n'est qu'une fenêtre.

---

## Architecture micro-services

```
frontend (React PWA + Capacitor)
   │  /api/*
   ▼
gateway :8080        rate-limit global · CORS · headers sécurité · request-id
   ├── auth     :4001   comptes, code e-mail, JWT+rotation, watchlist, alertes, admin, audit
   ├── market   :4002   quotes (Finnhub WS + Yahoo), candles réels, composition, SSE, job alertes
   ├── news     :4003   actualités officielles avec URLs réelles (cache 60 s)
   ├── earnings :4004   calendrier officiel, surprises EPS, impact réel J-1→J+1
   ├── smart    :4005   STOCK Act (Sénat+Chambre), 13F & Form 4 (SEC EDGAR)
   └── ai       :4006   Anthropic (résumés news sourcés, analyse simulateur)
        │
Postgres (Prisma, rôles moindre-privilège) · Redis (cache + rate-limit) · MinIO (fichiers)
```

Chaque requête suit : **frontend → gateway → service (auth → validation zod →
logique métier → base) → réponse.** Les routes `/internal/*` (service-à-service)
exigent `x-internal-key` et ne sont jamais proxifiées par le gateway.

### Chemin des données réelles

| Donnée | Source primaire | Lien affiché dans l'app |
|---|---|---|
| Quotes US | Finnhub (websocket + REST) | finnhub.io/quote/… |
| Quotes EU / candles / indices | Yahoo Finance chart API | finance.yahoo.com/quote/… |
| Composition des indices | Finnhub (payant) → repli Wikipedia | page constituents |
| Listing complet des places | Finnhub symbol directory | docs Finnhub |
| Actualités | Finnhub company/general news | **URL de l'article** |
| Earnings (dates, consensus, réel) | Finnhub earnings calendar | finnhub + **page IR officielle** |
| Impact cours ±1 j | Calculé sur candles Yahoo réels | source du cours |
| Congrès US | Senate/House Stock Watcher (STOCK Act) | **PDF de déclaration officiel** |
| 13F / Form 4 | SEC EDGAR (data.sec.gov) | **dépôt EDGAR officiel** |
| Élus européens | *N'existe pas* — l'app l'explique avec les sources officielles | europarl.europa.eu |

---

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
La même base tourne en PWA installable (manifest + service worker) et s'adapte
téléphone / tablette / desktop (shells dédiés portés du design).

## Documentation

- **[docs/BRD.md](docs/BRD.md)** — Business Requirements Document complet :
  exigences et statut, architecture détaillée, fonctionnement de chaque service
  avec ses cas limites, flux critiques, production, maintenance et évolution.
- [SECURITY.md](SECURITY.md) — modèle de sécurité complet.
- `docs/CREDENTIALS-LOCAL.md` — identifiants locaux (non versionné, chaque
  poste génère les siens via le seed).

## Sécurité

Voir [SECURITY.md](SECURITY.md). Résumé : argon2id, JWT 15 min + refresh tokens
rotatifs hachés (réutilisation = révocation de session), codes e-mail hachés avec
5 essais max/10 min, rate-limit strict sur `/auth/*`, validation zod sur chaque
route, requêtes 100 % Prisma (paramétrées), helmet + CORS allow-list, logs pino
avec secrets caviardés, rôles Postgres à moindre privilège, images Docker non-root.

## Limites connues (transparence)

- **Europe ≤30 s** : impossible gratuitement/légalement — différé ~15 min affiché.
- **Estimations par analyste nominatives** : données propriétaires (Refinitiv/LSEG) —
  l'app montre le consensus officiel + l'historique réel à la place.
- **Élus européens** : aucune déclaration de transactions n'existe — expliqué dans l'app.
- **Paiement Premium** : statut serveur de démonstration, pas de PSP branché.
- **Cache mémoire en mode local** : mono-instance uniquement ; Redis dès que Docker tourne.
