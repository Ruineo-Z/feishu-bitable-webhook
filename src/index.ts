import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'

// 创建应用
const app = new OpenAPIHono()

// 定义一个简单的 GET 接口
const helloRoute = createRoute({
  method: 'get',
  path: '/hello',
  tags: ['测试'],
  summary: '测试接口',
  responses: {
    200: {
      description: '成功响应',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
            timestamp: z.number(),
          }),
        },
      },
    },
  },
})

app.openapi(helloRoute, (c) => {
  return c.json({
    message: 'Hello, World!',
    timestamp: Date.now(),
  })
})

// 定义带参数的 POST 接口
const createUserRoute = createRoute({
  method: 'post',
  path: '/users',
  tags: ['用户'],
  summary: '创建用户',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string().min(2, '姓名至少2个字符'),
            email: z.string().email('邮箱格式不正确'),
            age: z.number().min(0).max(150).optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: '创建成功',
      content: {
        'application/json': {
          schema: z.object({
            id: z.string(),
            name: z.string(),
            email: z.string(),
          }),
        },
      },
    },
  },
})

app.openapi(createUserRoute, async (c) => {
  const body = await c.req.json()
  return c.json({
    id: crypto.randomUUID(),
    name: body.name,
    email: body.email,
  }, 201)
})

// 开放 API 文档
app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Feishu Bitable Webhook API',
    version: '1.0.0',
    description: '飞书多维表格 Webhook 接口文档',
  },
})

// Swagger UI
app.use('/docs', swaggerUI({ url: '/openapi.json' }))

// 启动服务
console.log('Server running at http://localhost:3000')
console.log('API Docs: http://localhost:3000/docs')

export default {
  port: 3000,
  fetch: app.fetch,
}
