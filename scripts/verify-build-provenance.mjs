import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  resolveProjectPath,
  sha256File,
  validateBuildProvenance,
} from './render-build-provenance.mjs'

const SHA_PATTERN = /^[0-9a-f]{40}$/

export async function verifyBuildProvenance({
  projectRoot,
  inputPath,
  expectedSha,
  expectedRef,
}) {
  if (!SHA_PATTERN.test(expectedSha ?? '')) {
    throw new Error('Expected build provenance SHA must be a lowercase 40-character Git SHA')
  }
  if (expectedRef !== 'refs/heads/main') {
    throw new Error('Expected build provenance ref must be refs/heads/main')
  }
  const resolvedInput = resolveProjectPath(projectRoot, inputPath)
  const provenance = validateBuildProvenance(JSON.parse(await readFile(resolvedInput, 'utf8')))
  if (provenance.sha !== expectedSha) {
    throw new Error(`Build provenance SHA mismatch: expected ${expectedSha}, received ${provenance.sha}`)
  }
  if (provenance.ref !== expectedRef) {
    throw new Error(`Build provenance ref mismatch: expected ${expectedRef}, received ${provenance.ref}`)
  }

  const lockfileSha256 = await sha256File(resolveProjectPath(projectRoot, 'package-lock.json'))
  if (provenance.lockfileSha256 !== lockfileSha256) {
    throw new Error('Build provenance lockfile hash mismatch')
  }
  const readinessManifestSha256 = await sha256File(
    resolveProjectPath(projectRoot, 'scripts/sql/verify/manifest.json'),
  )
  if (provenance.readinessManifestSha256 !== readinessManifestSha256) {
    throw new Error('Build provenance readiness manifest hash mismatch')
  }
  return provenance
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const inputPath = process.argv[2]
    if (!inputPath) throw new Error('Usage: node scripts/verify-build-provenance.mjs <relative-json-path>')
    const provenance = await verifyBuildProvenance({
      projectRoot: process.cwd(),
      inputPath,
      expectedSha: process.env.BUILD_PROVENANCE_EXPECTED_SHA,
      expectedRef: process.env.BUILD_PROVENANCE_EXPECTED_REF,
    })
    console.log(`Build provenance verified: ${provenance.sha} (${path.basename(inputPath)})`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
