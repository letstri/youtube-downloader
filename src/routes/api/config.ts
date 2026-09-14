import { createFileRoute } from '@tanstack/react-router'
import { authRequired, json } from '../../server/auth'

export const Route = createFileRoute('/api/config')({
  server: {
    handlers: {
      // Lets the UI know whether to ask for a token. Deliberately unauthenticated.
      GET: async () => json({ authRequired: authRequired() }),
    },
  },
})
