FROM node:22-slim

ENV ASTRO_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@latest --activate

RUN apt-get update && apt-get install -y gosu && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
EXPOSE 4321