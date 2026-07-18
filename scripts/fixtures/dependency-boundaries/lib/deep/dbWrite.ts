export async function invalidLibWrite(supabase: { from: (table: string) => { insert: (row: unknown) => unknown } }) {
  return supabase.from('activity_logs').insert({ invalid: true })
}
