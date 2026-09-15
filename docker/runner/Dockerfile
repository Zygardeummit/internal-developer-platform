FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install --no-install-recommends -y ca-certificates git \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir /workspace \
  && chown node:node /workspace

WORKDIR /workspace
USER node
