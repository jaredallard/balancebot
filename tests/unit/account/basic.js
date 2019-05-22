const assert = require('assert')
const Account = require('../../../lib/accounts')
const path = require('path')
const fs = require('fs-extra')

describe('Account', () => {
  afterEach(async () => {
    await fs.unlink(path.join(__dirname, '../../../db/accounts'))
  })

  describe('e2e', () => {
    it('should create and save an account properly', () => {
      const a = new Account()
      a.save()
    })

    it('should be able to pass an id for existing account', () => {
      const a = new Account()
      a.save()

      const a2 = new Account(a.id)
      assert.strictEqual(a.exists(), true)
    })
  })

  describe('find()', () => {
    it('should find an account by owner or related', () => {
      const a = new Account()
      a.create('id1', 'id2')
      a.save()

      const foundAccount = a.find('id1', 'id2')
      assert.strictEqual(JSON.stringify(a.account, 0, 2), JSON.stringify(foundAccount.account, 0, 2))
    })
  })

  describe('findAll()', () => {
    it('should return all accounts that belong to a user', () => {
      const a = new Account()
      a.create('id1', 'id2')
      a.save()

      const foundAccounts = a.findAll('id1')
      assert.strictEqual(a.account, foundAccounts[0])
    })
  })

  describe('create()', () => {
    it('should error when an account already exists for an id and is trying to create one', () => {
      const a = new Account()
      a.create('id1', 'id2')
      a.save()

      const a2 = new Account()

      let failed = false
      try {
        a.create('id1', 'id2')
        a.save()
      } catch (err) {
        failed = true
      }
      assert.strictEqual(true, failed)
    })
  })
  

  describe('transaction()', () => {
    it('should support add', () => {
      const a = new Account()
      a.create('id1', 'id2')
      a.save()

      a.transaction('id1', 'add', 10)
      assert.strictEqual(a.account.balance, 10)
    })

    it('should round the balance', () => {
      const a = new Account()
      a.create('id1', 'id2')
      a.save()

      a.transaction('id1', 'add', 1.56)
      assert.strictEqual(a.account.balance, 2)

      a.transaction('id1', 'sub', 2.3)
      assert.strictEqual(a.account.balance, 0)
    })

    it('should support sub', () => {
      const a = new Account()
      a.create('id1', 'id2')
      a.save()

      a.transaction('id1', 'sub', 10)
      assert.strictEqual(a.account.balance, -10)
    })

    it('should support adding negative numbers', () => {
      const a = new Account()
      a.create('id1', 'id2')
      a.save()

      a.transaction('id1', 'add', -10)
      assert.strictEqual(a.account.balance, -10)
    })

    it('should support subtracting negative numbers', () => {
      const a = new Account()
      a.create('id1', 'id2')
      a.save()

      a.transaction('id1', 'sub', -10)
      assert.strictEqual(a.account.balance, 10)
    })
  })

  describe('transactions()', () => {
    it('should return the top 5 transactions', () => {
      const a = new Account()
      a.create('id1', 'id2')
      a.save()

      a.transaction('id1', 'sub', 10)
      a.transaction('id1', 'sub', 10)
      a.transaction('id1', 'sub', 10)
      a.transaction('id1', 'sub', 10)
      a.transaction('id1', 'sub', 10)
      a.transaction('id1', 'sub', 10)
      const t = a.transactions
      assert.strictEqual(t.length, 5)
    })
  })
})