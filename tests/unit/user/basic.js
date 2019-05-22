const assert = require('assert')
const User = require('../../../lib/user')
const path = require('path')
const fs = require('fs-extra')

describe('User', () => {
  afterEach(async () => {
    await fs.unlink(path.join(__dirname, '../../../db/users'))
  })

  describe('e2e', () => {
    it('should create and save a user properly', () => {
      const user = new User()
      user.save()
    })

    it('should be able to pass an id for existing user', () => {
      const user = new User()
      user.save()

      const user2 = new User(user.id)
      assert.strictEqual(user.exists(), true)
    })
  })

  describe('findBySNS()', () => {
    it('should find a user by SNS id', () => {
      const user = new User()
      user.create('hello', 'telegram', 'id123')
      
      const user2 = new User()
      const found = user2.findBySNS('telegram', 'id123')
      assert.strictEqual(found, true)
    })
  })
  
  describe('exists()', () => {
    it('should not find a non-existent user', () => {
      const user = new User()
      assert.strictEqual(user.exists(), false)
    })

    it('should find a existing user', () => {
      const user = new User()
      user.save()
      assert.strictEqual(user.exists(), true)
    })
  })

  describe('delete()', () => {
    it('should delete a user', () => {
      const user = new User()
      user.save()
      assert.strictEqual(user.exists(), true)
      user.delete()
      assert.strictEqual(user.exists(), false)
    })
  })
})