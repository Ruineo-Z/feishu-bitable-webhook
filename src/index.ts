import { config } from 'dotenv'
config()

import { OpenAPIHono } from '@hono/zod-openapi'
import { startEventListener } from './lark'

const app = new OpenAPIHono()

app.get('/', (c) => {
  return c.text('飞书多维表格 Webhook 服务运行中')
})

startEventListener()

export default {
  port: 3000,
  fetch: app.fetch,
}
