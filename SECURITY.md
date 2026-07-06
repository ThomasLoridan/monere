# Sécurité — Monere

## Modèle de menace couvert

Application financière grand public : vol de compte, fuite de données,
abus d'API (scraping/coûts LLM), élévation de privilèges, injection.

## Authentification & sessions

- **Mots de passe** : argon2id (winner PHC), politique 10+ caractères avec
  majuscule/minuscule/chiffre validée serveur (zod).
- **Vérification e-mail obligatoire** : code à 6 chiffres crypto-aléatoire,
  stocké **haché (SHA-256)**, TTL 10 min, **5 tentatives max** puis invalidation,
  renvoi rate-limité. Comparaison en temps constant (`timingSafeEqual`).
  Envoi réel via Resend ; sans clé, le code n'est retourné qu'en `NODE_ENV=development`.
- **JWT d'accès** : 15 min, HS256, secret ≥ 32 octets exigé au boot.
- **Refresh tokens** : opaques 48 octets, stockés **hachés**, rotation à chaque
  usage ; **la réutilisation d'un token révoqué révoque toutes les sessions**
  (signal de vol). Changement de mot de passe = révocation globale.
- **Réinitialisation** : même mécanique de code, réponse uniforme (pas
  d'énumération d'e-mails).

## Autorisations

- Rôles `user`/`admin` portés par le JWT et **vérifiés dans chaque service**
  (pas seulement au gateway) : `requireAuth`, `requireAdmin`.
- Routes service-à-service `/internal/*` : clé `INTERNAL_API_KEY` (≥ 32 octets),
  jamais exposées par le gateway (allow-list de préfixes explicite).
- Données utilisateur systématiquement filtrées par `userId` du token
  (alertes, watchlist, notifications) — pas d'IDOR possible.
- Désactivation d'un compte par un admin = révocation immédiate des sessions.

## Entrées & API

- **Validation zod sur chaque route** (body, query, params) avec messages
  explicites ; tickers/IDs contraints par regex.
- **Rate limiting** (Redis en prod) : global gateway, renforcé sur `/auth/*`
  (10/min) et `/ai/*` (20/min, coût LLM).
- `bodyLimit` 512 Ko ; helmet (CSP et headers) ; CORS restreint à `WEB_ORIGIN`
  + schémas Capacitor ; erreurs uniformisées sans stack trace côté client.

## Base de données

- **100 % Prisma** → requêtes paramétrées, zéro concaténation SQL.
- **Moindre privilège** : rôle `monere_auth` limité au schéma `identity`,
  rôle `monere_readonly` en lecture seule (init SQL compose) ; `public` révoqué.
- **Chiffrement** : secrets applicatifs jamais en clair en base (mots de passe
  argon2, codes/refresh tokens hachés). En prod, activer le chiffrement au repos
  du volume Postgres (fournisseur cloud) et TLS sur les connexions.
- **Backups** : sidecar `pg_dump` toutes les 6 h (rétention 14 j) +
  `npm run backup` ; scripts de restauration standard `psql < dump`.

## Frontend

- Access token **en mémoire uniquement** ; le refresh token persiste en
  localStorage (arbitrage PWA/Capacitor documenté — pour un durcissement web pur,
  basculer sur cookie httpOnly + CSRF, l'API le permet).
- Aucun secret dans le bundle : seules les routes `/api/*` sont appelées.
- Service worker : les réponses API ne sont **jamais** mises en cache.
- Liens externes ouverts avec `noopener` ; contenu tiers non injecté en HTML.

## Logs & audit

- pino JSON avec **redaction** (`authorization`, `cookie`, `*.password`,
  `*.token`, `*.apiKey`) ; request-id propagé de bout en bout.
- **Journal d'audit en base** : connexions (réussies/échouées + IP), signups,
  vérifications, resets, actions admin, changements premium — consultable dans
  l'espace admin.
- `/metrics` Prometheus par service (latences HTTP, process).

## Chaîne d'approvisionnement & déploiement

- `npm audit` en CI (niveau high bloquant, dépendances prod).
- Images Docker multi-stage, exécution **non-root** (`USER node`).
- Secrets uniquement par variables d'environnement ; `.env` gitignoré ;
  `.env.example` sans aucune valeur sensible.
- CI : lint, typecheck, tests, build images ; publication GHCR sur tag.

## Signaler une vulnérabilité

Ouvrir une issue privée « Security advisory » sur le repo GitHub dédié
(ou contacter l'administrateur du projet). Merci de ne pas divulguer
publiquement avant correctif.
