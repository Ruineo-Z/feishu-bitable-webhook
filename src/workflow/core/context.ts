import { WorkflowContext, StepResult } from '../types';

export class ContextManager {
  private context: WorkflowContext;

  constructor(triggerData: any) {
    this.context = {
      trigger: triggerData,
      steps: {},
    };
  }

  public getContext(): WorkflowContext {
    return this.context;
  }

  public setStepResult(stepId: string, result: StepResult) {
    this.context.steps[stepId] = result;
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

    // Check if it's a single variable replacement to preserve type
    const exactMatch = text.match(/^\$\{([^}]+)\}$/);
    if (exactMatch) {
      const value = this.getValue(exactMatch[1].trim());
      // If value is undefined, return the original text so it's clear something failed
      // or return undefined? Usually keeping the template is safer for debugging.
      return value !== undefined ? value : text;
    }

    // String interpolation
    return text.replace(/\$\{([^}]+)\}/g, (match, path) => {
      const value = this.getValue(path.trim());
      return value !== undefined ? String(value) : match;
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
      return obj.map(item => this.substituteDeep(item));
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
