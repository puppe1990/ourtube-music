import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import { renderSearchPage } from '../src/searchView.mjs'

faker.seed(20261110)

function feed(overrides = {}) {
  const query = faker.music.songName()
  const albumTitle = faker.music.album()
  const artistName = faker.music.artist()
  const songTitle = faker.music.songName()
  const videoTitle = faker.lorem.words(4)
  const browseId = `MPREb_${faker.string.alphanumeric(12)}`
  const playlistId = `OLAK5uy_${faker.string.alphanumeric(12)}`
  const artistBrowseId = `UC${faker.string.alphanumeric(22)}`
  const songId = faker.string.alphanumeric(11)
  const videoId = faker.string.alphanumeric(11)
  const albumParams = 'EgWKAQIYAWoQEAkQBRADEAQQEBAKEBUQEQ=='
  return {
    query,
    albumTitle,
    artistName,
    songTitle,
    videoTitle,
    browseId,
    playlistId,
    artistBrowseId,
    songId,
    videoId,
    albumParams,
    html: renderSearchPage(
      {
        tabs: [
          { label: 'YT Music', params: '', selected: true },
          { label: 'Biblioteca', params: 'agIYBA==', selected: false },
        ],
        chips: [
          { label: 'Álbuns', params: albumParams, selected: false },
          { label: 'Músicas', params: 'EgWKAQIIAWoQEAkQBRADEAQQEBAKEBUQEQ==', selected: false },
        ],
        top: {
          title: albumTitle,
          subtitle: `Álbum • ${artistName} • 2005`,
          thumbnail: 'https://img/top',
          browseId,
          videoId: '',
          playlistId,
          shufflePlaylistId: playlistId,
          resultType: 'album',
        },
        items: [
          {
            title: artistName,
            subtitle: 'Artista • 6,66 mi ouvintes mensais',
            thumbnail: 'https://img/artist',
            browseId: artistBrowseId,
            videoId: '',
            playlistId: '',
            resultType: 'artist',
            artist: '',
            album: '',
            playCount: '',
            duration: '',
          },
          {
            title: songTitle,
            subtitle: `Música • ${artistName} • Tocou 2,4 mi vezes`,
            thumbnail: 'https://img/song',
            browseId: '',
            videoId: songId,
            playlistId: '',
            resultType: 'song',
            artist: artistName,
            album: '',
            playCount: 'Tocou 2,4 mi vezes',
            duration: '',
          },
          {
            title: videoTitle,
            subtitle: `Vídeo • ${faker.internet.username()} • 6 visualizações`,
            thumbnail: 'https://img/video',
            browseId: '',
            videoId,
            playlistId: '',
            resultType: 'video',
            artist: '',
            album: '',
            playCount: '',
            duration: '',
          },
        ],
        ...overrides.feed,
      },
      query,
    ),
  }
}

test('search page paints tabs, chips, top card and mixed rows like YT Music', () => {
  const page = feed()

  assert.match(page.html, /class="search-page"/)
  assert.match(page.html, /class="search-tabs"/)
  assert.match(page.html, /YT Music/)
  assert.match(page.html, /Biblioteca/)
  assert.match(page.html, /aria-current="true"/)
  assert.match(page.html, /data-search-params="agIYBA=="/)

  assert.match(page.html, /class="search-chips"/)
  assert.match(page.html, />Álbuns</)
  assert.match(page.html, />Músicas</)
  assert.match(page.html, new RegExp(`data-search-params="${page.albumParams}"`))

  assert.match(page.html, /class="search-top"/)
  assert.match(page.html, new RegExp(page.albumTitle))
  assert.match(page.html, /Álbum • /)
  assert.match(page.html, />Reproduzir</)
  assert.match(page.html, />Aleatório</)
  assert.match(page.html, new RegExp(`data-play-playlist="${page.playlistId}"`))
  assert.match(page.html, /data-shuffle="true"/)
  assert.match(page.html, new RegExp(`href="#/browse/${page.browseId}"`))

  assert.match(page.html, /class="search-list"/)
  assert.match(page.html, /search-row-art is-circle/)
  assert.match(page.html, new RegExp(page.artistName))
  assert.match(page.html, /Artista • 6,66 mi ouvintes mensais/)
  assert.match(page.html, new RegExp(page.songTitle))
  assert.match(page.html, /Música • /)
  assert.match(page.html, new RegExp(page.videoTitle))
  assert.doesNotMatch(page.html, /class="track-index"/)
  assert.doesNotMatch(page.html, /<h1>Resultados<\/h1>/)
})

test('search page without a top result still lists rows and selected chip', () => {
  const query = faker.music.songName()
  const title = faker.music.songName()
  const html = renderSearchPage(
    {
      tabs: [{ label: 'YT Music', params: '', selected: true }],
      chips: [{ label: 'Músicas', params: 'EgWKAQII', selected: true }],
      top: null,
      items: [
        {
          title,
          subtitle: 'Música • Nine Inch Nails • Tocou 1 vez',
          thumbnail: '',
          browseId: '',
          videoId: faker.string.alphanumeric(11),
          playlistId: '',
          resultType: 'song',
          artist: 'Nine Inch Nails',
          album: '',
          playCount: '',
          duration: '',
        },
      ],
    },
    query,
  )

  assert.doesNotMatch(html, /class="search-top"/)
  assert.match(html, /class="chip is-active"/)
  assert.match(html, new RegExp(title))
  assert.doesNotMatch(html, /Nada encontrado/)
})

test('search page empty state names the query', () => {
  const query = faker.music.songName()
  const html = renderSearchPage(
    {
      tabs: [{ label: 'YT Music', params: '', selected: true }],
      chips: [],
      top: null,
      items: [],
    },
    query,
  )

  const escaped = query
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
  assert.match(html, /Nada encontrado/)
  assert.match(html, new RegExp(escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})
