# Broker image. Build from the repository root:  docker build -f services/broker/deploy/Dockerfile .
# Not built or deployed by the agent (BLOCKER-006: deployment needs owner approval).
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @lensmate/broker... build \
 && pnpm --filter @lensmate/broker deploy --prod /out

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/ ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:8080/healthz >/dev/null 2>&1 || exit 1
CMD ["node", "dist/index.js"]
