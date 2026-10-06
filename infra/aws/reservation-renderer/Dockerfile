FROM public.ecr.aws/lambda/nodejs:22

COPY infra/aws/reservation-renderer/package.json ${LAMBDA_TASK_ROOT}/package.json
RUN npm install --omit=dev --no-audit --no-fund

COPY infra/aws/reservation-renderer/index.mjs ${LAMBDA_TASK_ROOT}/index.mjs

ENV AWS_EC2_METADATA_DISABLED=true
CMD ["index.handler"]
