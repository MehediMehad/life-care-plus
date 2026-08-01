# /server/Dockerfile
FROM node:22

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Provide a dummy URL so prisma generate succeeds during docker build.
ARG DATABASE_URL="postgresql://fake:fake@fake_host:5432/fake_db"
RUN npm run prisma:generate
RUN npm run build

EXPOSE 5000

CMD ["npm", "start"]