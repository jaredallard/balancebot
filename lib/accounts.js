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

/**
 * "Schema" for an account
 */
const AccountObject = {
  id: '',
  createdAt: new Date(),
  owner: '',
  related: '',
  balance: 0,
  currency: 'USD',
  currencyStr: '$'
}

/**
 * "Schema" for a request
 */
const RequestObject = {
  createdAt: new Date(),
  id: '', // UUID of the payment request
  description: '', // Description of the payment request

  // UserID of who created this
  createdById: '',

  // UserID of who owns this request
  ownerId: '',

  /**
   * UserIds this request relates too
   * @type {String[]}
   */
  relatedIds: [],

  /**
   * Transaction IDs related to this request
   * @type {String[]}
   */
  transactionIds: [],

  /**
   * Receipt IDs
   * @type {String[]}
   */
  receiptIds: []
}

/**
 * "Schema" for a transaction
 */
const TransactionObject = {
  requestId: '', // UUID of a request id
  id: '', // ID of the transaction
  op: '', // operation: add, sub
  userId: '', // UUID of the user
  amount: 0, // amount the transaction concerned
  description: '' // description of the transaction
}

class Account {
  constructor (id = '') {
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

    // create the requests schema if it doesn't exist yet (pre requests listing)
    if (!this.db.has('requests').value()) {
      this.db.set('requests', []).write()
    }

    this.id = null
    if (id !== '') {
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
  create (owner, related) {
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
  exists () {
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
  delete () {
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
  save () {
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
  find (ownerId, relatedId) {
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
  findAll (userId) {
    return this.db.get(this.dbName).filter(a => {
      if (a.owner === userId) return true
      if (a.related === userId) return true

      return false
    }).value()
  }

  /**
   * Get a request by ID
   * @param {String} requestId requestId
   * @returns {RequestObject|null} request object
   */
  getRequest (requestId) {
    if (!requestId) {
      throw new Error('Missing requestId')
    }

    if (!this.db.has('requests').value()) {
      this.db.set('requests', []).write()
    }

    const val = this.db.get('requests').getById(requestId).value()
    if (!val) throw new Error(`Failed to find request '${requestId}'`)

    return val
  }

  /**
   * Create a new transaction
   * @param {String} userId userId creating this transaction
   * @param {String} op operation to run
   * @param {Number} amount amount to charge
   * @param {requestId=} requestId requestID. if there is one
   * @returns {TransactionObject} transaction
   */
  transaction (userId, op = 'add', amount = 0, requestId = '') {
    let b = this.account.balance
    amount = Math.round(amount)
    if (op === 'add') {
      b = b + amount
    } else if (op === 'sub') {
      b = b - amount
    }

    this.account.balance = b
    this.save()

    const transaction = {
      id: uuid(),
      op,
      userId,
      amount,
      requestId,
      description: ''
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
   * @param {String} requestId request id to update
   * @param {String} description description of the transaction
   */
  updateTransaction (requestId, description) {
    const t = this.db.get('requests').getById(requestId).value()
    if (!t) throw new Error(`Request '${requestId}' not found`)

    this.db.get('requests').getById(requestId).assign({
      description
    }).write()
  }

  /**
   * Attach a receipt to a transaction
   *
   * @param {String} requestId request id to update
   * @param {String} description description of the transaction
   */
  attachReceipt (requestId, receiptId) {
    const t = this.db.get('requests').getById(requestId).value()
    if (!t) throw new Error(`Request '${requestId}' not found`)

    this.db.get('requests').getById(requestId).assign({
      receiptIds: [ receiptId ]
    }).write()
  }

  /**
   * Get a transaction
   * @param {String} accountId account id
   * @param {String} transactionId transaction id
   * @returns {TransactionObject} transaction
   */
  getTransaction (accountId, transactionId) {
    const val = this.db.get('transactions').get(accountId).getById(transactionId).value()
    if (!val) throw new Error(`Transaction '${accountId}' in account '${accountId}' not found`)
    return val
  }

  /**
   * Get the 5 latest requests
   * @param {String} userId user who created or is the owner of this request
   * @returns {RequestObject[]}
   */
  getRequests (userId) {
    return this.db.get('requests').filter({
      ownerId: userId
    }).sort(this._requestSorter.apply(this)).take(5).value()
  }

  /**
   * Sorts transactions in asc order
   * @param {TransactionObject} a transaction
   * @param {TransactionObject} b transaction
   */
  _requestSorter (a, b) {
    let acd = a.createdAt
    let bcd = b.createdAt

    if (a.requestId) {
      let r = this.getRequest(a.requestId)
      acd = r.createdAt
    }
    if (b.requestId) {
      let r = this.getRequest(b.requestId)
      bcd = r.createdAt
    }

    const ad = new Date(acd)
    const bd = new Date(bcd)
    return bd - ad
  }

  /**
   * Get the latest transactions on this account
   * @returns {TransactionObject[]}
   */
  get transactions () {
    return this.db.get('transactions').get(this.account.id).sort(this._requestSorter.apply(this)).take(5).value()
  }
}

module.exports = Account
