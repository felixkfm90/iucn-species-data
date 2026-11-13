FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c
LABEL org.opencontainers.image.title="FN Wildlife & Travel – gemeinsames Projekt"
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY species-explorer/shared-project/errors.mjs species-explorer/shared-project/security.mjs species-explorer/shared-project/catalog.mjs species-explorer/shared-project/species-record.mjs species-explorer/shared-project/store.mjs species-explorer/shared-project/http.mjs species-explorer/shared-project/cli.mjs species-explorer/shared-project/website-alt-sync.mjs ./species-explorer/shared-project/
COPY species-explorer/page-authoring/contract.mjs species-explorer/page-authoring/model.mjs species-explorer/page-authoring/shared.mjs species-explorer/page-authoring/templates.mjs ./species-explorer/page-authoring/
COPY species-explorer/shared-project/image-media.mjs species-explorer/shared-project/image-media-store.mjs species-explorer/shared-project/image-media-http.mjs ./species-explorer/shared-project/
COPY species-explorer/shared-project/species-editorial.mjs species-explorer/shared-project/species-editorial-data.mjs species-explorer/shared-project/species-editorial-intent.mjs species-explorer/shared-project/species-editorial-adoption.mjs species-explorer/shared-project/species-view.mjs ./species-explorer/shared-project/
COPY species-explorer/shared-project/species-enrichment.mjs ./species-explorer/shared-project/
COPY species-explorer/shared-project/reader-catalog.mjs species-explorer/shared-project/reader-projection.mjs species-explorer/shared-project/reader-service.mjs ./species-explorer/shared-project/
COPY species-explorer/shared-project/normal-media.mjs species-explorer/shared-project/normal-media-schema.mjs species-explorer/shared-project/normal-media-store.mjs species-explorer/shared-project/normal-media-http.mjs species-explorer/shared-project/normal-media-inspection.mjs species-explorer/shared-project/media-reference-context.mjs ./species-explorer/shared-project/
COPY scripts/image-validation.mjs scripts/image-header.mjs scripts/spectrogram-renderer.mjs ./scripts/
COPY scripts/audio-format.mjs scripts/audio-validation.mjs ./scripts/
COPY scripts/map-provenance.mjs scripts/taxonomy-overrides.mjs scripts/species-data-pipeline.mjs scripts/sound-rejection-key.mjs ./scripts/
COPY species-explorer/species-model.mjs species-explorer/storage-migration.mjs species-explorer/storage-paths.mjs species-explorer/taxonomy-storage.mjs species-explorer/website-alt-parser.mjs species-explorer/website-alt-policy.mjs species-explorer/website-alt-store.mjs ./species-explorer/
COPY nas/snapshot.mjs nas/bootstrap-personal.mjs ./nas/
RUN chmod -R a+rX /app
ENV NODE_ENV=production
USER 10001:10001
EXPOSE 4317
STOPSIGNAL SIGTERM
CMD ["node", "--no-warnings", "species-explorer/shared-project/cli.mjs", "serve", "--db", "/project/project.sqlite", "--confirm-local-storage", "--config", "/configuration/service.json"]
