/**
 * User Tracking Library
 *
 * @author Jared Allard <jaredallard@outlook.com>
 * @license MIT
 * @version 1
 */

const helpers = require('./helpers')
const uuid = require('uuid/v4')
const _ = require('lodash')

const UserObject = {
  id: '',
  createdAt: new Date(),

  name: '',

  /**
   * Settings Object
   */
  settings: {
    timezone: 'UTC',
    notifications: true
  },

  /**
   * Social networking mapping IDs
   * @type {Object<String, String}
   */
  sns: {}
}

class User {
  constructor (id = '') {
    /**
     * @type {UserObject}
     */
    this.user = UserObject
    this.db = helpers.openDatabase('users')

    if (!this.db.has('users').value()) {
      this.db.set('users', []).write()
    }

    this.id = null

    if (id !== '') {
      this.id = id
      this.user = this.db.get('users').getById(id).value()

      // add the settings object, this will be written at next save()
      if (!this.user.settings) this.user.settings = _.cloneDeep(UserObject.settings)
    }

    // generate a new user
    if (!this.user) {
      this.user = {
        createdAt: new Date(),
        name: '',
        sns: {}
      }
    }
  }

  /**
   * Create a user
   *
   * @param {String} name Name of the user
   * @param {String} snsName sns platform name
   * @param {String} snsId sns mapping ID
   */
  create (name, snsName, snsId) {
    this.user.name = name
    this.user.sns[snsName] = snsId
    this.save()
  }

  /**
   * Find a user by SNS id.
   *
   * @param {String} snsName sns platform name
   * @param {String} snsId sns platform id
   * @returns {Boolean} user existed or not
   */
  findBySNS (snsName, snsId) {
    this.db.read()

    const searchOpts = { sns: {} }
    searchOpts.sns[snsName] = snsId

    const found = this.db.get('users').find(searchOpts).value()
    if (!found) return false
    this.user = found
    this.id = this.user.id

    // add the settings object, this will be written at next save()
    if (!this.user.settings) this.user.settings = _.cloneDeep(UserObject.settings)

    return true
  }

  /**
   * Check if the user exists
   * @returns {Boolean} user exists or not2
   */
  exists () {
    if (this.db.get('users').getById(this.id).value()) {
      return true
    }

    return false
  }

  /**
   * Delete a user
   * @returns {undefined} nothing
   */
  delete () {
    if (!this.id) return
    this.db.get('users').remove({
      id: this.id
    }).write()
  }

  /**
   * Save the user to the database. This takes the entire
   * local object and stores it into the db.
   *
   * @returns {undefined} nothing
   */
  save () {
    if (this.id) {
      this.db.get('users').getById(this.id).assign(this.user).write()
      return
    }

    const userId = uuid()
    this.user.id = userId
    this.id = userId
    this.db.get('users').insert(this.user).write()
  }
}

module.exports = User
