import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertYoutubeUrl, friendlyError, isMode, parseProgress } from './jobs.ts'

test('accepts real YouTube URLs', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=DZzmOBx5K3A',
    'https://youtu.be/DZzmOBx5K3A',
    'https://m.youtube.com/watch?v=DZzmOBx5K3A',
    'https://music.youtube.com/watch?v=DZzmOBx5K3A',
  ]) {
    assert.equal(assertYoutubeUrl(url), url)
  }
})

test('rejects anything that is not an https YouTube URL', () => {
  for (const url of [
    'https://evil.example.com/video',
    'http://www.youtube.com/watch?v=x', // plaintext
    'file:///etc/passwd',
    'https://169.254.169.254/latest/meta-data', // cloud metadata endpoint
    'https://youtube.com.evil.example/watch?v=x', // suffix trick
    'https://localhost:3000/admin',
    42,
    null,
  ]) {
    assert.throws(() => assertYoutubeUrl(url), `should have rejected ${String(url)}`)
  }
})

test('parses yt-dlp progress lines', () => {
  assert.deepEqual(parseProgress('PROG|500|1000|250000|12'), {
    percent: 50,
    speed: 250000,
    eta: 12,
  })
  assert.equal(parseProgress('PROG|2000|1000|1|1')?.percent, 100) // estimate undershot, clamp
  assert.equal(parseProgress('PROG|0|NA|NA|NA')?.percent, null) // size unknown yet
  assert.equal(parseProgress('PROG|0|NA|NA|NA')?.speed, null)
  assert.equal(parseProgress('[download] Destination: foo.mp4'), null)
  assert.equal(parseProgress(''), null)
})

test('only known modes pass', () => {
  assert.ok(isMode('max') && isMode('compatible') && isMode('audio'))
  assert.ok(!isMode('rm -rf /') && !isMode('') && !isMode(undefined))
})

test('turns yt-dlp noise into something readable', () => {
  assert.match(
    friendlyError('ERROR: [youtube] x: Sign in to confirm you’re not a bot'),
    /YTDLP_COOKIES/,
  )
  assert.match(friendlyError('ERROR: [youtube] x: Private video'), /private/i)
  // yt-dlp phrases these two ways; both must be caught.
  assert.match(friendlyError('ERROR: [youtube] x: This video is unavailable'), /unavailable/i)
  assert.match(friendlyError('ERROR: [youtube] x: Video unavailable'), /unavailable/i)
  assert.match(friendlyError('ERROR: unable to download: HTTP Error 403: Forbidden'), /out of date/i)
  assert.match(friendlyError(''), /without saying why/)
  // Anything unrecognised is passed through rather than swallowed.
  assert.equal(friendlyError('ERROR: something new'), 'ERROR: something new')
})
