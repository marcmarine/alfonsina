/**
 * Something a result is based on that the caller should know: an interpretation the
 * library had to choose, or a value of lower precision. Plain data, so it survives
 * `postMessage` and `JSON.stringify`.
 */
export interface Warning {
  /** Stable, machine-readable code, e.g. `'AMBIGUOUS_LOCAL_TIME'`. */
  code: string
  /** Readable explanation, including what was assumed and how to avoid it. */
  message: string
}
