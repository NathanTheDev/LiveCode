# GH issue #2 Phase 5: Fly.io-compatible image for the ysocket relay - small
# runtime image, single exposed port that respects $PORT, non-root.

FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./

# node:alpine already ships a non-root `node` user - no need to create one.
USER node

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
