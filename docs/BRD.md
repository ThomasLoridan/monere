# BRD — Monere · Finance for traders

*Business Requirements Document · v1.0 · 6 juillet 2026*

Ce document est la référence complète du projet : vision, exigences business et
leur statut, architecture (dev & production), fonctionnement détaillé de chaque
micro-service avec ses cas limites, flux critiques, sécurité, exploitation et
plan d'évolution.

> 🔑 Les identifiants (admin, compte de test) et la gestion des clés API sont
> dans [`docs/CREDENTIALS-LOCAL.md`](CREDENTIALS-LOCAL.md) — fichier **exclu de
> Git** : un BRD est versionné et potentiellement public, des identifiants ne
> le sont jamais.

---

## 1. Vision produit

Monere est une application de suivi des marchés destinée aux traders
particuliers : indices US/EU et actions en (quasi) temps réel, détail complet
par valeur (graphique, ratios, actualités), calendrier des résultats
trimestriels avec analyse battre/manquer et impact réel sur le cours,
simulateur de stratégie assisté par IA, et suivi « smart money » (élus
américains, milliardaires/13F, fonds spéculatifs, dirigeants).

**Principe non négociable : zéro donnée inventée.** Chaque chiffre et chaque
actualité affichés proviennent d'une source réelle, liée dans l'interface.
Quand une source est indisponible, l'application affiche explicitement
« Données indisponibles » plutôt qu'un contenu plausible mais faux.

## 2. Exigences business et statut

| # | Exigence | Statut | Implémentation / adaptation |
|---|---|---|---|
| B1 | Composition des marchés : lister l'entièreté des actions cotées | ✅ | Composition complète des 6 indices (S&P 500, Nasdaq 100, CAC 40, DAX, Euro Stoxx 50, FTSE 100) via Finnhub (payant) avec repli Wikipedia sourcé ; listing complet par place (US, PA, DE, AS, L) via l'annuaire Finnhub ; recherche sur tout le marché. |
| B2 | Simulateur assisté par LLM | ✅ | Service `ai` (Claude `claude-opus-4-8`) : analyse de scénario ancrée sur cotation réelle + historique earnings réel + actualités citées. Résumé IA des actualités impactantes dans le détail de chaque action, avec URL de chaque source citée. |
| B3 | Actualités temps réel, sources officielles | ✅ | Finnhub company/general news, rafraîchies toutes les 30–60 s, chaque item liant l'**URL réelle de l'article**. |
| B4 | Earnings : dates, liens pour suivre, battre/manquer, impact ±1 j | ✅ | Calendrier officiel Finnhub (consensus EPS/CA, réel, surprise) ; lien vers la **page Investor Relations officielle** de chaque société (webcasts) ; tendance battre/manquer = statistique transparente calculée sur l'historique réel des surprises ; impact J-1→J et J-1→J+1 calculé sur les cours de clôture réels. |
| B5 | Graphique réel, 1D progressif | ✅ | Candles réels (Yahoo chart API, ou Finnhub si plan payant). En 1D, l'axe X couvre la séance officielle (bornes renvoyées par l'API, fuseau de la place) : vide avant l'ouverture, la courbe se remplit au fil des cotations jusqu'à la clôture. |
| B6 | Suivi : élus US **et européens**, milliardaires ; données réelles | ✅ adapté | Chambre US : index officiel `disclosures-clerk.house.gov` (tous les élus ayant déposé un Periodic Transaction Report, PDF officiel lié). **Sénat US** : pas de flux machine-readable gratuit → lien vers le portail officiel. **Élus européens : ces données n'existent pas** (pas d'équivalent du STOCK Act) → onglet « Europe » qui l'explique avec les sources officielles du Parlement européen. Milliardaires/fonds : 13F réels via SEC EDGAR. Dirigeants : Form 4 réels via EDGAR. |
| B7 | Temps réel ≤ 30 s | ✅ US / ⚠️ EU | US : websocket Finnhub (≈1 s) + polling 15 s + SSE vers le front. **Europe : différé ~15 min** (limite légale des plans de données gratuits, Euronext/XETRA facturent le temps réel) — affiché honnêtement avec un badge « différé ». L'abstraction provider permet de brancher un plan payant sans toucher au reste. |
| B8 | Sources liées partout | ✅ | Chaque bloc de données porte un lien source (Yahoo, Finnhub, EDGAR, IR officiel, PDF de déclaration, article de presse). |
| B9 | Plateforme : phone native + adaptatif PC/Mac | ✅ | PWA installable (manifest + service worker) + Capacitor (projets iOS/Android générables) ; trois shells responsive portés du design : téléphone plein écran, tablette (rail), desktop natif (sidebar + widgets). |
| B10 | Sécurité (front, back, base) | ✅ | Voir §7 et `SECURITY.md`. |
| B11 | Compte avec vérification e-mail par code | ✅ | Code 6 chiffres crypto-aléatoire envoyé par Resend, haché en base, TTL 10 min, 5 essais, rotation de refresh tokens. |
| B12 | Espace administrateur | ✅ | Console `#/admin` (stats, utilisateurs, audit, santé services) ; chaque route serveur exige le rôle `admin` du JWT. Processus d'accès : §8. |
| B13 | Micro-services, versionnés, scalables 10 M | ✅ | 7 services indépendants, monorepo versionné Git, images Docker par service, CI/CD, plan de scaling §10. |
| — | Estimations nominatives par analyste (design) | ⚠️ remplacé | Données propriétaires (LSEG/Refinitiv, payantes). Remplacées par le consensus officiel + l'historique réel des surprises, sourcés. |
| — | Paiement Premium | ⚠️ démo | Aucun PSP branché : le statut premium est un booléen serveur de démonstration, indiqué comme tel dans l'UI Facturation. |

