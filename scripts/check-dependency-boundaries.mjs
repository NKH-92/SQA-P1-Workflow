import { readdirSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const layerRules = {
  domain: new Set(['data', 'features', 'screens']),
  data: new Set(['features', 'screens']),
  features: new Set(['screens']),
  lib: new Set(['data', 'features', 'screens']),
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : []
  })
}

function importsFrom(source) {
  return [...source.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/g)].map((match) => match[1])
}

function pathParts(root, path) {
  return relative(root, path).split(/[\\/]/).filter(Boolean)
}

function targetParts(root, sourcePath, specifier) {
  if (!specifier.startsWith('.')) return []
  return pathParts(root, resolve(dirname(sourcePath), specifier))
}

export function findBoundaryViolations(sourceRoot) {
  const root = resolve(sourceRoot)
  const violations = []

  for (const path of sourceFiles(root)) {
    const sourceParts = pathParts(root, path)
    const sourceLayer = sourceParts[0]
    const source = readFileSync(path, 'utf8')

    for (const specifier of importsFrom(source)) {
      const resolvedTargetParts = targetParts(root, path, specifier)
      const targetLayer = resolvedTargetParts[0]
      const forbiddenTargets = layerRules[sourceLayer]

      if (forbiddenTargets?.has(targetLayer)) {
        violations.push(`${sourceParts.join('/')} -> ${specifier} (${sourceLayer} cannot import ${targetLayer})`)
      }

      const isPresentation = sourceLayer === 'screens'
        || sourceLayer === 'components'
        || (sourceLayer === 'features' && sourceParts.includes('components'))
      if (
        isPresentation
        && targetLayer === 'data'
        && ['mutations', 'local', 'remote'].includes(resolvedTargetParts[1])
      ) {
        violations.push(`${sourceParts.join('/')} -> ${specifier} (presentation cannot import data adapters or mutations)`)
      }

      if (
        sourceLayer === 'data'
        && sourceParts[1] === 'repositories'
        && (specifier === 'react' || specifier.startsWith('react/'))
      ) {
        violations.push(`${sourceParts.join('/')} -> ${specifier} (repository contracts must be React-independent)`)
      }
    }
  }

  return [...new Set(violations)].sort()
}

function argumentValue(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const configuredRoot = argumentValue('--root') ?? resolve(repositoryRoot, 'src')
  const sourceRoot = isAbsolute(configuredRoot) ? configuredRoot : resolve(repositoryRoot, configuredRoot)
  const violations = findBoundaryViolations(sourceRoot)
  if (violations.length > 0) {
    console.error(`Dependency boundary violations (${violations.length}):`)
    for (const violation of violations) console.error(`- ${violation}`)
    process.exitCode = 1
  } else {
    console.log(`Dependency boundaries OK: ${relative(repositoryRoot, sourceRoot).split(sep).join('/')}`)
  }
}
