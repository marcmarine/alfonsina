import { BODIES, type Body } from '../engines/contract/index.ts'
import { ANGLES, type Angle } from './houses/index.ts'

/** Anything an aspect or a transit can point to: a body or a chart angle. */
export type ChartPoint = Body | Angle

/** Every chart point in traditional order: Sun … Pluto, then the angles. */
export const CHART_POINTS: readonly ChartPoint[] = [...BODIES, ...ANGLES]

const ANGLE_SET: ReadonlySet<ChartPoint> = new Set(ANGLES)

/** Whether a chart point is one of the four angles. */
export function isAngle(point: ChartPoint): point is Angle {
  return ANGLE_SET.has(point)
}
