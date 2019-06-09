/**
 * New v2 scene - better UX
 *
 * @author Jared Allard <jaredallard@outlook.com>
 * @license MIT
 * @version 1
 */

const Stage = require('telegraf/stage')
const Scene = require('telegraf/scenes/base')
const Extra = require('telegraf/extra')
const Markup = require('telegraf/markup')
const User = require('../lib/user')
const Account = require('../lib/accounts')
const helpers = require('../lib/helpers')
const formatCurrency = require('format-currency')
const request = require('request-promise-native')
const { enter } = Stage
const config = require('../config/config.json')
const uuid = require('uuid/v4')

const rates = {
  base: '',
  rates: {},
  symbolMap: {
    '$': 'USD',
    '€': 'EUR',
    '¥': 'JPY',
    '₫': 'VND',
    '£': 'GBP',
    '₩': 'KRW',
    'zł': 'PLN'
  }
}

const initMoney = async (info) => {
  if (process.env.SKIP_CURRENCY) {
    rates.rates['USD'] = 1
    rates.base = 'USD'
    return
  }

  const startedAt = new Date()
  info('updating local currency exchange rates')

  const res = await request(`https://openexchangerates.org/api/latest.json?app_id=${config.openexchange.app_id}`, {
    json: true
  })

  rates.rates = res.rates
  rates.base = res.base
  const finishedAt = new Date()
  info('updated exchange rates in', finishedAt.getTime()-startedAt.getTime(), 'ms')
}

/**
 * Convert from one cureency to another
 * @param {String} from currency to convert from
 * @param {String} to currency to convert too
 * @param {Number} amount amount to convert
 */
const convert = (from, to, amount) => {
  if (!rates.rates[from]) throw new Error(`Failed to find from currency '${from}'.`)
  if (!rates.rates[to]) throw new Error(`Failed to find to currency from '${to}'.`)

  if (from === rates.base) {
    // console.log('base->', from, to, rates.rates[to])
    return amount * rates.rates[to]
  }

  if (to === rates.base) {
    // console.log('base<- ',from, to, rates.rates[to])
    return amount / rates.rates[from]
  }

  // from -> base (i.e USD) -> to
  console.log('warning: using expiramental FROM -> USD -> TO support.')
  const middleConvert = convert(from, rates.base, amount)
  return convert(rates.base, to, middleConvert)
}

