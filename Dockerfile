FROM mhart/alpine-node:12
WORKDIR /srv/app
COPY package.json yarn.lock /srv/app/
RUN yarn --frozen-lockfile --production=true

FROM mhart/alpine-node:slim-12
WORKDIR /srv/app
CMD [ "node", "index.js" ]
COPY --from=0 /srv/app .
COPY . .