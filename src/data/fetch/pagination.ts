export type PageResult<T> = { data: T[] | null; error: unknown }

/** Fetches every PostgREST page. `to` is inclusive, matching `.range(from, to)`. */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
): Promise<PageResult<T>> {
  const rows: T[] = []
  for (let page = 0; ; page += 1) {
    const from = page * pageSize
    const result = await fetchPage(from, from + pageSize - 1)
    if (result.error) return { data: null, error: result.error }
    const next = result.data ?? []
    rows.push(...next)
    if (next.length < pageSize) return { data: rows, error: null }
  }
}
