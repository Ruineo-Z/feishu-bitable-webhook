import { ActionRegistry } from './registry'
import sendFeishuMessage from './send-feishu-message'
import callApi from './call-api'
import createRecord from './create-record'
import updateRecord from './update-record'
import deleteRecord from './delete-record'
import { crossTableAction } from './cross-table'

export function registerActions(): void {
  ActionRegistry.register('send_feishu_message', sendFeishuMessage)
  ActionRegistry.register('call_api', callApi)
  ActionRegistry.register('create_record', createRecord)
  ActionRegistry.register('update_record', updateRecord)
  ActionRegistry.register('delete_record', deleteRecord)
  ActionRegistry.register('cross-table', crossTableAction)
}

export { ActionRegistry, executeAction } from './registry'
export * from './send-feishu-message'
export * from './call-api'
export * from './create-record'
export * from './update-record'
export * from './delete-record'
export * from './cross-table'
