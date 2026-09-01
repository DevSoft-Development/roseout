# syntax=docker/dockerfile:1.7

FROM public.ecr.aws/awsguru/aws-lambda-adapter:1.0.1 AS lambda-adapter

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
    HOSTNAME=0.0.0.0 \
    PLATFORM_RUNTIME_PROVIDER=aws-background \
    AWS_LWA_PORT=3000 \
    AWS_LWA_READINESS_CHECK_PROTOCOL=tcp \
    AWS_LWA_ASYNC_INIT=false

COPY --from=lambda-adapter /lambda-adapter /opt/extensions/lambda-adapter

RUN npm init -y >/dev/null 2>&1 \
    && npm install --omit=dev @aws-sdk/client-secrets-manager@3.864.0 >/dev/null 2>&1 \
    && addgroup -S nextjs \
    && adduser -S nextjs -G nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY infra/aws/background-runtime/bootstrap.mjs ./bootstrap.mjs
RUN chown -R nextjs:nextjs /app

USER nextjs
EXPOSE 3000
CMD ["node", "bootstrap.mjs"]
