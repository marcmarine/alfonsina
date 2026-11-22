/** Any angle in degrees to [0, 360). */
export function normalize(value: number): number {
  const result = value % 360
  if (result < 0) {
    // A tiny negative value plus 360 rounds to exactly 360, which is out of range.
    const wrapped = result + 360
    return wrapped === 360 ? 0 : wrapped
  }
  return result === 0 ? 0 : result // turns −0 into 0
}

/** Any angle in degrees to (−180, 180]. Not public: used by the aspect geometry. */
export function normalizeSigned(value: number): number {
  const result = normalize(value)
  return result > 180 ? result - 360 : result
}
