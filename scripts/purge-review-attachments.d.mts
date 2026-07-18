export const CONFIRMATION: string

export interface PurgeOptions {
  execute: boolean
  confirmed?: boolean
  verbose: boolean
  outputPath: string | null
}

export interface StorageObjectInventoryItem {
  name: string
  size: number
}

export function parseOptions(argv: string[]): PurgeOptions
export function describeTarget(rawUrl: string): { url: string; projectRef: string }
export function listAllObjects(bucketClient: unknown): Promise<StorageObjectInventoryItem[]>
export function summarizeObjects(objects: StorageObjectInventoryItem[]): {
  objectCount: number
  totalBytes: number
  nameDigestSha256: string
}
export function isMissingBucketError(error: unknown): boolean
export function getBucketPresence(
  storageClient: { getBucket(bucket: string): Promise<{ data: unknown; error: unknown }> },
  bucket: string,
): Promise<{ exists: boolean }>
export function deleteEmptyBucket(
  storageClient: {
    deleteBucket(bucket: string): Promise<{ error: unknown }>
    getBucket(bucket: string): Promise<{ data: unknown; error: unknown }>
  },
  bucket: string,
): Promise<{
  bucketDeleted: boolean
  bucketAlreadyAbsent: boolean
  bucketExistsAfter: boolean | null
  errorCode: string | number | null
}>
export function removeInBatches(bucketClient: unknown, objects: StorageObjectInventoryItem[]): Promise<Array<{
  batchNumber: number
  failedObjectCount: number
  errorCode: string | number
}>>
export function run(argv?: string[], env?: NodeJS.ProcessEnv): Promise<number>
