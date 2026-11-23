import type { AspectName } from '../../core/aspects/index.ts'
import { apparentSiderealTime, trueObliquity } from '../../core/earth/index.ts'
import type { Instant } from '../../core/time/index.ts'
import type { Warning } from '../../core/warning.ts'
import {
  BODIES,
  type Body,
  type BodyState,
  type JulianDayTT,
} from '../../engines/contract/index.ts'
import { type Aspect, aspectsWithin } from '../aspects/index.ts'
import {
  ANGLES,
  type Angle,
  angles,
  type HouseSystem,
  type Houses,
  houseOf,
  houses,
} from '../houses/index.ts'
import { type Sign, signLongitude, signOf } from '../zodiac/index.ts'

/** A body in a chart. */
export interface BodyPlacement {
  kind: 'body'
  body: Body
  /** Ecliptic longitude in degrees, [0, 360). */
  longitude: number
  /** Ecliptic latitude in degrees. */
  latitude: number
  /** Degrees per day; negative while retrograde. */
  longitudeSpeed: number
  /** Whether the body moves backwards in longitude. */
  retrograde: boolean
  sign: Sign
  /** Decimal degrees within the sign, [0, 30). */
  signLongitude: number
  /** House the body is in, 1–12. */
  house: number
}

/** A chart angle: no speed, no house. */
export interface AnglePlacement {
  kind: 'angle'
  angle: Angle
  /** Ecliptic longitude in degrees, [0, 360). */
  longitude: number
  sign: Sign
  /** Decimal degrees within the sign, [0, 30). */
  signLongitude: number
}

/** What a chart holds for each point; `kind` tells them apart. */
export type PointPlacement = BodyPlacement | AnglePlacement

/** A chart's points, bodies then angles, each with its own placement type. */
export type ChartPoints = { [B in Body]: BodyPlacement } & { [A in Angle]: AnglePlacement }

/** Geographic coordinates in degrees. */
export interface Coordinates {
  /** Geographic latitude, north positive, [−90, 90]. */
  latitude: number
  /** Geographic longitude, east positive, [−180, 180]. */
  longitude: number
}

/** Zodiacs of 0.1.0. */
export type Zodiac = 'tropical'

export interface ChartSettings {
  /** Default `'tropical'`, the only zodiac of 0.1.0. */
  zodiac?: Zodiac
  /** Default `'placidus'`; whole-sign houses where Placidus is undefined. */
  houseSystem?: HouseSystem
  /** Aspects to look for; `[]` for none. Default: the five major aspects. */
  aspects?: readonly AspectName[]
  /** Orb per aspect in degrees; aspects left out keep their default orb. */
  orbs?: Partial<Record<AspectName, number>>
}

/** What the astrology layer computes for a chart; the API adds the instant, place and meta. */
export interface ChartCalculation {
  points: ChartPoints
  houses: Houses
  aspects: Aspect[]
  warnings: Warning[]
}

/** The engine call a chart needs. */
export type StateFunction = (body: Body, julianDay: JulianDayTT) => BodyState

const HOUSE_SYSTEMS: readonly HouseSystem[] = ['placidus', 'whole-sign']

/** Checks the coordinates and settings, and fills in the defaults. */
export function resolveSettings(
  coordinates: Coordinates,
  settings: ChartSettings = {},
): Required<Pick<ChartSettings, 'zodiac' | 'houseSystem'>> {
  const { latitude, longitude } = coordinates
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) {
    throw new RangeError(`Latitude must be a number of degrees in [−90, 90]: ${latitude}`)
  }
  if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    throw new RangeError(`Longitude must be a number of degrees in [−180, 180]: ${longitude}`)
  }
  const zodiac = settings.zodiac ?? 'tropical'
  if (zodiac !== 'tropical') {
    throw new RangeError(`Unknown zodiac: ${zodiac}. Only 'tropical' is available.`)
  }
  const houseSystem = settings.houseSystem ?? 'placidus'
  if (!HOUSE_SYSTEMS.includes(houseSystem)) {
    throw new RangeError(`Unknown house system: ${houseSystem}`)
  }
  return { zodiac, houseSystem }
}

/**
 * The chart for an instant and a place: bodies from the engine, angles and houses from
 * sidereal time and obliquity, and the aspects between them.
 */
export function calculateChart(
  state: StateFunction,
  instant: Instant,
  coordinates: Coordinates,
  settings: ChartSettings = {},
): ChartCalculation {
  const { houseSystem } = resolveSettings(coordinates, settings)
  const siderealTime = apparentSiderealTime(instant, coordinates.longitude)
  const obliquity = trueObliquity(instant.julianDayTT)
  const { houses: chartHouses, warnings } = houses(
    houseSystem,
    siderealTime,
    coordinates.latitude,
    obliquity,
  )
  const chartAngles = angles(siderealTime, coordinates.latitude, obliquity)

  const points = {} as ChartPoints
  for (const body of BODIES) {
    const { longitude, latitude, longitudeSpeed } = state(body, instant.julianDayTT)
    points[body] = {
      kind: 'body',
      body,
      longitude,
      latitude,
      longitudeSpeed,
      retrograde: longitudeSpeed < 0,
      sign: signOf(longitude),
      signLongitude: signLongitude(longitude),
      house: houseOf(longitude, chartHouses.cusps),
    }
  }
  for (const angle of ANGLES) {
    const longitude = chartAngles[angle]
    points[angle] = {
      kind: 'angle',
      angle,
      longitude,
      sign: signOf(longitude),
      signLongitude: signLongitude(longitude),
    }
  }

  const aspects = aspectsWithin(points, {
    ...(settings.aspects && { aspects: settings.aspects }),
    ...(settings.orbs && { orbs: settings.orbs }),
  })
  return { points, houses: chartHouses, aspects, warnings }
}
