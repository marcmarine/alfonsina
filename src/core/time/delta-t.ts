import type { JulianDayUT } from '../../engines/contract/index.ts'
import { decimalYearFromJulianDay as decimalYear } from './calendar.ts'
import { LATEST_MEASURED_DELTA_T, MEASURED_DELTA_T, MEASURED_FIRST_YEAR } from './delta-t-data.ts'
import type { DateRange } from './types.ts'

/**
 * The single ΔT model of the library, reported in `meta`.
 *
 * - Within `measured`: USNO measured values, interpolated linearly between January 1 of
 *   each year.
 * - Outside: the Espenak–Meeus (2006) polynomials, shifted to meet the measured values at
 *   each end. The shift fades out linearly over a century, so ΔT stays continuous.
 */
export const DELTA_T_MODEL: { readonly name: string; readonly measured: DateRange } = {
  name: 'USNO measured values, Espenak–Meeus 2006 outside them',
  measured: { start: '1657-01-01', end: '2026-10-01' },
}

/** Years over which the shift between the polynomials and the measured values fades out. */
const BLEND_YEARS = 100

const FIRST_YEAR = MEASURED_FIRST_YEAR
const LAST_YEAR = decimalYear(LATEST_MEASURED_DELTA_T.julianDay)

/**
 * ΔT in seconds from the Espenak–Meeus (2006) polynomials, NASA Five Millennium Canon of
 * Solar Eclipses. Valid from −1999 to 3000, with the long-term parabola outside.
 */
export function espenakMeeus(year: number): number {
  if (year < -500 || year >= 2150) {
    const u = (year - 1820) / 100
    return -20 + 32 * u * u
  }
  if (year < 500) {
    const u = year / 100
    return (
      10583.6 -
      1014.41 * u +
      33.78311 * u ** 2 -
      5.952053 * u ** 3 -
      0.1798452 * u ** 4 +
      0.022174192 * u ** 5 +
      0.0090316521 * u ** 6
    )
  }
  if (year < 1600) {
    const u = (year - 1000) / 100
    return (
      1574.2 -
      556.01 * u +
      71.23472 * u ** 2 +
      0.319781 * u ** 3 -
      0.8503463 * u ** 4 -
      0.005050998 * u ** 5 +
      0.0083572073 * u ** 6
    )
  }
  if (year < 1700) {
    const t = year - 1600
    return 120 - 0.9808 * t - 0.01532 * t ** 2 + t ** 3 / 7129
  }
  if (year < 1800) {
    const t = year - 1700
    return 8.83 + 0.1603 * t - 0.0059285 * t ** 2 + 0.00013336 * t ** 3 - t ** 4 / 1_174_000
  }
  if (year < 1860) {
    const t = year - 1800
    return (
      13.72 -
      0.332447 * t +
      0.0068612 * t ** 2 +
      0.0041116 * t ** 3 -
      0.00037436 * t ** 4 +
      0.0000121272 * t ** 5 -
      0.0000001699 * t ** 6 +
      0.000000000875 * t ** 7
    )
  }
  if (year < 1900) {
    const t = year - 1860
    return (
      7.62 +
      0.5737 * t -
      0.251754 * t ** 2 +
      0.01680668 * t ** 3 -
      0.0004473624 * t ** 4 +
      t ** 5 / 233_174
    )
  }
  if (year < 1920) {
    const t = year - 1900
    return -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4
  }
  if (year < 1941) {
    const t = year - 1920
    return 21.2 + 0.84493 * t - 0.0761 * t ** 2 + 0.0020936 * t ** 3
  }
  if (year < 1961) {
    const t = year - 1950
    return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547
  }
  if (year < 1986) {
    const t = year - 1975
    return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718
  }
  if (year < 2005) {
    const t = year - 2000
    return (
      63.86 +
      0.3345 * t -
      0.060374 * t ** 2 +
      0.0017275 * t ** 3 +
      0.000651814 * t ** 4 +
      0.00002373599 * t ** 5
    )
  }
  if (year < 2050) {
    const t = year - 2000
    return 62.92 + 0.32217 * t + 0.005589 * t ** 2
  }
  const u = (year - 1820) / 100
  return -20 + 32 * u * u - 0.5628 * (2150 - year)
}

function measured(year: number): number {
  const lastIndex = MEASURED_DELTA_T.length - 1
  const position = year - FIRST_YEAR
  if (position >= lastIndex) {
    const last = MEASURED_DELTA_T[lastIndex] as number
    const fraction = (year - (FIRST_YEAR + lastIndex)) / (LAST_YEAR - (FIRST_YEAR + lastIndex))
    return last + (LATEST_MEASURED_DELTA_T.seconds - last) * fraction
  }
  const index = Math.floor(position)
  const before = MEASURED_DELTA_T[index] as number
  const after = MEASURED_DELTA_T[index + 1] as number
  return before + (after - before) * (position - index)
}

function blended(year: number, edge: number, edgeValue: number): number {
  const shift = edgeValue - espenakMeeus(edge)
  const weight = Math.max(0, 1 - Math.abs(year - edge) / BLEND_YEARS)
  return espenakMeeus(year) + shift * weight
}

/** ΔT = TT − UT in seconds at an instant, from the library's single model. */
export function deltaT(julianDay: JulianDayUT): number {
  const year = decimalYear(julianDay)
  if (year < FIRST_YEAR) return blended(year, FIRST_YEAR, MEASURED_DELTA_T[0] as number)
  if (year > LAST_YEAR) return blended(year, LAST_YEAR, LATEST_MEASURED_DELTA_T.seconds)
  return measured(year)
}

/**
 * Whether ΔT at an instant comes from the polynomials rather than measured values. Results
 * for such instants carry a warning.
 */
export function isDeltaTExtrapolated(julianDay: JulianDayUT): boolean {
  const year = decimalYear(julianDay)
  return year < FIRST_YEAR || year > LAST_YEAR
}
