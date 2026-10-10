# Colyseus game server for Fly.io
FROM node:22-slim AS base
WORKDIR /app

# Install workspace deps (server + shared only)
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN npm ci --omit=dev --workspace=@cameroon-life/server --include-workspace-root=false

COPY packages/shared packages/shared
COPY apps/server apps/server

ENV NODE_ENV=production
ENV PORT=2567
EXPOSE 2567
WORKDIR /app/apps/server
CMD ["npx", "tsx", "src/index.ts"]
