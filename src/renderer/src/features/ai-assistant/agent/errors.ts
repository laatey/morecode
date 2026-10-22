import type { ErrorKind } from '../types'

/** Throw this from an agent runner to show a friendly error card with a way forward. */
export class AgentError extends Error {
  kind: ErrorKind
  retryAfter?: number

  constructor(kind: ErrorKind, message: string, retryAfter?: number) {
    super(message)
    this.name = 'AgentError'
    this.kind = kind
    this.retryAfter = retryAfter
  }
}
