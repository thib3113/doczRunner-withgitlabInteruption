FROM node:10-alpine
MAINTAINER Citopia <citopia.fr>

RUN apk add --no-cache git bash openssh-client

WORKDIR /app

COPY ./package.json .
COPY ./package-lock.json .
RUN npm i

COPY ./runner.js .

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh
RUN ln -s usr/local/bin/docker-entrypoint.sh / # backwards compat

ENTRYPOINT ["docker-entrypoint.sh", "&&", "npm", "start"]
#ENTRYPOINT ["npm", "start"]