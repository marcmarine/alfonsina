import { describe, expect, it } from 'vitest'
import pkg from '../package.json' with { type: 'json' }

/** Maps a build output path (`./dist/x/index.js`) to its source (`../src/x/index.ts`). */
function sourceOf(outputPath: string): string {
  return outputPath.replace(/^\.\/dist\//, '../src/').replace(/\.(d\.ts|js)$/, '.ts')
}

describe('package.json', () => {
  it('is an ES module', () => {
    expect(pkg.type).toBe('module')
  })

  it('publishes only the build output', () => {
    expect(pkg.files).toEqual(['dist'])
  })

  it('points every export at the build output of an existing source file', async () => {
    for (const [subpath, target] of Object.entries(pkg.exports)) {
      expect(target.types, subpath).toMatch(/^\.\/dist\/.+\.d\.ts$/)
      expect(target.import, subpath).toMatch(/^\.\/dist\/.+\.js$/)
      expect(sourceOf(target.types), subpath).toBe(sourceOf(target.import))
      await expect(
        import(/* @vite-ignore */ sourceOf(target.import)),
        subpath,
      ).resolves.toBeDefined()
    }
  })
})
