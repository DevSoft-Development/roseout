FROM public.ecr.aws/awsguru/aws-lambda-adapter:1.0.1 AS lambda-adapter
FROM supabase/edge-runtime:v1.74.3

COPY --from=lambda-adapter /lambda-adapter /opt/extensions/lambda-adapter
COPY supabase/functions /home/deno/functions
COPY infra/aws/edge-runtime/main /home/deno/functions/main

ENV AWS_LWA_PORT=8080 \
    AWS_LWA_READINESS_CHECK_PATH=/healthz \
    AWS_LWA_READINESS_CHECK_PROTOCOL=http \
    AWS_LWA_READINESS_CHECK_HEALTHY_STATUS=200-399 \
    AWS_LWA_ASYNC_INIT=false \
    TMPDIR=/tmp \
    DENO_DIR=/tmp/deno-dir \
    XDG_CACHE_HOME=/tmp/.cache \
    HOME=/tmp \
    RUST_BACKTRACE=1

EXPOSE 8080

CMD ["start", "--main-service", "/home/deno/functions/main", "--port", "8080", "--policy", "per_worker"]
