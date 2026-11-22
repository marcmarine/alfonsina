import type { JulianDayTT, JulianDayUT } from '../../engines/contract/index.ts'
import { normalize } from '../degrees/degrees.ts'
import type { Instant } from '../time/types.ts'
import { NUTATION_TERMS } from './nutation-terms.ts'

// Earth orientation for chart angles and houses, in the current IAU models: IAU 2006
// obliquity and sidereal time, IAU 2000B nutation. Engines compute none of this, so houses
// and angles are identical with every engine.

const J2000 = 2451545
const DAYS_PER_CENTURY = 36525
const ARCSECONDS_PER_TURN = 1_296_000
const RADIANS_PER_ARCSECOND = Math.PI / 648_000
const RADIANS_PER_DEGREE = Math.PI / 180

/** Fixed offsets standing in for the planetary terms the 2000B series leaves out, arcsec. */
const PLANETARY_LONGITUDE_OFFSET = -0.000135
const PLANETARY_OBLIQUITY_OFFSET = 0.000388

/** Units of the nutation coefficients (0.1 µas) in arcseconds. */
const COEFFICIENT_TO_ARCSECONDS = 1e-7

/** Nutation: the corrections to ecliptic longitude and to obliquity, in degrees. */
export interface Nutation {
  /** Nutation in longitude, Δψ, in degrees. A correction, not a position. */
  longitude: number
  /** Nutation in obliquity, Δε, in degrees. */
  obliquity: number
}

function centuriesSinceJ2000(julianDay: number): number {
  return (julianDay - J2000) / DAYS_PER_CENTURY
}

/** A Delaunay argument in radians, from its value and rate in arcseconds. */
function delaunay(atEpoch: number, perCentury: number, centuries: number): number {
  return ((atEpoch + perCentury * centuries) % ARCSECONDS_PER_TURN) * RADIANS_PER_ARCSECOND
}

/** Mean obliquity of the ecliptic, ε₀, in degrees (IAU 2006). */
export function meanObliquity(julianDay: JulianDayTT): number {
  const t = centuriesSinceJ2000(julianDay)
  const arcseconds =
    84381.406 +
    (-46.836769 + (-0.0001831 + (0.0020034 + (-0.000000576 + -0.0000000434 * t) * t) * t) * t) * t
  return arcseconds / 3600
}

/** Nutation in longitude and in obliquity, in degrees (IAU 2000B, about 1 mas). */
export function nutation(julianDay: JulianDayTT): Nutation {
  const t = centuriesSinceJ2000(julianDay)
  const moonAnomaly = delaunay(485868.249036, 1717915923.2178, t)
  const sunAnomaly = delaunay(1287104.79305, 129596581.0481, t)
  const moonLatitude = delaunay(335779.526232, 1739527262.8478, t)
  const elongation = delaunay(1072260.70369, 1602961601.209, t)
  const node = delaunay(450160.398036, -6962890.5431, t)

  let longitude = 0
  let obliquity = 0
  // Smallest terms first, for accuracy.
  for (let index = NUTATION_TERMS.length - 1; index >= 0; index--) {
    const [l, lp, f, d, om, ps, pst, pc, ec, ect, es] = NUTATION_TERMS[
      index
    ] as (typeof NUTATION_TERMS)[number]
    const argument =
      l * moonAnomaly + lp * sunAnomaly + f * moonLatitude + d * elongation + om * node
    const sine = Math.sin(argument)
    const cosine = Math.cos(argument)
    longitude += (ps + pst * t) * sine + pc * cosine
    obliquity += (ec + ect * t) * cosine + es * sine
  }

  return {
    longitude: (longitude * COEFFICIENT_TO_ARCSECONDS + PLANETARY_LONGITUDE_OFFSET) / 3600,
    obliquity: (obliquity * COEFFICIENT_TO_ARCSECONDS + PLANETARY_OBLIQUITY_OFFSET) / 3600,
  }
}

/** True obliquity of the ecliptic, ε = ε₀ + Δε, in degrees. */
export function trueObliquity(julianDay: JulianDayTT): number {
  return meanObliquity(julianDay) + nutation(julianDay).obliquity
}

/** Earth rotation angle in degrees, [0, 360) (IAU 2000). Not public. */
export function earthRotationAngle(julianDay: JulianDayUT): number {
  const days = julianDay - J2000
  const fraction = julianDay % 1
  return normalize(360 * (fraction + 0.779057273264 + 0.00273781191135448 * days))
}

/**
 * Mean sidereal time in degrees, [0, 360) (IAU 2006): Greenwich, or the meridian at
 * `longitude` (geographic, degrees east, negative west). Needs UT for the Earth's rotation
 * and TT for precession, which is why it takes an `Instant`.
 */
export function meanSiderealTime(instant: Instant, longitude = 0): number {
  const t = centuriesSinceJ2000(instant.julianDayTT)
  const arcseconds =
    0.014506 +
    (4612.156534 + (1.3915817 + (-0.00000044 + (-0.000029956 + -0.0000000368 * t) * t) * t) * t) * t
  return normalize(earthRotationAngle(instant.julianDayUT) + arcseconds / 3600 + longitude)
}

/**
 * Apparent sidereal time in degrees, [0, 360): the mean sidereal time plus the equation
 * of the equinoxes, Δψ · cos ε₀. At a place, this is the right ascension of the medium
 * coeli (ARMC), from which angles and houses are computed.
 */
export function apparentSiderealTime(instant: Instant, longitude = 0): number {
  const equationOfEquinoxes =
    nutation(instant.julianDayTT).longitude *
    Math.cos(meanObliquity(instant.julianDayTT) * RADIANS_PER_DEGREE)
  return normalize(meanSiderealTime(instant, longitude) + equationOfEquinoxes)
}
