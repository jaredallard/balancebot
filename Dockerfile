FROM mhart/alpine-node:11
CMD [ "node", "index.js" ]
WORKDIR /srv/app

RUN apk add --no-cache python make gcc g++
COPY package.json yarn.lock /srv/app/

RUN yarn --frozen-lockfile --production=true

COPY . .