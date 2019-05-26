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
const moment = require('moment-timezone')
const formatCurrency = require('format-currency')
const AWS = require('aws-sdk')
const config = require('../config/config.json')

/**
 * Get a receipt's presigned URL
 *
 * @param {String} receiptId receipt id
 * @returns {String} file URL
 */
const getReceiptURL = async (receiptId) => {
  const s3 = new AWS.S3({
    endpoint: config.s3.endpoint,
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
    signatureVersion: 'v2'
  })

  return new Promise((resolve, reject) => {
    s3.getSignedUrl('getObject', {
      Bucket: config.s3.bucket, 
      Key: `receipts/${receiptId}.pdf`,
      Expires: 120
    }, (err, url) => {
      if (err) return reject(err)
      return resolve(url)
    })
  })
}

const history = async (payToUser, ctx) => {
  const u = new User()
  let { username, first_name } = ctx.message.from
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

    let date = transaction.createdAt
    let receipts = transaction.receipts
    let description = transaction.description
    if (transaction.requestId) {
      const r = account.getRequest(transaction.requestId)
      receipts = r.receiptIds
      description = r.description
      date = r.createdAt
    }

    const tz = u.user.settings.timezone || 'UTC'

    const createdAt = moment(date).tz(tz).format('MM-DD HH:mm')

    let op
    if (transaction.op === 'add') {
      op = 'added'
    } else {
      op = 'subtracted'
    }
    const username = user.id === u.id ? 'You' : '@' + user.user.sns.telegram
    reply += `${createdAt}: ${username} ${op} $${formatCurrency(transaction.amount)}`
    if (description && description !== '') {
      reply += `\n Desc: ${description}\n`
    } else {
      reply += '\n'
    }

    if (receipts && receipts.length !== 0) {
      let pos = 0
      for (const receiptId of receipts) {
        pos++
        reply += ` [Receipt #${pos}](${await getReceiptURL(receiptId)})\n`
      }
    }
  }

  if (a.transactions.length === 0) {
    reply += 'No recent transactions.'
  }

  return ctx.replyWithMarkdown(reply, Extra.webPreview(false))
}

const constructor = async (bot, info) => {
  const userSelectionScene = new Scene('userSelection')
  userSelectionScene.enter(ctx => {
    const u = new User()

    let { username, first_name } = ctx.message.from
    if (!username) username = first_name
    username = helpers.formatUsername(username)

    const users = u.db.get('users').filter(user => {
      if (user.sns.telegram !== username) return true
      return false
    }).value()

    const userNames = users.map(u => {
      return '@' + u.sns.telegram
    })

    info('display usernames', userNames)
    return ctx.reply('Which user?', Extra.markup(
      Markup.keyboard(userNames, {
        columns: 3
      }).resize().oneTime()
    ))
  })
  userSelectionScene.on('text', ctx => {
    ctx.scene.leave()

    const u = new User()
    const username = helpers.formatUsername(ctx.message.text)
    const exists = u.findBySNS('telegram', username)
    if (!exists) {
      return ctx.reply(`Failed to find user: ${username}. Please re-run this command.`)
    }

    history(username, ctx)
  })

  const stage = new Stage([userSelectionScene])
  bot.use(stage.middleware())
  bot.command('history', async ctx => {
    const params = ctx.message.text.split(' ')
    if (typeof params[1] === 'undefined') {
      return ctx.scene.enter('userSelection')
    }

    const payToUser = helpers.formatUsername(params[1])
    history(payToUser, ctx)
  })
}

module.exports = constructor
