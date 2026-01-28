import { ActionHandler, ActionResult } from './registry'
import client from '../lark'

const updateRecord: ActionHandler = {
  async execute(params, context): Promise<ActionResult> {
    const { app_token, table_id, record_id, fields } = params

    if (!app_token || !table_id || !record_id || !fields) {
      throw new Error('Missing required params: app_token, table_id, record_id, or fields')
    }

    const startTime = Date.now()

    try {
      await client.bitable.v1.appTableRecord.update({
        path: {
          app_token,
          table_id,
          record_id
        },
        body: {
          fields
        }
      })

      return {
        success: true,
        response: { recordId: record_id },
        durationMs: Date.now() - startTime
      }
    } catch (error) {
      throw new Error(`Failed to update record: ${error}`)
    }
  }
}

export default updateRecord
