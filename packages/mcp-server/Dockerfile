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

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3333
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/packages/mcp-server/dist ./packages/mcp-server/dist
COPY --from=build /app/packages/mcp-server/package.json ./packages/mcp-server/
EXPOSE 3333
CMD ["node", "packages/mcp-server/dist/server.js"]
