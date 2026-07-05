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
  it('apply-migrations.ps1 lists 20260705 pending migrations', () => {
    const script = readScript('apply-migrations.ps1')

    expect(script).toContain('20260705*.sql')
    expect(script).toContain('Sort-Object Name')
  })

  it('apply-pending-migrations.ps1 uses db query not db execute', () => {
    const script = readScript('apply-pending-migrations.ps1')

    expect(script).toContain('db query')
    expect(script).not.toContain('db execute')
  })
})
