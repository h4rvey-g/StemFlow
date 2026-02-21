import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InspectorPanel } from '../InspectorPanel'

describe('InspectorPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders portal-based overlay when open', () => {
    render(<InspectorPanel isOpen={true} onClose={vi.fn()} />)
    
    const panel = screen.getByTestId('inspector-panel')
    expect(panel).toBeInTheDocument()
    expect(document.body).toContainElement(panel)
  })

  it('does not render when closed', () => {
    render(<InspectorPanel isOpen={false} onClose={vi.fn()} />)
    
    expect(screen.queryByTestId('inspector-panel')).not.toBeInTheDocument()
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    render(<InspectorPanel isOpen={true} onClose={onClose} />)
    
    const closeButton = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeButton)
    
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn()
    render(<InspectorPanel isOpen={true} onClose={onClose} />)
    
    const backdrop = screen.getByTestId('inspector-panel').parentElement!
    fireEvent.mouseDown(backdrop)
    
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when panel content clicked', () => {
    const onClose = vi.fn()
    render(<InspectorPanel isOpen={true} onClose={onClose} />)
    
    const panel = screen.getByTestId('inspector-panel')
    fireEvent.mouseDown(panel)
    
    expect(onClose).not.toHaveBeenCalled()
  })

  describe('Esc key behavior', () => {
    it('closes panel when Esc pressed outside editable field', () => {
      const onClose = vi.fn()
      render(<InspectorPanel isOpen={true} onClose={onClose} />)
      
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      window.dispatchEvent(event)
      
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('does not close when Esc pressed in input field', () => {
      const onClose = vi.fn()
      render(
        <InspectorPanel isOpen={true} onClose={onClose}>
          <input data-testid="test-input" />
        </InspectorPanel>
      )
      
      const input = screen.getByTestId('test-input')
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      input.dispatchEvent(event)
      
      expect(onClose).not.toHaveBeenCalled()
    })

    it('does not close when Esc pressed in textarea', () => {
      const onClose = vi.fn()
      render(
        <InspectorPanel isOpen={true} onClose={onClose}>
          <textarea data-testid="test-textarea" />
        </InspectorPanel>
      )
      
      const textarea = screen.getByTestId('test-textarea')
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      textarea.dispatchEvent(event)
      
      expect(onClose).not.toHaveBeenCalled()
    })

    it('does not close when Esc pressed in contenteditable', () => {
      const onClose = vi.fn()
      render(
        <InspectorPanel isOpen={true} onClose={onClose}>
          <div contentEditable="true" data-testid="test-editable" />
        </InspectorPanel>
      )
      
      const editable = screen.getByTestId('test-editable')
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      editable.dispatchEvent(event)
      
      expect(onClose).not.toHaveBeenCalled()
    })

    it('removes keydown listener on unmount', () => {
      const onClose = vi.fn()
      const { unmount } = render(<InspectorPanel isOpen={true} onClose={onClose} />)
      
      unmount()
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      window.dispatchEvent(event)
      
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('Long text section', () => {
    it('renders full node text without truncation', () => {
      const longText = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8'
      render(
        <InspectorPanel isOpen={true} onClose={vi.fn()} nodeText={longText} />
      )
      
      expect(screen.getByText(/Line 1/)).toBeInTheDocument()
      expect(screen.getByText(/Line 8/)).toBeInTheDocument()
    })

    it('renders markdown emphasis and list structure in node text', () => {
      const markdownText = '**Bold text** and *italic text*\n- Item one\n- Item two'

      render(
        <InspectorPanel isOpen={true} onClose={vi.fn()} nodeText={markdownText} />
      )

      expect(screen.getByText('Bold text').tagName).toBe('STRONG')
      expect(screen.getByText('italic text').tagName).toBe('EM')
      expect(screen.getByRole('list')).toBeInTheDocument()
      expect(screen.getByText('Item one')).toBeInTheDocument()
      expect(screen.getByText('Item two')).toBeInTheDocument()
    })

    it('renders translated content below original text in inspector', () => {
      render(
        <InspectorPanel
          isOpen={true}
          onClose={vi.fn()}
          nodeText="Original content"
          translatedTitle="Translated title"
          translatedTextContent="1. **Bold translated**\n2. translated line"
          translatedLanguage="en"
        />
      )

      const original = screen.getByText('Original content')
      const translatedTitle = screen.getByText('Translated title')
      expect(original).toBeInTheDocument()
      expect(translatedTitle).toBeInTheDocument()
      const contentBlock = original.closest('div')?.parentElement
      const contentText = contentBlock?.textContent ?? ''
      expect(contentText.indexOf('Original content')).toBeGreaterThanOrEqual(0)
      expect(contentText.indexOf('Translated title')).toBeGreaterThan(contentText.indexOf('Original content'))
      expect(screen.getByText('Bold translated').tagName).toBe('STRONG')
      expect(contentText).toContain('translated line')
      expect(screen.getByText('English')).toBeInTheDocument()
    })

    it('does not render long text section when nodeText is empty', () => {
      render(
        <InspectorPanel isOpen={true} onClose={vi.fn()} nodeText="" />
      )
      
      expect(screen.queryByText(/long.text/i)).not.toBeInTheDocument()
    })

    it('renders markdown as read-only by default even when editable handler is provided', () => {
      render(
        <InspectorPanel
          isOpen={true}
          onClose={vi.fn()}
          nodeText="**Bold text**"
          onNodeTextChange={vi.fn()}
        />
      )

      expect(screen.queryByTestId('inspector-node-editor')).not.toBeInTheDocument()
      expect(screen.getByText('Bold text').tagName).toBe('STRONG')
      expect(screen.getByRole('button', { name: /common\.edit|edit/i })).toBeInTheDocument()
    })

    it('enters edit mode via Edit button and saves only on Save click', () => {
      const onNodeTextChange = vi.fn()

      render(
        <InspectorPanel
          isOpen={true}
          onClose={vi.fn()}
          nodeText="Original"
          onNodeTextChange={onNodeTextChange}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /common\.edit|edit/i }))

      const editor = screen.getByTestId('inspector-node-editor') as HTMLTextAreaElement
      fireEvent.change(editor, { target: { value: 'Updated text' } })

      expect(onNodeTextChange).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: /common\.save|save/i }))
      expect(onNodeTextChange).toHaveBeenCalledWith('Updated text')
    })
  })

  describe('Citations section', () => {
    it('is collapsed by default and expands on toggle', () => {
      const citations = [
        { index: 1, title: 'Paper A', url: 'https://example.com/a' },
        { index: 2, title: 'Paper B', url: 'https://example.com/b', publishedDate: '2024' }
      ]
      render(
        <InspectorPanel isOpen={true} onClose={vi.fn()} citations={citations} />
      )

      const citationsToggle = screen.getByRole('button', { name: /inspector\.citations/i })
      expect(citationsToggle).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByText('Paper A')).not.toBeInTheDocument()

      fireEvent.click(citationsToggle)

      expect(citationsToggle).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByText('Paper A')).toBeInTheDocument()
      expect(screen.getByText('Paper B')).toBeInTheDocument()
      const linkA = screen.getByRole('link', { name: /Paper A/i })
      expect(linkA).toHaveAttribute('href', 'https://example.com/a')
      expect(linkA).toHaveAttribute('target', '_blank')
      expect(linkA).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('renders explicit empty citation state message when citations absent', () => {
      render(
        <InspectorPanel isOpen={true} onClose={vi.fn()} citations={[]} />
      )

      fireEvent.click(screen.getByRole('button', { name: /inspector\.citations/i }))
      expect(screen.getByText('inspector.noCitations')).toBeInTheDocument()
    })

    it('renders localized labels for inspector sections', () => {
      render(
        <InspectorPanel isOpen={true} onClose={vi.fn()} nodeText="Some text" citations={[]} />
      )
      
      expect(screen.getByText('inspector.title')).toBeInTheDocument()
      expect(screen.getByText('inspector.longText')).toBeInTheDocument()
      expect(screen.getByText('inspector.citations')).toBeInTheDocument()
    })

    it('renders optional snippet when provided', () => {
      const citations = [
        { index: 1, title: 'Paper C', url: 'https://example.com/c', snippet: 'Abstract text here' }
      ]
      render(
        <InspectorPanel isOpen={true} onClose={vi.fn()} citations={citations} />
      )

      fireEvent.click(screen.getByRole('button', { name: /inspector\.citations/i }))
      expect(screen.getByText(/Abstract text here/)).toBeInTheDocument()
    })

    it('renders optional date when provided', () => {
      const citations = [
        { index: 1, title: 'Paper D', url: 'https://example.com/d', publishedDate: '2023' }
      ]
      render(
        <InspectorPanel isOpen={true} onClose={vi.fn()} citations={citations} />
      )

      fireEvent.click(screen.getByRole('button', { name: /inspector\.citations/i }))
      expect(screen.getByText(/2023/)).toBeInTheDocument()
    })
  })
})
