FROM node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/collab/package.json apps/collab/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/database/prisma packages/database/prisma
RUN pnpm install --frozen-lockfile
RUN DATABASE_URL=postgresql://build:build@postgres:5432/collab_docs_build \
  pnpm --filter @collab-docs/database exec prisma generate --schema prisma/schema.prisma

COPY apps/collab apps/collab
RUN pnpm --filter @collab-docs/collab build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/collab/node_modules ./apps/collab/node_modules
COPY --from=build /workspace/apps/collab/dist ./apps/collab/dist
USER node
EXPOSE 3002
CMD ["node", "apps/collab/dist/main.js"]
