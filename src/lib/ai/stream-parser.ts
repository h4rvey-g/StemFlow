import type { AiStreamChunk } from '@/lib/ai/types'

type StreamReader = ReadableStreamDefaultReader<Uint8Array>

const shouldIgnoreLine = (line: string): boolean => {
  const trimmed = line.trim()
  if (!trimmed) return true

  return line.trimStart().startsWith(':')
}

const readFieldValue = (line: string, field: 'data' | 'event'): string | null => {
  const normalized = line.trimStart()
  if (!normalized.startsWith(`${field}:`)) return null

  return normalized.slice(field.length + 1).trimStart()
}

const normalizeLine = (line: string): string => line.replace(/\r$/, '')

async function* readLines(reader: StreamReader): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()

    if (value) {
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const cleaned = normalizeLine(line)
        if (shouldIgnoreLine(cleaned)) continue
        yield cleaned
      }
    }

    if (done) break
  }

  buffer += decoder.decode()
  const remainingLines = buffer.split('\n')

  for (const line of remainingLines) {
    const cleaned = normalizeLine(line)
    if (shouldIgnoreLine(cleaned)) continue
    yield cleaned
  }
}

export async function* parseOpenAIStream(
  reader: StreamReader
): AsyncIterable<AiStreamChunk> {
  for await (const line of readLines(reader)) {
    const data = readFieldValue(line, 'data')
    if (data === null) continue
    if (!data) continue

    if (data === '[DONE]') break

    try {
      const parsed = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string } }>
      }
      const text = parsed.choices?.[0]?.delta?.content
      if (typeof text === 'string' && text.length > 0) {
        yield { text, done: false }
      }
    } catch {
      continue
    }
  }

  yield { text: '', done: true }
}

export async function* parseAnthropicStream(
  reader: StreamReader
): AsyncIterable<AiStreamChunk> {
  let currentEvent: string | null = null

  for await (const line of readLines(reader)) {
    const event = readFieldValue(line, 'event')
    if (event !== null) {
      currentEvent = event
      if (currentEvent === 'message_stop') break
      continue
    }

    const data = readFieldValue(line, 'data')
    if (data === null || !data) continue

    try {
      const parsed = JSON.parse(data) as { delta?: { text?: string } }
      if (currentEvent === 'content_block_delta') {
        const text = parsed.delta?.text
        if (typeof text === 'string' && text.length > 0) {
          yield { text, done: false }
        }
      }

      if (currentEvent === 'message_stop') break
    } catch {
      continue
    }
  }

  yield { text: '', done: true }
}

export async function* parseGeminiStream(
  reader: StreamReader
): AsyncIterable<AiStreamChunk> {
  for await (const line of readLines(reader)) {
    const data = readFieldValue(line, 'data')
    if (data === null || !data) continue

    try {
      const parsed = JSON.parse(data) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> }
        }>
      }

      const parts = parsed.candidates?.[0]?.content?.parts ?? []
      const text = parts
        .map((part) => (typeof part.text === 'string' ? part.text : ''))
        .join('')

      if (text.length > 0) {
        yield { text, done: false }
      }
    } catch {
      continue
    }
  }

  yield { text: '', done: true }
}
