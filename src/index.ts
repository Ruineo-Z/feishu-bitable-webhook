import { OpenAPIHono } from '@hono/zod-openapi'

const app = new OpenAPIHono()

export default {
  port: 3000,
  fetch: app.fetch,
}
