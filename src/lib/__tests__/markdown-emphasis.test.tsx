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
})