## 3. Architecture globale

### 3.1 Vue d'ensemble

```
                    ┌────────────────────────────────────────────────────┐
   iPhone / PC ───▶ │ apps/web — React 18 + Vite (PWA, Capacitor)        │
                    │ shells : phone / tablette / desktop natif          │
                    └───────────────┬────────────────────────────────────┘
                                    │ /api/* (JWT Bearer, SSE)
                    ┌───────────────▼────────────────────────────────────┐
                    │ gateway :8080 — reverse-proxy Fastify              │
                    │ rate-limit global · CORS allow-list · helmet ·     │
                    │ request-id propagé · agrégation /api/health        │
                    └──┬──────┬──────┬──────┬──────┬──────┬──────────────┘
                       ▼      ▼      ▼      ▼      ▼      ▼
                     auth   market  news earnings smart   ai
                     :4001  :4002  :4003  :4004   :4005  :4006
                       │      │______│______│_______│      │
                       │             appels /internal/*    │
                       ▼             (x-internal-key)      ▼
                  Postgres 16                        API Anthropic
                  (Prisma, schéma                    (claude-opus-4-8)
                   identity, rôles
                   moindre-privilège)
                       +
                  Redis 7 (cache TTL, rate-limit) · MinIO (fichiers)
                  sidecar backup (pg_dump 6 h, rétention 14 j)
```

**Chaîne obligatoire de chaque requête** : frontend → gateway → service
(**authentification** JWT → **validation** zod → **logique métier** →
**base/fournisseur**) → réponse. Aucune route métier n'est joignable sans
passer par cette chaîne ; les routes `/internal/*` (service-à-service) exigent
`x-internal-key` et ne sont **jamais** proxifiées par le gateway (allow-list
explicite de préfixes).

### 3.2 Deux modes d'exécution

| | Mode `local` (défaut sans Docker) | Mode `docker` / production |
|---|---|---|
| Base | SQLite (`services/auth/prisma/dev.db`) | Postgres 16, schéma `identity`, rôles dédiés |
| Cache / rate-limit | Mémoire (mono-instance) | Redis 7 (partagé multi-instances) |
| Lancement | `npm run dev` (orchestrateur `scripts/dev.mjs`) | `npm run dev:docker` / `docker compose --profile full up` |
| Usage | Développement sur un poste sans dépendance | Cible réelle, scalable |

