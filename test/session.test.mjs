import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import { accountLabel } from '../src/session.mjs'

faker.seed(5)

test('accountLabel invites the visitor to sign in', () => {
  assert.equal(accountLabel({ loggedIn: false, displayName: '' }), 'Entrar com Google')
  assert.equal(accountLabel(null), 'Entrar com Google')
})

test('accountLabel shows the Google display name once connected', () => {
  const name = faker.person.fullName()

  assert.equal(accountLabel({ loggedIn: true, displayName: name }), name)
})

test('accountLabel falls back when the account has no name', () => {
  assert.equal(accountLabel({ loggedIn: true, displayName: '' }), 'Conta conectada')
})
