import { ActionHandler, ActionResult } from './registry'
import client from '../lark'

const deleteRecord: ActionHandler = {
  async execute(params, context): Promise<ActionResult> {
    const { app_token, table_id, record_id } = params

    if (!app_token || !table_id || !record_id) {
      throw new Error('Missing required params: app_token, table_id, or record_id')
    }

    const startTime = Date.now()

    try {
      await client.bitable.v1.appTableRecord.delete({
        path: {
          app_token,
          table_id,
          record_id
        }
      })

      return {
        success: true,
        response: { recordId: record_id },
        durationMs: Date.now() - startTime
      }
    } catch (error) {
      throw new Error(`Failed to delete record: ${error}`)
    }
  }
}

export default deleteRecord
