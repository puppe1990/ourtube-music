import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createOfflineNode, sanitizeVideoId } from '../src/offlineNode.mjs'

faker.seed(20261112)

async function tempDir() {
  return mkdtemp(join(tmpdir(), 'ourtube-offline-'))
}

function track() {
  return {
    videoId: faker.string.alphanumeric(11),
    title: faker.music.songName(),
    artist: faker.music.artist(),
    album: faker.music.album(),
    duration: '3:21',
    thumbnail: faker.image.url(),
    browseId: `MPREb_${faker.string.alphanumeric(8)}`,
  }
}

test('sanitizeVideoId rejects path-like ids', () => {
  const id = faker.string.alphanumeric(11)
  assert.equal(sanitizeVideoId(id), id)
  assert.throws(() => sanitizeVideoId('..'), /invalid/)
  assert.throws(() => sanitizeVideoId('ab/cd'), /ab\/cd/)
})

test('offline node round-trips a track on disk', async () => {
  const dir = await tempDir()
  const node = createOfflineNode({ dir })
  const meta = track()
  const payload = Buffer.from(faker.lorem.sentence())

  const saved = node.put(meta, payload)
  assert.equal(saved.videoId, meta.videoId)
  assert.equal(saved.bytes, payload.length)
  assert.equal(node.has(meta.videoId), true)
  assert.deepEqual(node.readMedia(meta.videoId).bytes, payload)

  const again = createOfflineNode({ dir })
  assert.equal(again.get(meta.videoId).title, meta.title)
  const file = join(dir, 'offline', 'media', `${meta.videoId}.m4a`)
  assert.deepEqual(await readFile(file), payload)

  assert.equal(again.remove(meta.videoId), true)
  assert.equal(again.has(meta.videoId), false)
})

test('removeAlbum deletes every row with that browseId', async () => {
  const dir = await tempDir()
  const node = createOfflineNode({ dir })
  const browseId = `MPREb_${faker.string.alphanumeric(8)}`
  const first = track()
  const second = track()
  const extra = track()
  first.browseId = browseId
  second.browseId = browseId
  const bytes = Buffer.from(faker.word.sample())

  node.put(first, bytes)
  node.put(second, bytes)
  node.put(extra, bytes)

  const removed = node.removeAlbum(browseId)
  assert.equal(removed.length, 2)
  assert.equal(node.has(extra.videoId), true)
  assert.equal(node.has(first.videoId), false)
})
