import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import { parseSearchFeed, searchHref, searchStateFromHash } from '../src/searchFeed.mjs'

faker.seed(20261109)

const runs = (...texts) => ({ runs: texts.map((text) => ({ text })) })
const thumbs = (...urls) => ({ thumbnails: urls.map((url) => ({ url, width: 60, height: 60 })) })

function searchEndpoint(query, params) {
  return { searchEndpoint: { query, params } }
}

function chip(label, params, selected = false) {
  return {
    chipCloudChipRenderer: {
      text: runs(label),
      isSelected: selected,
      navigationEndpoint: searchEndpoint('q', params),
    },
  }
}

function songRow({ videoId, title, artist, plays }) {
  return {
    musicResponsiveListItemRenderer: {
      thumbnail: {
        musicThumbnailRenderer: {
          thumbnail: thumbs('https://img/small', 'https://img/song'),
          thumbnailCrop: 'MUSIC_THUMBNAIL_CROP_UNSPECIFIED',
        },
      },
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: runs(title) } },
        { musicResponsiveListItemFlexColumnRenderer: { text: runs('Música • ', artist) } },
        { musicResponsiveListItemFlexColumnRenderer: { text: runs(plays) } },
      ],
      playlistItemData: { videoId },
      overlay: {
        musicItemThumbnailOverlayRenderer: {
          content: {
            musicPlayButtonRenderer: {
              playNavigationEndpoint: {
                watchEndpoint: {
                  videoId,
                  watchEndpointMusicSupportedConfigs: {
                    watchEndpointMusicConfig: { musicVideoType: 'MUSIC_VIDEO_TYPE_ATV' },
                  },
                },
              },
            },
          },
        },
      },
    },
  }
}

function artistRow({ browseId, title, subtitle }) {
  return {
    musicResponsiveListItemRenderer: {
      thumbnail: {
        musicThumbnailRenderer: {
          thumbnail: thumbs('https://img/artist'),
          thumbnailCrop: 'MUSIC_THUMBNAIL_CROP_CIRCLE',
        },
      },
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: runs(title) } },
        { musicResponsiveListItemFlexColumnRenderer: { text: runs(subtitle) } },
      ],
      navigationEndpoint: {
        browseEndpoint: {
          browseId,
          browseEndpointContextSupportedConfigs: {
            browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ARTIST' },
          },
        },
      },
    },
  }
}

function albumRow({ browseId, playlistId, title, artist, year }) {
  return {
    musicResponsiveListItemRenderer: {
      thumbnail: {
        musicThumbnailRenderer: { thumbnail: thumbs('https://img/album') },
      },
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: runs(title) } },
        {
          musicResponsiveListItemFlexColumnRenderer: {
            text: runs('Álbum • ', artist, ' • ', year),
          },
        },
      ],
      navigationEndpoint: {
        browseEndpoint: {
          browseId,
          browseEndpointContextSupportedConfigs: {
            browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ALBUM' },
          },
        },
      },
      overlay: {
        musicItemThumbnailOverlayRenderer: {
          content: {
            musicPlayButtonRenderer: {
              playNavigationEndpoint: { watchPlaylistEndpoint: { playlistId } },
            },
          },
        },
      },
    },
  }
}

function videoRow({ videoId, title, channel, views }) {
  return {
    musicResponsiveListItemRenderer: {
      thumbnail: {
        musicThumbnailRenderer: { thumbnail: thumbs('https://img/video') },
      },
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: runs(title) } },
        {
          musicResponsiveListItemFlexColumnRenderer: {
            text: runs('Vídeo • ', channel, ' • ', views),
          },
        },
      ],
      playlistItemData: { videoId },
      overlay: {
        musicItemThumbnailOverlayRenderer: {
          content: {
            musicPlayButtonRenderer: {
              playNavigationEndpoint: {
                watchEndpoint: {
                  videoId,
                  watchEndpointMusicSupportedConfigs: {
                    watchEndpointMusicConfig: { musicVideoType: 'MUSIC_VIDEO_TYPE_UGC' },
                  },
                },
              },
            },
          },
        },
      },
    },
  }
}

function itemSection(row) {
  return { itemSectionRenderer: { contents: [row] } }
}

