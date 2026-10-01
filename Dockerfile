# ---- build ----
FROM node:26-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- PO token provider ----
# Makes yt-dlp traffic look like a real player, which may get past
# "confirm you're not a bot" without cookies. Not guaranteed.
FROM node:26-slim AS pot
ARG POT_VERSION=2.0.0
WORKDIR /pot
ADD https://github.com/Brainicism/bgutil-ytdlp-pot-provider/archive/refs/tags/${POT_VERSION}.tar.gz pot.tgz
RUN tar xzf pot.tgz --strip-components=1 \
 && cd server && npm ci && npx tsc && npm prune --omit=dev

# ---- runtime ----
FROM node:26-slim
WORKDIR /app
ARG POT_VERSION=2.0.0

# ffmpeg merges the separate video and audio streams YouTube serves.
# python3 is yt-dlp's runtime; curl fetches the yt-dlp binary itself.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates curl \
 && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

COPY --from=pot /pot/server /opt/bgutil
ADD https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases/download/${POT_VERSION}/bgutil-ytdlp-pot-provider.zip /etc/yt-dlp/plugins/

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/.output ./.output

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
