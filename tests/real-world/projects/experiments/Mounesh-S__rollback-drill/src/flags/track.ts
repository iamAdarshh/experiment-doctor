// Sends game events to Flagsmith. Each event is flushed straight away: a round produces
// at most four events, and the player may close the tab right after answering.

import type { IFlagsmith } from '@flagsmith/flagsmith/types'
import type { EmitEvent, GameEvent } from '../game/events.ts'

type EventClient = Pick<IFlagsmith, 'trackEvent' | 'flushEvents'>

export function flagsmithEmitter(client: EventClient, onSent?: (event: GameEvent) => void): EmitEvent {
  return (event) => {
    client.trackEvent(event.name, event.value === undefined ? undefined : { value: event.value })
    void client.flushEvents().catch(() => {})
    onSent?.(event)
  }
}

/** Best-effort flush when the page is hidden or unloaded. */
export function flushOnPageHide(client: Pick<IFlagsmith, 'flushEvents'>): () => void {
  const flush = () => void client.flushEvents().catch(() => {})
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush()
  }
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    window.removeEventListener('pagehide', flush)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