function catalogSearchPayload({ query, album, artist, song, video, librarySong }) {
  const albumParams = 'EgWKAQIYAWoQEAkQBRADEAQQEBAKEBUQEQ%3D%3D'
  const songParams = 'EgWKAQIIAWoQEAkQBRADEAQQEBAKEBUQEQ%3D%3D'
  return {
    contents: {
      tabbedSearchResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              title: 'YT Music',
              selected: true,
              tabIdentifier: 'music_search_catalog',
              content: {
                sectionListRenderer: {
                  header: {
                    chipCloudRenderer: {
                      chips: [
                        chip('Álbuns', albumParams),
                        chip('Músicas', songParams),
                        chip('Artistas', 'EgWKAQIgAWoQEAkQBRADEAQQEBAKEBUQEQ%3D%3D'),
                      ],
                    },
                  },
                  contents: [
                    {
                      musicCardShelfRenderer: {
                        title: runs(album.title),
                        subtitle: runs('Álbum • ', album.artist, ' • ', album.year),
                        thumbnail: {
                          musicThumbnailRenderer: {
                            thumbnail: thumbs('https://img/top'),
                          },
                        },
                        onTap: {
                          browseEndpoint: {
                            browseId: album.browseId,
                            browseEndpointContextSupportedConfigs: {
                              browseEndpointContextMusicConfig: {
                                pageType: 'MUSIC_PAGE_TYPE_ALBUM',
                              },
                            },
                          },
                        },
                        buttons: [
                          {
                            buttonRenderer: {
                              text: runs('Reproduzir'),
                              icon: { iconType: 'PLAY_ARROW' },
                              command: {
                                watchPlaylistEndpoint: { playlistId: album.playlistId },
                              },
                            },
                          },
                          {
                            buttonRenderer: {
                              text: runs('Aleatório'),
                              icon: { iconType: 'MUSIC_SHUFFLE' },
                              command: {
                                watchPlaylistEndpoint: {
                                  playlistId: album.playlistId,
                                  params: 'wAEB8gECKAE%3D',
                                },
                              },
                            },
                          },
                        ],
                      },
                    },
                    itemSection(artistRow(artist)),
                    itemSection(songRow(song)),
                    itemSection(videoRow(video)),
                    itemSection(
                      albumRow({
                        browseId: album.browseId,
                        playlistId: album.playlistId,
                        title: album.title,
                        artist: album.artist,
                        year: album.year,
                      }),
                    ),
                  ],
                },
              },
            },
          },
          {
            tabRenderer: {
              title: 'Biblioteca',
              selected: false,
              tabIdentifier: 'music_search_library',
              endpoint: searchEndpoint(query, 'agIYBA%3D%3D'),
              content: {
                sectionListRenderer: {
                  contents: [itemSection(songRow(librarySong))],
                },
              },
            },
          },
        ],
      },
    },
  }
}

