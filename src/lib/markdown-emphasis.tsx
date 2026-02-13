import React, { type ReactNode } from 'react'

import type { Citation } from '@/types/nodes'

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
    const multiCitationMatch = input.slice(cursor).match(/^\[(\[exa:\d+\](?:,\s*\[exa:\d+\])*)\]/)
    if (multiCitationMatch) {
      const inner = multiCitationMatch[1]
      const re = /exa:(\d+)/g
      let m = re.exec(inner)
      while (m) {
        tokens.push({ kind: 'citation', index: parseInt(m[1], 10) })
        m = re.exec(inner)
      }
      cursor += multiCitationMatch[0].length
      continue
    }

    const exaCitationMatch = input.slice(cursor).match(/^\[\[exa:(\d+)\]\]/)
    if (exaCitationMatch) {
      tokens.push({ kind: 'citation', index: parseInt(exaCitationMatch[1], 10) })
      cursor += exaCitationMatch[0].length
      continue
    }

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
      const rest = input.slice(cursor)
      const nextMultiCitation = rest.search(/\[\[exa:\d+\](?:,\s*\[exa:\d+\])*\]/)
      const nextExaCitation = rest.search(/\[\[exa:\d+\]\]/)
      const nextCitation = rest.search(/\[\d+\]/)
      const nextCitationPos = [nextMultiCitation, nextExaCitation, nextCitation]
        .filter((p) => p !== -1)
        .reduce((min, p) => Math.min(min, p), Infinity)
      const nextCitationAbs = nextCitationPos === Infinity ? -1 : cursor + nextCitationPos
      const nextSpecial = nextCitationAbs !== -1 && (nextMarker === -1 || nextCitationAbs < nextMarker)
        ? nextCitationAbs
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

export const renderMarkdownEmphasis = (input: string, citations?: Citation[]): ReactNode[] => {
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
      const citation = citations?.find((c) => c.index === token.index)
      if (citation?.url) {
        return (
          <a
            key={`c-${index}`}
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            title={citation.title}
            className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
          >
            <sup>[{token.index}]</sup>
          </a>
        )
      }
      return (
        <sup key={`c-${index}`} className="text-blue-600 cursor-default">
          [{token.index}]
        </sup>
      )
    }

    return <span key={`t-${index}`}>{token.value}</span>
  })
}
