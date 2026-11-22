// Regenerates src/core/time/delta-t-data.ts from the latest USNO data.
// Usage: bun run update-delta-t. Run before each release, then review and commit the diff.

import { writeFile } from 'node:fs/promises'
import { buildDeltaTData, HISTORIC_URL, MONTHLY_URL, renderDeltaTData } from './delta-t-data.ts'

const OUTPUT = new URL('../src/core/time/delta-t-data.ts', import.meta.url)

async function download(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} answered ${response.status} ${response.statusText}.`)
  return response.text()
}

const [historic, monthly] = await Promise.all([download(HISTORIC_URL), download(MONTHLY_URL)])
const data = buildDeltaTData(historic, monthly)
const generatedOn = new Date().toISOString().slice(0, 10)
await writeFile(OUTPUT, renderDeltaTData(data, generatedOn))

console.log(
  `Wrote ${data.yearly.length} yearly values from ${data.firstYear}; ` +
    `latest ${data.latest.date}: ${data.latest.seconds} s.`,
)
