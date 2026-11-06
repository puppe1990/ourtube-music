import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseAccount,
  parseListAccountRows,
  parseCommand,
  parseGuide,
  parseHomeFeed,
  parseHomeShelves,
  parseListAccounts,
  parseQueue,
  parseSearchResults,
  parseStream,
  parseSuggestions,
} from '../src/devParsers.mjs'

faker.seed(2026)

const runs = (...texts) => ({ runs: texts.map((text) => ({ text })) })
const thumbs = (...urls) => ({ thumbnails: urls.map((url) => ({ url, width: 60, height: 60 })) })

function responsiveRow(videoId, title, byline, duration) {
  return {
    musicResponsiveListItemRenderer: {
      thumbnail: {
        musicThumbnailRenderer: { thumbnail: thumbs('https://img/small', 'https://img/large') },
      },
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: runs(title) } },
        { musicResponsiveListItemFlexColumnRenderer: { text: runs(byline) } },
        { musicResponsiveListItemFlexColumnRenderer: { text: runs(duration) } },
      ],
      playlistItemData: { videoId },
    },
  }
}

test('search results become tracks with artist and album split', () => {
  const title = faker.music.songName()
  const artist = faker.music.artist()
  const album = faker.music.album()
  const payload = {
    contents: {
      tabbedSearchResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              content: {
                sectionListRenderer: {
                  contents: [
                    {
                      musicShelfRenderer: {
                        contents: [responsiveRow('vid-a', title, `${artist} • ${album}`, '3:45')],
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

  const tracks = parseSearchResults(payload)

  assert.equal(tracks.length, 1)
  assert.equal(tracks[0].videoId, 'vid-a')
  assert.equal(tracks[0].title, title)
  assert.equal(tracks[0].artist, artist)
  assert.equal(tracks[0].album, album)
  assert.equal(tracks[0].thumbnail, 'https://img/large')
})

test('home shelves keep the carousel title and rows', () => {
  const shelfTitle = faker.music.genre()
  const payload = {
    contents: {
      singleColumnBrowseResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              content: {
                sectionListRenderer: {
                  contents: [
                    {
                      musicCarouselShelfRenderer: {
                        header: {
                          musicCarouselShelfBasicHeaderRenderer: { title: runs(shelfTitle) },
                        },
                        contents: [
                          {
                            musicTwoRowItemRenderer: {
                              title: runs(faker.music.songName()),
                              subtitle: runs(faker.music.artist()),
                              thumbnailRenderer: {
                                musicThumbnailRenderer: { thumbnail: thumbs('https://img/one') },
                              },
                              navigationEndpoint: { watchEndpoint: { videoId: 'home-1' } },
                            },
                          },
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

  const shelves = parseHomeShelves(payload)

  assert.equal(shelves.length, 1)
  assert.equal(shelves[0].title, shelfTitle)
  assert.equal(shelves[0].tracks[0].videoId, 'home-1')
})

test('home mix cards keep the playlist id from the play overlay', () => {
  const shelfTitle = faker.music.genre()
  const mixTitle = faker.music.songName()
  const artist = faker.music.artist()
  const playlistId = `RDCLAK5uy_${faker.string.alphanumeric(12)}`

  const payload = {
    contents: {
      sectionListRenderer: {
        header: {
          chipCloudRenderer: {
            chips: [
              {
                chipCloudChipRenderer: {
                  text: runs('Podcasts'),
                  navigationEndpoint: {
                    browseEndpoint: { browseId: 'FEmusic_home', params: 'ggNC' },
                  },
                  isSelected: false,
                },
              },
            ],
          },
        },
        contents: [
          {
            musicCarouselShelfRenderer: {
              header: {
                musicCarouselShelfBasicHeaderRenderer: { title: runs(shelfTitle) },
              },
              contents: [
                {
                  musicTwoRowItemRenderer: {
                    title: runs(mixTitle),
                    subtitle: runs(artist),
                    thumbnailRenderer: {
                      musicThumbnailRenderer: { thumbnail: thumbs('https://img/mix') },
                    },
                    navigationEndpoint: { browseEndpoint: { browseId: `VL${playlistId}` } },
                    thumbnailOverlay: {
                      musicItemThumbnailOverlayRenderer: {
                        content: {
                          musicPlayButtonRenderer: {
                            playNavigationEndpoint: {
                              watchPlaylistEndpoint: { playlistId },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
        continuations: [{ nextContinuationData: { continuation: 'token-1' } }],
      },
    },
  }

  const feed = parseHomeFeed(payload)

  assert.equal(feed.shelves.length, 1)
  assert.equal(feed.shelves[0].title, shelfTitle)
  assert.equal(feed.shelves[0].tracks[0].title, mixTitle)
  assert.equal(feed.shelves[0].tracks[0].playlistId, playlistId)
  assert.equal(feed.shelves[0].tracks[0].videoId, '')
  assert.equal(feed.chips.length, 1)
  assert.equal(feed.chips[0].label, 'Podcasts')
  assert.equal(feed.chips[0].params, 'ggNC')
  assert.equal(feed.continuation, 'token-1')
})

test('library landing keeps the signed-out message', () => {
  const heading = faker.lorem.words(3)
  const message = faker.lorem.sentence()

  const feed = parseHomeFeed({
    contents: {
      singleColumnBrowseResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              content: {
                sectionListRenderer: {
                  contents: [
                    {
                      itemSectionRenderer: {
                        contents: [
                          {
                            messageRenderer: {
                              text: runs(heading),
                              subtext: { messageSubtextRenderer: { text: runs(message) } },
                              button: { buttonRenderer: { text: runs('Fazer login') } },
                            },
                          },
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
  })

  assert.equal(feed.shelves.length, 0)
  assert.equal(feed.message, message)
})

test('library shelves keep musicShelfRenderer rows', () => {
  const shelfTitle = faker.music.genre()
  const title = faker.music.songName()
  const videoId = faker.string.alphanumeric(11)

  const shelves = parseHomeShelves({
    contents: {
      sectionListRenderer: {
        contents: [
          {
            musicShelfRenderer: {
              title: runs(shelfTitle),
              contents: [responsiveRow(videoId, title, `${faker.music.artist()} • Álbum`, '3:21')],
            },
          },
        ],
      },
    },
  })

  assert.equal(shelves.length, 1)
  assert.equal(shelves[0].title, shelfTitle)
  assert.equal(shelves[0].tracks[0].videoId, videoId)
  assert.equal(shelves[0].tracks[0].title, title)
})

test('queue reads the playlist panel order', () => {
  const payload = {
    contents: {
      singleColumnMusicWatchNextResultsRenderer: {
        tabbedRenderer: {
          watchNextTabbedResultsRenderer: {
            tabs: [
              {
                tabRenderer: {
                  content: {
                    musicQueueRenderer: {
                      content: {
                        playlistPanelRenderer: {
                          contents: [
                            {
                              playlistPanelVideoRenderer: {
                                videoId: 'q-1',
                                title: runs('First'),
                                longBylineText: runs('Artist One'),
                                lengthText: runs('4:02'),
                                thumbnail: thumbs('https://img/q1'),
                              },
                            },
                          ],
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      },
    },
  }

  const tracks = parseQueue(payload)

  assert.equal(tracks.length, 1)
  assert.equal(tracks[0].videoId, 'q-1')
  assert.equal(tracks[0].duration, '4:02')
})

test('stream prefers MP4 audio over the higher-bitrate Opus/WebM', () => {
  const payload = {
    playabilityStatus: { status: 'OK' },
    videoDetails: { videoId: 'vid-x', title: 'Song', author: 'Artist', lengthSeconds: '213' },
    streamingData: {
      adaptiveFormats: [
        { itag: 137, mimeType: 'video/mp4', bitrate: 4334157, url: 'https://cdn/video' },
        {
          itag: 139,
          mimeType: 'audio/mp4; codecs="mp4a.40.5"',
          bitrate: 50152,
          url: 'https://cdn/low',
        },
        {
          itag: 140,
          mimeType: 'audio/mp4; codecs="mp4a.40.2"',
          bitrate: 130677,
          url: 'https://cdn/high',
        },
        // Chromium/WebKit reject the googlevideo Opus/WebM stream (format error),
        // so MP4/AAC wins even at a lower bitrate.
        {
          itag: 251,
          mimeType: 'audio/webm; codecs="opus"',
          bitrate: 169000,
          url: 'https://cdn/opus',
        },
      ],
    },
  }

  const stream = parseStream(payload)

  assert.equal(stream.audioUrl, 'https://cdn/high')
  assert.equal(stream.itag, 140)
  assert.equal(stream.duration, 213)
})

test('stream can pick the progressive muxed format on demand', () => {
  const payload = {
    playabilityStatus: { status: 'OK' },
    videoDetails: { videoId: 'vid-x', lengthSeconds: '180' },
    streamingData: {
      formats: [{ itag: 18, mimeType: 'video/mp4', bitrate: 300000, url: 'https://cdn/muxed' }],
      adaptiveFormats: [
        { itag: 140, mimeType: 'audio/mp4', bitrate: 130000, url: 'https://cdn/audio' },
      ],
    },
  }

  const stream = parseStream(payload, 'muxed')

  assert.equal(stream.audioUrl, 'https://cdn/muxed')
  assert.equal(stream.itag, 18)
})

test('stream exposes the progressive muxed format as fallback metadata', () => {
  const payload = {
    playabilityStatus: { status: 'OK' },
    videoDetails: { videoId: 'vid-x', lengthSeconds: '180' },
    streamingData: {
      formats: [
        {
          itag: 18,
          mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
          bitrate: 300000,
          url: 'https://cdn/muxed',
        },
      ],
      adaptiveFormats: [
        { itag: 140, mimeType: 'audio/mp4', bitrate: 130000, url: 'https://cdn/audio' },
      ],
    },
  }

  const stream = parseStream(payload)

  assert.equal(stream.audioUrl, 'https://cdn/audio')
  assert.equal(stream.fallbackUrl, 'https://cdn/muxed')
  assert.equal(stream.fallbackMime, 'video/mp4; codecs="avc1.42001E, mp4a.40.2"')
  assert.equal(stream.fallbackItag, 18)
})

test('stream accepts an ANDROID payload that only ships muxed itag 18', () => {
  const payload = {
    playabilityStatus: { status: 'OK' },
    videoDetails: { videoId: 'vid-x', title: 'Song', author: 'Artist', lengthSeconds: '180' },
    streamingData: {
      formats: [
        {
          itag: 18,
          mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
          bitrate: 300000,
          url: 'https://cdn/muxed',
        },
      ],
    },
  }

  const stream = parseStream(payload)

  assert.equal(stream.audioUrl, 'https://cdn/muxed')
  assert.equal(stream.itag, 18)
  assert.equal(stream.fallbackUrl, 'https://cdn/muxed')
  assert.equal(stream.fallbackItag, 18)
})

test('stream rejects an unplayable payload with the reason', () => {
  const payload = {
    playabilityStatus: { status: 'UNPLAYABLE', reason: 'Video unavailable' },
    videoDetails: { videoId: 'vid-x' },
  }

  assert.throws(() => parseStream(payload), /UNPLAYABLE.*Video unavailable/)
})

test('suggestions join every run of a row', () => {
  const tail = faker.music.songName()
  const payload = {
    contents: [
      {
        searchSuggestionsSectionRenderer: {
          contents: [{ searchSuggestionRenderer: { suggestion: runs('daft ', tail) } }],
        },
      },
    ],
  }

  const suggestions = parseSuggestions(payload)

  assert.equal(suggestions.length, 1)
  assert.ok(suggestions[0].endsWith(tail))
})

test('guide and account read their renderers', () => {
  const label = faker.music.genre()
  const name = faker.person.fullName()
  const guide = {
    items: [
      {
        guideSectionRenderer: {
          items: [
            {
              guideEntryRenderer: {
                formattedTitle: runs(label),
                navigationEndpoint: { browseEndpoint: { browseId: 'FEmusic_home' } },
              },
            },
          ],
        },
      },
    ],
  }
  const account = {
    actions: [
      {
        openPopupAction: {
          popup: {
            multiPageMenuRenderer: {
              header: { activeAccountHeaderRenderer: { accountName: runs(name) } },
            },
          },
        },
      },
    ],
  }

  assert.equal(parseGuide(guide)[0].browseId, 'FEmusic_home')
  assert.equal(parseAccount(account).displayName, name)
  assert.equal(parseAccount(account).email, '')
})

test('parseAccount reads the connected Google email from the header', () => {
  const name = faker.person.fullName()
  const email = faker.internet.email().toLowerCase()
  const account = {
    actions: [
      {
        openPopupAction: {
          popup: {
            multiPageMenuRenderer: {
              header: {
                activeAccountHeaderRenderer: {
                  accountName: runs(name),
                  email: runs(email),
                },
              },
            },
          },
        },
      },
    ],
  }

  assert.deepEqual(parseAccount(account), {
    displayName: name,
    email,
    handle: '',
    photoUrl: '',
  })
})

test('parseAccount reads the channel handle and avatar from the header', () => {
  const name = faker.person.fullName()
  const handle = `@${faker.internet.username()}`
  const photoUrl = faker.image.url()
  const account = {
    actions: [
      {
        openPopupAction: {
          popup: {
            multiPageMenuRenderer: {
              header: {
                activeAccountHeaderRenderer: {
                  accountName: runs(name),
                  channelHandle: { simpleText: handle },
                  accountPhoto: { thumbnails: [{ url: photoUrl, width: 48, height: 48 }] },
                },
              },
            },
          },
        },
      },
    ],
  }

  assert.deepEqual(parseAccount(account), {
    displayName: name,
    email: '',
    handle,
    photoUrl,
  })
})

test('parseListAccounts reads the connected Google email from gaia.l.a.r', () => {
  const name = faker.person.fullName()
  const email = faker.internet.email().toLowerCase()
  const payload = ['gaia.l.a.r', [['gaia.l.a', 1, name, email, 'https://lh3.example/photo', 0]]]

  assert.deepEqual(parseListAccounts(payload), {
    displayName: name,
    email,
    handle: '',
    photoUrl: 'https://lh3.example/photo',
  })
})

test('parseListAccounts is empty when Google returns no accounts', () => {
  assert.deepEqual(parseListAccounts(['gaia.l.a.r', []]), {
    displayName: '',
    email: '',
    handle: '',
    photoUrl: '',
  })
  assert.deepEqual(parseListAccounts({}), {
    displayName: '',
    email: '',
    handle: '',
    photoUrl: '',
  })
})

test('parseListAccountRows keeps every Google account in the chooser', () => {
  const first = faker.person.fullName()
  const second = faker.person.fullName()
  const firstEmail = faker.internet.email().toLowerCase()
  const secondEmail = faker.internet.email().toLowerCase()
  const payload = [
    'gaia.l.a.r',
    [
      ['gaia.l.a', 1, first, firstEmail, 'https://lh3.example/a', 0],
      ['gaia.l.a', 0, second, secondEmail, 'https://lh3.example/b', 0],
    ],
  ]

  assert.deepEqual(parseListAccountRows(payload), [
    { displayName: first, email: firstEmail, handle: '', photoUrl: 'https://lh3.example/a' },
    { displayName: second, email: secondEmail, handle: '', photoUrl: 'https://lh3.example/b' },
  ])
})

test('parseAccount reads email from simpleText when runs are missing', () => {
  const email = faker.internet.email().toLowerCase()
  const account = {
    actions: [
      {
        openPopupAction: {
          popup: {
            multiPageMenuRenderer: {
              header: {
                activeAccountHeaderRenderer: {
                  accountName: { simpleText: faker.person.fullName() },
                  email: { simpleText: email },
                },
              },
            },
          },
        },
      },
    ],
  }

  assert.equal(parseAccount(account).email, email)
})

test('parseCommand dispatches by command name', () => {
  const payload = {
    contents: [
      {
        searchSuggestionsSectionRenderer: {
          contents: [{ searchSuggestionRenderer: { suggestion: runs(faker.music.songName()) } }],
        },
      },
    ],
  }

  assert.equal(parseCommand('music_suggestions', payload).length, 1)
  assert.equal(parseCommand('music_browse', { contents: {} }).shelves.length, 0)
  assert.throws(() => parseCommand('music_unknown', payload), /music_unknown/)
})

function playOverlay(endpoint) {
  return {
    musicItemThumbnailOverlayRenderer: {
      content: {
        musicPlayButtonRenderer: { playNavigationEndpoint: endpoint },
      },
    },
  }
}

test('home album cards keep the MPREb browse id next to the overlay video', () => {
  const album = faker.music.album()
  const artist = faker.music.artist()
  const browseId = `MPREb_${faker.string.alphanumeric(12)}`
  const playlistId = `OLAK5uy_${faker.string.alphanumeric(12)}`
  const videoId = faker.string.alphanumeric(11)

  const feed = parseHomeFeed({
    contents: {
      sectionListRenderer: {
        contents: [
          {
            musicCarouselShelfRenderer: {
              header: {
                musicCarouselShelfBasicHeaderRenderer: { title: runs('Ouvir de novo') },
              },
              contents: [
                {
                  musicTwoRowItemRenderer: {
                    title: runs(album),
                    subtitle: runs('Álbum', ' • ', artist),
                    thumbnailRenderer: {
                      musicThumbnailRenderer: { thumbnail: thumbs('https://img/album') },
                    },
                    navigationEndpoint: { browseEndpoint: { browseId } },
                    thumbnailOverlay: playOverlay({
                      watchEndpoint: { videoId, playlistId },
                    }),
                  },
                },
              ],
            },
          },
        ],
      },
    },
  })

  const track = feed.shelves[0].tracks[0]
  assert.equal(track.title, album)
  assert.equal(track.artist, artist)
  assert.equal(track.browseId, browseId)
  assert.equal(track.playlistId, playlistId)
  assert.equal(track.videoId, videoId)
})

test('album browse feed reads the header, numbered tracks, then related carousels', () => {
  const album = faker.music.album()
  const artist = faker.music.artist()
  const year = String(faker.number.int({ min: 1990, max: 2026 }))
  const subtitle = `Álbum • ${year}`
  const secondSubtitle = '11 músicas • 48 minutos'
  const playlistId = `OLAK5uy_${faker.string.alphanumeric(12)}`
  const firstTitle = faker.music.songName()
  const secondTitle = faker.music.songName()
  const firstId = faker.string.alphanumeric(11)
  const secondId = faker.string.alphanumeric(11)
  const relatedTitle = faker.music.genre()
  const relatedAlbum = faker.music.album()
  const cover = 'https://img/cover-large'
  const playCount = 'Tocou 452 mil vezes'

  const albumRow = (videoId, title, duration) => ({
    musicResponsiveListItemRenderer: {
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: runs(title) } },
        { musicResponsiveListItemFlexColumnRenderer: { text: runs() } },
        { musicResponsiveListItemFlexColumnRenderer: { text: runs(playCount) } },
      ],
      fixedColumns: [{ musicResponsiveListItemFixedColumnRenderer: { text: runs(duration) } }],
      playlistItemData: { videoId },
      overlay: playOverlay({ watchEndpoint: { videoId, playlistId } }),
    },
  })

  const feed = parseHomeFeed({
    contents: {
      twoColumnBrowseResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              content: {
                sectionListRenderer: {
                  contents: [
                    {
                      musicResponsiveHeaderRenderer: {
                        thumbnail: {
                          musicThumbnailRenderer: {
                            thumbnail: thumbs('https://img/cover-small', cover),
                          },
                        },
                        title: runs(album),
                        subtitle: runs('Álbum', ' • ', year),
                        straplineTextOne: runs(artist),
                        secondSubtitle: runs('11 músicas', ' • ', '48 minutos'),
                        buttons: [
                          {
                            musicPlayButtonRenderer: {
                              playNavigationEndpoint: {
                                watchEndpoint: { videoId: firstId, playlistId },
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
        secondaryContents: {
          sectionListRenderer: {
            contents: [
              {
                musicCarouselShelfRenderer: {
                  header: {
                    musicCarouselShelfBasicHeaderRenderer: { title: runs(relatedTitle) },
                  },
                  contents: [
                    {
                      musicTwoRowItemRenderer: {
                        title: runs(relatedAlbum),
                        subtitle: runs(artist, ' • Álbum'),
                        thumbnailRenderer: {
                          musicThumbnailRenderer: { thumbnail: thumbs('https://img/related') },
                        },
                        navigationEndpoint: {
                          browseEndpoint: { browseId: `MPREb_${faker.string.alphanumeric(8)}` },
                        },
                        thumbnailOverlay: playOverlay({
                          watchPlaylistEndpoint: {
                            playlistId: `OLAK5uy_${faker.string.alphanumeric(8)}`,
                          },
                        }),
                      },
                    },
                  ],
                },
              },
              {
                musicShelfRenderer: {
                  contents: [
                    albumRow(firstId, firstTitle, '3:10'),
                    albumRow(secondId, secondTitle, '4:59'),
                  ],
                },
              },
            ],
          },
        },
      },
    },
  })

  assert.equal(feed.header.title, album)
  assert.equal(feed.header.artist, artist)
  assert.equal(feed.header.subtitle, subtitle)
  assert.equal(feed.header.secondSubtitle, secondSubtitle)
  assert.equal(feed.header.thumbnail, cover)
  assert.equal(feed.header.playlistId, playlistId)
  assert.equal(feed.header.videoId, firstId)

  assert.equal(feed.shelves[0].tracks.length, 2)
  assert.equal(feed.shelves[0].tracks[0].title, firstTitle)
  assert.equal(feed.shelves[0].tracks[0].duration, '3:10')
  assert.equal(feed.shelves[0].tracks[0].playCount, playCount)
  assert.equal(feed.shelves[0].tracks[0].playlistId, playlistId)
  assert.equal(feed.shelves[0].tracks[0].artist, artist)
  assert.equal(feed.shelves[0].tracks[0].album, album)
  assert.equal(feed.shelves[0].tracks[0].thumbnail, cover)
  assert.equal(feed.shelves[1].title, relatedTitle)
  assert.equal(feed.header != null, true)
})
