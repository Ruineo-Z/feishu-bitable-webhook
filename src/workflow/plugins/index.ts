import { PluginRegistry } from '../core/registry'
import { ConditionPlugin } from './condition'
import { FeishuMessagePlugin } from './feishu-message'
import { FeishuWebhookPlugin } from './feishu-webhook'
import { BitableUpdatePlugin } from './bitable-update'
import { BitableCreatePlugin } from './bitable-create'
import { BitableDeletePlugin } from './bitable-delete'
import { BitableQueryPlugin } from './bitable-query'

export function registerStandardPlugins() {
  const registry = PluginRegistry.getInstance()

  registry.register('condition', new ConditionPlugin())

  registry.register('action.feishu.message', new FeishuMessagePlugin())
  registry.register('action.feishu.webhook', new FeishuWebhookPlugin())

  registry.register('action.bitable.create', new BitableCreatePlugin())
  registry.register('action.bitable.update', new BitableUpdatePlugin())
  registry.register('action.bitable.delete', new BitableDeletePlugin())
  registry.register('action.bitable.query', new BitableQueryPlugin())

  // aliases for compatibility
  registry.register('action.bitable.create_record', new BitableCreatePlugin())
  registry.register('action.bitable.update_record', new BitableUpdatePlugin())
  registry.register('action.bitable.delete_record', new BitableDeletePlugin())
  registry.register('action.bitable.query_records', new BitableQueryPlugin())
}
