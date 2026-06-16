/**
 * Async client for parsing Copilot usage CSV via a Web Worker.
 *
 * Falls back to synchronous parsing when `Worker` is unavailable (test
 * environments, very old browsers) so callers always get the same shape and
 * tests don't depend on the worker runtime.
 */

import { parseUsageCsv, type CsvParseResult } from '@/lib/chargeback'
import type { CsvWorkerRequest, CsvWorkerResponse } from '@/workers/csv-parser.worker'

let worker: Worker | null = null
let workerInitTried = false
let nextRequestId = 1
const pending = new Map<number, { resolve: (r: CsvParseResult) => void; reject: (e: Error) => void }>()

async function getWorker(): Promise<Worker | null> {
  if (worker) return worker
  if (workerInitTried) return null
  workerInitTried = true
  if (typeof Worker === 'undefined') return null
  try {
    // Vite's `?worker` import returns a class that constructs a Worker.
    // Dynamic-imported so test environments without worker support skip it gracefully.
    const mod = await import('@/workers/csv-parser.worker?worker')
    const WorkerCtor = (mod as { default: new () => Worker }).default
    const w = new WorkerCtor()
    w.addEventListener('message', (event: MessageEvent<CsvWorkerResponse>) => {
      const { id, result, error } = event.data
      const handler = pending.get(id)
      if (!handler) return
      pending.delete(id)
      if (error || !result) {
        handler.reject(new Error(error ?? 'CSV worker returned no result'))
      } else {
        handler.resolve(result)
      }
    })
    w.addEventListener('error', (event) => {
      // Reject all pending requests; the worker is in a bad state.
      for (const [, handler] of pending) {
        handler.reject(new Error(event.message || 'CSV worker error'))
      }
      pending.clear()
      w.terminate()
      worker = null
    })
    worker = w
    return worker
  } catch {
    worker = null
    return null
  }
}

/**
 * Parse Copilot usage CSV asynchronously. Uses a worker when available,
 * otherwise falls back to synchronous parsing on the main thread.
 */
export async function parseCsvAsync(text: string): Promise<CsvParseResult> {
  const w = await getWorker()
  if (!w) {
    // Fallback: parse synchronously. Wrapped in Promise so callers can
    // always `await` regardless of environment.
    return parseUsageCsv(text)
  }
  return new Promise<CsvParseResult>((resolve, reject) => {
    const id = nextRequestId++
    pending.set(id, { resolve, reject })
    const request: CsvWorkerRequest = { id, text }
    w.postMessage(request)
  })
}

