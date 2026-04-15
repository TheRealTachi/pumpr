# Launcher — Express API + workers (watcher, indexer, WS, unlock, distribution)
# Needs native build for better-sqlite3 → use Debian slim (not alpine).

FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Install build tooling for better-sqlite3 + sharp etc.
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends \
        python3 make g++ pkg-config libsqlite3-dev ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --include=dev

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ----- Runtime image -----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends \
        ca-certificates tini && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=8787 \
    DB_PATH=/app/data/launcher.sqlite \
    IMAGE_DIR=/app/data/images

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

# Railway mounts the Volume as root-owned, so we stay as root (container is
# already sandboxed).
RUN mkdir -p /app/data/images

EXPOSE 8787
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.js"]
