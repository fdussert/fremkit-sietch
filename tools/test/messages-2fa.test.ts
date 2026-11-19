import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const html = readFileSync(new URL('../../widgets/messages-2fa/index.html', import.meta.url), 'utf8')

describe('Messages 2FA widget', () => {
  it('confirms a successful copy without receiving or rendering the OTP', async () => {
    const elements: Record<string, { textContent: string; disabled?: boolean; addEventListener?: (type: string, handler: () => void) => void }> = {
      copy: { textContent: '', disabled: false, addEventListener: (_type, handler) => { click = handler } },
      status: { textContent: '' },
    }
    let click = () => {}
    const context = {
      document: { getElementById: (id: string) => elements[id] },
      Fremkit: {
        whenReady: (callback: () => void) => callback(),
        t: (value: { en: string }) => value.en,
        sendCommand: async () => ({ ok: true }),
        onLocale: () => {},
        onSettings: () => {},
      },
      clearTimeout: () => {},
      setTimeout: () => 1,
    }
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1]
    expect(script).toBeTruthy()
    runInNewContext(script!, context)

    click()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(elements.copy.textContent).toBe('Copied')
    expect(elements.status.textContent).toBe('Code copied. Clipboard cleanup is scheduled in one minute.')
    expect(elements).not.toHaveProperty('code')
    expect(html).not.toContain('result.code')
  })
})
