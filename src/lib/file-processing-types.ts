export type ProcessedFileKind = 'image' | 'pdf' | 'text' | 'other'

export interface FileProcessingRequest {
  requestId: string
  file: File
}

export interface FileProcessingResult {
  requestId: string
  kind: ProcessedFileKind
  imageBase64?: string
  textExcerpt?: string
}

export interface FileProcessingError {
  requestId: string
  error: string
}

export type FileProcessingWorkerMessage =
  | { type: 'success'; payload: FileProcessingResult }
  | { type: 'error'; payload: FileProcessingError }
