import { type DateRange, toTimeRange } from '../core/time/index.ts'
import {
  type AstronomyEngine,
  type Body,
  type BodyState,
  EngineNotReadyError,
  type JulianDayTT,
  type TimeRange,
} from '../engines/contract/index.ts'

/** Range loaded when `create` gets none, cut to the engine's coverage. */
export const DEFAULT_RANGE: DateRange = { start: '1900-01-01', end: '2100-01-01' }

export interface AlfonsinaOptions {
  /** The engine to compute with, e.g. `caelusEngine()` or `naelosEngine()`. */
  engine: AstronomyEngine
  /**
   * Dates to load now, in UTC. Default: 1900–2100, cut to the engine's coverage. Any other
   * range must fit in the coverage, or `create` throws `OutOfRangeError`.
   */
  range?: DateRange
}

/** The engine as an instance exposes it: `load` goes through `alfonsina.load`. */
export type InstanceEngine = Pick<AstronomyEngine, 'info' | 'bodies' | 'state'>

function contains(range: TimeRange, julianDay: number): boolean {
  return julianDay >= range.start && julianDay <= range.end
}

/** The default range, cut to a coverage; uncut when they do not overlap, so load() fails. */
function defaultRange(coverage: TimeRange): TimeRange {
  const range = toTimeRange(DEFAULT_RANGE)
  const start = Math.max(range.start, coverage.start) as JulianDayTT
  const end = Math.min(range.end, coverage.end) as JulianDayTT
  return start <= end ? { start, end } : range
}

/** Adds a range to a sorted list of disjoint ranges, merging the ones it overlaps. */
function union(ranges: readonly TimeRange[], added: TimeRange): TimeRange[] {
  const result: TimeRange[] = []
  let merged = added
  for (const range of ranges) {
    if (range.end < merged.start || range.start > merged.end) {
      result.push(range)
    } else {
      merged = {
        start: Math.min(range.start, merged.start) as JulianDayTT,
        end: Math.max(range.end, merged.end) as JulianDayTT,
      }
    }
  }
  result.push(merged)
  return result.sort((a, b) => a.start - b.start)
}

/** An Alfonsina instance: an engine and the dates loaded into it. */
export interface Alfonsina {
  /** The engine, with `state` checked against the instance's loaded ranges. */
  readonly engine: InstanceEngine
  /**
   * Loads more dates into the engine, in UTC. Returns at once when they are loaded already;
   * throws `OutOfRangeError` outside the engine's coverage.
   */
  load(range: DateRange): Promise<void>
}

export const Alfonsina = {
  /**
   * Creates an instance and loads `range` (default 1900–2100) into the engine. With
   * `alfonsina.load`, the only async calls of the API; everything else is synchronous.
   */
  async create(options: AlfonsinaOptions): Promise<Alfonsina> {
    const { engine } = options
    /** Loaded ranges, sorted and disjoint. */
    let loaded: TimeRange[] = []

    /**
     * Throws `EngineNotReadyError` unless an instant is within the loaded ranges. Every
     * operation checks its instants here, so the rule is the same for every engine.
     */
    function assertLoaded(julianDay: JulianDayTT): void {
      if (loaded.some((range) => contains(range, julianDay))) return
      throw new EngineNotReadyError(
        engine.info.id,
        julianDay,
        'Await alfonsina.load({ start, end }) with a date range that includes this instant.',
      )
    }

    async function loadRange(range: TimeRange): Promise<void> {
      if (loaded.some((done) => done.start <= range.start && range.end <= done.end)) return
      await engine.load(range)
      loaded = union(loaded, range)
    }

    await loadRange(options.range ? toTimeRange(options.range) : defaultRange(engine.info.coverage))

    return {
      engine: {
        info: engine.info,
        bodies: engine.bodies,
        state(body: Body, julianDay: JulianDayTT): BodyState {
          // Unsupported bodies and instants outside the coverage get the engine's own error.
          if (engine.bodies.has(body) && contains(engine.info.coverage, julianDay)) {
            assertLoaded(julianDay)
          }
          return engine.state(body, julianDay)
        },
      },
      load: (range) => loadRange(toTimeRange(range)),
    }
  },
}
