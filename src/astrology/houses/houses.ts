import { normalize } from '../../core/degrees/index.ts'
import type { Warning } from '../../core/warning.ts'

/** The four chart angles. */
export const ANGLES = ['ascendant', 'mediumCoeli', 'descendant', 'imumCoeli'] as const

/** A chart angle: ascendant, medium coeli (MC), descendant or imum coeli (IC). */
export type Angle = (typeof ANGLES)[number]

/** House systems of 0.1.0. */
export type HouseSystem = 'placidus' | 'whole-sign'

/** House cusps as a chart carries them. */
export interface Houses {
  /** The system actually used: `'whole-sign'` when Placidus is undefined. */
  system: HouseSystem
  /** Ecliptic longitudes of the twelve cusps in degrees, cusp 1 first. */
  cusps: number[]
}

export interface HousesResult {
  houses: Houses
  warnings: Warning[]
}

const RADIANS_PER_DEGREE = Math.PI / 180

function sin(degrees: number): number {
  return Math.sin(degrees * RADIANS_PER_DEGREE)
}

function cos(degrees: number): number {
  return Math.cos(degrees * RADIANS_PER_DEGREE)
}

function tan(degrees: number): number {
  return Math.tan(degrees * RADIANS_PER_DEGREE)
}

function atan2Degrees(y: number, x: number): number {
  return normalize(Math.atan2(y, x) / RADIANS_PER_DEGREE)
}

/** Ecliptic longitude on the meridian or the horizon for a right ascension, in degrees. */
function longitudeOfRightAscension(rightAscension: number, obliquity: number): number {
  return atan2Degrees(sin(rightAscension), cos(rightAscension) * cos(obliquity))
}

/**
 * Whether an ecliptic point on the horizon is in the east, i.e. rising: its hour angle
 * (ARMC minus its right ascension) is between −180° and 0°.
 */
function isRising(longitude: number, siderealTime: number, obliquity: number): boolean {
  const rightAscension = atan2Degrees(sin(longitude) * cos(obliquity), cos(longitude))
  return sin(siderealTime - rightAscension) < 0
}

/**
 * The four angles, as ecliptic longitudes in degrees. The ascendant is the ecliptic point
 * rising on the eastern horizon, at every latitude.
 *
 * @param siderealTime Local apparent sidereal time in degrees (the right ascension of the
 *   meridian, ARMC), as `earth.apparentSiderealTime(instant, longitude)` gives it.
 * @param latitude Geographic latitude in degrees, north positive.
 * @param obliquity True obliquity of the ecliptic in degrees.
 */
export function angles(
  siderealTime: number,
  latitude: number,
  obliquity: number,
): Record<Angle, number> {
  const mediumCoeli = longitudeOfRightAscension(siderealTime, obliquity)
  // One of the two points where the ecliptic meets the horizon. Outside the polar circles
  // it is always the eastern one; inside them it can be the western, setting one.
  const intersection = atan2Degrees(
    cos(siderealTime),
    -(sin(siderealTime) * cos(obliquity) + tan(latitude) * sin(obliquity)),
  )
  const ascendant = isRising(intersection, siderealTime, obliquity)
    ? intersection
    : normalize(intersection + 180)
  return {
    ascendant,
    mediumCoeli,
    descendant: normalize(ascendant + 180),
    imumCoeli: normalize(mediumCoeli + 180),
  }
}

/**
 * Whether Placidus is defined at a latitude: beyond the polar circles (|latitude| ≥ 90° −
 * obliquity) some ecliptic degrees never rise or set, so their semi-arcs do not exist.
 */
export function isPlacidusDefined(latitude: number, obliquity: number): boolean {
  return Math.abs(latitude) < 90 - obliquity
}

/** Iterations and tolerance, in degrees, of the Placidus cusp search. */
const PLACIDUS_MAX_ITERATIONS = 100
const PLACIDUS_TOLERANCE = 1e-10

/**
 * One Placidus cusp: the ecliptic point whose hour angle is `fraction` of its semi-arc.
 * Above the horizon (cusps 11 and 12) the right ascension is ARMC + fraction × diurnal
 * semi-arc; below it (cusps 2 and 3), ARMC + 180° − fraction × nocturnal semi-arc. The
 * semi-arc depends on the point's declination, so the cusp is found by iteration.
 */
