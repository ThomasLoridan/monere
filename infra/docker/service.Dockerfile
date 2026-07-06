# Multi-stage build for any backend service.
#   docker build -f infra/docker/service.Dockerfile --build-arg SERVICE=auth .
ARG SERVICE

FROM node:22-alpine AS build
ARG SERVICE
WORKDIR /app
# Native deps for argon2 / prisma engines
RUN apk add --no-cache python3 make g++ openssl

# npm ci validates the lockfile against EVERY workspace manifest — copy them all
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY services/gateway/package.json services/gateway/
COPY services/auth/package.json services/auth/
COPY services/market/package.json services/market/
COPY services/news/package.json services/news/
COPY services/earnings/package.json services/earnings/
COPY services/smart/package.json services/smart/
COPY services/ai/package.json services/ai/

# Install only the root + shared + target service dependency trees
RUN npm ci --include-workspace-root -w packages/shared -w services/${SERVICE}

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY services/${SERVICE} services/${SERVICE}
RUN npm run build -w packages/shared && npm run build -w services/${SERVICE} \
 && if [ -d services/${SERVICE}/prisma ]; then npm run db:generate -w services/${SERVICE}; fi

FROM node:22-alpine AS runtime
ARG SERVICE
ENV NODE_ENV=production
# Run as non-root (security baseline)
USER node
WORKDIR /app
COPY --from=build --chown=node:node /app /app
ENV SERVICE_NAME=${SERVICE}
CMD ["sh", "-c", "node services/${SERVICE_NAME}/dist/index.js"]
