import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import { followHomeContinuations, mergeHomePages } from '../src/homeFeed.mjs'

faker.seed(20261110)

test('mergeHomePages appends continuation shelves and keeps the latest token', () => {
  const firstTitle = faker.music.genre()
  const extraTitle = 'Lançamentos'
  const nextToken = faker.string.alphanumeric(12)

  const merged = mergeHomePages(
    {
      chips: [{ label: 'Podcasts' }],
      shelves: [{ title: firstTitle, tracks: [{ title: 'a' }] }],
      continuation: 't1',
    },
    {
      chips: [],
      shelves: [{ title: extraTitle, tracks: [{ title: 'b' }] }],
      continuation: nextToken,
    },
  )

  assert.deepEqual(
    merged.shelves.map((shelf) => shelf.title),
    [firstTitle, extraTitle],
  )
  assert.equal(merged.continuation, nextToken)
  assert.equal(merged.chips[0].label, 'Podcasts')
})

test('followHomeContinuations walks continuation pages up to the cap', async () => {
  const calls = []
  const start = {
    chips: [],
    shelves: [{ title: 'Ouvir de novo', tracks: [{ title: 'a' }] }],
    continuation: 't1',
  }

  const feed = await followHomeContinuations(
    start,
    async (token) => {
      calls.push(token)
      return {
        shelves: [{ title: token, tracks: [{ title: token }] }],
        continuation: `n${calls.length}`,
      }
    },
    2,
  )

  assert.deepEqual(calls, ['t1', 'n1'])
  assert.equal(feed.shelves.length, 3)
  assert.equal(feed.shelves[1].title, 't1')
  assert.equal(feed.continuation, 'n2')
})