L'orchestrateur détecte Docker au démarrage et bascule automatiquement. Le
schéma Prisma est généré pour le bon provider (`scripts/gen-schema.mjs`).

### 3.3 Arborescence

```
monere/
├── apps/web/            # Frontend (React, styles.css du design, écrans, admin)
├── packages/shared/     # Socle commun : env zod, factory Fastify sécurisée,
│                        # cache Redis/mémoire, client HTTP, erreurs typées
├── services/
│   ├── gateway/         # Entrée publique unique
│   ├── auth/            # Comptes + données utilisateur + admin (+ Prisma)
│   ├── market/          # Cotations, candles, composition, SSE, job alertes
│   ├── news/            # Actualités officielles
│   ├── earnings/        # Calendrier, surprises, impact cours
│   ├── smart/           # Congrès US, 13F, Form 4 (EDGAR)
│   └── ai/              # Intégration Anthropic
├── infra/               # Dockerfiles, nginx, init Postgres, backup, Prometheus
├── scripts/             # dev.mjs (orchestrateur), dev-launch.sh
├── docs/                # BRD (ce fichier), CREDENTIALS-LOCAL.md (non versionné)
├── .github/workflows/   # CI/CD
├── docker-compose.yml   # Stack complète (profils full / backup / monitoring)
├── README.md · SECURITY.md · .env.example
```

## 4. Fonctionnement détaillé des services

### 4.1 `packages/shared` — le socle

Chaque service est construit par `buildService()` qui applique **le même
niveau de sécurité partout** : helmet, CORS restreint à `WEB_ORIGIN` (+ schémas
Capacitor), rate-limit (Redis si dispo), JWT (`requireAuth`, `requireAdmin`,
`requireInternal`), logs pino JSON avec secrets caviardés et request-id
propagé, `/health`, `/metrics` Prometheus, mapping d'erreurs uniforme (jamais
de stack trace côté client), `bodyLimit` 512 Ko, arrêt gracieux SIGTERM.

`getEnv()` valide l'environnement au boot (zod) : un `JWT_SECRET` trop court
empêche le démarrage plutôt que de tourner en mode faible.

### 4.2 `gateway` (:8080)

