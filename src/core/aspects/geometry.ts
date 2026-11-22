import { normalizeSigned } from '../degrees/degrees.ts'

/** The major aspects, by increasing exact angle. */
export const ASPECT_NAMES = ['conjunction', 'sextile', 'square', 'trine', 'opposition'] as const

/** An aspect's name; the same type wherever aspects are chosen or reported. */
export type AspectName = (typeof ASPECT_NAMES)[number]

const EXACT_ANGLES: Record<AspectName, number> = {
  conjunction: 0,
  sextile: 60,
  square: 90,
  trine: 120,
  opposition: 180,
}

/** Exact angle of an aspect in degrees: `'square'` → 90. */
export function exactAngle(aspect: AspectName): number {
  return EXACT_ANGLES[aspect]
}

/**
 * Aspect offset: signed distance in degrees from A to the nearest point where it would
 * form the exact aspect with B, in (−180, 180]. An aspect other than the conjunction and
 * the opposition is exact on both sides of B (A at B + exactAngle or at B − exactAngle);
 * the nearer side is used, so one call sees both.
 *
 * The sign is geometric: positive when A is past that point in zodiacal order, negative
 * when it is short of it. It is not the signed orb (negative applying, positive
 * separating): with a retrograde body the offset can be negative while the aspect
 * separates.
 *
 * Halfway between the two exact points the result jumps (from +exactAngle to −exactAngle,
 * for instance). A root search must ignore sign changes where `|offset|` is large, as it
 * does for the jump at ±180°.
 */
export function offset(longitudeA: number, longitudeB: number, exactAngle: number): number {
  const separation = longitudeA - longitudeB
  const ahead = normalizeSigned(separation - exactAngle)
  const behind = normalizeSigned(separation + exactAngle)
  return Math.abs(ahead) <= Math.abs(behind) ? ahead : behind
}
