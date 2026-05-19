FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/mcp-server ./packages/mcp-server
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @gigflow/shared build
RUN pnpm --filter @gigflow/mcp-server build
# `pnpm deploy` resolves the workspace package into a self-contained
# directory with a real (non-symlinked) node_modules — exactly what the
# runner stage needs.
RUN pnpm --filter @gigflow/mcp-server --prod deploy /app/deploy

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3333
COPY --from=build /app/deploy ./
EXPOSE 3333
CMD ["node", "dist/server.js"]