Seul service exposé. Route `/api/{auth,me,admin,market,news,earnings,smart,ai}`
vers le bon service en réécrivant le préfixe, transmet `x-request-id` et
`x-forwarded-for`, applique le rate-limit global, sert `/api/health` (état
agrégé des 6 services, consommé par la console admin).
**Edge cases** : service down → l'agrégat le signale `down` sans casser les
autres ; SSE passé en streaming sans buffering ; timeout upstream 120 s ;
chemin inconnu → 404 (rien d'autre n'est proxifié, donc `/internal/*`
inaccessible de l'extérieur).

### 4.3 `auth` (:4001) — identité, données utilisateur, admin

**Tables (Prisma)** : `User`, `VerificationCode`, `RefreshToken`,
`WatchlistItem`, `PriceAlert`, `FollowedInvestor`, `Notification`, `AuditLog`.

**Signup → vérification (B11)** :
1. `POST /auth/signup` — e-mail normalisé + mot de passe 10+ (maj/min/chiffre),
   hash argon2id, compte créé **non vérifié**, code 6 chiffres crypto-aléatoire
   stocké **haché SHA-256** (TTL 10 min), envoyé via Resend.
2. `POST /auth/verify` — comparaison en temps constant, compteur d'essais
   (5 max puis invalidation), succès → `emailVerified`, émission des tokens.
3. `POST /auth/resend` / `password-reset/*` — même mécanique, **réponses
   uniformes** (impossible d'énumérer les e-mails existants).

**Sessions** : access JWT 15 min (sub, email, role, premium) + refresh token
opaque 48 octets stocké haché, **rotation à chaque usage**.
**Edge cases couverts** : réutilisation d'un refresh token déjà consommé =
signal de vol → **révocation de toutes les sessions** de l'utilisateur ;
changement de mot de passe → révocation globale ; compte désactivé par un
admin → refresh refusé immédiatement ; signup sur un e-mail existant non
vérifié → renvoie un code (pas de doublon, pas de fuite) ; signup sur un
e-mail vérifié → 409 ; sans `RESEND_API_KEY`, le code n'est retourné dans la
réponse **qu'en développement**, et l'envoi échoue explicitement en prod ;
codes expirés purgés par un job horaire.

**Données utilisateur** (`/me/*`, toutes JWT) : profil + préférences de
notification, watchlist (toggle), alertes de prix (CRUD, plafond 50, toujours
filtrées par `userId` du token → pas d'IDOR), suivis smart money, centre de
notifications. **Admin** (`/admin/*`, rôle admin vérifié serveur) : stats,
liste/recherche paginée des utilisateurs, modification rôle/premium/désactivation
(désactivation = sessions révoquées), journal d'audit filtrable.
**Interne** (`/internal/*`, `x-internal-key`) : liste des alertes actives,
déclenchement d'alerte (transactionnel : alerte désactivée + notification
créée), insertion de notification **respectant les préférences** de
l'utilisateur.

**Audit** : chaque événement sensible (login réussi/échoué + IP, signup,
verify, reset, actions admin, premium) est journalisé en base, consultable
dans la console admin.

### 4.4 `market` (:4002) — cotations et graphiques réels

**Fournisseurs** : Finnhub (temps réel US, annuaire des places, fondamentaux,
recherche) avec **repli automatique Yahoo chart API** (sans clé, réel, US+EU).
`universe.ts` ne contient que des **métadonnées** (noms, domaines, mapping de
symboles) — jamais un prix.

**Endpoints** : quotes unitaires/batch (cache 15 s, concurrence bornée à 5
pour respecter les 60 req/min Finnhub), candles par plage (1D→MAX : 1D, 1W, 1M, 3M, 6M, YTD, 1Y, 5Y, MAX — TTL adapté),
indices avec spark intraday, composition d'indice (Finnhub payant → repli
Wikipedia parsé et sourcé → sinon erreur explicite), listing complet par place,
profil + ratios réels (P/E, PEG, EPS, dividende, bêta, 52 sem., capitalisation),
recherche, `GET /market/stream` (SSE).

**Temps réel (B7)** : websocket Finnhub (trades US ≈1 s, reconnexion auto,
abonnements synchronisés sur l'union des symboles regardés) + boucle de
polling 15 s → hub SSE. Le front superpose le flux SSE sur un polling
React Query 20 s (résilience si le SSE tombe).
**1D progressif (B5)** : l'API renvoie les bornes de séance et le fuseau de la
place ; le front trace sur cet axe complet, donc vide avant l'ouverture et
rempli progressivement ensuite.
**Job alertes** : toutes les 30 s, récupère les alertes actives (via auth
interne), compare aux cotations fraîches, déclenche via l'API interne.

**Edge cases** : ticker inconnu → passthrough Yahoo (toute valeur réelle est
consultable) ; quote EU → `delayed: true` affiché ; marché fermé → candles de
la dernière séance, le front filtre sur la séance du jour en 1D (état
« marché pas encore ouvert ») ; échec upstream → 503 explicite, **jamais mis
en cache** (le cache refuse les valeurs nulles) ; trade websocket ne portant
que le prix → fusionné sur la dernière quote complète côté client ; auth SSE
par token en query (EventSource ne porte pas de headers), vérifié comme un
Bearer.

### 4.5 `news` (:4003)

Actualités par société (7 j glissants) et macro/marché, cache 60 s, feed
agrégé multi-symboles dédupliqué par URL, badge « dernière minute » si < 45
min. Chaque item : titre, résumé, source, **URL réelle de l'article**, image.
**Edge cases** : sans clé Finnhub → `{available:false, message}` explicite
(l'UI affiche l'état, n'invente rien) ; items sans URL filtrés ; feed limité
à 12 symboles / 60 items.

### 4.6 `earnings` (:4004)

Calendrier officiel (fenêtre paramétrable, défaut −30/+60 j), historique des
surprises EPS par société, **`beatStats`** : statistique transparente
(beats/misses, taux, surprise moyenne, tendance) calculée uniquement sur les
chiffres publiés — c'est la « prédiction » assumée du produit, sourcée et
explicable. **Impact cours** : localisation de la clôture J-1/J/J+1 dans les
candles réels (via l'API interne du service market), % calculés, mis en cache
24 h. Liens IR officiels (registre statique vérifié) pour suivre les calls.
**Edge cases** : société sans historique → stats nulles (pas de valeur par
défaut inventée) ; date de publication hors historique de cours → impact
`null` ; `revenue` Finnhub converti en Md ; événement « TBD » affiché
« horaire à confirmer » ; sans clé → indisponibilité explicite.

### 4.7 `smart` (:4005) — sources officielles uniquement

- **Chambre US** : télécharge l'index annuel officiel (`{year}FD.zip`, année
  courante + précédente), décompresse (lecteur ZIP minimal embarqué), ne garde
  que les dépôts type `P` (Periodic Transaction Report = déclaration STOCK
  Act), groupe par élu. Chaque dépôt lie le **PDF officiel** (qui contient
  tickers/montants/dates). *Décision documentée : les datasets communautaires
  Senate/House Stock Watcher ont fermé (403) — remplacés par la source
  primaire.*
- **Sénat US** : pas de flux machine-readable gratuit → l'API renvoie le lien
  du portail officiel efdsearch, l'UI l'explique.
- **Europe** : `GET /smart/europe` explique l'absence légale de ces données
  (déclarations annuelles d'intérêts, pas de transactions) avec les sources du
  Parlement européen.
- **13F** (milliardaires & fonds) : SEC EDGAR — submissions par CIK (registre
  vérifié : Berkshire, Pershing Square, Scion, Citadel, Millennium,
  Renaissance, Third Point, Tiger Global), localisation de l'info-table XML du
  dernier 13F-HR, agrégation par émetteur, top positions avec % réels, lien
  vers le dépôt. Cache 24 h, User-Agent conforme aux règles SEC.
- **Form 4** (dirigeants) : dépôts récents par société (AAPL, MSFT, NVDA,
  GOOGL, AMZN, TSLA, META), parsing owner/rôle/transactions/plan 10b5-1,
  lien vers chaque dépôt.

**Edge cases** : index annuel absent (début d'année) → l'autre année suffit,
flag `partial` ; XML/13F illisible → erreur explicite, jamais de table vide
silencieuse ; amendements 13F-HR/A pris en compte ; codes Form 4 traduits
(P/S/A/M/F/G/D) ; élu présent sous plusieurs graphies → slug normalisé.

### 4.8 `ai` (:4006) — IA ancrée sur données sourcées

Deux capacités : **résumé des actualités impactantes** (sortie structurée
JSON : titre, pourquoi ça peut impacter le cours, sens potentiel, **URL de la
source pour chaque item**) et **analyse de simulation** (risques, effet
mécanique du levier chiffré sur la volatilité historique réelle, ce que les
données ne disent pas, rappel « pas un conseil »).

Garde-fous : le system prompt interdit tout fait de marché hors des données
injectées (collectées en direct auprès des autres services, JWT de
l'utilisateur transmis) ; sorties structurées (`output_config` JSON schema) ;
`stop_reason: refusal` géré ; cache 10 min par ticker/configuration (maîtrise
des coûts) ; rate-limit dédié 20 req/min ; sans `ANTHROPic_API_KEY` →
`/ai/status.available=false` et l'UI désactive les boutons proprement.

### 4.9 `apps/web` — frontend

Port pixel-perfect du design (styles.css d'origine + tous les écrans),
React Query pour le cache/refetch, SSE superposé pour le temps réel,
access token **en mémoire** + refresh en localStorage avec refresh-and-retry
automatique sur 401, bannière de notification (nouvelles notifications
serveur), paywall/premium, console admin, PWA (les réponses API ne sont
jamais mises en cache par le service worker), Capacitor prêt.
**Edge cases UI** : chaque requête a ses états loading/erreur/indisponible ;
badge « différé » sur les places EU ; états vides dédiés (watchlist,
notifications, pré-ouverture 1D) ; liens externes `noopener`.

## 5. Flux critiques (séquences)

**Inscription** : `signup` → compte non vérifié + code haché + e-mail Resend →
l'utilisateur saisit le code (5 essais, 10 min) → `verify` → tokens + session.
**Session** : access 15 min ; sur 401 le front joue `refresh` (rotation) et
rejoue la requête ; réutilisation d'un vieux refresh → toutes les sessions
tombent.
**Alerte de prix** : création (validée, plafonnée, liée au user) → job market
30 s → seuil franchi sur cotation réelle → API interne auth → notification en
base (si la préférence `price` est active) → polling 30 s du front → bannière.
**Graph 1D** : `GET /market/candles/X?range=1D` → bornes de séance + points
réels → axe = séance complète, courbe = points du jour uniquement.
**Analyse IA** : bouton → le service ai collecte quote+news+earnings réels →
Claude produit une synthèse citant chaque URL → cache 10 min.

## 6. Modèle de données (schéma `identity`)

`User` (rôle, premium, vérifié, désactivé, prefs notifications JSON) ·
`VerificationCode` (haché, purpose signup/reset, essais, expiration) ·
`RefreshToken` (haché, expiration, révocation, UA/IP) · `WatchlistItem`
(unique user+ticker) · `PriceAlert` (direction, seuil, active, déclenchée) ·
`FollowedInvestor` (kind+id, unique) · `Notification` (catégorie, nav, lu) ·
`AuditLog` (action, détail JSON, IP). Les données de marché ne sont **pas**
persistées : cache Redis/mémoire à TTL courts, la vérité reste chez les
fournisseurs.

## 7. Sécurité (résumé — détail dans SECURITY.md)

argon2id · codes e-mail hachés + temps constant + 5 essais · JWT 15 min +
refresh rotatif haché avec détection de réutilisation · validation zod sur
100 % des routes · rate-limit global + renforcé (`/auth` 10/min, `/ai` 20/min)
· requêtes 100 % Prisma (paramétrées) · rôles Postgres moindre-privilège +
révocation du schéma `public` · helmet/CORS/limite de corps · logs caviardés +
audit en base · secrets uniquement en env (`.env` gitignoré, seed n'affiche le
mot de passe qu'une fois) · images Docker non-root · `npm audit` bloquant en CI
· routes internes isolées par clé + non-exposition gateway.

## 8. Accès administrateur (processus)

1. `npm run db:seed` (ou premier `npm run dev`) crée l'admin avec l'e-mail
   `ADMIN_EMAIL` du `.env` et un mot de passe aléatoire **affiché une seule
   fois** dans le terminal.
2. Connexion avec ces identifiants → **Réglages → Administration** ou le
   chemin `#/admin` (sur l'URL publique de l'app, ou `http://localhost:5173`
   en local).
3. Changer le mot de passe (« Mot de passe oublié » avec l'e-mail admin).
4. Les identifiants du poste actuel sont consignés dans
   `docs/CREDENTIALS-LOCAL.md` (non versionné).

Capacités : stats plateforme, gestion des utilisateurs (désactiver = sessions
révoquées, premium, promotion/rétrogradation admin), journal d'audit, santé
des micro-services en direct.

## 9. GitHub & production

### 9.1 Rôle de GitHub

GitHub héberge **le code, l'historique, la CI/CD et les images Docker** — pas
l'exécution. Le pipeline (`.github/workflows/ci.yml`) :

1. **À chaque push/PR** : install, lint (prettier), typecheck TS strict,
   22 tests unitaires, build du frontend, `npm audit` (niveau high bloquant),
   build des 7 images Docker (cache GitHub Actions).
2. **À chaque tag `vX.Y.Z`** : publication des images versionnées sur
   **GHCR** (`ghcr.io/<user>/<repo>/monere-<service>:vX.Y.Z` + `latest`).

### 9.2 Mise en production type (VPS)

```bash
# Sur le serveur (Docker installé)
git clone https://github.com/<user>/monere && cd monere
cp .env.example .env        # remplir secrets + clés + MONERE_MODE=docker
docker compose --profile full --profile backup up -d
```
Ajouter un reverse-proxy TLS (Caddy/Traefik/nginx + Let's Encrypt) devant le
port 80 du conteneur `web`. Les migrations se déploient via
`prisma migrate deploy` (job de release). Secrets de prod : variables
d'environnement de l'hébergeur ou GitHub Actions Secrets — jamais dans le repo.

### 9.3 Maintenance & évolution

- **Versionner** : branches courtes + PR (la CI bloque lint/type/tests/audit),
  tags sémantiques pour publier les images. Chaque service a sa version dans
  son `package.json`.
- **Ajouter une fonctionnalité** : nouveau routeur dans le service concerné
  (zod + auth) → hook React Query côté front → test unitaire → PR. Pour un
  **nouveau service** : dossier `services/x` sur le modèle existant
  (`buildService`), route dans le gateway, entrée compose + CI matrix.
- **Schéma de base** : modifier `prisma/schema.body.prisma` →
  `npm run db:migrate` (dev) → la release exécute `migrate deploy`. Jamais de
  SQL manuel.
- **Changer de fournisseur de données** : implémenter l'interface dans
  `services/market/src/providers/` et brancher dans l'orchestrateur de quotes
  — le reste de l'app ne voit pas la différence (c'est ainsi qu'on passera
  l'Europe en ≤30 s avec un plan payant).
- **Scaling 10 M d'utilisateurs** : services stateless → répliques derrière un
  load-balancer (le rate-limit et le cache sont déjà dans Redis, prêt
  multi-instances) ; Postgres managé + réplicas lecture ; le hub SSE peut
  passer sur Redis pub/sub pour partager les abonnements entre répliques ;
  CDN devant le frontend statique ; les images non-root passent telles
  quelles sur Kubernetes si besoin.
- **Surveillance** : `/metrics` Prometheus par service (profil compose
  `monitoring`), `/api/health` agrégé (affiché dans la console admin), logs
  JSON centralisables (Loki/Datadog).
- **Sauvegardes** : sidecar pg_dump 6 h (rétention 14 j) + `npm run backup` ;
  en prod, expédier `backups/` vers un stockage objet ; restauration
  `psql < dump`.
- **Dépendances** : `npm audit` en CI ; activer Dependabot sur le repo.

## 10. Limites connues & risques

| Sujet | État | Mitigation |
|---|---|---|
| Temps réel Europe | Différé ~15 min (plans gratuits) | Badge « différé » ; abstraction provider prête pour EODHD/Finnhub premium |
| Sénat US | Pas de flux machine-readable gratuit | Lien portail officiel ; scraping efdsearch possible mais fragile (non retenu) |
| Élus européens | Données inexistantes légalement | Expliqué dans l'app avec sources officielles |
| Estimations par analyste | Données propriétaires | Consensus officiel + historique réel à la place |
| Paiement Premium | Démo sans PSP | Brancher Stripe : le statut serveur existe déjà |
| Yahoo chart API | Non contractuel (usage toléré) | Réel mais sans SLA ; bascule Finnhub payant prévue |
| Cache mémoire (mode local) | Mono-instance uniquement | Redis dès que Docker/prod |
| Refresh token en localStorage | Arbitrage PWA/Capacitor | Basculer cookie httpOnly+CSRF possible côté API |
| Tunnel trycloudflare | URL éphémère, dépend du Mac | VPS/PaaS pour une URL stable |

## 11. Glossaire

**PTR** : Periodic Transaction Report (déclaration de transaction STOCK Act).
**13F** : dépôt trimestriel SEC des positions des gérants > 100 M$.
**Form 4** : déclaration SEC des transactions des dirigeants (2 j ouvrés).
**SSE** : Server-Sent Events (flux temps réel unidirectionnel).
**Consensus** : moyenne des estimations d'analystes (EPS/CA) avant résultats.
