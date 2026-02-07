import { PluginRegistry } from '../core/registry';
import { ConditionPlugin } from './condition';
import { FeishuMessagePlugin } from './feishu-message';
import { BitableUpdatePlugin } from './bitable-update';

export function registerStandardPlugins() {
  const registry = PluginRegistry.getInstance();

  registry.register('condition', new ConditionPlugin());
  registry.register('action.feishu.message', new FeishuMessagePlugin());
  registry.register('action.bitable.update', new BitableUpdatePlugin());
}
