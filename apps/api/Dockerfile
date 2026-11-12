FROM node:22.23.3-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm prisma:generate && pnpm build \
  && pnpm --filter @homeware/api deploy --prod /runtime \
  && cp -R apps/api/dist /runtime/dist

FROM node:22.23.3-alpine AS runtime
# Apply the reviewed Alpine security revision and omit unused runtime package managers.
# These exact paths belong only to this image layer, never to host/project data.
RUN apk add --no-cache 'zlib=1.3.2-r1' \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v1.22.22 \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production
WORKDIR /app
USER node
COPY --from=build --chown=node:node /runtime ./
EXPOSE 3000
CMD ["node", "dist/main.js"]

