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
const Stage = require('telegraf/stage')
const moment = require('moment')
const session = require('telegraf/session')
const formatCurrency = require('format-currency')

const config = require('./config/config.json')

const info = (...args) => {
  const now = new Date()
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '/')
  console.log.call(console, ...[`${dateStr}`, `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`].concat(args))
}

const main = async () => {
  const bot = new Telegraf(config.telegram.bot_token)

  bot.use(session())

  const newv2 = require('./scenes/newv2')
  await newv2(bot, info)

  bot.command('setdescription', ctx => {
    if(!ctx.session.lstm) ctx.session.lstm = {}

    const u = new User()
    let { username, first_name } = ctx.message.from
    if (!username) username = first_name
    username = helpers.formatUsername(username)

    const desc = ctx.message.text.replace(/^\/setdescription /, '')
    if (!desc || desc === '') return ctx.reply("USAGE: /setdescription description of last payment request")

    const exists = u.findBySNS('telegram', username)
    if (!exists) {
      return ctx.reply('Please run /start before using this bot.')
    }

    if(!ctx.session.lstm[u.id] || ctx.session.lstm[u.id].length === 0) {
      return ctx.reply('No recent payment request found.')
    }

    const account = new Account()
    for (const ids of ctx.session.lstm[u.id]) {
      const sids = ids.split(':')
      const aid = sids[0]
      const id = sids[1]

      try {
        account.updateTransaction(aid, id, desc)
      } catch(err) {
        info('failed to update transaction:', err.message)
        return ctx.reply('Failed to update transaction')
      }
    }

    return ctx.reply('Updated transaction details.')
  })

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
      if(a.balance === 0) continue

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
      a.transaction(u.id, 'sub', a.account.balance)
    } else if (a.account.balance < 0) {
      a.transaction(u.id, 'add', a.account.balance)
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

  bot.command('history', ctx => {
    const params = ctx.message.text.split(' ')
    if (typeof params[1] === 'undefined') {
      return ctx.reply('USAGE: /history @user')
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

    let reply = '*Account History*\n\n'
    for (const transaction of a.transactions) {
      const user = new User(transaction.userId)
      const createdAt = moment(transaction.createdAt).format('MM-DD HH:mm')
      
      let op;
      if (transaction.op === 'add') {
        op = 'added'
      } else {
        op = 'subtracted'
      }
      const username = user.id === u.id ? 'You' : '@'+user.user.sns.telegram
      reply += `${createdAt} UTC: ${username} ${op} $${formatCurrency(transaction.amount)}`
      if (transaction.description && transaction.description !== '') {
        reply += `\n Desc: ${transaction.description}\n`
      } else {
        reply += '\n'
      }
    }

    if (a.transactions.length === 0) {
      reply += 'No recent transactions.'
    }

    return ctx.replyWithMarkdown(reply)
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

    user.create(username || first_name, 'telegram', username)
    ctx.reply(`Created a user account for you. Your name is '${username || first_name}' and your SNS ID is '${id}/${username}'`)

    info('created user for SNS ID', id, 'username', username || first_name)
  })

  info('running ...')
  bot.launch()
}

main()