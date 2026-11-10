import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EXPLORE_BROWSE_ID,
  HOME_BROWSE_ID,
  LIBRARY_BROWSE_ID,
  browseIdFromPath,
  catalogCardByline,
  catalogContextFromPage,
  catalogHref,
  catalogLabelHtml,
  dockAlbumHref,
  dockArtistHref,
  mergeCatalogIds,
  feedHeading,
  guideHref,
  guideKind,
  isAlbumBrowseId,
  isArtistBrowseId,
  isLibraryBrowseId,
  libraryNeedsLogin,
  shelfCountLabel,
  stampCatalogQueue,
  stepAction,
  stepHref,
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
  assert.equal(feedHeading('FEmusic_new_releases'), 'Lançamentos')
  assert.equal(feedHeading('FEmusic_new_releases_albums'), 'Lançamentos')
})

test('catalogCardByline shows release type and artist', () => {
  const artist = faker.music.artist()

  assert.equal(catalogCardByline({ album: 'Álbum', artist }), `Álbum • ${artist}`)
  assert.equal(catalogCardByline({ album: 'Single', artist }), `Single • ${artist}`)
  assert.equal(catalogCardByline({ album: 'EP', artist }), `EP • ${artist}`)
  assert.equal(catalogCardByline({ album: faker.music.album(), artist }), artist)
})

test('library chip pages stay under Biblioteca', () => {
  const likedPlaylists = 'FEmusic_liked_playlists'
  const artists = 'FEmusic_library_corpus_track_artists'

  assert.equal(isLibraryBrowseId(LIBRARY_BROWSE_ID), true)
  assert.equal(isLibraryBrowseId(likedPlaylists), true)
  assert.equal(isLibraryBrowseId(artists), true)
  assert.equal(isLibraryBrowseId(HOME_BROWSE_ID), false)
  assert.equal(feedHeading(likedPlaylists), 'Biblioteca')
  assert.equal(guideKind(likedPlaylists), 'library')
})

