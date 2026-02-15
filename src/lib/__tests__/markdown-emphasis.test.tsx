import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderMarkdownEmphasis } from '@/lib/markdown-emphasis'

describe('renderMarkdownEmphasis', () => {
  it('renders bold and italic markers as semantic tags', () => {
    render(<p>{renderMarkdownEmphasis('Use **critical** and *supporting* terms.')}</p>)

    expect(screen.getByText('critical').tagName).toBe('STRONG')
    expect(screen.getByText('supporting').tagName).toBe('EM')
  })

  it('keeps unmatched markers as plain text', () => {
    const { container } = render(<p>{renderMarkdownEmphasis('Keep *this literal marker without closure.')}</p>)

    expect(container.textContent).toBe('Keep *this literal marker without closure.')
  })

  it('renders single-level unordered and ordered markdown lists', () => {
    render(
      <div>
        {renderMarkdownEmphasis('- First bullet\n- Second bullet\n\n1. First step\n2. Second step')}
      </div>
    )

    const lists = screen.getAllByRole('list')
    expect(lists[0]?.tagName).toBe('UL')
    expect(screen.getByText('First bullet').closest('li')).toBeInTheDocument()

    const orderedList = lists[1]
    expect(orderedList.tagName).toBe('OL')
    expect(screen.getByText('Second step').closest('li')).toBeInTheDocument()
  })

  it('renders nested multi-level markdown lists', () => {
    render(
      <div>
        {renderMarkdownEmphasis(
          '- Parent\n  - Child bullet\n    1. Nested ordered\n- Parent 2\n\n1. Top ordered\n   - Child under ordered'
        )}
      </div>
    )

    const lists = screen.getAllByRole('list')
    expect(lists.length).toBeGreaterThanOrEqual(4)
    expect(screen.getByText('Child bullet').closest('ul')).toBeInTheDocument()
    expect(screen.getByText('Nested ordered').closest('ol')).toBeInTheDocument()
    expect(screen.getByText('Child under ordered').closest('ul')).toBeInTheDocument()
  })
})
