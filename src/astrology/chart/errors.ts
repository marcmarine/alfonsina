import type { Coordinates } from './chart.ts'

/**
 * The Sun does not cross the ascendant on the given local date (polar day or night), so
 * there is no sunrise chart. Carries a stable `code`, the `date`, the `location` and a
 * `suggestion` on how to fix the call.
 */
export class NoSunriseError extends Error {
  override readonly name = 'NoSunriseError'
  readonly code = 'NO_SUNRISE'
  /** The local date asked for, `YYYY-MM-DD`. */
  readonly date: string
  /** Geographic coordinates of the place. */
  readonly location: Coordinates
  /** How to fix the call. */
  readonly suggestion: string

  constructor(date: string, location: Coordinates) {
    super(
      `The Sun does not rise on ${date} at latitude ${location.latitude}°, longitude ` +
        `${location.longitude}° (polar day or night), so there is no sunrise chart.`,
    )
    this.date = date
    this.location = { ...location }
    this.suggestion = "Give the birth time; if it is unknown, a conventional time such as '12:00'."
  }
}
