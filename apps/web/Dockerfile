# Next.js — standalone build for a tiny runtime image.

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --include=dev

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined at build time, not runtime, so they must
# be passed in as build args. Railway forwards service vars as build args.
ARG NEXT_PUBLIC_SOLANA_RPC_URL
ARG NEXT_PUBLIC_LAUNCHER_API
ARG NEXT_PUBLIC_STAKING_PROGRAM_ID
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_SOLANA_RPC_URL=$NEXT_PUBLIC_SOLANA_RPC_URL \
    NEXT_PUBLIC_LAUNCHER_API=$NEXT_PUBLIC_LAUNCHER_API \
    NEXT_PUBLIC_STAKING_PROGRAM_ID=$NEXT_PUBLIC_STAKING_PROGRAM_ID
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1

RUN apt-get update -qq && apt-get install -y --no-install-recommends tini ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# standalone output = minimal runtime deps + built pages
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]
