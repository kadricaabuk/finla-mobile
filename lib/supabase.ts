import { createClient, FunctionsHttpError } from '@supabase/supabase-js'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const supabase = createClient(url, key)

export async function callEdgeFunction<T>(
  name: string,
  body: object,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body })

  if (error) {
    // Try to read the actual error body the function sent back
    let message = error.message
    try {
      if (error instanceof FunctionsHttpError) {
        const json = await error.context.json()
        message = json?.error ?? json?.message ?? message
      }
    } catch {
      // context not readable — use original message
    }
    throw new Error(message)
  }

  return data as T
}
