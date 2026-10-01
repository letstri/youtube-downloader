import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertYoutubeUrl, clipArgs, friendlyError, isMode, parseProgress, parseTime } from './jobs.ts'

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
    'http://www.youtube.com/watch?v=x',
    'file:///etc/passwd',
    'https://169.254.169.254/latest/meta-data',
    'https://youtube.com.evil.example/watch?v=x',
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
  assert.equal(parseProgress('PROG|2000|1000|1|1')?.percent, 100)
  assert.equal(parseProgress('PROG|0|NA|NA|NA')?.percent, null)
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
  assert.match(friendlyError('ERROR: [youtube] x: This video is unavailable'), /unavailable/i)
  assert.match(friendlyError('ERROR: [youtube] x: Video unavailable'), /unavailable/i)
  assert.match(friendlyError('ERROR: unable to download: HTTP Error 403: Forbidden'), /out of date/i)
  assert.match(friendlyError(''), /without saying why/)
  assert.equal(friendlyError('ERROR: something new'), 'ERROR: something new')
})

test('reads clip times and builds the cut', () => {
  assert.equal(parseTime(''), null)
  assert.equal(parseTime(undefined), null)
  assert.equal(parseTime('40'), 40)
  assert.equal(parseTime('1:10'), 70)
  assert.equal(parseTime('1:02:03.5'), 3723.5)
  for (const bad of ['abc', '-5', '1:2:3:4', '10-40', '*10', 42]) {
    assert.throws(() => parseTime(bad), `should have rejected ${String(bad)}`)
  }
  assert.deepEqual(clipArgs(null, null), [])
  assert.deepEqual(clipArgs(10, 40).slice(0, 2), ['--download-sections', '*10-40'])
  assert.equal(clipArgs(null, 40)[1], '*0-40')
  assert.equal(clipArgs(10, null)[1], '*10-inf')
  assert.throws(() => clipArgs(40, 10))
  assert.throws(() => clipArgs(10, 10))
})
