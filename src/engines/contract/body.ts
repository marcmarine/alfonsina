/**
 * Bodies an engine can compute, in traditional order.
 *
 * Chiron, lunar nodes, Lilith and asteroids come after 0.1.0.
 */
export const BODIES = [
  'sun',
  'moon',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto',
] as const

/** A planet or point an engine computes. */
export type Body = (typeof BODIES)[number]

/**
 * Apparent geocentric state of a body, ecliptic and true equinox of date.
 *
 * Fields are flat so that each `state()` call allocates a single object. There is no time
 * field: the caller already knows the instant it asked for.
 */
export interface BodyState {
  body: Body
  /** Ecliptic longitude in degrees, [0, 360). */
  longitude: number
  /** Ecliptic latitude in degrees. */
  latitude: number
  /** Distance from the Earth in AU. */
  distance: number
  /** Degrees per day. Always present; negative while retrograde. */
  longitudeSpeed: number
  /** Degrees per day. */
  latitudeSpeed: number
  /** AU per day. */
  distanceSpeed: number
}
