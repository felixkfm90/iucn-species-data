FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c
LABEL org.opencontainers.image.title="FN Wildlife & Travel – gemeinsames Projekt"
WORKDIR /app
COPY species-explorer/shared-project/errors.mjs species-explorer/shared-project/security.mjs species-explorer/shared-project/catalog.mjs species-explorer/shared-project/species-record.mjs species-explorer/shared-project/store.mjs species-explorer/shared-project/http.mjs species-explorer/shared-project/cli.mjs species-explorer/shared-project/website-alt-sync.mjs ./species-explorer/shared-project/
COPY species-explorer/page-authoring/contract.mjs species-explorer/page-authoring/model.mjs species-explorer/page-authoring/shared.mjs species-explorer/page-authoring/templates.mjs ./species-explorer/page-authoring/
COPY species-explorer/species-model.mjs species-explorer/storage-migration.mjs species-explorer/storage-paths.mjs species-explorer/taxonomy-storage.mjs species-explorer/website-alt-parser.mjs species-explorer/website-alt-policy.mjs species-explorer/website-alt-store.mjs ./species-explorer/
COPY nas/snapshot.mjs nas/bootstrap-personal.mjs ./nas/
RUN chmod -R a+rX /app
ENV NODE_ENV=production
USER 10001:10001
EXPOSE 4317
STOPSIGNAL SIGTERM
CMD ["node", "--no-warnings", "species-explorer/shared-project/cli.mjs", "serve", "--db", "/project/project.sqlite", "--confirm-local-storage", "--config", "/configuration/service.json"]
