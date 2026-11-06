import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import { accountLabel, mergeAccount } from '../src/session.mjs'

faker.seed(5)

test('accountLabel invites the visitor to sign in', () => {
  assert.equal(accountLabel({ loggedIn: false, displayName: '' }), 'Entrar com Google')
  assert.equal(accountLabel(null), 'Entrar com Google')
})

test('accountLabel shows the Google display name once connected', () => {
  const name = faker.person.fullName()

  assert.equal(accountLabel({ loggedIn: true, displayName: name, email: '' }), name)
})

test('accountLabel prefers the connected Google email over the display name', () => {
  const name = faker.person.fullName()
  const email = faker.internet.email()

  assert.equal(accountLabel({ loggedIn: true, displayName: name, email }), email)
})

test('accountLabel falls back when the account has no name', () => {
  assert.equal(accountLabel({ loggedIn: true, displayName: '', email: '' }), 'Conta conectada')
})

test('mergeAccount prefers ListAccounts email over the Innertube menu', () => {
  const listedEmail = faker.internet.email().toLowerCase()
  const listedName = faker.person.fullName()
  const menuName = faker.person.fullName()

  assert.deepEqual(
    mergeAccount(
      { displayName: listedName, email: listedEmail },
      { displayName: menuName, email: '' },
      { displayName: '', email: '' },
    ),
    { displayName: listedName, email: listedEmail, handle: '', photoUrl: '' },
  )
})

test('mergeAccount keeps a stored email when ListAccounts is empty', () => {
  const storedEmail = faker.internet.email().toLowerCase()
  const storedName = faker.person.fullName()

  assert.deepEqual(
    mergeAccount(
      { displayName: '', email: '' },
      { displayName: '', email: '' },
      { displayName: storedName, email: storedEmail },
    ),
    { displayName: storedName, email: storedEmail, handle: '', photoUrl: '' },
  )
})

test('mergeAccount takes the Google photo and the YouTube handle', () => {
  const listedEmail = faker.internet.email().toLowerCase()
  const listedName = faker.person.fullName()
  const photoUrl = faker.image.avatar()
  const handle = `@${faker.internet.username()}`

  assert.deepEqual(
    mergeAccount(
      { displayName: listedName, email: listedEmail, photoUrl },
      { displayName: faker.person.fullName(), email: '', handle },
      { displayName: '', email: '' },
    ),
    { displayName: listedName, email: listedEmail, handle, photoUrl },
  )
})
