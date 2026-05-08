FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/dashboard ./packages/dashboard
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @gigflow/shared build
RUN pnpm --filter @gigflow/dashboard build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/packages/dashboard/.next/standalone ./
COPY --from=build /app/packages/dashboard/.next/static ./packages/dashboard/.next/static
COPY --from=build /app/packages/dashboard/public ./packages/dashboard/public
EXPOSE 3000
CMD ["node", "packages/dashboard/server.js"]
