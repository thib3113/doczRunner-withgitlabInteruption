FROM node:10-alpine
MAINTAINER Citopia <citopia.fr>

COPY ./runner.js .
COPY ./package.json .
COPY ./package-lock.json.json .

RUN npm i

CMD npm start

EXPOSE 3000