import app from './src/index.ts'

Bun.serve({
  port: 3000,
  fetch: app.fetch,
})

console.log('Server running on http://localhost:3000')
