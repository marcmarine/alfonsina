/**
 * The twelve signs of the tropical zodiac, in order from 0° Aries. Internal: results
 * carry these ids and the application translates them, typed by `Sign`.
 */
export const SIGNS = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
] as const

/** A sign of the tropical zodiac. */
export type Sign = (typeof SIGNS)[number]
