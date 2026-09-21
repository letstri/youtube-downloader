import { createFileRoute } from '@tanstack/react-router'
import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { discardJob, getJob } from '../../server/jobs'

const TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
}

export const Route = createFileRoute('/api/download')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get('id')
        const job = id ? getJob(id) : undefined
        if (!job) return Response.json({ error: 'job not found' }, { status: 404 })
        if (job.status !== 'done' || !job.filename) {
          return Response.json({ error: `job is ${job.status}, not ready` }, { status: 409 })
        }

        const path = join(job.dir, job.filename)
        const ext = job.filename.split('.').pop() ?? ''
        const stream = createReadStream(path)

        stream.on('close', () => void discardJob(job.id))
        stream.on('error', () => void discardJob(job.id))

        return new Response(Readable.toWeb(stream) as ReadableStream, {
          headers: {
            'content-type': TYPES[ext] ?? 'application/octet-stream',
            'content-length': String(job.size ?? 0),
            'content-disposition': `attachment; filename="${job.filename}"`,
          },
        })
      },
    },
  },
})
