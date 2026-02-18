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

const updateNodeMock = vi.fn()

vi.mock('@/stores/useStore', () => ({
  useStore: (selector: (state: { updateNode: typeof updateNodeMock }) => unknown) =>
    selector({ updateNode: updateNodeMock }),
}))

const renderNodeWithPlaceholder = (Component: React.ComponentType<any>, placeholderKey: string, nodeId: string) => {
  render(<Component id={nodeId} data={{ text_content: 'initial' }} isConnectable={false} selected />)
  const textarea = screen.getByPlaceholderText(new RegExp(`${placeholderKey}|${placeholderKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  expect(textarea).toBeInTheDocument()
  return textarea as HTMLTextAreaElement
}

const simulateTextChange = (textarea: HTMLTextAreaElement, nodeId: string, newValue: string) => {
  fireEvent.change(textarea, { target: { value: newValue } })
  expect(updateNodeMock).toHaveBeenCalledWith(nodeId, {
    data: { text_content: newValue },
  })
}

describe('Node components', () => {
  beforeEach(() => {
    updateNodeMock.mockReset()
    updateInternalsMock.mockReset()
  })

  it('calls updateNode when ObservationNode text updates', () => {
    const textarea = renderNodeWithPlaceholder(ObservationNode, 'nodes.observation.placeholder', 'obs-1')

    simulateTextChange(textarea, 'obs-1', 'new observation')
  })

  it('calls updateNode when MechanismNode text updates', () => {
    const textarea = renderNodeWithPlaceholder(MechanismNode, 'nodes.mechanism.placeholder', 'mech-1')

    simulateTextChange(textarea, 'mech-1', 'new mechanism')
  })

  it('calls updateNode when ValidationNode text updates', () => {
    const textarea = renderNodeWithPlaceholder(ValidationNode, 'nodes.validation.placeholder', 'valid-1')

    simulateTextChange(textarea, 'valid-1', 'new validation')
  })

  it('dispatches read-more intent event when Read More is clicked', async () => {
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
      
      const readMoreButton = await screen.findByRole('button', { name: /Read more|nodes\.card\.readMore/i })
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
