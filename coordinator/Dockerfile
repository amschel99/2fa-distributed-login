FROM node:18.18.2
WORKDIR /app
COPY package.json .
ARG NODE_ENV
RUN if [ "$NODE_ENV" = "development" ]; \
    then npm install; \
    else npm install --omit=dev; \
    fi

COPY . .
EXPOSE 8000

CMD ["npm", "run", "spin"]