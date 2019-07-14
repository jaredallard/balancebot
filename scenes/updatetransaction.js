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
const imagesToPdf = require('images-to-pdf')
const url = require('url')
const Minio = require('minio')
const path = require('path')
const fs = require('fs-extra')

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
  const parsed = new url.URL(config.s3.endpoint)
  const port = parsed.port || 443
  const minio = new Minio.Client({
    endPoint: parsed.host,
    port: parsed.port || 443,
    useSSL: port === 443,
    accessKey: config.s3.accessKey,
    secretKey: config.s3.secretKey
  })

  const id = uuid()
  await minio.putObject(config.s3.bucket, `receipts/${id}.pdf`, stream, undefined, {
    'content-type': 'application/pdf'
  })
  return id
}

const constructor = async (bot, info) => {
  const updateDescriptionInput = new Scene('updateDescriptionInput')
  updateDescriptionInput.enter(ctx => {
    return ctx.reply('Please enter a new description.')
  })
  updateDescriptionInput.on('text', ctx => {
    const desc = ctx.message.text

    const account = new Account()
    try {
      account.updateTransaction(ctx.session.requestId, desc)
    } catch (err) {
      info('failed to update transaction:', err.message)
      return ctx.reply('Failed to update transaction')
    }

    ctx.scene.leave()
    return ctx.reply('Updated transaction details.')
  })

  const transactionSelectionScene = new Scene('transactionSelection')
  transactionSelectionScene.enter(ctx => {
    const a = new Account()
    const rs = a.getRequests(ctx.session.user.id)

    info('searching for requests for user', ctx.session.user.id)

    ctx.session.options = []

    let buttons = []
    let i = 0
    for (const r of rs) {
      ctx.session.options.push(r.id)
      buttons.push(`${i}. ${moment(r.createdAt).format('MM-DD HH:mm')} $${r.amount} (${r.relatedIds.length} ${r.relatedIds.length === 1 ? 'person' : 'people'})`)
      i++
    }

    buttons.push('Cancel')

    return ctx.reply('Please choose the transaction to update', Extra.markup(
      Markup.keyboard(buttons, {
        columns: 1
      }).oneTime().resize()
    ))
  })
  transactionSelectionScene.hears(/^\d/, ctx => {
    const matches = ctx.message.text.match(/^(\d)/)
    if (matches.length !== 2) {
      return ctx.reply('failed to find that option')
    }

    const selection = matches[1]

    info('user selected option', selection)
    if (!ctx.session.options[selection]) {
      return ctx.reply('failed to find that option')
    }

    ctx.session.requestId = ctx.session.options[selection]
    ctx.scene.enter(ctx.session.next)
  })
  transactionSelectionScene.hears(/cancel/i, ctx => {
    ctx.reply('Canceled!', Extra.markup(Markup.removeKeyboard()))
    return ctx.scene.leave()
  })
  transactionSelectionScene.on('text', ctx => {
    return ctx.reply('Option not recognized. Send "cancel" to cancel.')
  })

  const attachRecieptScene = new Scene('attachReceipt')
  attachRecieptScene.enter(ctx => {
    return ctx.reply('Please send a pdf or image')
  })
  attachRecieptScene.on(['document', 'photo'], async ctx => {
    let document = ctx.update.message.document
    if (ctx.message.photo) {
      info('using photo block')
      // actually a file, but get the last one for best res
      document = ctx.message.photo[ctx.message.photo.length - 1]
    }

    ctx.reply('Uploading your file...')
    const link = await ctx.telegram.getFileLink(document.file_id)
    info('downloading file', link)
    request.get({ url: link, encoding: null }).on('response', async res => {
      if (res.statusCode !== 200) {
        return ctx.reply('Internal Server Error (failed to download file)')
      }

      // support non PDFs
      if (path.parse(document.file_name || 'image.jpg').ext !== 'pdf') {
        info('JIT converting to pdf')
        const filePath = path.join('/tmp/', document.file_id)
        const ws = fs.createWriteStream(filePath)
        res.pipe(ws)

        await new Promise((resolve, reject) => {
          ws.on('close', resolve)
          ws.on('error', reject)
        })

        await imagesToPdf([filePath], filePath + '.pdf')
        res = fs.createReadStream(filePath + '.pdf')
      }

      let receiptId
      try {
        info('streaming download to s3')
        receiptId = await uploadFile(res)
      } catch (err) {
        info('Failed to upload receipt to s3:', err.message)
        return ctx.reply('Internal Server Error (failed to upload file)')
      }

      info('file uploaded as', receiptId)

      const account = new Account()
      try {
        account.attachReceipt(ctx.session.requestId, receiptId)
      } catch (err) {
        info('failed to attachReceipt transaction:', err.message)
        return ctx.reply('Failed to add receipt.')
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
    ctx.reply('Canceled!', Extra.markup(Markup.removeKeyboard()))
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
