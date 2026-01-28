import { EventRouter, EventData, MatchedRule } from './event-router'

export class RuleMatcher {
  private eventRouter: EventRouter

  constructor() {
    this.eventRouter = new EventRouter()
  }

  async match(event: EventData): Promise<MatchedRule[]> {
    return this.eventRouter.route(event)
  }

  clearCache(): void {
    this.eventRouter.clearCache()
  }
}
