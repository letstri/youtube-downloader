import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertYoutubeUrl, isMode, parseProgress } from './jobs.ts'

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
  assert.equal(parseProgress('PROG|500|1000'), 50)
  assert.equal(parseProgress('PROG|1000|1000'), 100)
  assert.equal(parseProgress('PROG|2000|1000'), 100) // estimate undershot, clamp
  assert.equal(parseProgress('PROG|0|NA'), null) // size unknown yet
  assert.equal(parseProgress('[download] Destination: foo.mp4'), null)
  assert.equal(parseProgress(''), null)
})

test('only known modes pass', () => {
  assert.ok(isMode('max') && isMode('compatible') && isMode('audio'))
  assert.ok(!isMode('rm -rf /') && !isMode('') && !isMode(undefined))
})
