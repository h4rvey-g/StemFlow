import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateInternalsMock = vi.fn()
vi.mock('reactflow', () => ({
  Handle: (props: React.ComponentProps<'div'>) => <div {...props} />,
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
  useUpdateNodeInternals: () => updateInternalsMock,
}))

import { MechanismNode } from '@/components/nodes/MechanismNode'
import { ObservationNode } from '@/components/nodes/ObservationNode'
import { ValidationNode } from '@/components/nodes/ValidationNode'

vi.mock('@/stores/useStore', () => ({
  useStore: (
    selector: (state: {
      updateNodeData: ReturnType<typeof vi.fn>
      setNodeGrade: ReturnType<typeof vi.fn>
      addNode: ReturnType<typeof vi.fn>
      addEdge: ReturnType<typeof vi.fn>
      globalGoal: string
    }) => unknown
  ) =>
    selector({
      updateNodeData: vi.fn(),
      setNodeGrade: vi.fn(),
      addNode: vi.fn(),
      addEdge: vi.fn(),
      globalGoal: '',
    }),
}))

const renderNode = (Component: React.ComponentType<any>, nodeId: string, text = 'initial', selected = true) => {
  render(
    <Component
      id={nodeId}
      data={{ text_content: text }}
      isConnectable={false}
      selected={selected}
      type="OBSERVATION"
      zIndex={0}
      xPos={0}
      yPos={0}
      dragging={false}
    />
  )
}

describe('Node components', () => {
  beforeEach(() => {
    updateInternalsMock.mockReset()
  })

  it('keeps ObservationNode content as static text when selected', () => {
    renderNode(ObservationNode, 'obs-1', 'new observation', true)

    expect(screen.getAllByText('new observation').length).toBeGreaterThan(0)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('keeps MechanismNode content as static text when selected', () => {
    renderNode(MechanismNode, 'mech-1', 'new mechanism', true)

    expect(screen.getAllByText('new mechanism').length).toBeGreaterThan(0)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('keeps ValidationNode content as static text when selected', () => {
    renderNode(ValidationNode, 'valid-1', 'new validation', true)

    expect(screen.getAllByText('new validation').length).toBeGreaterThan(0)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('dispatches read-more intent event when Inspect is clicked', async () => {
    const longText = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6'
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
    const originalGetComputedStyle = window.getComputedStyle
    const originalResizeObserver = global.ResizeObserver

    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return 200
      },
    })

    window.getComputedStyle = () => ({
      lineHeight: '28px',
      getPropertyValue: () => '28px',
    }) as unknown as CSSStyleDeclaration

    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver

    const eventListener = vi.fn()

    try {
      window.addEventListener('stemflow:read-more-intent', eventListener)

      const initialInternalsCallCount = updateInternalsMock.mock.calls.length

      render(
        <ObservationNode
          id="obs-expand"
          data={{ text_content: longText }}
          isConnectable={false}
          selected={false}
          type="OBSERVATION"
          zIndex={0}
          xPos={0}
          yPos={0}
          dragging={false}
        />
      )
      
      const readMoreButton = await screen.findByRole('button', { name: /Inspect|nodes\.card\.readMore/i })
      fireEvent.click(readMoreButton)

      expect(eventListener).toHaveBeenCalledTimes(1)
      expect(eventListener.mock.calls[0][0]).toBeInstanceOf(CustomEvent)
      expect((eventListener.mock.calls[0][0] as CustomEvent).detail).toEqual({ nodeId: 'obs-expand' })
      expect(updateInternalsMock).toHaveBeenCalled()
      expect(updateInternalsMock).toHaveBeenCalledWith('obs-expand')
      expect(updateInternalsMock.mock.calls.length).toBeGreaterThan(initialInternalsCallCount)
      expect(updateInternalsMock.mock.calls.at(-1)?.[0]).toBe('obs-expand')
    } finally {
      window.removeEventListener('stemflow:read-more-intent', eventListener)

      if (scrollHeightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor)
      } else {
        delete (HTMLElement.prototype as unknown as Record<string, unknown>)['scrollHeight']
      }

      window.getComputedStyle = originalGetComputedStyle
      global.ResizeObserver = originalResizeObserver
    }
  })
})
