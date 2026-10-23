FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs operations.mjs advisor.mjs elastic.mjs routing.mjs entrypoint.mjs ./
COPY dist ./dist
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
RUN mkdir -p /app/runtime && chown node:node /app/runtime
ENV NODE_OPTIONS=--max-old-space-size=320
CMD ["node","entrypoint.mjs"]
