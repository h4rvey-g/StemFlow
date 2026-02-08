import type {
  FileProcessingRequest,
  FileProcessingResult,
  FileProcessingWorkerMessage,
} from '@/lib/file-processing-types'

type PendingEntry = {
  resolve: (value: FileProcessingResult) => void
  reject: (reason?: unknown) => void
}

let workerInstance: Worker | null = null
const pending = new Map<string, PendingEntry>()

const ensureWorker = (): Worker => {
  if (typeof window === 'undefined') {
    throw new Error('File processing is only available in the browser')
  }

  if (workerInstance) return workerInstance

  workerInstance = new Worker(new URL('../workers/file-processor.worker.ts', import.meta.url), {
    type: 'module',
  })

  workerInstance.onmessage = (event: MessageEvent<FileProcessingWorkerMessage>) => {
    const { type, payload } = event.data
    const entry = pending.get(payload.requestId)

    if (!entry) return
    pending.delete(payload.requestId)

    if (type === 'success') {
      entry.resolve(payload)
      return
    }

    entry.reject(new Error(payload.error))
  }

  workerInstance.onerror = (event: ErrorEvent) => {
    const message = event.message || 'File processing worker failed'
    pending.forEach((entry) => {
      entry.reject(new Error(message))
    })
    pending.clear()
  }

  return workerInstance
}

const createRequestId = (): string =>
  `process-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

export const processFileInWorker = async (file: File): Promise<FileProcessingResult> => {
  const worker = ensureWorker()
  const requestId = createRequestId()

  const message: FileProcessingRequest = {
    requestId,
    file,
  }

  return new Promise<FileProcessingResult>((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    worker.postMessage(message)
  })
}
