# Aurum Desk container. NOT yet built or run by the author (no Docker on the dev machine): test it first.
# One copy only: the app keeps its database in a file and runs its tracker inside the process.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# APP_URL is read at build time for robots.txt and the sitemap; pass it with --build-arg APP_URL=https://your.domain
ARG APP_URL=
ENV APP_URL=$APP_URL
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATABASE_FILE=/app/data/aurum.db
# The full install is kept on purpose: `next start` loads next.config.ts, which needs the build toolchain.
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts
# Non-root, with a data directory it can write to. Mount a volume here so the database survives restarts.
RUN mkdir -p /app/data && chown -R node:node /app/data /app/.next
USER node
VOLUME /app/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/auth/me').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
