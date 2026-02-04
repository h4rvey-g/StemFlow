import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('reactflow', () => ({
  Handle: (props: React.ComponentProps<'div'>) => <div {...props} />,
  Position: { Top: 'top', Bottom: 'bottom' },
}))

import { MechanismNode } from '@/components/nodes/MechanismNode'
import { ObservationNode } from '@/components/nodes/ObservationNode'
import { ValidationNode } from '@/components/nodes/ValidationNode'

const updateNodeMock = vi.fn()

vi.mock('@/stores/useStore', () => ({
  useStore: (selector: (state: { updateNode: typeof updateNodeMock }) => unknown) =>
    selector({ updateNode: updateNodeMock }),
}))

const renderNodeWithPlaceholder = (Component: React.ComponentType<any>, placeholder: string, nodeId: string) => {
  render(<Component id={nodeId} data={{ text_content: 'initial' }} isConnectable={false} />)
  const textarea = screen.getByPlaceholderText(placeholder)
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
  })

  it('ObservationNode renders and updates text content', () => {
    const textarea = renderNodeWithPlaceholder(ObservationNode, 'Capture an observation', 'obs-1')

    simulateTextChange(textarea, 'obs-1', 'new observation')
  })

  it('MechanismNode renders and updates text content', () => {
    const textarea = renderNodeWithPlaceholder(MechanismNode, 'Describe the mechanism', 'mech-1')

    simulateTextChange(textarea, 'mech-1', 'new mechanism')
  })

  it('ValidationNode renders and updates text content', () => {
    const textarea = renderNodeWithPlaceholder(ValidationNode, 'Document validation', 'valid-1')

    simulateTextChange(textarea, 'valid-1', 'new validation')
  })
})
