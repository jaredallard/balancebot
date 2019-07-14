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
const helpers = require('../lib/helpers')
const _ = require('lodash')

const constructor = async (bot, info) => {
  const settingSetScene = new Scene('settingSet')
  settingSetScene.enter(ctx => {
    if (ctx.session.setting.type === 'boolean') {
      return ctx.reply('Please select an option', Extra.markup(
        Markup.keyboard(['true', 'false'], {
          columns: 2
        }).oneTime().resize()
      ))
    }

    return ctx.reply('Please select a timezone', Extra.markup(
      Markup.keyboard([
        'America/Los_Angeles',
        'Asia/Tokyo',
        'America/New_York',
        'UTC/GMT'
      ], {
        columns: 3
      }).resize().oneTime()
    ))
  })
  settingSetScene.on('text', ctx => {
    let val = ctx.message.text
    if (ctx.session.setting.type === 'boolean') {
      val = (val === 'true')
    }

    const prev = _.cloneDeep(ctx.session.user.user.settings[ctx.session.setting.field])
    ctx.session.user.user.settings[ctx.session.setting.field] = val
    ctx.session.user.save()

    ctx.scene.leave()
    return ctx.reply(`Setting '${ctx.session.setting.field}': '${prev}' -> '${val}'`)
  })

  const settingSelectScene = new Scene('settingSelect')
  settingSelectScene.enter(ctx => {
    const u = new User()
    let { username, first_name } = ctx.message.from
    if (!username) username = first_name
    username = helpers.formatUsername(username)

    const exists = u.findBySNS('telegram', username)
    if (!exists) {
      return ctx.reply('Please run /start before using this bot.')
    }

    ctx.session.user = u

    const buttons = []
    const opts = Object.keys(u.user.settings)
    for (const opt of opts) {
      buttons.push(`${opt}`)
    }

    return ctx.reply('Please select a setting to change', Extra.markup(
      Markup.keyboard(buttons, {
        columns: 2
      }).resize().oneTime()
    ))
  })
  settingSelectScene.on('text', ctx => {
    const option = ctx.message.text

    if (!ctx.session.user.user.settings[option]) {
      return ctx.reply(`Option '${option}' not found.`)
    }

    ctx.session.setting = {
      field: option,
      type: typeof ctx.session.user.user.settings[option]
    }

    ctx.scene.enter('settingSet')
  })

  const stage = new Stage([settingSelectScene, settingSetScene])
  bot.use(stage.middleware())

  bot.command(['setting', 'settings'], ctx => {
    ctx.scene.enter('settingSelect')
  })
}

module.exports = constructor
