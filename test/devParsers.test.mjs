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
  parseLyrics,
  parseLyricsBrowseId,
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

test('home carousel keeps Mais browse id, explicit badge and artist catalog id', () => {
  const title = faker.music.album()
  const artist = faker.music.artist()
  const albumId = `MPREb_${faker.string.alphanumeric(12)}`
  const artistId = `UC${faker.string.alphanumeric(22)}`
  const moreId = 'FEmusic_new_releases_albums'

  const feed = parseHomeFeed({
    contents: {
      sectionListRenderer: {
        contents: [
          {
            musicCarouselShelfRenderer: {
              header: {
                musicCarouselShelfBasicHeaderRenderer: {
                  title: runs('Lançamentos'),
                  moreContentButton: {
                    buttonRenderer: {
                      text: runs('Mais'),
                      navigationEndpoint: { browseEndpoint: { browseId: moreId } },
                    },
                  },
                },
              },
              contents: [
                {
                  musicTwoRowItemRenderer: {
                    title: runs(title),
                    subtitle: {
                      runs: [
                        { text: 'Álbum' },
                        { text: ' • ' },
                        {
                          text: artist,
                          navigationEndpoint: { browseEndpoint: { browseId: artistId } },
                        },
                      ],
                    },
                    subtitleBadges: [
                      {
                        musicInlineBadgeRenderer: {
                          icon: { iconType: 'MUSIC_EXPLICIT_BADGE' },
                          accessibilityData: { accessibilityData: { label: 'Explícito' } },
                        },
                      },
                    ],
                    thumbnailRenderer: {
                      musicThumbnailRenderer: { thumbnail: thumbs('https://img/rel') },
                    },
                    navigationEndpoint: { browseEndpoint: { browseId: albumId } },
                  },
                },
              ],
            },
          },
        ],
      },
    },
  })

  assert.equal(feed.shelves.length, 1)
  assert.equal(feed.shelves[0].title, 'Lançamentos')
  assert.equal(feed.shelves[0].moreBrowseId, moreId)
  assert.equal(feed.shelves[0].tracks[0].title, title)
  assert.equal(feed.shelves[0].tracks[0].album, 'Álbum')
  assert.equal(feed.shelves[0].tracks[0].artist, artist)
  assert.equal(feed.shelves[0].tracks[0].browseId, albumId)
  assert.equal(feed.shelves[0].tracks[0].albumBrowseId, albumId)
  assert.equal(feed.shelves[0].tracks[0].artistBrowseId, artistId)
  assert.equal(feed.shelves[0].tracks[0].explicit, true)
})

