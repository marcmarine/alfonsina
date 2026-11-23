import { normalize } from '../../core/degrees/index.ts'
import { SIGNS, type Sign } from './signs.ts'

export type { Sign }

/** Width of a sign in degrees. */
const SIGN_WIDTH = 30

const SECONDS_PER_DEGREE = 3600
const SECONDS_PER_SIGN = SIGN_WIDTH * SECONDS_PER_DEGREE
const SECONDS_PER_CIRCLE = 360 * SECONDS_PER_DEGREE

/**
 * Tolerance in arcseconds before truncating: 24.45° is 88019.99999999999″ in floating
 * point and must still be 24°27′00″.
 */
const ROUNDING_TOLERANCE = 1e-7

/** A longitude within its sign in whole degrees, minutes and seconds, all truncated. */
export interface SignLongitudeParts {
  sign: Sign
  /** Whole degrees within the sign, 0–29. */
  degrees: number
  /** Whole arcminutes, 0–59. */
  minutes: number
  /** Whole arcseconds, 0–59. */
  seconds: number
}

function checkFinite(longitude: number): void {
  if (!Number.isFinite(longitude)) {
    throw new RangeError(`Ecliptic longitude must be finite, got ${longitude}.`)
  }
}

/**
 * Sign of an ecliptic longitude in degrees, normalized first: `signOf(54.45)` is
 * `'taurus'`, and a longitude on a cusp belongs to the sign it begins.
 *
 * @throws {RangeError} If the longitude is not a finite number.
 */
export function signOf(longitude: number): Sign {
  checkFinite(longitude)
  return SIGNS[Math.floor(normalize(longitude) / SIGN_WIDTH)] as Sign
}

/**
 * Decimal degrees within the sign, in [0, 30): `signLongitude(54.45)` is `24.45`.
 *
 * @throws {RangeError} If the longitude is not a finite number.
 */
export function signLongitude(longitude: number): number {
  checkFinite(longitude)
  return normalize(longitude) % SIGN_WIDTH
}

/**
 * A longitude split into sign, degrees, minutes and seconds, the data behind a text such
 * as 24°27′29″ Taurus: `signLongitudeParts(54.4583)` is
 * `{ sign: 'taurus', degrees: 24, minutes: 27, seconds: 29 }`.
 *
 * Every part is truncated, as in ephemerides, so the parts never show a degree, or a sign,
 * the point has not reached yet. They all come from the same whole number of arcseconds,
 * so they never disagree. Composing the text (symbols, padding, sign names in any
 * language) is up to the application.
 *
 * @throws {RangeError} If the longitude is not a finite number.
 */
export function signLongitudeParts(longitude: number): SignLongitudeParts {
  checkFinite(longitude)
  const seconds =
    Math.floor(normalize(longitude) * SECONDS_PER_DEGREE + ROUNDING_TOLERANCE) % SECONDS_PER_CIRCLE
  const withinSign = seconds % SECONDS_PER_SIGN
  return {
    sign: SIGNS[Math.floor(seconds / SECONDS_PER_SIGN)] as Sign,
    degrees: Math.floor(withinSign / SECONDS_PER_DEGREE),
    minutes: Math.floor((withinSign % SECONDS_PER_DEGREE) / 60),
    seconds: withinSign % 60,
  }
}
