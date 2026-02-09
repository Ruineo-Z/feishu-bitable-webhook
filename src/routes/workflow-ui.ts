import { OpenAPIHono } from '@hono/zod-openapi'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

const ASSET_BASE = new URL('../ui/workflows/', import.meta.url)

const ASSET_CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
}

const ALLOWED_ASSETS = new Set([
  'index.html',
  'styles.css',
  'app.js',
  'api.js',
  'state.js',
  'view.js',
])

async function serveAsset(c: any, filename: string) {
  if (!ALLOWED_ASSETS.has(filename)) {
    return c.text('Not Found', 404)
  }

  const fileUrl = new URL(filename, ASSET_BASE)

  let body = ''
  try {
    body = await readFile(fileUrl, 'utf8')
  } catch {
    return c.text('Not Found', 404)
  }

  const ext = extname(filename)
  const contentType = ASSET_CONTENT_TYPES[ext] ?? 'text/plain; charset=utf-8'

  return c.body(body, 200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  })
}

export default function registerWorkflowUiRoutes(app: OpenAPIHono) {
  app.get('/ui/workflows', (c: any) => serveAsset(c, 'index.html'))
  app.get('/ui/workflows/', (c: any) => c.redirect('/ui/workflows'))
  app.get('/ui/workflows/:asset', (c: any) => {
    const asset = c.req.param('asset')
    return serveAsset(c, asset)
  })
}
