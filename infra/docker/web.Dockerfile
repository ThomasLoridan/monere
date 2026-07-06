# Frontend: build static PWA, serve via nginx with API proxy.
FROM node:22-alpine AS build
WORKDIR /app

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

RUN npm ci --include-workspace-root -w apps/web

COPY apps/web apps/web
RUN npm run build -w apps/web

FROM nginx:1.27-alpine
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
