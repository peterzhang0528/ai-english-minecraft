FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY web ./web

ENV NODE_ENV=production
ENV MAPLE_PORT=8080
EXPOSE 8080

CMD ["node", "--experimental-strip-types", "src/server.ts"]
