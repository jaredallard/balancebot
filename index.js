/**
 * Balance Bot
 *
 * @author Jared Allard <jaredallard@outlook.com>
 * @license MIT
 * @version 1
 **/

const Telegraf = require('telegraf')
const User = require('./lib/user')
const Account = require('./lib/accounts')
const helpers = require('./lib/helpers')
const session = require('telegraf/session')
const formatCurrency = require('format-currency')

const config = require('./config/config.json')

const info = (...args) => {
  const now = new Date()
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '/')
  const seconds = now.getSeconds()
  console.log.call(console, ...[`${dateStr}`, `${now.getHours()}:${now.getMinutes()}:${seconds < 10 ? `0${seconds}` : seconds}`].concat(args))
}

const main = async () => {
  const bot = new Telegraf(config.telegram.bot_token)

  bot.use(session())

  const newv2 = require('./scenes/newv2')
  const updateTransaction = require('./scenes/updatetransaction')
  const setting = require('./scenes/settings')
  const history = require('./scenes/history')

  await history(bot, info)
  await newv2(bot, info)
  await updateTransaction(bot, info)
  await setting(bot, info)

  bot.command('status', ctx => {
    const u = new User()
    let { username, first_name } = ctx.message.from
    if (!username) username = first_name
    username = helpers.formatUsername(username)

    const exists = u.findBySNS('telegram', username)
    if (!exists) {
      return ctx.reply('Please run /start before using this bot.')
    }

    info(`show status for user ${username} (ID: ${u.id})`)

    const account = new Account()
    const accounts = account.findAll(u.id)

    let reply = `*@${username} Status*\n\n`
    let total = 0
    for (const a of accounts) {
      if (a.balance === 0) continue

      const owner = new User(a.owner)
      const related = new User(a.related)

      let weOwe = false

      // we're the owner, and a negative number, we owe related
      if (a.owner === u.id && a.balance < 0) {
        weOwe = true
      }

      // their the owner, and NOT a negative number, we owe owner
      if (a.related === u.id && a.balance > 0) {
        weOwe = true
      }

      if (weOwe) {
        const to = a.owner === u.id ? related : owner
        total = total - a.balance
        reply += `You owe @${to.user.sns.telegram} ${a.currencyStr}${formatCurrency(a.balance)}\n`
      } else {
        total = total + a.balance
        const from = a.owner === u.id ? related : owner
        reply += `@${from.user.sns.telegram} owes you ${a.currencyStr}${formatCurrency(a.balance)}\n`
      }
    }

    if (accounts.length === 0) {
      reply = '*No balances found*'
    } else {
      reply += `\nTotal: $${formatCurrency(total)}\n`
      reply += 'For more information, run `/history @user`.'
    }

    return ctx.replyWithMarkdown(reply)
  })

  bot.command('paid', ctx => {
    const params = ctx.message.text.split(' ')
    if (typeof params[1] === 'undefined') {
      return ctx.reply('USAGE: /paid @user')
    }

    const payToUser = params[1].replace('@', '').toLowerCase()

    const u = new User()
    let { id, username, first_name } = ctx.message.from
    if (!username) username = first_name
    username = helpers.formatUsername(username)

    let existed = u.findBySNS('telegram', username)
    if (!existed) return ctx.reply('Please run /start before using this bot.')

    const payTo = new User()
    existed = payTo.findBySNS('telegram', payToUser)
    if (!existed) {
      return ctx.reply(`Failed to find user: @${payToUser}`)
    }

    const account = new Account()
    const a = account.find(u.id, payTo.id)
    if (!a) return ctx.reply(`Failed to find a balance between @${payToUser} and you.`)

    if (a.account.balance > 0) {
      a.transaction(u.id, 'sub', Math.abs(a.account.balance))
    } else if (a.account.balance < 0) {
      a.transaction(u.id, 'add', Math.abs(a.account.balance))
    } else {
      return ctx.reply('Account is already at zero.')
    }

    a.save()

    info('sending paid message to', config.telegram.announce_id)
    ctx.tg.sendMessage(config.telegram.announce_id, `🎉🎉🎉 *@${u.user.sns.telegram} just paid back @${payToUser}* 🎉🎉🎉`, {
      parse_mode: 'markdown'
    })

    return ctx.reply(`Marked balance as paid between you and @${payToUser}`)
  })

  bot.command('help', ctx => {
    return ctx.replyWithMarkdown('*Commands*:\n\nnew - Create a new balance (/new BALANCE @user...)\nstatus - Show the status of balances\npaid - Mark a balance as paid to another user (/paid @user)\nstart - Create a user account\nhistory - View transaction history of an account')
  })

  bot.command('start', ctx => {
    const user = new User()
    let { id, username, first_name } = ctx.message.from
    if (!username) username = first_name
    username = helpers.formatUsername(username)

    const existed = user.findBySNS('telegram', username)
    if (existed) {
      ctx.reply('You already have an account!')
      return
    }

    user.create(username, 'telegram', username)
    ctx.reply(`Created a user account for you. Your name is '${username}' and your SNS ID is '${id}/${username}'`)

    info('created user for SNS ID', id, 'username', username)
  })

  info('running ...')
  bot.launch()
}

main()