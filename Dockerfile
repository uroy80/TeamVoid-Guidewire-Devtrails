# ── Stage 1: Build ──
FROM node:22-alpine AS builder

# Build-time public vars for Vite. Vite only inlines VITE_* env vars that are
# present in the frontend package's own directory at build time, so we receive
# them as ARGs and drop them into packages/frontend/.env before the build.
ARG VITE_GOOGLE_MAPS_KEY=""
ARG VITE_API_URL=""

WORKDIR /app
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
RUN npm ci

COPY packages/shared/ packages/shared/
COPY packages/backend/ packages/backend/
COPY packages/frontend/ packages/frontend/
COPY tsconfig.base.json ./

# Write the build-time env file so Vite can inline the key. Kept to this
# scoped file (not the repo root .env) so nothing bleeds into the backend.
RUN printf 'VITE_GOOGLE_MAPS_KEY=%s\nVITE_API_URL=%s\n' \
    "$VITE_GOOGLE_MAPS_KEY" "$VITE_API_URL" > packages/frontend/.env

# Build shared first, then backend and frontend
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/backend
RUN npm run build --workspace=packages/frontend

# ── Stage 2: Production ──
FROM node:22-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

# Copy backend build
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/backend/package.json packages/backend/
COPY --from=builder /app/packages/shared/dist/ packages/shared/dist/
COPY --from=builder /app/packages/backend/dist/ packages/backend/dist/
COPY --from=builder /app/packages/backend/src/db/ packages/backend/src/db/
COPY --from=builder /app/packages/backend/src/config/knexfile.ts packages/backend/src/config/knexfile.ts

# Copy frontend build (static files)
COPY --from=builder /app/packages/frontend/dist/ packages/frontend/dist/

# Install production deps only
RUN npm ci --omit=dev --ignore-scripts 2>/dev/null || npm install --omit=dev

# Install serve for frontend static files
RUN npm install -g serve

EXPOSE 3000 4173

# Start script
COPY <<'EOF' /app/start.sh
#!/bin/sh
# Run migrations
cd /app/packages/backend
npx knex migrate:latest --knexfile src/config/knexfile.ts 2>/dev/null || true
cd /app

# Serve frontend on 4173
serve -s packages/frontend/dist -l 4173 &

# Start backend on 3000
node packages/backend/dist/index.js
EOF

RUN chmod +x /app/start.sh
CMD ["/app/start.sh"]
