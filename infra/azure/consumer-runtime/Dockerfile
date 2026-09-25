# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    SUPABASE_SERVICE_ROLE_KEY=build-placeholder \
    OPENAI_API_KEY=build-placeholder \
    CRON_SECRET=build-placeholder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build:surface:consumer
RUN set -eux; \
    mkdir -p /runtime/apps/consumer/.next /runtime/apps/consumer/public; \
    cp -a apps/consumer/.next/standalone/. /runtime/; \
    cp -a apps/consumer/.next/static /runtime/apps/consumer/.next/static; \
    cp -a public/. /runtime/apps/consumer/public/; \
    printf 'require("./apps/consumer/server.js");\n' > /runtime/start.cjs

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
COPY --from=builder --chown=nextjs:nextjs /runtime ./
USER nextjs
EXPOSE 3000
CMD ["node", "start.cjs"]
