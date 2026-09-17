# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=secret,id=platform_env,target=/app/.env.production.local,required=true npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --chown=nextjs:nextjs infra/aws/web-surfaces/runtime-env-loader.cjs ./runtime-env-loader.cjs
COPY --chown=nextjs:nextjs infra/aws/web-surfaces/healthcheck.cjs ./healthcheck.cjs
USER nextjs
EXPOSE 3000
CMD ["node", "-r", "./runtime-env-loader.cjs", "server.js"]
