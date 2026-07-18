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

function hasStorageHttpStatus(error, expectedStatus) {
  return [error?.status, error?.httpStatusCode, error?.statusCode]
    .some((candidate) => Number(candidate) === expectedStatus)
}

export function isMissingBucketError(error) {
  if (!error) return false
  const codes = [error.statusCode, error.code, error.error]
    .filter((value) => typeof value === 'string')
    .map((value) => value.toLowerCase())
  if (codes.includes('nosuchbucket') || codes.includes('bucketnotfound')) return true

  const message = String(error.message ?? '').toLowerCase()
  return hasStorageHttpStatus(error, 404)
    && message.includes('bucket')
    && (message.includes('not found') || message.includes('does not exist') || message.includes('missing'))
}

export async function getBucketPresence(storageClient, bucket) {
  const { data, error } = await storageClient.getBucket(bucket)
  if (error) {
    if (isMissingBucketError(error)) return { exists: false }
    throw error
  }
  if (data == null) {
    throw new Error('Storage getBucket returned neither bucket data nor an error.')
  }
  return { exists: true }
}

export async function deleteEmptyBucket(storageClient, bucket) {
  const { error } = await storageClient.deleteBucket(bucket)
  if (error && !isMissingBucketError(error)) {
    return {
      bucketDeleted: false,
      bucketAlreadyAbsent: false,
      bucketExistsAfter: null,
      errorCode: error.statusCode ?? error.status ?? 'storage_bucket_delete_failed',
    }
  }

  const finalPresence = await getBucketPresence(storageClient, bucket)
  return {
    bucketDeleted: error == null,
    bucketAlreadyAbsent: error != null,
    bucketExistsAfter: finalPresence.exists,
    errorCode: finalPresence.exists ? 'storage_bucket_still_exists' : null,
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
  const bucketPresence = await getBucketPresence(client.storage, bucket)
  const objects = bucketPresence.exists ? await listAllObjects(bucketClient) : []
  const inventory = summarizeObjects(objects)
  const report = {
    generatedAt: new Date().toISOString(),
    mode: options.execute ? 'execute' : 'dry-run',
    bucket,
    target,
    bucketExists: bucketPresence.exists,
    inventory,
  }

  console.log(JSON.stringify({ bucket, bucketExists: bucketPresence.exists, ...inventory }))
  if (options.verbose) console.error(JSON.stringify({ objectNames: objects.map((object) => object.name) }))

  if (!options.execute) {
    if (options.outputPath) {
      console.log(JSON.stringify({ reportPath: await saveReport(options.outputPath, report) }))
    }
    return 0
  }

  if (!bucketPresence.exists) {
    const terminalPresence = await getBucketPresence(client.storage, bucket)
    report.execution = {
      attemptedObjectCount: 0,
      failedObjectCount: 0,
      failedBatchCount: 0,
      verifiedRemainingObjectCount: 0,
      verifiedRemainingTotalBytes: 0,
      verifiedRemainingNameDigestSha256: inventory.nameDigestSha256,
      bucketDeleteAttempted: false,
      bucketDeleted: false,
      bucketAlreadyAbsent: true,
      bucketExistsAfter: terminalPresence.exists,
      verifiedBucketAbsent: !terminalPresence.exists,
      failures: [],
    }
    console.log(JSON.stringify(report.execution))
    if (options.outputPath) {
      console.log(JSON.stringify({ reportPath: await saveReport(options.outputPath, report) }))
    }
    if (terminalPresence.exists) {
      console.error(JSON.stringify({
        error: 'Bucket was recreated during absence verification.',
        bucketExistsAfter: true,
      }))
      return 1
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
    bucketDeleteAttempted: false,
    bucketDeleted: false,
    bucketAlreadyAbsent: false,
    bucketExistsAfter: true,
    verifiedBucketAbsent: false,
    failures,
  }
  report.execution = execution
  if (failures.length > 0 || remainingObjects.length > 0) {
    console.log(JSON.stringify(execution))
    if (options.outputPath) {
      console.log(JSON.stringify({ reportPath: await saveReport(options.outputPath, report) }))
    }
    console.error(JSON.stringify({
      error: 'Purge verification failed.',
      failedObjectCount: execution.failedObjectCount,
      verifiedRemainingObjectCount: execution.verifiedRemainingObjectCount,
    }))
    return 1
  }

  const bucketDeletion = await deleteEmptyBucket(client.storage, bucket)
  Object.assign(execution, {
    bucketDeleteAttempted: true,
    bucketDeleted: bucketDeletion.bucketDeleted,
    bucketAlreadyAbsent: bucketDeletion.bucketAlreadyAbsent,
    bucketExistsAfter: bucketDeletion.bucketExistsAfter,
    verifiedBucketAbsent: bucketDeletion.bucketExistsAfter === false,
    bucketDeleteErrorCode: bucketDeletion.errorCode,
  })
  console.log(JSON.stringify(execution))
  if (options.outputPath) {
    console.log(JSON.stringify({ reportPath: await saveReport(options.outputPath, report) }))
  }
  if (bucketDeletion.errorCode != null || bucketDeletion.bucketExistsAfter) {
    console.error(JSON.stringify({
      error: 'Bucket deletion verification failed.',
      bucketDeleteErrorCode: bucketDeletion.errorCode,
      bucketExistsAfter: bucketDeletion.bucketExistsAfter,
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
