import {
  DryRunEffect,
  WorkflowContext,
  WorkflowRunMode,
  StepResult,
} from '../types';

function isScalarValue(value: unknown): value is string | number | boolean | bigint {
  return (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || typeof value === 'bigint'
  );
}

function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  try {
    const result = JSON.stringify(value, (_key, currentValue) => {
      if (typeof currentValue === 'bigint') {
        return String(currentValue);
      }

      if (currentValue && typeof currentValue === 'object') {
        if (seen.has(currentValue)) {
          return '[Circular]';
        }
        seen.add(currentValue);
      }

      return currentValue;
    });

    return result === undefined ? '' : result;
  } catch {
    return '[Unserializable]';
  }
}

function extractObjectDisplayValue(obj: Record<string, unknown>): string | null {
  const preferredTextKeys = ['name', 'user_name', 'display_name', 'en_name', 'title', 'text', 'label'];
  for (const key of preferredTextKeys) {
    const raw = obj[key];
    if (isScalarValue(raw)) {
      const text = String(raw).trim();
      if (text.length > 0) {
        return text;
      }
    }
  }

  if (Array.isArray(obj.users)) {
    const usersText = formatInterpolatedValue(obj.users);
    if (usersText.trim().length > 0) {
      return usersText;
    }
  }

  const preferredIdKeys = ['id', 'open_id', 'user_id', 'union_id', 'record_id', 'file_token'];
  for (const key of preferredIdKeys) {
    const raw = obj[key];
    if (isScalarValue(raw)) {
      const id = String(raw).trim();
      if (id.length > 0) {
        return id;
      }
    }
  }

  const nestedUserId = obj.user_id;
  if (nestedUserId && typeof nestedUserId === 'object') {
    const nestedText = extractObjectDisplayValue(nestedUserId as Record<string, unknown>);
    if (nestedText) {
      return nestedText;
    }
  }

  const fallbackValue = obj.value;
  if (isScalarValue(fallbackValue)) {
    const text = String(fallbackValue).trim();
    if (text.length > 0) {
      return text;
    }
  }

  return null;
}

function formatInterpolatedValue(value: unknown): string {
  if (value === null || value === undefined) return '';

  if (isScalarValue(value)) {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '';

    const parts = value
      .map((item) => {
        if (item === null || item === undefined) {
          return '';
        }

        if (isScalarValue(item)) {
          return String(item);
        }

        if (Array.isArray(item)) {
          return formatInterpolatedValue(item);
        }

        if (typeof item === 'object') {
          return extractObjectDisplayValue(item as Record<string, unknown>)
            || safeJsonStringify(item);
        }

        return String(item);
      })
      .filter((item) => item.trim().length > 0);

    if (parts.length > 0) {
      return parts.join(', ');
    }

    return safeJsonStringify(value);
  }

  if (typeof value === 'object') {
    return extractObjectDisplayValue(value as Record<string, unknown>)
      || safeJsonStringify(value);
  }

  return String(value);
}

export class ContextManager {
  private context: WorkflowContext;

  constructor(
    triggerData: any,
    options?: {
      mode?: WorkflowRunMode;
    },
  ) {
    this.context = {
      trigger: triggerData,
      steps: {},
      runtime: {
        mode: options?.mode || 'live',
        dryRun: {
          effects: [],
        },
      },
    };
  }

  public getContext(): WorkflowContext {
    return this.context;
  }

  public setStepResult(stepId: string, result: StepResult) {
    this.context.steps[stepId] = result;
  }

  public setCurrentStep(stepId: string, stepType: string): void {
    this.context.runtime.currentStepId = stepId;
    this.context.runtime.currentStepType = stepType;
  }

  public clearCurrentStep(): void {
    delete this.context.runtime.currentStepId;
    delete this.context.runtime.currentStepType;
  }

  public isDryRun(): boolean {
    return this.context.runtime.mode === 'dry-run';
  }

  public recordDryRunEffect(
    effect: Omit<DryRunEffect, 'stepId' | 'stepType'>
      & Partial<Pick<DryRunEffect, 'stepId' | 'stepType'>>,
  ): void {
    if (!this.isDryRun()) {
      return;
    }

    this.context.runtime.dryRun.effects.push({
      stepId: effect.stepId || this.context.runtime.currentStepId || 'unknown_step',
      stepType: effect.stepType || this.context.runtime.currentStepType || 'unknown_type',
      action: effect.action,
      target: effect.target,
      payload: effect.payload,
    });
  }

  /**
   * Resolves a value from the context using a dot-notation path.
   * Example: 'trigger.fields.Title' -> context.trigger.fields.Title
   */
  public getValue(path: string): any {
    const parts = path.split('.');
    let current: any = this.context;

    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = current[part];
    }
    return current;
  }

  /**
   * Replaces variables in the format ${path.to.value} with actual values.
   * If the text contains only the variable, it returns the raw value (preserving type).
   * Otherwise it returns a string with the substitution.
   */
  public substitute(text: string): any {
    if (!text || typeof text !== 'string') return text;

    const exactMatch = text.match(/^\$\{([^}]+)\}$/);
    if (exactMatch) {
      const value = this.getValue(exactMatch[1].trim());
      return value !== undefined ? value : text;
    }

    return text.replace(/\$\{([^}]+)\}/g, (match, path) => {
      const value = this.getValue(path.trim());
      return value !== undefined ? formatInterpolatedValue(value) : match;
    });
  }

  /**
   * Recursively substitutes variables in an object or array.
   */
  public substituteDeep(obj: any): any {
    if (typeof obj === 'string') {
      return this.substitute(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.substituteDeep(item));
    }

    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          result[key] = this.substituteDeep(obj[key]);
        }
      }
      return result;
    }

    return obj;
  }
}
