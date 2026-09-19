# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ARG WEB_SURFACE
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=secret,id=platform_env,target=/tmp/platform_env,required=true \
    set -eux; \
    cp /tmp/platform_env "apps/$WEB_SURFACE/.env.production.local"; \
    trap 'rm -f "apps/$WEB_SURFACE/.env.production.local"' EXIT; \
    case "$WEB_SURFACE" in \
      admin) npm run build:surface:admin ;; \
      business) npm run build:surface:business ;; \
      reserve) npm run build:surface:reserve ;; \
      *) echo "WEB_SURFACE must be admin, business, or reserve" >&2; exit 2 ;; \
    esac
RUN set -eux; \
    mkdir -p /runtime; \
    cp -a "apps/$WEB_SURFACE/.next/standalone/." /runtime/; \
    mkdir -p "/runtime/apps/$WEB_SURFACE/.next" "/runtime/apps/$WEB_SURFACE/public"; \
    cp -a "apps/$WEB_SURFACE/.next/static" "/runtime/apps/$WEB_SURFACE/.next/static"; \
    cp -a public/. "/runtime/apps/$WEB_SURFACE/public/"; \
    printf 'require("./apps/%s/server.js");\n' "$WEB_SURFACE" > /runtime/start.cjs

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
COPY --from=builder --chown=nextjs:nextjs /runtime ./
COPY --chown=nextjs:nextjs infra/aws/web-surfaces/runtime-env-loader.cjs ./runtime-env-loader.cjs
COPY --chown=nextjs:nextjs infra/aws/web-surfaces/healthcheck.cjs ./healthcheck.cjs
USER nextjs
EXPOSE 3000
CMD ["node", "-r", "./runtime-env-loader.cjs", "start.cjs"]
