import { ActionHandler, ActionResult } from './registry'
import client from '../lark'

const sendFeishuMessage: ActionHandler = {
  async execute(params, context): Promise<ActionResult> {
    const { receive_id, receive_id_type, content } = params

    if (!receive_id || !content) {
      throw new Error('Missing required params: receive_id or content')
    }

    const startTime = Date.now()

    try {
      const res = await client.im.v1.messages.create({
        body: {
          receive_id_type: receive_id_type || 'open_id',
          receive_id,
          content
        }
      })

      return {
        success: true,
        response: { messageId: res.data?.message_id },
        durationMs: Date.now() - startTime
      }
    } catch (error) {
      throw new Error(`Failed to send Feishu message: ${error}`)
    }
  }
}

export default sendFeishuMessage