test('parseSearchFeed reads tabs, decoded chips, top album and mixed rows', () => {
  const query = faker.music.songName()
  const album = {
    title: faker.music.album(),
    artist: faker.music.artist(),
    year: '2005',
    browseId: `MPREb_${faker.string.alphanumeric(12)}`,
    playlistId: `OLAK5uy_${faker.string.alphanumeric(12)}`,
  }
  const artist = {
    browseId: `UC${faker.string.alphanumeric(22)}`,
    title: faker.music.artist(),
    subtitle: 'Artista • 6,66 mi ouvintes mensais',
  }
  const song = {
    videoId: faker.string.alphanumeric(11),
    title: faker.music.songName(),
    artist: album.artist,
    plays: 'Tocou 2,4 mi vezes',
  }
  const video = {
    videoId: faker.string.alphanumeric(11),
    title: `${album.artist} - ${album.title}`,
    channel: faker.internet.username(),
    views: '1,9 mil visualizações',
  }
  const librarySong = {
    videoId: faker.string.alphanumeric(11),
    title: faker.music.songName(),
    artist: faker.music.artist(),
    plays: 'Tocou 12 vezes',
  }

  const feed = parseSearchFeed(
    catalogSearchPayload({ query, album, artist, song, video, librarySong }),
  )

  assert.equal(feed.tabs.length, 2)
  assert.equal(feed.tabs[0].label, 'YT Music')
  assert.equal(feed.tabs[0].selected, true)
  assert.equal(feed.tabs[0].params, '')
  assert.equal(feed.tabs[1].label, 'Biblioteca')
  assert.equal(feed.tabs[1].selected, false)
  assert.equal(feed.tabs[1].params, 'agIYBA==')

  assert.equal(feed.chips.length, 3)
  assert.equal(feed.chips[0].label, 'Álbuns')
  assert.equal(feed.chips[0].params, 'EgWKAQIYAWoQEAkQBRADEAQQEBAKEBUQEQ==')
  assert.equal(feed.chips[0].selected, false)
  assert.equal(feed.chips[1].label, 'Músicas')

  assert.equal(feed.top.title, album.title)
  assert.equal(feed.top.subtitle, `Álbum • ${album.artist} • ${album.year}`)
  assert.equal(feed.top.browseId, album.browseId)
  assert.equal(feed.top.playlistId, album.playlistId)
  assert.equal(feed.top.shufflePlaylistId, album.playlistId)
  assert.equal(feed.top.resultType, 'album')
  assert.equal(feed.top.thumbnail, 'https://img/top')

  assert.equal(feed.items.length, 4)
  assert.equal(
    feed.items.some((item) => item.videoId === librarySong.videoId),
    false,
    'unselected library tab stays out of the catalog list',
  )

  const artistItem = feed.items[0]
  assert.equal(artistItem.title, artist.title)
  assert.equal(artistItem.browseId, artist.browseId)
  assert.equal(artistItem.videoId, '')
  assert.equal(artistItem.resultType, 'artist')
  assert.equal(artistItem.subtitle, artist.subtitle)

  const songItem = feed.items[1]
  assert.equal(songItem.videoId, song.videoId)
  assert.equal(songItem.title, song.title)
  assert.equal(songItem.artist, song.artist)
  assert.equal(songItem.resultType, 'song')
  assert.equal(songItem.subtitle, `Música • ${song.artist} • ${song.plays}`)
  assert.equal(songItem.playCount, song.plays)

  const videoItem = feed.items[2]
  assert.equal(videoItem.resultType, 'video')
  assert.equal(videoItem.subtitle, `Vídeo • ${video.channel} • ${video.views}`)

  const albumItem = feed.items[3]
  assert.equal(albumItem.resultType, 'album')
  assert.equal(albumItem.browseId, album.browseId)
  assert.equal(albumItem.playlistId, album.playlistId)
  assert.equal(albumItem.artist, album.artist)
})

test('parseSearchFeed skips the empty reset chip and keeps a selected filter', () => {
  const songTitle = faker.music.songName()
  const videoId = faker.string.alphanumeric(11)
  const payload = {
    contents: {
      tabbedSearchResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              title: 'YT Music',
              selected: true,
              content: {
                sectionListRenderer: {
                  header: {
                    chipCloudRenderer: {
                      chips: [
                        chip('', 'agIYAQ%3D%3D'),
                        chip('Músicas', 'EgWKAQIIAWoQEAkQBRADEAQQEBAKEBUQEQ%3D%3D', true),
                      ],
                    },
                  },
                  contents: [
                    {
                      musicShelfRenderer: {
                        title: runs('Músicas'),
                        contents: [
                          songRow({
                            videoId,
                            title: songTitle,
                            artist: faker.music.artist(),
                            plays: 'Tocou 1 vez',
                          }),
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    },
  }

  const feed = parseSearchFeed(payload)

  assert.equal(feed.top, null)
  assert.equal(feed.chips.length, 1)
  assert.equal(feed.chips[0].label, 'Músicas')
  assert.equal(feed.chips[0].selected, true)
  assert.equal(feed.items.length, 1)
  assert.equal(feed.items[0].title, songTitle)
  assert.equal(feed.items[0].videoId, videoId)
})

test('searchHref and searchStateFromHash round-trip query and params', () => {
  const query = faker.music.songName()
  const params = 'EgWKAQIIAWoQEAkQBRADEAQQEBAKEBUQEQ=='

  const href = searchHref(query, params)
  const state = searchStateFromHash(href)

  assert.match(href, /^#\/search\?/)
  assert.equal(state.query, query)
  assert.equal(state.params, params)
  assert.equal(searchStateFromHash('#/').query, undefined)
  assert.equal(searchHref(query).includes('params='), false)
})
