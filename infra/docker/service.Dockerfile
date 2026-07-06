# Multi-stage build for any backend service.
#   docker build -f infra/docker/service.Dockerfile --build-arg SERVICE=auth .
ARG SERVICE

FROM node:22-alpine AS build
ARG SERVICE
WORKDIR /app
# Native deps for argon2 / prisma engines
RUN apk add --no-cache python3 make g++ openssl
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY services/${SERVICE}/package.json services/${SERVICE}/
RUN npm ci --workspaces --include-workspace-root --omit=optional || npm install --workspaces --include-workspace-root
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
