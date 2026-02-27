import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderMarkdownEmphasis } from '@/lib/markdown-emphasis'

describe('renderMarkdownEmphasis', () => {
  it('renders bold and italic markers as semantic tags', () => {
    render(<p>{renderMarkdownEmphasis('Use **critical** and *supporting* terms.')}</p>)

    const boldText = screen.getByText('critical')
    expect(boldText.tagName).toBe('STRONG')
    expect(boldText).toHaveClass('text-inherit')
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

  it('renders markdown headings with semantic heading tags', () => {
    render(
      <div>
        {renderMarkdownEmphasis('# Heading 1\n## Heading 2\n### Heading 3\n#### Heading 4\n##### Heading 5\n###### Heading 6')}
      </div>
    )

    expect(screen.getByText('Heading 1').closest('h1')).toBeInTheDocument()
    expect(screen.getByText('Heading 2').closest('h2')).toBeInTheDocument()
    expect(screen.getByText('Heading 3').closest('h3')).toBeInTheDocument()
    expect(screen.getByText('Heading 4').closest('h4')).toBeInTheDocument()
    expect(screen.getByText('Heading 5').closest('h5')).toBeInTheDocument()
    expect(screen.getByText('Heading 6').closest('h6')).toBeInTheDocument()
  })

  it('renders headings with inline emphasis', () => {
    render(<div>{renderMarkdownEmphasis('# **Bold** Heading with *italic*')}</div>)

    const heading = screen.getByText('Bold').closest('h1')
    expect(heading).toBeInTheDocument()
    expect(screen.getByText('Bold').tagName).toBe('STRONG')
    expect(screen.getByText('italic').tagName).toBe('EM')
  })

  it('keeps unmatched heading markers as plain text', () => {
    const { container } = render(<p>{renderMarkdownEmphasis('#NoSpace heading')}</p>)

    expect(container.textContent).toBe('#NoSpace heading')
  })
})
