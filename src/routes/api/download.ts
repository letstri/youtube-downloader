import { createFileRoute } from '@tanstack/react-router'
import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { checkAuth, json } from '../../server/auth'
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
      // Stream the finished file, then delete it. Query: ?id=<job id>
      GET: async ({ request }) => {
        const denied = checkAuth(request)
        if (denied) return denied

        const id = new URL(request.url).searchParams.get('id')
        const job = id ? getJob(id) : undefined
        if (!job) return json({ error: 'job not found' }, 404)
        if (job.status !== 'done' || !job.filename) {
          return json({ error: `job is ${job.status}, not ready` }, 409)
        }

        const path = join(job.dir, job.filename)
        const ext = job.filename.split('.').pop() ?? ''
        const stream = createReadStream(path)

        // The file only exists to be handed over once, so bin it either way.
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
