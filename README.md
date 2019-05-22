# balancebot

A bot to track money balances between friends on Telegram.

## Installation

Setup `./config/config.default.json` and renam to `./config/config.json`

```bash
$ docker run --restart=always --name=balancebot -v $(pwd)/config:/srv/app/config -v $(pwd)/db:/srv/app/db -d jaredallard/balancebot:v1

# Automatic updates
$ docker run -d --name watchtower -v /var/run/docker.sock:/var/run/docker.sock containrrr/watchtower
```

Profit.

## License

MIT