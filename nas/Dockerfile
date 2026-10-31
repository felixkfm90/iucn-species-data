FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c
LABEL org.opencontainers.image.title="FN Wildlife & Travel – gemeinsames Projekt"
WORKDIR /app
COPY species-explorer/shared-project/errors.mjs species-explorer/shared-project/security.mjs species-explorer/shared-project/catalog.mjs species-explorer/shared-project/store.mjs species-explorer/shared-project/http.mjs species-explorer/shared-project/cli.mjs ./species-explorer/shared-project/
COPY nas/snapshot.mjs ./nas/snapshot.mjs
ENV NODE_ENV=production
USER 10001:10001
EXPOSE 4317
STOPSIGNAL SIGTERM
CMD ["node", "--no-warnings", "species-explorer/shared-project/cli.mjs", "serve", "--db", "/project/project.sqlite", "--confirm-local-storage", "--config", "/configuration/service.json"]
