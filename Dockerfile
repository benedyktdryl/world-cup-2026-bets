FROM oven/bun:1.3.13 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run lint
RUN bun run typecheck
RUN bun run test
RUN bun run build

FROM oven/bun:1.3.13-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DB_PATH=/data/world-cup-bets.sqlite
COPY --from=build /app/package.json /app/bun.lock ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/app ./app
COPY --from=build /app/scripts ./scripts
VOLUME ["/data"]
EXPOSE 3000
CMD ["bun", "run", "start:docker"]