import { createFileRoute } from '@tanstack/react-router'
import { assertYoutubeUrl, fetchInfo } from '../../server/jobs'

export const Route = createFileRoute('/api/info')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = new URL(request.url).searchParams.get('url')

        let url: string
        try {
          url = assertYoutubeUrl(raw)
        } catch (err) {
          return Response.json({ error: (err as Error).message }, { status: 400 })
        }

        try {
          return Response.json(await fetchInfo(url))
        } catch (err) {
          return Response.json({ error: (err as Error).message }, { status: 502 })
        }
      },
    },
  },
})
