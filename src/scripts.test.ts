import { describe, expect, it } from 'vitest'

const scripts = import.meta.glob('../scripts/*.{ps1,mjs}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function readScript(name: string) {
  return scripts[`../scripts/${name}`] ?? ''
}

describe('migration scripts', () => {
  it('apply-migrations.ps1 lists 202607 pending migrations', () => {
    const script = readScript('apply-migrations.ps1')

    expect(script).toContain('202607*.sql')
    expect(script).toContain('Pending migrations (202607*)')
    expect(script).toContain('Sort-Object Name')
  })

  it('apply-pending-migrations.ps1 uses db query not db execute', () => {
    const script = readScript('apply-pending-migrations.ps1')

    expect(script).toContain('db query')
    expect(script).not.toContain('db execute')
  })

  it('backup-db.ps1 dumps schema and data separately', () => {
    const script = readScript('backup-db.ps1')

    expect(script).toContain('-schema.sql')
    expect(script).toContain('-data.sql')
    expect(script).toContain('--data-only')
  })

  it('generate-p1-product-seed.mjs reads CSV/JSON inputs instead of src/data', () => {
    const script = readScript('generate-p1-product-seed.mjs')
    expect(script).toContain('readCsvRows')
    expect(script).toContain('readProfileMap')
    expect(script).not.toContain('src/data/p1ProductAllocation.ts')
    expect(script).not.toContain('Function(')
  })

  it('generate-p1-duty-seed.mjs reads CSV/JSON inputs instead of src/data', () => {
    const script = readScript('generate-p1-duty-seed.mjs')
    expect(script).toContain('readCsvRows')
    expect(script).toContain('readProfileMap')
    expect(script).not.toContain('src/data/p1DutyAllocation.ts')
    expect(script).not.toContain('Function(')
  })
})
