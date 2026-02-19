import React, { type ReactNode } from 'react'

import type { Citation } from '@/types/nodes'

type EmphasisToken =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'italic'; value: string }
  | { kind: 'citation'; index: number }

type MarkdownListType = 'unordered' | 'ordered'

interface MarkdownListItem {
  text: string
  children: MarkdownListBlock[]
}

interface MarkdownListBlock {
  kind: 'list'
  listType: MarkdownListType
  items: MarkdownListItem[]
}

interface MarkdownParagraphBlock {
  kind: 'paragraph'
  text: string
}

type MarkdownBlock = MarkdownParagraphBlock | MarkdownListBlock

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

const countIndent = (line: string): number => {
  const leadingWhitespace = line.match(/^\s*/)?.[0] ?? ''
  return leadingWhitespace.replace(/\t/g, '  ').length
}

const parseListMarker = (
  line: string
): { indent: number; listType: MarkdownListType; content: string } | null => {
  const unorderedMatch = line.match(/^(\s*)([-*+])\s+(.*)$/)
  if (unorderedMatch) {
    return {
      indent: unorderedMatch[1].replace(/\t/g, '  ').length,
      listType: 'unordered',
      content: unorderedMatch[3].trimEnd(),
    }
  }

  const orderedMatch = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/)
  if (orderedMatch) {
    return {
      indent: orderedMatch[1].replace(/\t/g, '  ').length,
      listType: 'ordered',
      content: orderedMatch[3].trimEnd(),
    }
  }

  return null
}

const parseListBlock = (lines: string[], startIndex: number): [MarkdownListBlock, number] => {
  const firstMarker = parseListMarker(lines[startIndex])
  if (!firstMarker) {
    return [
      {
        kind: 'list',
        listType: 'unordered',
        items: [],
      },
      startIndex,
    ]
  }

  const baseIndent = firstMarker.indent
  const listType = firstMarker.listType
  const items: MarkdownListItem[] = []
  let cursor = startIndex

  while (cursor < lines.length) {
    const line = lines[cursor]
    const marker = parseListMarker(line)

    if (!marker) {
      if (line.trim().length === 0) {
        cursor += 1
        continue
      }

      const indent = countIndent(line)
      if (indent > baseIndent && items.length > 0) {
        const lastItem = items[items.length - 1]
        const trimmed = line.trim()
        lastItem.text = lastItem.text.length > 0 ? `${lastItem.text}\n${trimmed}` : trimmed
        cursor += 1
        continue
      }

      break
    }

    if (marker.indent < baseIndent) break

    if (marker.indent > baseIndent) {
      if (items.length === 0) break
      const [nestedList, nextCursor] = parseListBlock(lines, cursor)
      items[items.length - 1].children.push(nestedList)
      cursor = nextCursor
      continue
    }

    if (marker.listType !== listType) break

    items.push({
      text: marker.content,
      children: [],
    })

    cursor += 1
  }

  return [
    {
      kind: 'list',
      listType,
      items,
    },
    cursor,
  ]
}

const parseMarkdownBlocks = (input: string): MarkdownBlock[] => {
  const lines = input.split('\n')
  const blocks: MarkdownBlock[] = []
  let cursor = 0
  let paragraphBuffer: string[] = []

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return
    blocks.push({
      kind: 'paragraph',
      text: paragraphBuffer.join('\n'),
    })
    paragraphBuffer = []
  }

  while (cursor < lines.length) {
    const line = lines[cursor]
    const marker = parseListMarker(line)

    if (marker) {
      flushParagraph()
      const [listBlock, nextCursor] = parseListBlock(lines, cursor)
      blocks.push(listBlock)
      cursor = nextCursor
      continue
    }

    if (line.trim().length === 0) {
      flushParagraph()
      cursor += 1
      continue
    }

    paragraphBuffer.push(line)
    cursor += 1
  }

  flushParagraph()
  return blocks
}

const renderInline = (input: string, citations: Citation[] | undefined, keyPrefix: string): ReactNode[] => {
  const tokens = tokenizeEmphasis(input)

  return tokens.map((token, index) => {
    if (token.kind === 'bold') {
      return (
        <strong key={`${keyPrefix}-b-${index}`} className="font-semibold text-inherit">
          {token.value}
        </strong>
      )
    }

    if (token.kind === 'italic') {
      return (
        <em key={`${keyPrefix}-i-${index}`} className="italic">
          {token.value}
        </em>
      )
    }

    if (token.kind === 'citation') {
      const citation = citations?.find((c) => c.index === token.index)
      if (citation?.url) {
        return (
          <a
            key={`${keyPrefix}-c-${index}`}
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            title={citation.title}
            className="cursor-pointer text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-300 dark:hover:text-blue-200"
          >
            <sup>[{token.index}]</sup>
          </a>
        )
      }

      return (
        <sup key={`${keyPrefix}-c-${index}`} className="cursor-default text-blue-600 dark:text-blue-300">
          [{token.index}]
        </sup>
      )
    }

    return <span key={`${keyPrefix}-t-${index}`}>{token.value}</span>
  })
}

const renderListBlock = (
  block: MarkdownListBlock,
  citations: Citation[] | undefined,
  keyPrefix: string
): ReactNode => {
  const ListTag = block.listType === 'ordered' ? 'ol' : 'ul'
  const listClassName = block.listType === 'ordered' ? 'list-decimal pl-5' : 'list-disc pl-5'

  return (
    <ListTag key={`${keyPrefix}-list`} className={`${listClassName} space-y-1`}>
      {block.items.map((item, itemIndex) => (
        <li key={`${keyPrefix}-item-${itemIndex}`}>
          <span className="whitespace-pre-wrap break-words">
            {renderInline(item.text, citations, `${keyPrefix}-item-${itemIndex}`)}
          </span>
          {item.children.map((child, childIndex) => (
            <div key={`${keyPrefix}-child-${itemIndex}-${childIndex}`} className="mt-1">
              {renderListBlock(child, citations, `${keyPrefix}-child-${itemIndex}-${childIndex}`)}
            </div>
          ))}
        </li>
      ))}
    </ListTag>
  )
}

export const renderMarkdownEmphasis = (input: string, citations?: Citation[]): ReactNode[] => {
  const blocks = parseMarkdownBlocks(input)

  if (blocks.length === 1 && blocks[0].kind === 'paragraph') {
    return renderInline(blocks[0].text, citations, 'root-inline')
  }

  return blocks.map((block, blockIndex) => {
    const keyPrefix = `block-${blockIndex}`
    if (block.kind === 'list') {
      return renderListBlock(block, citations, keyPrefix)
    }

    return (
      <p key={`${keyPrefix}-paragraph`} className="m-0 whitespace-pre-wrap break-words">
        {renderInline(block.text, citations, keyPrefix)}
      </p>
    )
  })
}