test('library login CTA only appears with the signed-out message', () => {
  const message = faker.lorem.sentence()

  assert.equal(libraryNeedsLogin(LIBRARY_BROWSE_ID, message), true)
  assert.equal(libraryNeedsLogin(LIBRARY_BROWSE_ID, ''), false)
  assert.equal(libraryNeedsLogin(HOME_BROWSE_ID, message), false)
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

test('isArtistBrowseId recognizes YouTube channel artist pages', () => {
  const artistId = `UC${faker.string.alphanumeric(22)}`
  assert.equal(isArtistBrowseId(artistId), true)
  assert.equal(isArtistBrowseId(`MPREb_${faker.string.alphanumeric(8)}`), false)
  assert.equal(isArtistBrowseId(HOME_BROWSE_ID), false)
  assert.equal(isArtistBrowseId(''), false)
})

test('catalogHref opens the artist channel from a UC browse id', () => {
  const browseId = `UC${faker.string.alphanumeric(22)}`
  const videoId = faker.string.alphanumeric(11)

  assert.equal(catalogHref({ browseId, videoId }), `#/browse/${browseId}`)
})

test('stepHref stays on the artist browse hash so next does not open /watch', () => {
  const browseId = `UC${faker.string.alphanumeric(22)}`
  const hash = `#/browse/${browseId}`
  const videoId = faker.string.alphanumeric(11)
  const playlistId = `RDAO${faker.string.alphanumeric(12)}`

  assert.equal(stepHref(hash, videoId, playlistId), hash)
  assert.deepEqual(stepAction(hash, videoId, playlistId), { type: 'play', href: hash })
})

test('catalogHref watches a song when there is no album browse id', () => {
  const videoId = faker.string.alphanumeric(11)
  const playlistId = `RDAMVM${faker.string.alphanumeric(8)}`

  assert.equal(catalogHref({ videoId, playlistId }), `#/watch/${videoId}?list=${playlistId}`)
  assert.equal(catalogHref({ videoId }), `#/watch/${videoId}`)
  assert.equal(catalogHref({ playlistId }), '')
})

test('dockAlbumHref opens the album page from albumBrowseId or a saved MPREb browse id', () => {
  const albumId = `MPREb_${faker.string.alphanumeric(12)}`
  const artistId = `UC${faker.string.alphanumeric(22)}`
  const videoId = faker.string.alphanumeric(11)

  assert.equal(dockAlbumHref({ videoId, albumBrowseId: albumId }), `#/browse/${albumId}`)
  assert.equal(dockAlbumHref({ videoId, browseId: albumId }), `#/browse/${albumId}`)
  assert.equal(dockAlbumHref({ videoId, browseId: artistId, artistBrowseId: artistId }), '')
  assert.equal(dockAlbumHref({ videoId }), '')
})

test('dockArtistHref opens the artist page from artistBrowseId or a UC browse id', () => {
  const albumId = `MPREb_${faker.string.alphanumeric(12)}`
  const artistId = `UC${faker.string.alphanumeric(22)}`
  const videoId = faker.string.alphanumeric(11)

  assert.equal(dockArtistHref({ videoId, artistBrowseId: artistId }), `#/browse/${artistId}`)
  assert.equal(dockArtistHref({ browseId: artistId }), `#/browse/${artistId}`)
  assert.equal(dockArtistHref({ videoId, browseId: albumId, albumBrowseId: albumId }), '')
  assert.equal(dockArtistHref({ videoId }), '')
})

test('catalogLabelHtml wraps the dock name in a hash link when the href exists', () => {
  const title = faker.string.alpha({ length: 18 })
  const href = `#/browse/MPREb_${faker.string.alphanumeric(8)}`

  assert.equal(catalogLabelHtml(title, href), `<a href="${href}">${title}</a>`)
  assert.equal(catalogLabelHtml(title, ''), title)
  assert.equal(catalogLabelHtml('', ''), '—')
  assert.match(catalogLabelHtml('<b>x</b>', '#/browse/UC1'), /&lt;b&gt;x&lt;\/b&gt;/)
})

test('catalogContextFromPage only stamps album/artist ids while that catalog page is open', () => {
  const albumId = `MPREb_${faker.string.alphanumeric(12)}`
  const artistId = `UC${faker.string.alphanumeric(22)}`
  const otherAlbum = `MPREb_${faker.string.alphanumeric(12)}`
  const album = {
    browseId: albumId,
    feed: { header: { artistBrowseId: artistId } },
  }

  assert.deepEqual(catalogContextFromPage(`#/browse/${albumId}`, album), {
    albumBrowseId: albumId,
    artistBrowseId: artistId,
  })
  assert.deepEqual(catalogContextFromPage(`#/browse/${artistId}`, { browseId: artistId }), {
    artistBrowseId: artistId,
  })
  assert.deepEqual(catalogContextFromPage('#/search?q=divine', album), {})
  assert.deepEqual(catalogContextFromPage('#/', album), {})
  assert.deepEqual(catalogContextFromPage(`#/browse/${otherAlbum}`, album), {})
})

test('mergeCatalogIds copies missing album/artist browse ids from a queue row', () => {
  const albumId = `MPREb_${faker.string.alphanumeric(12)}`
  const artistId = `UC${faker.string.alphanumeric(22)}`
  const otherAlbum = `MPREb_${faker.string.alphanumeric(12)}`
  const videoId = faker.string.alphanumeric(11)

  const filled = mergeCatalogIds(
    { videoId, title: faker.music.songName() },
    { albumBrowseId: albumId, artistBrowseId: artistId },
  )
  const kept = mergeCatalogIds(
    { videoId, albumBrowseId: otherAlbum, artistBrowseId: artistId },
    { albumBrowseId: albumId, browseId: artistId },
  )

  assert.equal(filled.albumBrowseId, albumId)
  assert.equal(filled.artistBrowseId, artistId)
  assert.equal(kept.albumBrowseId, otherAlbum)
  assert.equal(kept.artistBrowseId, artistId)
})

test('stampCatalogQueue fills missing album and artist browse ids without clobbering row ids', () => {
  const albumId = `MPREb_${faker.string.alphanumeric(12)}`
  const artistId = `UC${faker.string.alphanumeric(22)}`
  const otherAlbum = `MPREb_${faker.string.alphanumeric(12)}`
  const videoId = faker.string.alphanumeric(11)

  const [fromAlbum, alreadySet] = stampCatalogQueue(
    [
      { videoId, title: faker.music.songName() },
      {
        videoId: faker.string.alphanumeric(11),
        albumBrowseId: otherAlbum,
        artistBrowseId: artistId,
      },
    ],
    { albumBrowseId: albumId, artistBrowseId: artistId },
  )

  assert.equal(fromAlbum.albumBrowseId, albumId)
  assert.equal(fromAlbum.artistBrowseId, artistId)
  assert.equal(alreadySet.albumBrowseId, otherAlbum)
  assert.equal(alreadySet.artistBrowseId, artistId)
})

test('stepHref stays on the album browse hash so next does not open /watch', () => {
  const browseId = `MPREb_${faker.string.alphanumeric(12)}`
  const hash = `#/browse/${browseId}`
  const videoId = faker.string.alphanumeric(11)
  const playlistId = `OLAK5uy_${faker.string.alphanumeric(12)}`

  assert.equal(stepHref(hash, videoId, playlistId), hash)
  assert.equal(stepHref(hash.replace(/^#/, ''), videoId, playlistId), hash)
})

test('stepHref keeps the mix list when skipping on a watch page', () => {
  const current = faker.string.alphanumeric(11)
  const following = faker.string.alphanumeric(11)
  const playlistId = `RDAMVM${faker.string.alphanumeric(8)}`

  assert.equal(
    stepHref(`#/watch/${current}?list=${playlistId}`, following, playlistId),
    `#/watch/${following}?list=${playlistId}`,
  )
})

test('stepHref watches the next id when there is no album and no list', () => {
  const following = faker.string.alphanumeric(11)
  assert.equal(
    stepHref(`#/watch/${faker.string.alphanumeric(11)}`, following, ''),
    `#/watch/${following}`,
  )
})

test('stepAction plays in place on an album page and navigates on watch', () => {
  const browseId = `MPREb_${faker.string.alphanumeric(12)}`
  const following = faker.string.alphanumeric(11)
  const playlistId = `RDAMVM${faker.string.alphanumeric(8)}`
  const current = faker.string.alphanumeric(11)

  assert.deepEqual(stepAction(`#/browse/${browseId}`, following, playlistId), {
    type: 'play',
    href: `#/browse/${browseId}`,
  })
  assert.deepEqual(stepAction(`#/watch/${current}?list=${playlistId}`, following, playlistId), {
    type: 'navigate',
    href: `#/watch/${following}?list=${playlistId}`,
  })
})

test('guideKind maps the official rails and leaves other items generic', () => {
  const extra = `FE${faker.string.alphanumeric(10)}`

  assert.equal(guideKind(HOME_BROWSE_ID), 'home')
  assert.equal(guideKind(EXPLORE_BROWSE_ID), 'explore')
  assert.equal(guideKind(LIBRARY_BROWSE_ID), 'library')
  assert.equal(guideKind(extra), 'item')
  assert.equal(guideKind(''), 'item')
})

test('shelfCountLabel names a whole album shelf as albums, not tracks', () => {
  const albums = Array.from({ length: faker.number.int({ min: 2, max: 8 }) }, () => ({
    browseId: `MPREb_${faker.string.alphanumeric(12)}`,
    videoId: faker.string.alphanumeric(11),
  }))

  assert.equal(shelfCountLabel(albums), `${albums.length} álbuns`)
  assert.equal(shelfCountLabel(albums.slice(0, 1)), '1 álbum')
})

test('shelfCountLabel names a whole artist shelf as artists', () => {
  const artists = Array.from({ length: faker.number.int({ min: 2, max: 6 }) }, () => ({
    browseId: `UC${faker.string.alphanumeric(22)}`,
  }))

  assert.equal(shelfCountLabel(artists), `${artists.length} artistas`)
  assert.equal(shelfCountLabel(artists.slice(0, 1)), '1 artista')
})

test('shelfCountLabel keeps mixed or song shelves as faixas', () => {
  const songs = Array.from({ length: faker.number.int({ min: 2, max: 5 }) }, () => ({
    videoId: faker.string.alphanumeric(11),
  }))
  const mixed = [
    { browseId: `MPREb_${faker.string.alphanumeric(12)}` },
    { videoId: faker.string.alphanumeric(11) },
  ]

  assert.equal(shelfCountLabel(songs), `${songs.length} faixas`)
  assert.equal(shelfCountLabel(songs.slice(0, 1)), '1 faixa')
  assert.equal(shelfCountLabel(mixed), '2 faixas')
  assert.equal(shelfCountLabel([]), '')
})
