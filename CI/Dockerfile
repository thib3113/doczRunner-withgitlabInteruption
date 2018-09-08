FROM node:10-alpine
MAINTAINER Citopia <citopia.fr>

WORKDIR /app

COPY ./runner.js .
COPY ./package.json .
COPY ./package-lock.json .

RUN npm i

CMD "/bin/sh"