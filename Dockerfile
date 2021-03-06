FROM node:current-alpine
LABEL maintainer="citopia <citopia.fr>" version=1.0

RUN apk add --no-cache git bash openssh-client yarn

ENV CI_MODE false

WORKDIR /app

COPY ./package.json .
RUN yarn install

COPY ./runner.js .

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh
RUN ln -s usr/local/bin/docker-entrypoint.sh /

#generate working dir
RUN mkdir working

VOLUME /app/workding

ENTRYPOINT ["docker-entrypoint.sh"]
