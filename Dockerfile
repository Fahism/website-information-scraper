FROM node:20-slim

# ── System dependencies required by Chromium ──────────────────────────────────
RUN apt-get update && apt-get install -y \
    ca-certificates fonts-liberation libappindicator3-1 libasound2 \
    libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 \
    libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 \
    libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 \
    libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
    libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
    libxshmfence1 libdrm2 \
    lsb-release wget xdg-utils --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Install dependencies ───────────────────────────────────────────────────────
COPY package.json package-lock.json ./
RUN npm ci

# ── Install Playwright Chromium browser ───────────────────────────────────────
# Use `playwright install` (not playwright-core) — the app uses playwright-extra
# which wraps the `playwright` package and needs its browser binary.
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.playwright-browsers
RUN npx playwright install chromium --with-deps

# ── Build arguments for NEXT_PUBLIC_* vars ────────────────────────────────────
# These are baked into the client-side bundle at build time by Next.js.
# They MUST be provided as build args — without them Supabase won't work on the frontend.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# ── Copy source and build ──────────────────────────────────────────────────────
COPY . .
RUN npm run build

# ── Assemble standalone output ────────────────────────────────────────────────
# Next.js standalone mode requires static assets copied manually
RUN cp -r .next/static .next/standalone/.next/static
# Copy public folder if it exists (favicon, images, etc.)
RUN if [ -d "public" ]; then cp -r public .next/standalone/public; fi

RUN npm prune --omit=dev

# ── Runtime environment ───────────────────────────────────────────────────────
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
# Playwright browser path must also be available at runtime (not just build time)
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.playwright-browsers

EXPOSE 3000
CMD ["node", ".next/standalone/server.js"]
