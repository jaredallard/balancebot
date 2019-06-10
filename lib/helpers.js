'use strict'

const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const path = require('path')
const lodashId = require('lodash-id')

module.exports = {
  /**
   * Open a database
   * @param {String} dbName name of database to open
   * @returns {low}
   */
  openDatabase: dbName => {
    const adapter = new FileSync(path.join(__dirname, '../db', dbName))
    const db = low(adapter)
    db._.mixin(lodashId)

    return db
  },

  /**
   * Format a username
   *
   * @param {String} username username of the user
   * @returns {String} formatted username
   */
  formatUsername: username => {
    return username.replace('@', '').toLowerCase()
  }
}