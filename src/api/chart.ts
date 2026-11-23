import type { Aspect } from '../astrology/aspects/index.ts'
import {
  type ChartPoints,
  type ChartSettings,
  type Coordinates,
  calculateChart,
  findSunrise,
  resolveSettings,
  type StateFunction,
  type Zodiac,
} from '../astrology/chart/index.ts'
import type { HouseSystem, Houses } from '../astrology/houses/index.ts'
import {
  DELTA_T_MODEL,
  deltaT,
  fromLocal,
  isDeltaTExtrapolated,
  type LocalInstant,
} from '../core/time/index.ts'
import type { Warning } from '../core/warning.ts'
import type { EngineInfo } from '../engines/contract/index.ts'

/** Where a chart is cast, and how to read its local time. */
export interface ChartLocation extends Coordinates {
  /** IANA time zone, e.g. `'Europe/Madrid'`. Ignored when `utcOffset` is given. */
  timezone?: string
  /** Fixed UTC offset, `±HH:mm`; `'+00:00'` for UTC. Wins over `timezone`. */
  utcOffset?: string
}

export interface ChartInput {
  /** Local date, `YYYY-MM-DD`. */
  date: string
  /**
   * Local time, `HH:mm`, `HH:mm:ss` or `HH:mm:ss.fff`; or `'sunrise'` when the birth time is
   * unknown, for the chart at the instant the Sun crosses the ascendant that day.
   */
  time: string
  location: ChartLocation
  settings?: ChartSettings
}

/** Where a chart's time comes from. */
export type TimeSource = 'given' | 'sunrise'

/** How a chart was computed, so it can be interpreted and reproduced. */
export interface ChartMeta {
  /** The engine that gave the positions. */
  engine: EngineInfo
  /** `'given'` for the time in the input, `'sunrise'` for a computed sunrise time. */
  timeSource: TimeSource
  /** ΔT = TT − UT at the instant, in seconds. */
  deltaT: number
  /** Apparent geocentric positions. */
  positions: 'apparent'
  /** Ecliptic and true equinox of date. */
  frame: 'ecliptic-of-date'
  zodiac: Zodiac
  /** The system asked for; `houses.system` is the one used. */
  houseSystem: HouseSystem
}

/** A full chart for a moment and a place. Plain data. */
export interface Chart {
  /** The local time as interpreted, with its UTC, UT and TT forms. */
  instant: LocalInstant
  /** Geographic coordinates of the place. */
  location: Coordinates
  /** Bodies (Sun … Pluto) then angles, keyed by point. */
  points: ChartPoints
  houses: Houses
  /** Aspects between the points, each pair once, in traditional order. */
  aspects: Aspect[]
  meta: ChartMeta
  warnings: Warning[]
}

function deltaTWarning(instant: LocalInstant): Warning {
  const { start, end } = DELTA_T_MODEL.measured
  return {
    code: 'DELTA_T_EXTRAPOLATED',
    message:
      `ΔT at ${instant.utc} is extrapolated: measured values cover ${start} to ${end}. ` +
      'The Moon, the angles and the houses are less certain than the other positions.',
  }
}

/** Builds a chart from the instance's checked `state` and its engine's info. */
export function chart(state: StateFunction, engine: EngineInfo, input: ChartInput): Chart {
  const { location, settings } = input
  const coordinates = { latitude: location.latitude, longitude: location.longitude }
  // Bad coordinates or settings fail before the local time is read.
  const { zodiac, houseSystem } = resolveSettings(coordinates, settings)
  const zone = {
    ...(location.timezone !== undefined && { timezone: location.timezone }),
    ...(location.utcOffset !== undefined && { utcOffset: location.utcOffset }),
  }
  const timeSource: TimeSource = input.time === 'sunrise' ? 'sunrise' : 'given'
  const local =
    timeSource === 'sunrise'
      ? findSunrise(state, input.date, coordinates, zone)
      : fromLocal({ date: input.date, time: input.time, ...zone })
  const { instant } = local
  const calculation = calculateChart(state, instant, coordinates, settings)

  return {
    instant,
    location: coordinates,
    points: calculation.points,
    houses: calculation.houses,
    aspects: calculation.aspects,
    meta: {
      engine: { ...engine, coverage: { ...engine.coverage } },
      timeSource,
      deltaT: deltaT(instant.julianDayUT),
      positions: 'apparent',
      frame: 'ecliptic-of-date',
      zodiac,
      houseSystem,
    },
    warnings: [
      ...local.warnings,
      ...(isDeltaTExtrapolated(instant.julianDayUT) ? [deltaTWarning(instant)] : []),
      ...calculation.warnings,
    ],
  }
}
