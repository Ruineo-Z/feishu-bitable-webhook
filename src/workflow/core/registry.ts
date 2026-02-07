import { IWorkflowPlugin } from '../types';

export class PluginRegistry {
  private static instance: PluginRegistry;
  private plugins: Map<string, IWorkflowPlugin> = new Map();

  private constructor() {}

  public static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
    }
    return PluginRegistry.instance;
  }

  public register(type: string, plugin: IWorkflowPlugin) {
    if (this.plugins.has(type)) {
      console.warn(`Plugin ${type} is already registered. Overwriting.`);
    }
    this.plugins.set(type, plugin);
  }

  public get(type: string): IWorkflowPlugin | undefined {
    return this.plugins.get(type);
  }

  public getAllRegisteredTypes(): string[] {
      return Array.from(this.plugins.keys());
  }
}
