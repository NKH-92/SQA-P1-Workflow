import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

export const CONFIRMATION = 'PURGE_REVIEW_ATTACHMENTS'
const DEFAULT_BUCKET = 'review-attachments'
const PAGE_SIZE = 100
const DELETE_BATCH_SIZE = 100

export function parseOptions(argv) {
  const options = { execute: false, verbose: false, outputPath: null }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--execute') options.execute = true
    else if (argument === '--verbose') options.verbose = true
    else if (argument === `--confirm=${CONFIRMATION}`) options.confirmed = true
    else if (argument.startsWith('--output=')) options.outputPath = argument.slice('--output='.length)
    else if (argument === '--output') {
      index += 1
      if (index >= argv.length) throw new Error('--output requires a file path.')
      options.outputPath = argv[index]
    }
    else throw new Error(`Unknown argument: ${argument}`)
  }

  if (options.execute && !options.confirmed) {
    throw new Error(`Execution requires --confirm=${CONFIRMATION}.`)
  }
  if (options.outputPath != null && options.outputPath.trim() === '') {
    throw new Error('--output requires a file path.')
  }
  return options
}

export function describeTarget(rawUrl) {
  const url = new URL(rawUrl)
  const supabaseSuffix = '.supabase.co'
  const projectRef = url.hostname.endsWith(supabaseSuffix)
    ? url.hostname.slice(0, -supabaseSuffix.length)
    : url.hostname === '127.0.0.1' || url.hostname === 'localhost'
      ? 'local'
      : 'custom-host'
  return { url: url.origin, projectRef }
}

function objectSize(entry) {
  const size = Number(entry.metadata?.size ?? 0)
  return Number.isFinite(size) && size >= 0 ? size : 0
}

export async function listAllObjects(bucketClient) {
  const objects = []
  const pendingPrefixes = ['']
  const visitedPrefixes = new Set()

  while (pendingPrefixes.length > 0) {
    const prefix = pendingPrefixes.shift()
    if (visitedPrefixes.has(prefix)) continue
    visitedPrefixes.add(prefix)

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await bucketClient.list(prefix, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) throw error

      for (const entry of data ?? []) {
        const name = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.id == null) pendingPrefixes.push(name)
        else objects.push({ name, size: objectSize(entry) })
      }
      if ((data ?? []).length < PAGE_SIZE) break
    }
  }

  const unique = new Map()
  for (const object of objects) unique.set(object.name, object)
  return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name))
}

export function summarizeObjects(objects) {
  const names = objects.map((object) => object.name)
  return {
    objectCount: objects.length,
    totalBytes: objects.reduce((total, object) => total + object.size, 0),
    nameDigestSha256: createHash('sha256').update(names.join('\n')).digest('hex'),
  }
}

export async function removeInBatches(bucketClient, objects) {
  const failures = []
  for (let index = 0; index < objects.length; index += DELETE_BATCH_SIZE) {
    const batch = objects.slice(index, index + DELETE_BATCH_SIZE)
    const { error } = await bucketClient.remove(batch.map((object) => object.name))
    if (error) {
      failures.push({
        batchNumber: Math.floor(index / DELETE_BATCH_SIZE) + 1,
        failedObjectCount: batch.length,
        errorCode: error.statusCode ?? error.status ?? 'storage_remove_failed',
      })
    }
  }
  return failures
}

async function saveReport(outputPath, report) {
  const absolutePath = resolve(outputPath)
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return absolutePath
}

export async function run(argv = process.argv.slice(2), env = process.env) {
  const options = parseOptions(argv)
  const url = env.SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  const bucket = env.REVIEW_ATTACHMENT_BUCKET || DEFAULT_BUCKET
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  }

  const target = describeTarget(url)
  console.log(JSON.stringify({ mode: options.execute ? 'execute' : 'dry-run', bucket, target }))

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const bucketClient = client.storage.from(bucket)
  const objects = await listAllObjects(bucketClient)
  const inventory = summarizeObjects(objects)
  const report = {
    generatedAt: new Date().toISOString(),
    mode: options.execute ? 'execute' : 'dry-run',
    bucket,
    target,
    inventory,
  }

  console.log(JSON.stringify({ bucket, ...inventory }))
  if (options.verbose) console.error(JSON.stringify({ objectNames: objects.map((object) => object.name) }))

  if (!options.execute) {
    if (options.outputPath) {
      console.log(JSON.stringify({ reportPath: await saveReport(options.outputPath, report) }))
    }
    return 0
  }

  const failures = await removeInBatches(bucketClient, objects)
  const remainingObjects = await listAllObjects(bucketClient)
  const remainingInventory = summarizeObjects(remainingObjects)
  const execution = {
    attemptedObjectCount: objects.length,
    failedObjectCount: failures.reduce((total, failure) => total + failure.failedObjectCount, 0),
    failedBatchCount: failures.length,
    verifiedRemainingObjectCount: remainingInventory.objectCount,
    verifiedRemainingTotalBytes: remainingInventory.totalBytes,
    verifiedRemainingNameDigestSha256: remainingInventory.nameDigestSha256,
    failures,
  }
  report.execution = execution
  console.log(JSON.stringify(execution))

  if (options.outputPath) {
    console.log(JSON.stringify({ reportPath: await saveReport(options.outputPath, report) }))
  }
  if (failures.length > 0 || remainingObjects.length > 0) {
    console.error(JSON.stringify({
      error: 'Purge verification failed.',
      failedObjectCount: execution.failedObjectCount,
      verifiedRemainingObjectCount: execution.verifiedRemainingObjectCount,
    }))
    return 1
  }
  return 0
}

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isDirectExecution) {
  run().then((exitCode) => {
    process.exitCode = exitCode
  }).catch((error) => {
    console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    process.exitCode = 1
  })
}
