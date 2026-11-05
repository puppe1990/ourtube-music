import { faker } from '@faker-js/faker'
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseAccount,
  parseCommand,
  parseGuide,
  parseHomeShelves,
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
  assert.throws(() => parseCommand('music_unknown', payload), /music_unknown/)
})
