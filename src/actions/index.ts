import { ActionRegistry } from './registry'
import sendFeishuMessage from './send-feishu-message'
import callApi from './call-api'
import createRecord from './create-record'
import updateRecord from './update-record'
import deleteRecord from './delete-record'
import batchCreate from './batch-create'
import batchUpdate from './batch-update'
import batchDelete from './batch-delete'
import queryRecords from './query-records'

export function registerActions(): void {
  ActionRegistry.register('send_feishu_message', sendFeishuMessage)
  ActionRegistry.register('call_api', callApi)
  ActionRegistry.register('create_record', createRecord)
  ActionRegistry.register('update_record', updateRecord)
  ActionRegistry.register('delete_record', deleteRecord)
  ActionRegistry.register('batch_create', batchCreate)
  ActionRegistry.register('batch_update', batchUpdate)
  ActionRegistry.register('batch_delete', batchDelete)
  ActionRegistry.register('query_records', queryRecords)
}

export { ActionRegistry, executeAction } from './registry'
export * from './send-feishu-message'
export * from './call-api'
export * from './create-record'
export * from './update-record'
export * from './delete-record'
export * from './batch-create'
export * from './batch-update'
export * from './batch-delete'
export * from './query-records'