function placidusCusp(
  siderealTime: number,
  latitude: number,
  obliquity: number,
  fraction: number,
  aboveHorizon: boolean,
): number {
  let longitude = longitudeOfRightAscension(
    siderealTime + (aboveHorizon ? 90 * fraction : 180 - 90 * fraction),
    obliquity,
  )
  for (let iteration = 0; iteration < PLACIDUS_MAX_ITERATIONS; iteration += 1) {
    const declination = Math.asin(sin(obliquity) * sin(longitude))
    // Ascensional difference: how much longer than 90° the diurnal semi-arc is.
    const ascensionalDifference =
      Math.asin(tan(latitude) * Math.tan(declination)) / RADIANS_PER_DEGREE
    const rightAscension = aboveHorizon
      ? siderealTime + fraction * (90 + ascensionalDifference)
      : siderealTime + 180 - fraction * (90 - ascensionalDifference)
    const next = longitudeOfRightAscension(rightAscension, obliquity)
    const change = Math.abs(normalize(next - longitude + 180) - 180)
    longitude = next
    if (change < PLACIDUS_TOLERANCE) break
  }
  return longitude
}

function placidusCusps(siderealTime: number, latitude: number, obliquity: number): number[] {
  const { ascendant, mediumCoeli } = angles(siderealTime, latitude, obliquity)
  const eleventh = placidusCusp(siderealTime, latitude, obliquity, 1 / 3, true)
  const twelfth = placidusCusp(siderealTime, latitude, obliquity, 2 / 3, true)
  const second = placidusCusp(siderealTime, latitude, obliquity, 2 / 3, false)
  const third = placidusCusp(siderealTime, latitude, obliquity, 1 / 3, false)
  return [
    ascendant,
    second,
    third,
    normalize(mediumCoeli + 180),
    normalize(eleventh + 180),
    normalize(twelfth + 180),
    normalize(ascendant + 180),
    normalize(second + 180),
    normalize(third + 180),
    mediumCoeli,
    eleventh,
    twelfth,
  ]
}

function wholeSignCusps(ascendant: number): number[] {
  const first = Math.floor(ascendant / 30) * 30
  return Array.from({ length: 12 }, (_, index) => normalize(first + 30 * index))
}

/**
 * House cusps in the system asked for. Where Placidus is undefined (beyond the polar
 * circles) it falls back to whole-sign houses with a `PLACIDUS_UNDEFINED` warning, and
 * `houses.system` says which system was used.
 *
 * @param siderealTime Local apparent sidereal time in degrees (ARMC).
 * @param latitude Geographic latitude in degrees, north positive.
 * @param obliquity True obliquity of the ecliptic in degrees.
 */
export function houses(
  system: HouseSystem,
  siderealTime: number,
  latitude: number,
  obliquity: number,
): HousesResult {
  if (system === 'placidus') {
    if (isPlacidusDefined(latitude, obliquity)) {
      return {
        houses: { system, cusps: placidusCusps(siderealTime, latitude, obliquity) },
        warnings: [],
      }
    }
    const { ascendant } = angles(siderealTime, latitude, obliquity)
    return {
      houses: { system: 'whole-sign', cusps: wholeSignCusps(ascendant) },
      warnings: [
        {
          code: 'PLACIDUS_UNDEFINED',
          message:
            `Placidus houses are undefined at latitude ${latitude}° (beyond the polar ` +
            'circles some degrees never rise or set); whole-sign houses were used instead.',
        },
      ],
    }
  }
  const { ascendant } = angles(siderealTime, latitude, obliquity)
  return { houses: { system, cusps: wholeSignCusps(ascendant) }, warnings: [] }
}

/**
 * House (1–12) of an ecliptic longitude: the cusp it is at or past and before the next,
 * across the 360° → 0° wrap. Not public in 0.1.0.
 */
export function houseOf(longitude: number, cusps: readonly number[]): number {
  const point = normalize(longitude)
  for (let index = 0; index < 12; index += 1) {
    const start = cusps[index] as number
    const end = cusps[(index + 1) % 12] as number
    if (normalize(point - start) < normalize(end - start)) {
      return index + 1
    }
  }
  // Only reached through rounding at a cusp: the point is on cusp 1's boundary.
  return 1
}
