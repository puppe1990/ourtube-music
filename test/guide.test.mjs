import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EXPLORE_BROWSE_ID,
  HOME_BROWSE_ID,
  LIBRARY_BROWSE_ID,
  browseIdFromPath,
  catalogHref,
  feedHeading,
  guideHref,
  isAlbumBrowseId,
} from '../src/guide.mjs'

faker.seed(7)

test('guideHref sends home to the root and other rails to /browse', () => {
  const extra = `FE${faker.string.alphanumeric(10)}`

  assert.equal(guideHref(HOME_BROWSE_ID), '#/')
  assert.equal(guideHref(EXPLORE_BROWSE_ID), `#/browse/${EXPLORE_BROWSE_ID}`)
  assert.equal(guideHref(LIBRARY_BROWSE_ID), `#/browse/${LIBRARY_BROWSE_ID}`)
  assert.equal(guideHref(extra), `#/browse/${extra}`)
})

test('browseIdFromPath reads the rail target out of the hash', () => {
  assert.equal(browseIdFromPath('#/'), HOME_BROWSE_ID)
  assert.equal(browseIdFromPath(''), HOME_BROWSE_ID)
  assert.equal(browseIdFromPath(`#/browse/${EXPLORE_BROWSE_ID}`), EXPLORE_BROWSE_ID)
  assert.equal(browseIdFromPath(`/browse/${LIBRARY_BROWSE_ID}`), LIBRARY_BROWSE_ID)
})

test('feedHeading names the official YTM rails in Portuguese', () => {
  assert.equal(feedHeading(EXPLORE_BROWSE_ID), 'Explorar')
  assert.equal(feedHeading(LIBRARY_BROWSE_ID), 'Biblioteca')
  assert.equal(feedHeading(HOME_BROWSE_ID), 'Início')
})

test('isAlbumBrowseId recognizes MPREb catalog pages', () => {
  const albumId = `MPREb_${faker.string.alphanumeric(12)}`
  assert.equal(isAlbumBrowseId(albumId), true)
  assert.equal(isAlbumBrowseId(HOME_BROWSE_ID), false)
  assert.equal(isAlbumBrowseId(`VL${faker.string.alphanumeric(12)}`), false)
  assert.equal(isAlbumBrowseId(''), false)
})

test('catalogHref opens the album page even when the overlay has a video id', () => {
  const browseId = `MPREb_${faker.string.alphanumeric(12)}`
  const videoId = faker.string.alphanumeric(11)
  const playlistId = `OLAK5uy_${faker.string.alphanumeric(12)}`

  assert.equal(catalogHref({ browseId, videoId, playlistId }), `#/browse/${browseId}`)
})

test('catalogHref watches a song when there is no album browse id', () => {
  const videoId = faker.string.alphanumeric(11)
  const playlistId = `RDAMVM${faker.string.alphanumeric(8)}`

  assert.equal(catalogHref({ videoId, playlistId }), `#/watch/${videoId}?list=${playlistId}`)
  assert.equal(catalogHref({ videoId }), `#/watch/${videoId}`)
  assert.equal(catalogHref({ playlistId }), '')
})
