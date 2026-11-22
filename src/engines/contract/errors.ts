import type { Body } from './body.ts'
import type { JulianDayTT, TimeRange } from './julian-day.ts'

/** Machine-readable codes of the engine errors. */
export type EngineErrorCode = 'OUT_OF_RANGE' | 'UNSUPPORTED_BODY' | 'ENGINE_NOT_READY'

/**
 * Base class of the errors an engine throws instead of returning a wrong value.
 *
 * Each error carries a stable `code`, a readable `message` and a `suggestion` on how to fix
 * the call, so applications and AI agents can react without parsing the message.
 */
export abstract class EngineError extends Error {
  abstract readonly code: EngineErrorCode
  /** How to fix the call. */
  readonly suggestion: string
  /** Id of the adapter that threw (`EngineInfo.id`). */
  readonly engineId: string

  protected constructor(engineId: string, message: string, suggestion: string) {
    super(message)
    this.engineId = engineId
    this.suggestion = suggestion
  }
}

function formatRange(range: TimeRange): string {
  return `JD ${range.start}–${range.end} TT`
}

/** The requested instant or range is outside the engine's coverage. */
export class OutOfRangeError extends EngineError {
  override readonly name = 'OutOfRangeError'
  readonly code = 'OUT_OF_RANGE'
  /** The instant or range that was asked for. */
  readonly requested: JulianDayTT | TimeRange
  /** The engine's coverage. */
  readonly coverage: TimeRange

  constructor(engineId: string, requested: JulianDayTT | TimeRange, coverage: TimeRange) {
    const what = typeof requested === 'number' ? `JD ${requested} TT` : formatRange(requested)
    super(
      engineId,
      `Engine '${engineId}' cannot compute ${what}: outside its coverage, ${formatRange(coverage)}.`,
      'Use dates within the engine coverage, or switch to an engine that covers them.',
    )
    this.requested = requested
    this.coverage = coverage
  }
}

/** The engine does not compute the requested body. */
export class UnsupportedBodyError extends EngineError {
  override readonly name = 'UnsupportedBodyError'
  readonly code = 'UNSUPPORTED_BODY'
  /** The body that was asked for. */
  readonly body: Body

  constructor(engineId: string, body: Body) {
    super(
      engineId,
      `Engine '${engineId}' does not compute '${body}'.`,
      'Check the engine bodies before asking for a body, or switch to an engine that computes it.',
    )
    this.body = body
  }
}

/** The engine was asked for an instant whose data has not been loaded yet. */
export class EngineNotReadyError extends EngineError {
  override readonly name = 'EngineNotReadyError'
  readonly code = 'ENGINE_NOT_READY'
  /** The instant that was asked for. */
  readonly requested: JulianDayTT

  constructor(engineId: string, requested: JulianDayTT) {
    super(
      engineId,
      `Engine '${engineId}' has no data loaded for JD ${requested} TT.`,
      'Await load() with a range that includes this instant before calling state().',
    )
    this.requested = requested
  }
}
