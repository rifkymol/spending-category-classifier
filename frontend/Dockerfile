# Next.js frontend (standalone output). Build from the repo root:
#   docker build -f frontend/Dockerfile .

# node:22-alpine, pinned 2026-10-18. Update: docker pull node:22-alpine, then
# docker image inspect --format '{{index .RepoDigests 0}}' node:22-alpine
FROM node:26-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS deps
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

# node:22-alpine, pinned 2026-10-18. Update: docker pull node:22-alpine, then
# docker image inspect --format '{{index .RepoDigests 0}}' node:22-alpine
FROM node:26-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS build
WORKDIR /app
# The browser calls the API directly, so this URL is baked into the client
# bundle at build time. Change it with a build arg (see README).
ARG NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./
RUN npm run build

# node:22-alpine, pinned 2026-10-18. Update: docker pull node:22-alpine, then
# docker image inspect --format '{{index .RepoDigests 0}}' node:22-alpine
FROM node:26-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
# Files stay root-owned; the node user only needs to read them.
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
