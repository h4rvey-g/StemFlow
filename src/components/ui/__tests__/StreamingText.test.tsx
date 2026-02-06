import React from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StreamingText } from '@/components/ui/StreamingText'

describe('StreamingText', () => {
  it('renders text', () => {
    const { getByText } = render(<StreamingText text="Hello" isLoading={false} />)
    expect(getByText('Hello')).toBeInTheDocument()
  })

  it('shows cursor when loading', () => {
    const { getByTestId } = render(<StreamingText text="Hello" isLoading={true} />)
    expect(getByTestId('typing-cursor')).toBeInTheDocument()
  })

  it('hides cursor when done', () => {
    const { queryByTestId } = render(<StreamingText text="Hello" isLoading={false} />)
    expect(queryByTestId('typing-cursor')).toBeNull()
  })

  it('auto-scrolls when text changes', () => {
    const { getByTestId, rerender } = render(
      <StreamingText text="Hello" isLoading={true} />
    )

    const el = getByTestId('streaming-text-container') as HTMLDivElement
    Object.defineProperty(el, 'scrollHeight', { value: 123, configurable: true })
    el.scrollTop = 0

    rerender(<StreamingText text="Hello\nWorld" isLoading={true} />)
    expect(el.scrollTop).toBe(123)
  })
})
