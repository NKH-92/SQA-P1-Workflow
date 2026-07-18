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
export function removeInBatches(bucketClient: unknown, objects: StorageObjectInventoryItem[]): Promise<Array<{
  batchNumber: number
  failedObjectCount: number
  errorCode: string | number
}>>
export function run(argv?: string[], env?: NodeJS.ProcessEnv): Promise<number>