const constructor = async (bot, info) => {
  await initMoney(info)

  // 1 minute -> 1 hour -> 24 hours
  setInterval(() => {
    initMoney(info)
  }, 60000 * 60 * 24)

  const amountScene = new Scene('amount')
  amountScene.enter(ctx => {
    info('enter amount scene')
    let { username, first_name } = ctx.message.from
    if (!username) username = first_name
    username = helpers.formatUsername(username)

    const u = new User()
    const exists = u.findBySNS('telegram', username)
    if(!exists) return ctx.reply('Please run /start before using this bot.')

    ctx.session.user = u

    return ctx.reply('How much should we request?')
  })
  amountScene.on('text', ctx => {
    let amount = ctx.message.text.replace(/[,\s]/g, '')
    const numAmount = parseInt(amount.replace(/[^\d]/g, ''), 10)
    if (isNaN(numAmount)) {
      return ctx.reply('Invalid input')
    }

    let symbol = amount[0]

    let currency = 'USD'
    if (rates.symbolMap[symbol]) {
      currency = rates.symbolMap[symbol]
      info('detected currency', currency)
    }

    info('attempt to convert amount', amount)
    const convertedAmount = convert(currency, 'USD', numAmount)

    info('create amount', amount)
    const formatedAmount = formatCurrency(convertedAmount)
    ctx.session.amount = convertedAmount
    ctx.session.formatedAmount = formatedAmount

    ctx.scene.enter('userSelection')
  })

  const userSelectionScene = new Scene('userSelection')
  userSelectionScene.enter(ctx => {
    const u = new User()
    const users = u.db.get('users').value()
    const userNames = users.map(u => {
      return '@' + u.sns.telegram
    })

    ctx.session.users = []
    userNames.push('done')

    info('display usernames', userNames)
    const formatedAmount = ctx.session.formatedAmount
    return ctx.reply(`OK, we will request ${formatedAmount} USD.\nWho should we request this from? (send "done" when done):`, Extra.markup(
      Markup.keyboard(userNames, {
        columns: 3
      }).resize()
    ))
  })
  userSelectionScene.hears('done', ctx => {
    if (ctx.session.users.length === 0) {
      ctx.reply('No users selected. Canceling.')
      ctx.scene.leave()
      return
    }

    const userNames = ctx.session.users.map(id => {
      const u = new User(id)
      return '@' + u.user.sns.telegram
    })
    ctx.reply(`Going to request payment of ${ctx.session.formatedAmount} from:\n${userNames.join('\n')}\nOk?`, Extra.markup(Markup.keyboard(
      ['Yes', 'No'], {
        columns: 2
      }
    ).resize().oneTime()))

    ctx.scene.enter('confirm')
  })
  userSelectionScene.on('text', ctx => {
    const u = new User()
    const username = helpers.formatUsername(ctx.message.text)
    const exists = u.findBySNS('telegram', username)
    if (!exists) {
      return ctx.reply(`Failed to find user: ${username}. Please try again.`)
    }
    ctx.session.users.push(u.id)
  })

  const confirmScene = new Scene('confirm')
  confirmScene.on('text', ctx => {
    const opt = ctx.message.text.replace(/\s+/g, '').toLowerCase()
    info('confirm payment scene, option:', opt)
    if (opt !== 'yes') {
      ctx.reply('Canceling payment request.')
      return ctx.scene.leave()
    }

    const u = ctx.session.user
    const balance = ctx.session.amount

    const rId = uuid()
    const lastTransactions = []
    for (const user of ctx.session.users) {
      const account = new Account()

      // skip us since we're "paying" ourself here.
      if (user === u.id) continue

      let a = account.find(u.id, user)
      if (!a) {
        account.create(u.id, user)
        a = account.find(u.id, user)
        if (!a) {
          ctx.scene.leave()
          return ctx.reply('Internal Server Error (ERRJITACC)')
        }
      }

      let op
      if (a.account.owner === u.id) {
        op = 'add'
      } else {
        op = 'sub'
      }

      info(`new transaction: op=${op},account=${a.id},balance=${balance}`)
      const t = a.transaction(u.id, op, balance / ctx.session.users.length, rId)
      lastTransactions.push(t.id)
    }

    const r = {
      createdAt: new Date(),
      id: rId,
      createdById: u.id,
      ownerId: u.id,
      relatedIds: ctx.session.users,
      amount: balance,
      transactionIds: lastTransactions
    }

    const account = new Account()
    account.db.get('requests').insert(r).write()
    info('created requestId', r.id)

    ctx.reply(`Payment request created for a total of ${formatCurrency(balance)} USD`)
    return ctx.scene.leave()
  })

  const stage = new Stage([amountScene, userSelectionScene, confirmScene])
  bot.use(stage.middleware())
  bot.command('new', ctx => {
    if (!ctx.message.text.split(' ')[1]) {
      info('using v1.2 /new')
      return enter('amount')(ctx)
    }

    info('using v1 /new')
    const params = ctx.message.text.split(' ')
    let balance = params[1].replace(/[^\d\.]/g, '')
    let balanceStr = params[1]

    const help = () => {
      ctx.reply('USAGE: /new [currency]balance ...@debtor\nUSAGE: /new @creditor [currency]balance ...@debtor')
    }

    if (params.length < 2) {
      return help()
    }

    if (balance === 'help') {
      return help()
    }

    let { username, first_name } = ctx.message.from
    if (!username) username = first_name

    const u = new User()
    try {
      balance = parseInt(balance, 10)
      if (isNaN(balance)) throw new Error('Invalid Balance')

      params.shift()
      params.shift()
    } catch (err) {
      info('using overloaded /new')

      try {
        balance = parseInt(params[2].replace(/[^\d]/g, ''), 10)
        balanceStr = params[2]
        if (isNaN(balance)) throw new Error('Invalid Balance')
        username = params[1].replace('@', '').toLowerCase()
        params.shift()
        params.shift()
        params.shift()
      } catch (err) {
        info('failed to parse overloaded:', err.message)
        return help()
      }
    }

    let symbol = balanceStr[0]
    let currency = 'USD'
    if (rates.symbolMap[symbol]) {
      currency = rates.symbolMap[symbol]
      info('detected currency', currency)
    }

    info('attempt to convert amount', balance)
    balance = convert(currency, 'USD', balance)

    // format the username
    username = helpers.formatUsername(username)
    const exists = u.findBySNS('telegram', username)
    if (!exists) {
      return ctx.reply(`Failed to find the user ${username}, did you or they run /start?`)
    }

    const invalidUsers = []
    const validUserIds = []
    const validUsers = params.filter(user => {
      const username = user.replace('@', '').toLowerCase()
      info('checking if username', username, 'is valid')
      const u = new User()
      if (u.findBySNS('telegram', username)) {
        validUserIds.push(u.id)
        return true
      }

      invalidUsers.push(user)
      return false
    })

    if (invalidUsers.length !== 0) {
      return ctx.reply(`Failed to find users: '${invalidUsers.join(',')}' (try username or first names)`)
    }

    if (validUserIds.length === 0) {
      return ctx.reply('No users found or specified.')
    }

    info(`creating new payment request, balance=${balance} from users=${validUsers.join(',')}`)

    const rId = uuid()
    const lastTransactions = []
    for (const user of validUserIds) {
      const account = new Account()

      // skip us since we're "paying" ourself here.
      if (user === u.id) continue

      let a = account.find(u.id, user)
      if (!a) {
        account.create(u.id, user)
        a = account.find(u.id, user)
        if (!a) {
          return ctx.reply('Internal Server Error (ERRJITACC)')
        }
      }

      let op
      if (a.account.owner === u.id) {
        op = 'add'
      } else {
        op = 'sub'
      }

      const bal = balance / validUserIds.length
      info(`new transaction: op=${op},account=${a.id},balance=${bal}`)
      const t = a.transaction(u.id, op, bal, rId)
      lastTransactions.push(t.id)
    }

    const r = {
      createdAt: new Date(),
      id: rId,
      createdById: u.id,
      ownerId: u.id,
      relatedIds: validUserIds,
      amount: balance,
      transactionIds: lastTransactions
    }

    const account = new Account()
    account.db.get('requests').insert(r).write()

    return ctx.reply(`Payment request created for a total of ${formatCurrency(balance)} USD`)
  })
}

module.exports = constructor
