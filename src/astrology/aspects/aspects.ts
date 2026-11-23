import { ASPECT_NAMES, type AspectName, exactAngle, offset } from '../../core/aspects/index.ts'
import { normalizeSigned } from '../../core/degrees/degrees.ts'
import { CHART_POINTS, type ChartPoint, isAngle } from '../points.ts'

/**
 * What an aspect needs from a point. A chart's `points` fit as they are. A point without
 * `longitudeSpeed`, such as an angle, counts as stationary.
 */
export interface AspectPoint {
  /** Ecliptic longitude in degrees. */
  longitude: number
  /** Degrees per day; 0 when absent. */
  longitudeSpeed?: number
}

export interface AspectOptions {
  /** Aspects to look for. Default: the five major aspects. */
  aspects?: readonly AspectName[]
  /** Orb per aspect in degrees; aspects left out keep their default orb. */
  orbs?: Partial<Record<AspectName, number>>
}

/** An aspect found between two points. */
export interface Aspect {
  /** The two points, in traditional order within a chart, in argument order across two. */
  between: [ChartPoint, ChartPoint]
  aspect: AspectName
  /** Exact angle of the aspect in degrees, as `aspects.exactAngle` gives it. */
  exactAngle: number
  /** Real angular distance between the two points in degrees, [0, 180]. */
  separation: number
  /** `|separation − exactAngle|` in degrees. */
  orb: number
  /** Whether the points are moving towards the exact aspect. */
  applying: boolean
}

/** Default orbs in degrees (D-86). */
export const DEFAULT_ORBS: Readonly<Record<AspectName, number>> = {
  conjunction: 8,
  sextile: 5,
  square: 7,
  trine: 7,
  opposition: 8,
}

type AspectPoints = Partial<Record<ChartPoint, AspectPoint>>

interface Criteria {
  aspects: readonly AspectName[]
  orbs: Readonly<Record<AspectName, number>>
}

/** Checks the options and fills in the defaults. */
function criteria(options: AspectOptions): Criteria {
  const asked = new Set<string>(options.aspects ?? ASPECT_NAMES)
  for (const name of asked) {
    if (!(ASPECT_NAMES as readonly string[]).includes(name)) {
      throw new RangeError(`Unknown aspect: ${name}`)
    }
  }
  const orbs = { ...DEFAULT_ORBS, ...options.orbs }
  for (const name of ASPECT_NAMES) {
    const orb = orbs[name]
    if (!Number.isFinite(orb) || orb < 0) {
      throw new RangeError(`The ${name} orb must be a finite number of degrees ≥ 0: ${orb}`)
    }
  }
  return { aspects: ASPECT_NAMES.filter((name) => asked.has(name)), orbs }
}

/**
 * The aspect between two points, if any is within its orb. When orbs are wide enough for
 * two aspects to match, the one with the smaller orb wins.
 */
function aspectBetween(
  pointA: ChartPoint,
  a: AspectPoint,
  pointB: ChartPoint,
  b: AspectPoint,
  { aspects, orbs }: Criteria,
): Aspect | undefined {
  const separation = Math.abs(normalizeSigned(a.longitude - b.longitude))
  let found: Aspect | undefined
  for (const aspect of aspects) {
    const exact = exactAngle(aspect)
    const orb = Math.abs(separation - exact)
    if (orb > orbs[aspect] || (found && found.orb <= orb)) continue
    // The orb shrinks when the aspect offset and the relative speed have opposite signs.
    const relativeSpeed = (a.longitudeSpeed ?? 0) - (b.longitudeSpeed ?? 0)
    const applying = offset(a.longitude, b.longitude, exact) * relativeSpeed < 0
    found = { between: [pointA, pointB], aspect, exactAngle: exact, separation, orb, applying }
  }
  return found
}

/** The points of a map that are chart points, in traditional order. */
function entries(points: AspectPoints): [ChartPoint, AspectPoint][] {
  return CHART_POINTS.flatMap((point) => {
    const value = points[point]
    return value ? [[point, value] as [ChartPoint, AspectPoint]] : []
  })
}

/**
 * Aspects between two sets of points, such as two charts' `points` for a synastry. Every
 * point of A is paired with every point of B; `between` holds A's point first. Results
 * follow the traditional order of A's points, then of B's.
 */
export function findAspects(
  pointsA: AspectPoints,
  pointsB: AspectPoints,
  options: AspectOptions = {},
): Aspect[] {
  const settings = criteria(options)
  const listB = entries(pointsB)
  const result: Aspect[] = []
  for (const [pointA, a] of entries(pointsA)) {
    for (const [pointB, b] of listB) {
      const found = aspectBetween(pointA, a, pointB, b, settings)
      if (found) result.push(found)
    }
  }
  return result
}

/**
 * Aspects within one chart: each pair once, in traditional order, and no pairs of two
 * angles, whose aspects depend only on the place (the ascendant always opposes the
 * descendant). What `chart` uses; not public in 0.1.0.
 */
export function aspectsWithin(points: AspectPoints, options: AspectOptions = {}): Aspect[] {
  const settings = criteria(options)
  const list = entries(points)
  const result: Aspect[] = []
  list.forEach(([pointA, a], index) => {
    for (const [pointB, b] of list.slice(index + 1)) {
      if (isAngle(pointA) && isAngle(pointB)) continue
      const found = aspectBetween(pointA, a, pointB, b, settings)
      if (found) result.push(found)
    }
  })
  return result
}
