import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import { greeting } from '../src/greeting.mjs'

faker.seed(3)

test('greeting says bom dia in the morning', () => {
  const hour = faker.number.int({ min: 5, max: 11 })

  assert.equal(greeting(hour), 'Bom dia')
})

test('greeting says boa tarde in the afternoon', () => {
  const hour = faker.number.int({ min: 12, max: 17 })

  assert.equal(greeting(hour), 'Boa tarde')
})

test('greeting says boa noite at night and in the madrugada', () => {
  for (const hour of [18, 23, 0, 4]) {
    assert.equal(greeting(hour), 'Boa noite')
  }
})
