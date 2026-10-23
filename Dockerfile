FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914
WORKDIR /app
COPY package.json server.mjs operations.mjs advisor.mjs elastic.mjs routing.mjs entrypoint.mjs search-index.mjs ./
COPY dist ./dist
# CI exports the snapshot from this exact image after its smoke test. Keep it
# outside the public directory; standalone builds can still prepare their own.
RUN if [ -f dist/.build/search-index.v8 ]; then \
      mkdir -p .cache && mv dist/.build/search-index.v8 .cache/search-index.v8 && rmdir dist/.build; \
    else \
      node --max-old-space-size=320 search-index.mjs --build; \
    fi
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
RUN mkdir -p /app/runtime && chown node:node /app/runtime
ENV NODE_OPTIONS=--max-old-space-size=320
CMD ["node","entrypoint.mjs"]
