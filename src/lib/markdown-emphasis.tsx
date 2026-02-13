import React, { type ReactNode } from 'react'

type EmphasisToken =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'italic'; value: string }
  | { kind: 'citation'; index: number }

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
    // Check for citation [n]
    const citationMatch = input.slice(cursor).match(/^\[(\d+)\]/)
    if (citationMatch) {
      tokens.push({ kind: 'citation', index: parseInt(citationMatch[1], 10) })
      cursor += citationMatch[0].length
      continue
    }

    const hasBoldMarker = input.slice(cursor, cursor + 2) === '**'
    const hasItalicMarker = !hasBoldMarker && input[cursor] === '*'

    if (!hasBoldMarker && !hasItalicMarker) {
      const nextMarker = input.indexOf('*', cursor)
      const nextCitation = input.slice(cursor).search(/\[\d+\]/)
      const nextSpecial = nextCitation !== -1 && (nextMarker === -1 || nextCitation < nextMarker - cursor)
        ? cursor + nextCitation
        : nextMarker
      const end = nextSpecial === -1 || nextSpecial === cursor ? input.length : nextSpecial
      if (end > cursor) {
        tokens.push({ kind: 'text', value: input.slice(cursor, end) })
      }
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

  return tokens.filter((token) => {
    if (token.kind === 'citation') return true
    return token.value.length > 0
  })
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

    if (token.kind === 'citation') {
      return (
        <sup key={`c-${index}`} className="text-blue-600 cursor-default">
          [{token.index}]
        </sup>
      )
    }

    return <span key={`t-${index}`}>{token.value}</span>
  })
}
