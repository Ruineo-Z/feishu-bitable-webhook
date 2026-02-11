import app from './src/index.ts'

Bun.serve({
  port: 3333,
  fetch: app.fetch,
})

console.log('Server running on http://localhost:3333')
