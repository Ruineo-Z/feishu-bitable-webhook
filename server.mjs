import { serve } from '@hono/node-server'
import { config } from 'dotenv'
config()

const appModule = await import('./src/index.js')
const app = appModule.default

const port = 3000
serve({
  fetch: app.fetch,
  port,
})

console.log(`Server running on http://localhost:${port}`)
