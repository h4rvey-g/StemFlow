import { describe, expect, it } from 'vitest'

import type { AiStreamChunk } from '@/lib/ai/types'

import {
  parseAnthropicStream,
  parseGeminiStream,
  parseOpenAIStream,
} from '@/lib/ai/stream-parser'

const createReader = (chunks: string[]): ReadableStreamDefaultReader<Uint8Array> => {
  const encoder = new TextEncoder()
  let index = 0

  return {
    read: async () => {
      if (index >= chunks.length) {
        return { value: undefined, done: true }
      }

      const value = encoder.encode(chunks[index])
      index += 1
      return { value, done: false }
    },
  } as ReadableStreamDefaultReader<Uint8Array>
}

const collectChunks = async (
  iterable: AsyncIterable<AiStreamChunk>
): Promise<AiStreamChunk[]> => {
  const chunks: AiStreamChunk[] = []
  for await (const chunk of iterable) {
    chunks.push(chunk)
  }
  return chunks
}

describe('parseOpenAIStream', () => {
  it('emits delta content and done on [DONE]', async () => {
    const reader = createReader([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
      'data: [DONE]\n',
    ])

    const chunks = await collectChunks(parseOpenAIStream(reader))

    expect(chunks).toEqual([
      { text: 'Hello', done: false },
      { text: '', done: true },
    ])
  })

  it('buffers partial lines across chunks', async () => {
    const reader = createReader([
      'data: {"choices":[{"delta":{"content":"Hel',
      'lo"}}]}\n',
    ])

    const chunks = await collectChunks(parseOpenAIStream(reader))

    expect(chunks).toEqual([
      { text: 'Hello', done: false },
      { text: '', done: true },
    ])
  })

  it('handles multiple data lines in a single chunk', async () => {
    const reader = createReader([
      'data: {"choices":[{"delta":{"content":"A"}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":"B"}}]}\n',
    ])

    const chunks = await collectChunks(parseOpenAIStream(reader))

    expect(chunks).toEqual([
      { text: 'A', done: false },
      { text: 'B', done: false },
      { text: '', done: true },
    ])
  })

  it('ignores comments, empty lines, and invalid JSON', async () => {
    const reader = createReader([
      ': keep-alive\n\n',
      'data: {broken json}\n',
      'data: {"choices":[{"delta":{"content":"OK"}}]}\n',
    ])

    const chunks = await collectChunks(parseOpenAIStream(reader))

    expect(chunks).toEqual([
      { text: 'OK', done: false },
      { text: '', done: true },
    ])
  })

  it('ignores data lines without content delta', async () => {
    const reader = createReader(['data: {"choices":[{"delta":{}}]}\n'])

    const chunks = await collectChunks(parseOpenAIStream(reader))

    expect(chunks).toEqual([{ text: '', done: true }])
  })
})

describe('parseAnthropicStream', () => {
  it('emits text for content_block_delta events', async () => {
    const reader = createReader([
      'event: content_block_delta\n',
      'data: {"delta":{"text":"Hello"}}\n',
      'event: content_block_delta\n',
      'data: {"delta":{"text":" world"}}\n',
    ])

    const chunks = await collectChunks(parseAnthropicStream(reader))

    expect(chunks).toEqual([
      { text: 'Hello', done: false },
      { text: ' world', done: false },
      { text: '', done: true },
    ])
  })

  it('buffers partial event lines across chunks', async () => {
    const reader = createReader([
      'event: content_block_',
      'delta\n',
      'data: {"delta":{"text":"Partial"}}\n',
    ])

    const chunks = await collectChunks(parseAnthropicStream(reader))

    expect(chunks).toEqual([
      { text: 'Partial', done: false },
      { text: '', done: true },
    ])
  })

  it('ignores data lines for non-content events', async () => {
    const reader = createReader([
      'event: message_start\n',
      'data: {"delta":{"text":"Ignore"}}\n',
    ])

    const chunks = await collectChunks(parseAnthropicStream(reader))

    expect(chunks).toEqual([{ text: '', done: true }])
  })

  it('stops on message_stop event', async () => {
    const reader = createReader([
      'event: content_block_delta\n',
      'data: {"delta":{"text":"First"}}\n',
      'event: message_stop\n',
      'data: {"delta":{"text":"Ignored"}}\n',
    ])

    const chunks = await collectChunks(parseAnthropicStream(reader))

    expect(chunks).toEqual([
      { text: 'First', done: false },
      { text: '', done: true },
    ])
  })

  it('handles multiple events in a single chunk', async () => {
    const reader = createReader([
      'event: content_block_delta\n' +
        'data: {"delta":{"text":"A"}}\n' +
        'event: content_block_delta\n' +
        'data: {"delta":{"text":"B"}}\n',
    ])

    const chunks = await collectChunks(parseAnthropicStream(reader))

    expect(chunks).toEqual([
      { text: 'A', done: false },
      { text: 'B', done: false },
      { text: '', done: true },
    ])
  })
})

describe('parseGeminiStream', () => {
  it('joins parts text and emits chunks', async () => {
    const reader = createReader([
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello "},{"text":"World"}]}}]}\n',
    ])

    const chunks = await collectChunks(parseGeminiStream(reader))

    expect(chunks).toEqual([
      { text: 'Hello World', done: false },
      { text: '', done: true },
    ])
  })

  it('buffers partial JSON across chunks', async () => {
    const reader = createReader([
      'data: {"candidates":[{"content":{"parts":[{"text":"H',
      'i"}]}}]}\n',
    ])

    const chunks = await collectChunks(parseGeminiStream(reader))

    expect(chunks).toEqual([
      { text: 'Hi', done: false },
      { text: '', done: true },
    ])
  })

  it('ignores comments and empty lines', async () => {
    const reader = createReader([
      ': ping\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"Ok"}]}}]}\n',
    ])

    const chunks = await collectChunks(parseGeminiStream(reader))

    expect(chunks).toEqual([
      { text: 'Ok', done: false },
      { text: '', done: true },
    ])
  })

  it('handles multiple data lines in a single chunk', async () => {
    const reader = createReader([
      'data: {"candidates":[{"content":{"parts":[{"text":"A"}]}}]}\n' +
        'data: {"candidates":[{"content":{"parts":[{"text":"B"}]}}]}\n',
    ])

    const chunks = await collectChunks(parseGeminiStream(reader))

    expect(chunks).toEqual([
      { text: 'A', done: false },
      { text: 'B', done: false },
      { text: '', done: true },
    ])
  })

  it('emits done even when no text appears', async () => {
    const reader = createReader(['data: {"candidates":[]}\n'])

    const chunks = await collectChunks(parseGeminiStream(reader))

    expect(chunks).toEqual([{ text: '', done: true }])
  })
})
