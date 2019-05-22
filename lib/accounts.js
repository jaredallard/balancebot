/**
 * Account Library
 * 
 * @author Jared Allard <jaredallard@outlook.com>
 * @license MIT
 * @version 1
 */

const helpers = require('./helpers')
const uuid = require('uuid/v4')
const _ = require('lodash')

const AccountObject = {
  id: '',
  createdAt: new Date(),
  owner: '',
  related: '',
  balance: 0,
  currency: 'USD',
  currencyStr: '$',
}

class Account {
  constructor(id = '') {
    /**
     * @type {AccountObject}
     */
    this.account = _.cloneDeep(AccountObject)
    this.dbName = 'accounts'
    this.db = helpers.openDatabase(this.dbName)

    if (!this.db.has(this.dbName).value()) {
      this.db.set('transactions', {}).write()
      this.db.set(this.dbName, []).write()
    }

    this.id = null
    if (id != '') {
      this.id = id
      this.account = this.db.get(this.dbName).getById(id).value()
      if (!this.account) {
        throw new Error(`Account '${id}' not found.`)
      }
    }
  }

  /**
   * Create an acccount
   * 
   * If the balance is positive, the related user owes the owner.
   * If the balance is negative, the owner owes the related
   * 
   * @param {String} owner the owner of the account
   * @param {String} related the related user of the account
   */
  create(owner, related) {
    const found = this.find(owner, related)
    if (found) throw new Error('Account already exists for these two people')

    this.account.owner = owner
    this.account.related = related
    this.save()
  }

  /**
   * Check if the account exists
   * @returns {Boolean} user account or not
   */
  exists() {
    if (!this.id) throw new Error('Unselected account')
    if (this.db.get(this.dbName).getById(this.id).value()) {
      return true
    }

    return false
  }

  /**
   * Delete this account
   * @returns {undefined} nothing
   */
  delete() {
    if (!this.id) throw new Error('Unselected account')
    this.db.get(this.dbName).remove({
      id: this.id
    }).write()
  }

  /**
   * Save the user to the database. This takes the entire
   * local object and stores it into the db.
   * 
   * @returns {undefined} nothing
   */
  save() {
    if (this.id) {
      this.db.get(this.dbName).getById(this.id).assign(this.account).write()
      return
    }

    const aId = uuid()
    this.account.id = aId
    this.id = aId
    this.account.createdAt = new Date()
    this.db.get(this.dbName).insert(this.account).write()
  }

  /**
   * Find an account by user id
   * @param {String} userId user1 id
   * @param {String} relatedId user2 id
   * @returns {Account|null} account object or undefined
   */
  find(ownerId, relatedId) {
    if (!ownerId || !relatedId) {
      throw new Error('Missing ownerId or relatedId')
    }

    const a = this.db.get(this.dbName).find(a => {
      if (a.owner === ownerId && a.related === relatedId) return true
      if (a.related === ownerId && a.owner === relatedId) return true
      return false
    }).value()

    if (!a) return null
    return new Account(a.id)
  }

  /**
   * Find all accounts a user is involved with
   * @param {String} userId user id
   * @returns {AccountObject[]} accounts
   */
  findAll(userId) { 
    return this.db.get(this.dbName).filter(a => {
      if(a.owner === userId) return true
      if(a.related === userId) return true

      return false
    }).value()
  }

  /**
   * Create a new transaction
   * @param {String} userId userId creating this transaction
   * @param {String} op operation to run
   * @param {Number} amount amount to charge
   * @returns {Object} to be defined later ...
   */
  transaction(userId, op = 'add', amount = 0) {
    let b = this.account.balance
    amount = Math.round(amount)
    if (op === 'add') {
      b = b + amount
    } else if (op === 'sub') {
      b = b - amount
    }

    this.account.balance = b
    //if (this.account.balance === -0) this.account.balance = Math.abs(this.account.balance)
    this.save()

    const transaction =  {
      createdAt: new Date(),
      id: uuid(),
      op,
      userId,
      amount,
      description: '',
    }

    // create the transactions schema if it doesn't exist yet (pre transactions listing)
    if (!this.db.has('transactions').value()) {
      this.db.set('transactions', {}).write()
    }

    // create the initial transactions block
    if (!this.db.get('transactions').has(this.account.id).value()) {
      this.db.get('transactions').set(this.account.id, []).write()
    }

    // add a transaction
    this.db.get('transactions').get(this.account.id).insert(transaction).write()

    return transaction
  }

  /**
   * Update a transaction
   *
   * @param {String} aid account id
   * @param {String} id transaction id
   * @param {String} description description of the transaction
   */
  updateTransaction(aid, id, description) {
    const t = this.db.get('transactions').get(aid).getById(id).value()
    if(!t) throw new Error(`Transaction '${id}' in account '${aid}' not found`)

    this.db.get('transactions').get(aid).getById(id).assign({
      description,
    }).write()
  }

  get transactions() {
   return this.db.get('transactions').get(this.account.id).sort((a, b) => {
     const ad = new Date(a.createdAt)
     const bd = new Date(b.createdAt)
     return bd - ad
   }).take(5).value()
  }
}

module.exports = Account