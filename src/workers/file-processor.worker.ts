/// <reference lib="webworker" />

import type {
  FileProcessingError,
  FileProcessingRequest,
  FileProcessingResult,
} from '@/lib/file-processing-types'

const MAX_TOKENS = 1000

const tokenize = (text: string, limit: number): string => {
  const tokens = text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)

  if (tokens.length <= limit) {
    return tokens.join(' ')
  }

  return tokens.slice(0, limit).join(' ')
}

const toBase64DataUrl = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''

  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }

  const mimeType = file.type || 'application/octet-stream'
  return `data:${mimeType};base64,${btoa(binary)}`
}

type PdfTextItem = {
  str?: string
}

const extractPdfText = async (file: File): Promise<string> => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf')
  const data = await file.arrayBuffer()
  const document = await pdfjs.getDocument({ data }).promise

  let fullText = ''
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item: PdfTextItem) => item.str ?? '')
      .join(' ')

    fullText += `${pageText} `
  }

  return tokenize(fullText, MAX_TOKENS)
}

const extractText = async (file: File): Promise<string> => {
  const text = await file.text()
  return tokenize(text, MAX_TOKENS)
}

const detectKind = (file: File): FileProcessingResult['kind'] => {
  const mimeType = file.type.toLowerCase()
  const lowerName = file.name.toLowerCase()

  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf' || lowerName.endsWith('.pdf')) return 'pdf'
  if (mimeType.startsWith('text/')) return 'text'
  if (lowerName.endsWith('.md') || lowerName.endsWith('.json') || lowerName.endsWith('.csv')) return 'text'

  return 'other'
}

const postSuccess = (payload: FileProcessingResult) => {
  self.postMessage({ type: 'success', payload })
}

const postFailure = (payload: FileProcessingError) => {
  self.postMessage({ type: 'error', payload })
}

self.onmessage = async (event: MessageEvent<FileProcessingRequest>) => {
  const { requestId, file } = event.data

  try {
    const kind = detectKind(file)

    if (kind === 'image') {
      const imageBase64 = await toBase64DataUrl(file)
      postSuccess({ requestId, kind, imageBase64 })
      return
    }

    if (kind === 'pdf') {
      const textExcerpt = await extractPdfText(file)
      postSuccess({ requestId, kind, textExcerpt })
      return
    }

    if (kind === 'text') {
      const textExcerpt = await extractText(file)
      postSuccess({ requestId, kind, textExcerpt })
      return
    }

    postSuccess({ requestId, kind })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process file'
    postFailure({ requestId, error: message })
  }
}

export {}
