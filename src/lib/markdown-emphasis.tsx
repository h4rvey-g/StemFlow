import React, { type ReactNode } from 'react'

type EmphasisToken =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'italic'; value: string }

const findClosing = (input: string, marker: '*' | '**', start: number): number => {
  const markerLength = marker.length
  for (let index = start; index < input.length; index += 1) {
    if (input.slice(index, index + markerLength) !== marker) continue
    const content = input.slice(start, index)
    if (content.trim().length === 0) continue
    return index
  }

  return -1
}

const tokenizeEmphasis = (input: string): EmphasisToken[] => {
  const tokens: EmphasisToken[] = []
  let cursor = 0

  while (cursor < input.length) {
    const hasBoldMarker = input.slice(cursor, cursor + 2) === '**'
    const hasItalicMarker = !hasBoldMarker && input[cursor] === '*'

    if (!hasBoldMarker && !hasItalicMarker) {
      const nextMarker = input.indexOf('*', cursor)
      const end = nextMarker === -1 ? input.length : nextMarker
      tokens.push({ kind: 'text', value: input.slice(cursor, end) })
      cursor = end
      continue
    }

    const marker = hasBoldMarker ? '**' : '*'
    const markerLength = marker.length
    const closingIndex = findClosing(input, marker, cursor + markerLength)

    if (closingIndex === -1) {
      tokens.push({ kind: 'text', value: input.slice(cursor, cursor + markerLength) })
      cursor += markerLength
      continue
    }

    const content = input.slice(cursor + markerLength, closingIndex)
    tokens.push({ kind: hasBoldMarker ? 'bold' : 'italic', value: content })
    cursor = closingIndex + markerLength
  }

  return tokens.filter((token) => token.value.length > 0)
}

export const renderMarkdownEmphasis = (input: string): ReactNode[] => {
  const tokens = tokenizeEmphasis(input)

  return tokens.map((token, index) => {
    if (token.kind === 'bold') {
      return (
        <strong key={`b-${index}`} className="font-semibold text-slate-800">
          {token.value}
        </strong>
      )
    }

    if (token.kind === 'italic') {
      return (
        <em key={`i-${index}`} className="italic">
          {token.value}
        </em>
      )
    }

    return <span key={`t-${index}`}>{token.value}</span>
  })
}
