FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate

EXPOSE 4100

# Generate again at start so a bind-mounted schema.prisma stays in sync
# with the client in the anonymous /app/node_modules volume.
CMD ["sh", "-c", "npx prisma generate && npm run dev"]
