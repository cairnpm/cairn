import { describe, expect, it } from 'vitest'
import { compareVersions, detectHost, docsUrl, latestRelease, resetUpdateCache, updateCommand } from '../server/utils/updateCheck'

// Zero network: `latestRelease` takes an injected fetch, so the GitHub call is stubbed like the CLI
// suite stubs the API. Nothing here touches .data/ or the wire.

describe('compareVersions', () => {
  it('orders by major, minor, patch', () => {
    expect(compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('0.2.0', '0.10.0')).toBeLessThan(0)
    expect(compareVersions('0.1.2', '0.1.10')).toBeLessThan(0)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })

  it('tolerates a v prefix and missing segments', () => {
    expect(compareVersions('v1.2.0', '1.2.0')).toBe(0)
    expect(compareVersions('1.3', '1.2.9')).toBeGreaterThan(0)
  })

  it('ranks a pre-release below its release', () => {
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0)
  })
})

describe('detectHost', () => {
  it('reads the platform markers, CAIRN_HOST winning', () => {
    expect(detectHost({ FLY_APP_NAME: 'cairn' })).toBe('fly')
    expect(detectHost({ RENDER: 'true' })).toBe('render')
    expect(detectHost({ FLY_APP_NAME: 'cairn', CAIRN_HOST: 'source' })).toBe('source')
    expect(detectHost({ CAIRN_HOST: 'nonsense' })).not.toBe('nonsense')
  })

  it('maps every host to a command and a docs anchor', () => {
    expect(updateCommand('fly', {})).toContain('fly deploy')
    expect(updateCommand('docker', {})).toContain('docker compose pull')
    expect(updateCommand('source', {})).toContain('pnpm build')
    // Never leave `pnpm preview` in the update path — it's a foreground preview, not a service.
    expect(updateCommand('source', {})).not.toContain('preview')
    for (const h of ['fly', 'render', 'docker', 'source'] as const) expect(docsUrl(h)).toContain('DEPLOY.md#')
  })

  it('fills Render\'s service id from its own env', () => {
    expect(updateCommand('render', { RENDER_SERVICE_ID: 'srv-abc' })).toContain('srv-abc')
    expect(updateCommand('render', {})).toContain('<service-id>')
  })
})

/** Minimal WHATWG-Response shape, like tests/cli.test.ts. */
function res(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, async json() { return body } }
}

describe('latestRelease', () => {
  it('returns the tag without its v prefix', async () => {
    resetUpdateCache()
    const stub = async () => res(200, { tag_name: 'v0.4.0', html_url: 'https://x/releases/v0.4.0', published_at: '2026-01-01T00:00:00Z' })
    // @ts-expect-error — a minimal Response stand-in, like the CLI suite's (library-shape boundary).
    const r = await latestRelease(true, stub)
    expect(r).toEqual({ version: '0.4.0', url: 'https://x/releases/v0.4.0', published_at: '2026-01-01T00:00:00Z' })
  })

  it('swallows failures and skips drafts — never an error to the self-hoster', async () => {
    resetUpdateCache()
    const boom = async () => { throw new Error('offline') }
    // @ts-expect-error — see above
    expect(await latestRelease(true, boom)).toBeNull()
    resetUpdateCache()
    // @ts-expect-error — see above
    expect(await latestRelease(true, async () => res(403, {}))).toBeNull()
    resetUpdateCache()
    // @ts-expect-error — see above
    expect(await latestRelease(true, async () => res(200, { tag_name: 'v9.9.9', draft: true }))).toBeNull()
  })

  it('caches — a second unforced call makes no request', async () => {
    resetUpdateCache()
    let calls = 0
    const stub = async () => { calls++; return res(200, { tag_name: 'v1.0.0', html_url: '', published_at: null }) }
    // @ts-expect-error — see above
    await latestRelease(false, stub)
    // @ts-expect-error — see above
    await latestRelease(false, stub)
    expect(calls).toBe(1)
  })
})
