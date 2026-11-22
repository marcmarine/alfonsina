/**
 * A date, date-time or date range that cannot be read. Carries a stable `code`, the
 * rejected `input` and a `suggestion` on how to fix it.
 */
export class InvalidDateError extends Error {
  override readonly name = 'InvalidDateError'
  readonly code = 'INVALID_DATE'
  /** The rejected input. */
  readonly input: string
  /** How to fix the input. */
  readonly suggestion: string

  constructor(input: string, reason: string, suggestion: string) {
    super(`Invalid date '${input}': ${reason}.`)
    this.input = input
    this.suggestion = suggestion
  }
}
