import { ActionHandler, ActionResult } from './registry'
import client from '../lark'

const createRecord: ActionHandler = {
  async execute(params, context): Promise<ActionResult> {
    const { app_token, table_id, fields } = params

    if (!app_token || !table_id || !fields) {
      throw new Error('Missing required params: app_token, table_id, or fields')
    }

    const startTime = Date.now()

    try {
      const res = await client.bitable.v1.appTableRecord.create({
        path: {
          app_token,
          table_id
        },
        body: {
          records: [{ fields }]
        }
      })

      const recordId = res.data?.records?.[0]?.record_id

      return {
        success: true,
        response: { recordId },
        durationMs: Date.now() - startTime
      }
    } catch (error) {
      throw new Error(`Failed to create record: ${error}`)
    }
  }
}

export default createRecord
