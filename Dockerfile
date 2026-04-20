# Builder stage
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl

WORKDIR /app
COPY package.json package-lock.json* ./

RUN npm ci --include=dev --legacy-peer-deps && npm cache clean --force

COPY . .
RUN npm run build

# Runner stage
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

COPY --from=builder /app/build ./build
COPY --from=builder /app/prisma ./prisma

# Change ownership to non-root user
RUN chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

CMD ["npm", "run", "docker-start"]
