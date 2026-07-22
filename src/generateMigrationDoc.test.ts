import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// @ts-expect-error The operational .mjs entrypoint is exercised directly at runtime.
import { BEGIN_MARKER, buildMigrationEntries, docFilePath, END_MARKER, generateMigrationDoc, injectGeneratedBlock, manifestHash, renderGeneratedBlock } from '../scripts/generate-migration-doc.mjs'

const temporaryDirectories: string[] = []

const MIGRATIONS = [
  ['202607020001', 'initial_schema', '초기 스키마'],
  ['202607020002', 'add_widgets', '위젯 추가'],
  ['20260714075451', 'leader_ui_improvements', '리더 UI 개선'],
] as const

function fixtureDoc(manualBefore = '# Docs\n\nManual intro text.\n\n', manualAfter = '\n\n## Manual footer\n\nKeep me.\n') {
  return `${manualBefore}${BEGIN_MARKER}\nstale\n${END_MARKER}${manualAfter}`
}

function fixture({
  migrations = MIGRATIONS,
  manifestVersions = migrations.map(([version]) => version),
  descriptions,
  docContent = fixtureDoc(),
}: {
  migrations?: readonly (readonly [string, string, string])[]
  manifestVersions?: string[]
  descriptions?: Record<string, string>
  docContent?: string | null
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sqa-migration-doc-'))
  temporaryDirectories.push(root)
  const migrationsDirectory = join(root, 'supabase', 'migrations')
  const verifyDirectory = join(root, 'scripts', 'sql', 'verify')
  const docsDirectory = join(root, 'docs')
  mkdirSync(migrationsDirectory, { recursive: true })
  mkdirSync(verifyDirectory, { recursive: true })
  mkdirSync(docsDirectory, { recursive: true })
  mkdirSync(join(root, 'scripts'), { recursive: true })

  for (const [version, slug] of migrations) {
    writeFileSync(join(migrationsDirectory, `${version}_${slug}.sql`), '-- fixture migration\n')
  }
  writeFileSync(
    join(verifyDirectory, 'manifest.json'),
    JSON.stringify({ schemaVersion: 1, readinessFiles: [], migrationVersions: manifestVersions }),
  )
  const resolvedDescriptions = descriptions ?? Object.fromEntries(
    migrations.map(([version, slug, description]) => [`${version}_${slug}.sql`, description]),
  )
  writeFileSync(join(root, 'scripts', 'migration-doc-descriptions.json'), JSON.stringify(resolvedDescriptions))
  if (docContent !== null) writeFileSync(join(docsDirectory, 'SUPABASE_MIGRATIONS.md'), docContent)

  return { root }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('generate-migration-doc', () => {
  it('builds ordered entries with descriptions from the sidecar file', () => {
    const { root } = fixture()
    const entries = buildMigrationEntries(root)

    expect(entries).toEqual([
      { filename: '202607020001_initial_schema.sql', version: '202607020001', description: '초기 스키마' },
      { filename: '202607020002_add_widgets.sql', version: '202607020002', description: '위젯 추가' },
      { filename: '20260714075451_leader_ui_improvements.sql', version: '20260714075451', description: '리더 UI 개선' },
    ])
  })

  it('keeps the manifest hash stable across LF and CRLF checkouts', () => {
    const { root } = fixture()
    const manifestPath = join(root, 'scripts', 'sql', 'verify', 'manifest.json')
    const manifest = JSON.stringify(
      { schemaVersion: 1, readinessFiles: [], migrationVersions: MIGRATIONS.map(([version]) => version) },
      null,
      2,
    )

    writeFileSync(manifestPath, `${manifest}\n`)
    const lfHash = manifestHash(root)
    writeFileSync(manifestPath, `${manifest.replace(/\n/g, '\r\n')}\r\n`)

    expect(manifestHash(root)).toBe(lfHash)
  })

  it('fails when a migration on disk is missing from the manifest', () => {
    const { root } = fixture({ manifestVersions: ['202607020001', '20260714075451'] })
    expect(() => buildMigrationEntries(root)).toThrow('SQA_MIGRATION_DOC_MISSING_FROM_MANIFEST')
  })

  it('fails when the manifest references a migration that does not exist on disk', () => {
    const { root } = fixture({
      manifestVersions: ['202607020001', '202607020002', '20260714075451', '20260801000000'],
    })
    expect(() => buildMigrationEntries(root)).toThrow('SQA_MIGRATION_DOC_MISSING_MIGRATION')
  })

  it('fails on duplicate migration versions on disk', () => {
    const { root } = fixture({
      migrations: [...MIGRATIONS, ['202607020001', 'duplicate_version', '중복']],
      manifestVersions: [...MIGRATIONS.map(([version]) => version), '202607020001'],
    })
    expect(() => buildMigrationEntries(root)).toThrow('SQA_MIGRATION_DOC_DUPLICATE_VERSION')
  })

  it('fails on duplicate versions inside the manifest itself', () => {
    const { root } = fixture({
      manifestVersions: [...MIGRATIONS.map(([version]) => version), MIGRATIONS[0][0]],
    })
    expect(() => buildMigrationEntries(root)).toThrow('SQA_MIGRATION_DOC_DUPLICATE_VERSION')
  })

  it('fails when a migration file has no description in the sidecar', () => {
    const { root } = fixture({
      descriptions: {
        '202607020001_initial_schema.sql': '초기 스키마',
        '202607020002_add_widgets.sql': '위젯 추가',
      },
    })
    expect(() => buildMigrationEntries(root)).toThrow('SQA_MIGRATION_DOC_MISSING_DESCRIPTION')
  })

  it('fails when a description is present but blank', () => {
    const { root } = fixture({
      descriptions: {
        '202607020001_initial_schema.sql': '초기 스키마',
        '202607020002_add_widgets.sql': '   ',
        '20260714075451_leader_ui_improvements.sql': '리더 UI 개선',
      },
    })
    expect(() => buildMigrationEntries(root)).toThrow('SQA_MIGRATION_DOC_MISSING_DESCRIPTION')
  })

  it('fails when the manifest lists migrations out of chronological order', () => {
    const shuffled = [MIGRATIONS[2][0], MIGRATIONS[0][0], MIGRATIONS[1][0]]
    const { root } = fixture({ manifestVersions: shuffled })
    expect(() => buildMigrationEntries(root)).toThrow('SQA_MIGRATION_DOC_BAD_ORDER')
  })

  it('fails to inject when the doc file is missing BEGIN/END markers', () => {
    const { root } = fixture({ docContent: '# Docs\n\nNo markers here.\n' })
    expect(() => generateMigrationDoc(root)).toThrow('SQA_MIGRATION_DOC_MARKERS_MISSING')
  })

  it('fails to inject when the END marker precedes the BEGIN marker', () => {
    const brokenOrder = `# Docs\n${END_MARKER}\nstale\n${BEGIN_MARKER}\n`
    expect(() => injectGeneratedBlock(brokenOrder, 'block')).toThrow('SQA_MIGRATION_DOC_MARKERS_ORDER')
  })

  it('is deterministic across repeated generation runs', () => {
    const { root } = fixture()
    const first = renderGeneratedBlock(root)
    const second = renderGeneratedBlock(root)
    expect(first).toBe(second)

    // Regenerating repeatedly from unchanged inputs must not introduce drift.
    const run1 = generateMigrationDoc(root)
    const run2 = generateMigrationDoc(root)
    expect(run1.nextText).toBe(run2.nextText)
  })

  it('shows the latest version and the manifest hash without any hand-written count', () => {
    const { root } = fixture()
    const block = renderGeneratedBlock(root)
    const expectedHash = manifestHash(root)

    expect(block).toContain('20260714075451_leader_ui_improvements.sql')
    expect(block).toContain(`manifest.json SHA-256**: \`${expectedHash}\``)
    expect(block).toContain('Migration 개수**: 3')
  })

  it('regenerates only the marked region and preserves manual text verbatim', () => {
    const manualBefore = '# Docs\n\nHand-written intro that must survive.\n\n'
    const manualAfter = '\n\n## Manual footer\n\nHand-written footer that must survive.\n'
    const { root } = fixture({ docContent: fixtureDoc(manualBefore, manualAfter) })

    const { nextText, changed } = generateMigrationDoc(root)

    expect(changed).toBe(true)
    expect(nextText.startsWith(manualBefore)).toBe(true)
    expect(nextText.endsWith(manualAfter)).toBe(true)
    expect(nextText).toContain('202607020001_initial_schema.sql')
    expect(nextText).not.toContain('stale')
  })

  it('reports no drift once regenerated, and drift again after a manifest change', () => {
    const { root } = fixture()
    const first = generateMigrationDoc(root)
    writeFileSync(docFilePath(root), first.nextText, 'utf8')
    const rechecked = generateMigrationDoc(root)
    expect(rechecked.changed).toBe(false)

    // Simulate documentation drift: a new migration lands on disk and in the manifest,
    // but the previously generated doc on disk has not been regenerated yet.
    writeFileSync(
      join(root, 'supabase', 'migrations', '20260801000000_late_migration.sql'),
      '-- fixture migration\n',
    )
    writeFileSync(
      join(root, 'scripts', 'sql', 'verify', 'manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        readinessFiles: [],
        migrationVersions: [...MIGRATIONS.map(([version]) => version), '20260801000000'],
      }),
    )
    writeFileSync(
      join(root, 'scripts', 'migration-doc-descriptions.json'),
      JSON.stringify({
        ...Object.fromEntries(MIGRATIONS.map(([version, slug, description]) => [`${version}_${slug}.sql`, description])),
        '20260801000000_late_migration.sql': '지연 반영된 마이그레이션',
      }),
    )
    const drifted = generateMigrationDoc(root)
    expect(drifted.changed).toBe(true)
    expect(drifted.nextText).toContain('20260801000000_late_migration.sql')
  })

  it('reports no drift when the generated document is checked out with CRLF', () => {
    const { root } = fixture()
    const generated = generateMigrationDoc(root)
    writeFileSync(docFilePath(root), generated.nextText.replace(/\n/g, '\r\n'), 'utf8')

    const rechecked = generateMigrationDoc(root)

    expect(rechecked.changed).toBe(false)
    expect(rechecked.currentText).not.toContain('\r')
    expect(rechecked.nextText).toBe(rechecked.currentText)
  })
})
