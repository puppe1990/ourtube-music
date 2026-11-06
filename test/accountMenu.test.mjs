import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import { accountMenuModel, renderAccountButton, renderAccountMenu } from '../src/accountMenu.mjs'

faker.seed(11)

test('accountMenuModel is empty when signed out', () => {
  assert.equal(accountMenuModel({ loggedIn: false, email: faker.internet.email() }), null)
  assert.equal(accountMenuModel(null), null)
})

test('accountMenuModel exposes the header and the other Google accounts', () => {
  const name = faker.person.fullName()
  const email = faker.internet.email().toLowerCase()
  const handle = `@${faker.internet.username()}`
  const photoUrl = faker.image.avatar()
  const otherName = faker.person.fullName()
  const otherEmail = faker.internet.email().toLowerCase()

  const model = accountMenuModel({
    loggedIn: true,
    displayName: name,
    email,
    handle,
    photoUrl,
    accounts: [
      { displayName: name, email, photoUrl },
      { displayName: otherName, email: otherEmail, photoUrl: faker.image.avatar() },
    ],
  })

  assert.equal(model.displayName, name)
  assert.equal(model.email, email)
  assert.equal(model.handle, handle)
  assert.equal(model.photoUrl, photoUrl)
  assert.equal(model.manageUrl, 'https://myaccount.google.com/')
  assert.equal(model.others.length, 1)
  assert.equal(model.others[0].email, otherEmail)
})

test('renderAccountMenu lists switch-account and sign-out like YouTube Music', () => {
  const name = faker.person.fullName()
  const email = faker.internet.email().toLowerCase()
  const html = renderAccountMenu({
    displayName: name,
    email,
    handle: '',
    photoUrl: 'https://lh3.example/photo',
    manageUrl: 'https://myaccount.google.com/',
    others: [],
  })

  assert.match(html, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(html, new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(html, /Gerenciar sua Conta do Google/)
  assert.match(html, /Mudar de conta/)
  assert.match(html, /data-account-action="switch"/)
  assert.match(html, /Sair/)
  assert.match(html, /data-account-action="logout"/)
  assert.match(html, /https:\/\/myaccount\.google\.com\//)
})

test('renderAccountButton shows the avatar and the connected email', () => {
  const email = faker.internet.email().toLowerCase()
  const html = renderAccountButton({
    loggedIn: true,
    displayName: faker.person.fullName(),
    email,
    photoUrl: 'https://lh3.example/me',
  })

  assert.match(html, /account-avatar/)
  assert.match(html, /https:\/\/lh3\.example\/me/)
  assert.match(html, new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})
