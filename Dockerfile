FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4173

COPY package.json ./
COPY index.html fridge.html selfhost.html styles.css ./
COPY apps ./apps
COPY core ./core
COPY src ./src
COPY server ./server

RUN mkdir -p /app/server/data/fridges

EXPOSE 4173

CMD ["npm", "start"]
