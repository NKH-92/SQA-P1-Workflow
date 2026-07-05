import { describe, expect, it } from 'vitest'

const scripts = import.meta.glob('../scripts/*.ps1', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function readScript(name: string) {
  return scripts[`../scripts/${name}`] ?? ''
}

describe('migration scripts', () => {
  it('apply-migrations.ps1 lists 202607050004 and 202607050005', () => {
    const script = readScript('apply-migrations.ps1')

    expect(script).toContain('202607050004')
    expect(script).toContain('202607050005')
    expect(script).toContain('20260705*.sql')
  })

  it('apply-pending-migrations.ps1 uses db query not db execute', () => {
    const script = readScript('apply-pending-migrations.ps1')

    expect(script).toContain('db query')
    expect(script).not.toContain('db execute')
  })
})
