import { OpenAPIHono } from '@hono/zod-openapi'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

const LEGACY_ASSET_BASE = new URL('../ui/workflows/', import.meta.url)
const MODERN_ASSET_BASE = new URL('../../web/workflow-studio/dist/', import.meta.url)

const LEGACY_ALLOWED_ASSETS = new Set([
  'index.html',
  'styles.css',
  'app.js',
  'api.js',
  'state.js',
  'view.js',
  'style-lab.html',
  'style-lab.css',
  'style-lab.js',
  'style-lab-v2.js',
  'style-lab-v3.html',
  'style-lab-v3.css',
  'style-lab-v3.js',
  'style-lab-v2.css',
  'style-lab-v2.html',
  'style-lab-v4.html',
  'style-lab-v4.css',
  'style-lab-v4.js',
])

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

function isLegacyEnabled(): boolean {
  const rawValue = String(process.env.WORKFLOW_UI_LEGACY || '')
    .trim()
    .toLowerCase()

  return rawValue === 'true' || rawValue === '1' || rawValue === 'yes'
}

function sanitizeAssetPath(rawPath: string): string | null {
  const normalized = decodeURIComponent(rawPath || '')
    .replace(/^\/+/, '')
    .trim()

  if (!normalized) return ''
  if (normalized.includes('\0')) return null

  const pathSegments = normalized.split('/')
  if (pathSegments.some((segment) => segment === '..' || segment === '.')) {
    return null
  }

  return normalized
}

async function serveLegacyAsset(c: any, assetPath: string) {
  const normalized = sanitizeAssetPath(assetPath)
  if (normalized === null || !LEGACY_ALLOWED_ASSETS.has(normalized || 'index.html')) {
    return c.text('Not Found', 404)
  }

  const filename = normalized || 'index.html'

  try {
    const body = await readFile(new URL(filename, LEGACY_ASSET_BASE), 'utf8')
    const ext = extname(filename)
    const contentType = CONTENT_TYPES[ext] ?? 'text/plain; charset=utf-8'

    return c.body(body, 200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    })
  } catch {
    return c.text('Not Found', 404)
  }
}

async function readModernFile(assetPath: string): Promise<Buffer | null> {
  try {
    const file = await readFile(new URL(assetPath, MODERN_ASSET_BASE))
    return file
  } catch {
    return null
  }
}

async function serveModernIndex(c: any) {
  const indexFile = await readModernFile('index.html')
  if (!indexFile) {
    return c.text(
      'Workflow Studio 前端产物不存在，请先执行：npm --prefix web/workflow-studio run build',
      503,
    )
  }

  return c.body(indexFile, 200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  })
}

async function serveModernAsset(c: any, assetPath: string) {
  const normalized = sanitizeAssetPath(assetPath)
  if (normalized === null) {
    return c.text('Not Found', 404)
  }

  if (!normalized || normalized === 'index.html') {
    return serveModernIndex(c)
  }

  const extension = extname(normalized)
  if (!extension) {
    return serveModernIndex(c)
  }

  const fileBody = await readModernFile(normalized)
  if (!fileBody) {
    return c.text('Not Found', 404)
  }

  const contentType = CONTENT_TYPES[extension] ?? 'application/octet-stream'
  const cacheControl = extension === '.html' ? 'no-store' : 'public, max-age=31536000, immutable'

  return c.body(fileBody, 200, {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
  })
}

export default function registerWorkflowUiRoutes(app: OpenAPIHono) {
  app.get('/ui/workflows', (c: any) => {
    if (isLegacyEnabled()) {
      return serveLegacyAsset(c, 'index.html')
    }

    return serveModernIndex(c)
  })

  app.get('/ui/workflows/', (c: any) => c.redirect('/ui/workflows'))

  app.get('/ui/workflows/*', (c: any) => {
    const relativePath = c.req.path.replace(/^\/ui\/workflows\/?/, '')

    if (isLegacyEnabled()) {
      return serveLegacyAsset(c, relativePath)
    }

    return serveModernAsset(c, relativePath)
  })

  app.get('/ui/workflows/:asset', (c: any) => {
    const asset = c.req.param('asset')

    if (isLegacyEnabled()) {
      return serveLegacyAsset(c, asset)
    }

    return serveModernAsset(c, asset)
  })
}
