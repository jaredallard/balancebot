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
const Telegraf = require('telegraf')
const Minio = require('minio')

const helpers = require('../lib/helpers')
const moment = require('moment')
const request = require('request')
const uuid = require('uuid/v4')

const config = require('../config/config.json')

/**
 * Upload a file to s3
 * 
 * @param {internal.Stream} stream file stream to upload
 * @returns {String} file id
 */
const uploadFile = async (stream) => {
  const minio = new Minio.Client({
    endPoint: config.s3.endpoint,
    port: 443,
    useSSL: true,
    accessKey: config.s3.accessKey,
    secretKey: config.s3.secretKey
  })

  const id = uuid()
  await minio.putObject(config.s3.bucket, `receipts/${id}.pdf`, stream)
  return id
}

/**
 * @param {Telegraf.Telegraf} bot 
 */
const constructor = async (bot, info) => {
  const updateDescriptionInput = new Scene('updateDescriptionInput')
  updateDescriptionInput.enter(ctx => {
    return ctx.reply('Please enter a new description.')
  })
  updateDescriptionInput.on('text', ctx => {
    const desc = ctx.message.text

    const account = new Account()
    for (const ids of ctx.session.lstm[ctx.session.user.id]) {
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

    ctx.scene.leave()
    return ctx.reply('Updated transaction details.')
  })

  const transactionSelectionScene = new Scene('transactionSelection')
  transactionSelectionScene.enter(ctx => {
    if (!ctx.session.lstm) ctx.session.lstm = {}
    const tids = ctx.session.lstm[ctx.session.user.id]
    if (!tids) {
      ctx.scene.leave()
      return ctx.reply('Internal Server Error (missing lstm db for user)')
    }

    const tokens = tids[0].split(':')
    const aid = tokens[0]
    const id = tokens[1]

    const a = new Account(aid)
    const t = a.getTransaction(aid, id)

    const button = `1. ${moment(t.createdAt).format('MM-DD HH:mm')} ${a.account.currencyStr}${t.amount * tids.length} (${tids.length} people)`

    return ctx.reply('Please choose the transaction to update', Extra.markup(
      Markup.keyboard([
        button,
        'Cancel'
      ]).oneTime().resize()
    ))
  })
  transactionSelectionScene.hears(/1./, ctx => {
    ctx.scene.enter(ctx.session.next)
  })
  transactionSelectionScene.hears(/cancel/i, ctx => {
    ctx.reply('Canceled!')
    return ctx.scene.leave()
  })
  transactionSelectionScene.on('text', ctx => {
    return ctx.reply('Option not recognized. Send "cancel" to cancel.')
  })

  const attachRecieptScene = new Scene('attachReceipt')
  attachRecieptScene.enter(ctx => {
    return ctx.reply('Please send me a pdf or image via the "File" method.')
  })
  attachRecieptScene.on('document', async ctx => {
    ctx.reply('Uploading your file...')
    const link = await ctx.telegram.getFileLink(ctx.message.document.file_id)
    info('streaming file to s3', link)
    request.get({ url: link, encoding: null }).on("response", async res => {
      if (res.statusCode !== 200) {
        return ctx.reply('Internal Server Error (failed to download file)')
      }

      let receiptId
      try {
        receiptId = await uploadFile(res)
      } catch(err) {
        info('Failed to upload receipt to s3:', err.message)
        return ctx.reply('Internal Server Error (failed to upload file)')
      }

      info('file uploaded as', receiptId)

      const account = new Account()
      for (const ids of ctx.session.lstm[ctx.session.user.id]) {
        const sids = ids.split(':')
        const aid = sids[0]
        const id = sids[1]

        info('attaching receipt', `accountId=${aid},transactionId=${id},receiptId=${receiptId}`)
  
        try {
          account.attachReceipt(aid, id, receiptId)
        } catch(err) {
          info('failed to attachReceipt transaction:', err.message)
          return ctx.reply('Failed to add receipt.')
        }
      }

      ctx.scene.leave()
      return ctx.reply('Receipt attached.')
    })
  })
  attachRecieptScene.on('message', async ctx => {
    return ctx.reply('Invalid input. Send "cancel" to cancel.')
  })
  

  const optionsScene = new Scene('options')
  optionsScene.enter(ctx => {
    const u = new User()
    let { username, first_name } = ctx.message.from
    if (!username) username = first_name
    username = helpers.formatUsername(username)
  
    const exists = u.findBySNS('telegram', username)
    if (!exists) {
      return ctx.reply('Please run /start before using this bot.')
    }

    ctx.session.user = u

    return ctx.reply('Please choose an option', Extra.markup(
      Markup.keyboard([
        'Update Description',
        'Attach a Receipt',
        'Cancel'
      ], {
        columns: 2
      }).resize().oneTime()
    ))
  })
  optionsScene.hears(/update description/i, ctx => {
    info('starting updateDescription path')
    ctx.session.next = 'updateDescriptionInput'
    ctx.scene.enter('transactionSelection')
  })
  optionsScene.hears(/attach a receipt/i, ctx => {
    info('starting attachReceipt path')
    ctx.session.next = 'attachReceipt'
    ctx.scene.enter('transactionSelection')
  })
  optionsScene.hears(/cancel/i, ctx => {
    ctx.reply('Canceled!')
    return ctx.scene.leave()
  })
  optionsScene.on('text', ctx => {
    ctx.reply('Unrecognized option.')
    ctx.scene.enter('options')
  })

  const stage = new Stage([optionsScene, transactionSelectionScene, updateDescriptionInput, attachRecieptScene])
  bot.use(stage.middleware())
  bot.command('updatetransaction', ctx => {
    ctx.scene.enter('options')
  })
}

module.exports = constructor