FROM node:22-alpine

WORKDIR /app

# Backend dependencies
COPY package*.json ./
RUN npm ci --production

# Frontend build
COPY web/package*.json web/
RUN cd web && npm ci
COPY web/ web/
RUN cd web && npm run build

# Backend source
COPY src/ src/

# Serve frontend from backend
ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002

CMD ["node", "src/server.js"]
