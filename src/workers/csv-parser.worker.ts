/**
 * Web Worker entry: parse Copilot usage CSV in a background thread.
 *
 * This keeps large CSV uploads from blocking the main thread (e.g. tens of
 * thousands of rows). Production code should call `parseCsvAsync` from
 * `csv-parser-client.ts`, which falls back to synchronous parsing when
 * Workers are not available (e.g. test environments).
 */

import { parseUsageCsv, type CsvParseResult } from '@/lib/chargeback'

export interface CsvWorkerRequest {
  id: number
  text: string
}

export interface CsvWorkerResponse {
  id: number
  result?: CsvParseResult
  error?: string
}

self.addEventListener('message', (event: MessageEvent<CsvWorkerRequest>) => {
  const { id, text } = event.data
  try {
    const result = parseUsageCsv(text)
    const response: CsvWorkerResponse = { id, result }
    ;(self as unknown as Worker).postMessage(response)
  } catch (err) {
    const response: CsvWorkerResponse = {
      id,
      error: err instanceof Error ? err.message : String(err),
    }
    ;(self as unknown as Worker).postMessage(response)
  }
})

// Empty export so this file is treated as a module.
export {}