test('home continuation falls back to continuationCommand token', () => {
  const token = faker.string.alphanumeric(24)
  const feed = parseHomeFeed({
    onResponseReceivedActions: [
      {
        appendContinuationItemsAction: {
          continuationItems: [
            {
              continuationItemRenderer: {
                continuationEndpoint: { continuationCommand: { token } },
              },
            },
          ],
        },
      },
    ],
  })

  assert.equal(feed.continuation, token)
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

test('signed-in library landing keeps gridRenderer cards and chip browse ids', () => {
  const liked = faker.music.songName()
  const artist = faker.music.artist()
  const album = faker.music.album()
  const playlistId = faker.string.alphanumeric(8)
  const artistId = `UC${faker.string.alphanumeric(22)}`
  const albumId = `MPREb_${faker.string.alphanumeric(12)}`

  const twoRow = (title, subtitle, endpoint, extra = {}) => ({
    musicTwoRowItemRenderer: {
      title: runs(title),
      subtitle: runs(subtitle),
      thumbnailRenderer: {
        musicThumbnailRenderer: { thumbnail: thumbs('https://img/lib') },
      },
      navigationEndpoint: endpoint,
      ...extra,
    },
  })

  const feed = parseHomeFeed({
    contents: {
      singleColumnBrowseResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              content: {
                sectionListRenderer: {
                  header: {
                    musicSideAlignedItemRenderer: {
                      startItems: [
                        {
                          chipCloudRenderer: {
                            chips: [
                              {
                                chipCloudChipRenderer: {
                                  text: runs('Playlists'),
                                  navigationEndpoint: {
                                    commandExecutorCommand: {
                                      commands: [
                                        { browseEndpoint: { browseId: 'FEmusic_liked_playlists' } },
                                      ],
                                    },
                                  },
                                },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                  contents: [
                    {
                      gridRenderer: {
                        items: [
                          twoRow(
                            liked,
                            'Playlist automática',
                            {
                              browseEndpoint: { browseId: `VL${playlistId}` },
                            },
                            {
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
                          ),
                          twoRow(artist, 'Artista', {
                            browseEndpoint: { browseId: artistId },
                          }),
                          twoRow(album, 'Álbum • 2026', {
                            browseEndpoint: { browseId: albumId },
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
  })

  assert.equal(feed.message, '')
  assert.equal(feed.chips.length, 1)
  assert.equal(feed.chips[0].label, 'Playlists')
  assert.equal(feed.chips[0].browseId, 'FEmusic_liked_playlists')
  assert.equal(feed.shelves.length, 1)
  assert.equal(feed.shelves[0].layout, 'grid')
  assert.equal(feed.shelves[0].tracks.length, 3)
  assert.equal(feed.shelves[0].tracks[0].title, liked)
  assert.equal(feed.shelves[0].tracks[0].playlistId, playlistId)
  assert.equal(feed.shelves[0].tracks[1].browseId, artistId)
  assert.equal(feed.shelves[0].tracks[2].browseId, albumId)
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

test('queue splits artist and album out of a YouTube byline', () => {
  const artist = faker.music.artist()
  const album = faker.music.album()
  const views = `${faker.number.int({ min: 20, max: 900 })} mil visualizações`
  const title = faker.music.songName()
  const videoId = faker.string.alphanumeric(11)

  const tracks = parseQueue({
    contents: {
      playlistPanelRenderer: {
        contents: [
          {
            playlistPanelVideoRenderer: {
              videoId,
              title: runs(title),
              longBylineText: runs(`${artist} • ${album} • ${views}`),
              lengthText: runs('3:41'),
              thumbnail: thumbs('https://img/q'),
            },
          },
        ],
      },
    },
  })

  assert.equal(tracks[0].title, title)
  assert.equal(tracks[0].artist, artist)
  assert.equal(tracks[0].album, album)
})

test('queue reads album and artist browse ids from byline runs', () => {
  const artist = faker.music.artist()
  const album = faker.music.album()
  const title = faker.music.songName()
  const videoId = faker.string.alphanumeric(11)
  const artistId = `UC${faker.string.alphanumeric(22)}`
  const albumId = `MPREb_${faker.string.alphanumeric(12)}`
  const views = `${faker.number.int({ min: 20, max: 900 })} mil visualizações`

  const tracks = parseQueue({
    contents: {
      playlistPanelRenderer: {
        contents: [
          {
            playlistPanelVideoRenderer: {
              videoId,
              title: runs(title),
              longBylineText: {
                runs: [
                  {
                    text: artist,
                    navigationEndpoint: { browseEndpoint: { browseId: artistId } },
                  },
                  { text: ' • ' },
                  {
                    text: album,
                    navigationEndpoint: { browseEndpoint: { browseId: albumId } },
                  },
                  { text: ' • ' },
                  { text: views },
                ],
              },
              lengthText: runs('3:41'),
              thumbnail: thumbs('https://img/q'),
            },
          },
        ],
      },
    },
  })

  assert.equal(tracks[0].artist, artist)
  assert.equal(tracks[0].album, album)
  assert.equal(tracks[0].artistBrowseId, artistId)
  assert.equal(tracks[0].albumBrowseId, albumId)
  assert.equal(tracks[0].browseId, '')
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

function artistStrapline(name, browseId) {
  return {
    runs: [
      {
        text: name,
        navigationEndpoint: {
          browseEndpoint: {
            browseId,
            browseEndpointContextSupportedConfigs: {
              browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ARTIST' },
            },
          },
        },
      },
    ],
  }
}

test('album header keeps the artist channel browse id from the strapline', () => {
  const album = faker.music.album()
  const artist = faker.music.artist()
  const artistId = `UC${faker.string.alphanumeric(22)}`
  const playlistId = `OLAK5uy_${faker.string.alphanumeric(8)}`
  const videoId = faker.string.alphanumeric(11)

  const feed = parseHomeFeed({
    contents: {
      musicResponsiveHeaderRenderer: {
        thumbnail: { musicThumbnailRenderer: { thumbnail: thumbs('https://img/cover') } },
        title: runs(album),
        subtitle: runs('Álbum'),
        straplineTextOne: artistStrapline(artist, artistId),
        buttons: [
          {
            musicPlayButtonRenderer: {
              playNavigationEndpoint: { watchEndpoint: { videoId, playlistId } },
            },
          },
        ],
      },
    },
  })

  assert.equal(feed.header.title, album)
  assert.equal(feed.header.artist, artist)
  assert.equal(feed.header.artistBrowseId, artistId)
  assert.equal(feed.header.pageType, 'album')
})

test('album tracks inherit the artist channel browse id from the header', () => {
  const album = faker.music.album()
  const artist = faker.music.artist()
  const artistId = `UC${faker.string.alphanumeric(22)}`
  const videoId = faker.string.alphanumeric(11)
  const title = faker.music.songName()

  const feed = parseHomeFeed({
    contents: {
      musicResponsiveHeaderRenderer: {
        title: runs(album),
        straplineTextOne: artistStrapline(artist, artistId),
      },
      musicShelfRenderer: {
        contents: [
          {
            musicResponsiveListItemRenderer: {
              flexColumns: [{ musicResponsiveListItemFlexColumnRenderer: { text: runs(title) } }],
              playlistItemData: { videoId },
            },
          },
        ],
      },
    },
  })

  assert.equal(feed.shelves[0].tracks[0].title, title)
  assert.equal(feed.shelves[0].tracks[0].artist, artist)
  assert.equal(feed.shelves[0].tracks[0].artistBrowseId, artistId)
  assert.equal(feed.shelves[0].tracks[0].browseId, '')
})

test('artist browse feed reads the immersive banner, shuffle/mix and top songs', () => {
  const artist = faker.music.artist()
  const banner = faker.image.url()
  const subscribers = `${faker.number.int({ min: 10, max: 90 })},${faker.number.int({ min: 1, max: 9 })} mil`
  const shuffleId = faker.string.alphanumeric(11)
  const shuffleList = `RDAO${faker.string.alphanumeric(12)}`
  const mixId = faker.string.alphanumeric(11)
  const mixList = `RDEM${faker.string.alphanumeric(12)}`
  const song = faker.music.songName()
  const album = faker.music.album()
  const videoId = faker.string.alphanumeric(11)
  const playlistId = `OLAK5uy_${faker.string.alphanumeric(8)}`
  const playCount = `Tocou ${faker.number.int({ min: 100, max: 900 })} mil vezes`
  const albumsTitle = 'Álbuns'
  const relatedAlbum = faker.music.album()

  const feed = parseHomeFeed({
    header: {
      musicImmersiveHeaderRenderer: {
        title: runs(artist),
        thumbnail: {
          musicThumbnailRenderer: { thumbnail: thumbs('https://img/banner-small', banner) },
        },
        playButton: {
          buttonRenderer: {
            text: runs('Aleatório'),
            navigationEndpoint: { watchEndpoint: { videoId: shuffleId, playlistId: shuffleList } },
          },
        },
        startRadioButton: {
          buttonRenderer: {
            text: runs('Mix'),
            navigationEndpoint: { watchEndpoint: { videoId: mixId, playlistId: mixList } },
          },
        },
        subscriptionButton: {
          subscribeButtonRenderer: { subscriberCountText: runs(subscribers) },
        },
      },
    },
    contents: {
      sectionListRenderer: {
        contents: [
          {
            musicShelfRenderer: {
              title: runs('Top músicas'),
              contents: [
                {
                  musicResponsiveListItemRenderer: {
                    flexColumns: [
                      { musicResponsiveListItemFlexColumnRenderer: { text: runs(song) } },
                      { musicResponsiveListItemFlexColumnRenderer: { text: runs(artist) } },
                      { musicResponsiveListItemFlexColumnRenderer: { text: runs(playCount) } },
                      { musicResponsiveListItemFlexColumnRenderer: { text: runs(album) } },
                    ],
                    playlistItemData: { videoId },
                    overlay: {
                      musicItemThumbnailOverlayRenderer: {
                        content: {
                          musicPlayButtonRenderer: {
                            playNavigationEndpoint: {
                              watchEndpoint: { videoId, playlistId },
                            },
                          },
                        },
                      },
                    },
                    thumbnail: {
                      musicThumbnailRenderer: { thumbnail: thumbs('https://img/track') },
                    },
                  },
                },
              ],
            },
          },
          {
            musicCarouselShelfRenderer: {
              header: {
                musicCarouselShelfBasicHeaderRenderer: { title: runs(albumsTitle) },
              },
              contents: [
                {
                  musicTwoRowItemRenderer: {
                    title: runs(relatedAlbum),
                    subtitle: runs('Álbum'),
                    thumbnailRenderer: {
                      musicThumbnailRenderer: { thumbnail: thumbs('https://img/alb') },
                    },
                    navigationEndpoint: {
                      browseEndpoint: { browseId: `MPREb_${faker.string.alphanumeric(8)}` },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
  })

  assert.equal(feed.header.pageType, 'artist')
  assert.equal(feed.header.title, artist)
  assert.equal(feed.header.thumbnail, banner)
  assert.equal(feed.header.playlistId, shuffleList)
  assert.equal(feed.header.videoId, shuffleId)
  assert.equal(feed.header.mixPlaylistId, mixList)
  assert.equal(feed.header.mixVideoId, mixId)
  assert.equal(feed.header.subscriberCount, subscribers)
  assert.equal(feed.shelves[0].title, 'Top músicas')
  assert.equal(feed.shelves[0].tracks[0].title, song)
  assert.equal(feed.shelves[0].tracks[0].artist, artist)
  assert.equal(feed.shelves[0].tracks[0].album, album)
  assert.equal(feed.shelves[0].tracks[0].playCount, playCount)
  assert.equal(feed.shelves[0].tracks[0].playlistId, playlistId)
  assert.equal(feed.shelves[1].title, albumsTitle)
})

test('top song keeps the album column when it repeats the title', () => {
  const artist = faker.music.artist()
  const song = faker.music.songName()
  const videoId = faker.string.alphanumeric(11)
  const playCount = `Tocou ${faker.number.int({ min: 100, max: 900 })} mil vezes`

  const feed = parseHomeFeed({
    contents: {
      musicShelfRenderer: {
        title: runs('Top músicas'),
        contents: [
          {
            musicResponsiveListItemRenderer: {
              flexColumns: [
                { musicResponsiveListItemFlexColumnRenderer: { text: runs(song) } },
                { musicResponsiveListItemFlexColumnRenderer: { text: runs(artist) } },
                { musicResponsiveListItemFlexColumnRenderer: { text: runs(playCount) } },
                { musicResponsiveListItemFlexColumnRenderer: { text: runs(song) } },
              ],
              playlistItemData: { videoId },
            },
          },
        ],
      },
    },
  })

  assert.equal(feed.shelves[0].tracks[0].title, song)
  assert.equal(feed.shelves[0].tracks[0].artist, artist)
  assert.equal(feed.shelves[0].tracks[0].album, song)
  assert.equal(feed.shelves[0].tracks[0].playCount, playCount)
})

test('top song keeps views as play count instead of the album', () => {
  const artist = faker.music.artist()
  const song = faker.music.songName()
  const album = faker.music.album()
  const videoId = faker.string.alphanumeric(11)
  const playCount = `${faker.number.int({ min: 40, max: 900 })} mil visualizações`

  const feed = parseHomeFeed({
    contents: {
      musicShelfRenderer: {
        title: runs('Top músicas'),
        contents: [
          {
            musicResponsiveListItemRenderer: {
              flexColumns: [
                { musicResponsiveListItemFlexColumnRenderer: { text: runs(song) } },
                { musicResponsiveListItemFlexColumnRenderer: { text: runs(artist) } },
                { musicResponsiveListItemFlexColumnRenderer: { text: runs(playCount) } },
                { musicResponsiveListItemFlexColumnRenderer: { text: runs(album) } },
              ],
              playlistItemData: { videoId },
            },
          },
        ],
      },
    },
  })

  const track = feed.shelves[0].tracks[0]
  assert.equal(track.title, song)
  assert.equal(track.artist, artist)
  assert.equal(track.album, album)
  assert.equal(track.playCount, playCount)
})

function lyricsTab({ browseId, pageType, title = 'Letra', unselectable }) {
  const tab = {
    tabRenderer: {
      title,
      endpoint: {
        browseEndpoint: {
          browseId,
          browseEndpointContextSupportedConfigs: {
            browseEndpointContextMusicConfig: { pageType },
          },
        },
      },
    },
  }
  if (unselectable) tab.tabRenderer.unselectable = true
  return tab
}

test('lyrics browse id comes from the TRACK_LYRICS watch tab', () => {
  const lyricsId = `MPLYt_${faker.string.alphanumeric(16)}`
  const relatedId = `MPREl_${faker.string.alphanumeric(16)}`
  const payload = {
    contents: {
      singleColumnMusicWatchNextResultsRenderer: {
        tabbedRenderer: {
          watchNextTabbedResultsRenderer: {
            tabs: [
              { tabRenderer: { title: 'A seguir', content: { musicQueueRenderer: {} } } },
              lyricsTab({ browseId: lyricsId, pageType: 'MUSIC_PAGE_TYPE_TRACK_LYRICS' }),
              lyricsTab({
                browseId: relatedId,
                pageType: 'MUSIC_PAGE_TYPE_TRACK_RELATED',
                title: 'Relacionadas',
              }),
            ],
          },
        },
      },
    },
  }

  assert.equal(parseLyricsBrowseId(payload), lyricsId)
})

test('lyrics browse id skips an unselectable lyrics tab', () => {
  const lyricsId = `MPLYt_${faker.string.alphanumeric(16)}`
  const payload = {
    tabs: [
      lyricsTab({
        browseId: lyricsId,
        pageType: 'MUSIC_PAGE_TYPE_TRACK_LYRICS',
        unselectable: true,
      }),
    ],
  }

  assert.equal(parseLyricsBrowseId(payload), '')
})

test('lyrics parser splits the description shelf into lines and a source', () => {
  const lineOne = faker.lorem.sentence()
  const lineTwo = faker.lorem.sentence()
  const source = `Source: ${faker.company.name()}`
  const payload = {
    contents: {
      sectionListRenderer: {
        contents: [
          {
            musicDescriptionShelfRenderer: {
              header: runs('Letra'),
              description: runs(`${lineOne}\n\n${lineTwo}`),
              footer: runs(source),
            },
          },
        ],
      },
    },
  }

  const lyrics = parseLyrics(payload)

  assert.deepEqual(lyrics.lines, [lineOne, lineTwo])
  assert.equal(lyrics.source, source)
  assert.equal(lyrics.message, '')
})

test('lyrics parser keeps the Innertube empty message when the shelf is missing', () => {
  const message = faker.lorem.sentence()
  const payload = {
    contents: {
      sectionListRenderer: {
        contents: [{ messageRenderer: { text: runs(message) } }],
      },
    },
  }

  const lyrics = parseLyrics(payload)

  assert.deepEqual(lyrics.lines, [])
  assert.equal(lyrics.message, message)
})
