import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Sidebar } from '@/components/Sidebar'

type SidebarNode = {
  label: string
  type: 'OBSERVATION' | 'MECHANISM' | 'VALIDATION'
  testId: 'sidebar-observation' | 'sidebar-mechanism' | 'sidebar-validation'
}

const sidebarNodes: SidebarNode[] = [
  { label: 'Observation', type: 'OBSERVATION', testId: 'sidebar-observation' },
  { label: 'Mechanism', type: 'MECHANISM', testId: 'sidebar-mechanism' },
  { label: 'Validation', type: 'VALIDATION', testId: 'sidebar-validation' },
]

const createMockDataTransfer = (): DataTransfer =>
  ({
    setData: vi.fn(),
    effectAllowed: '',
  } as unknown as DataTransfer)

describe('Sidebar', () => {
  it('renders draggable nodes for each type with correct labels', () => {
    render(<Sidebar />)

    sidebarNodes.forEach(({ label, testId }) => {
      const node = screen.getByTestId(testId)
      expect(node).toBeInTheDocument()
      expect(node).toHaveTextContent(label)
      expect(node).toHaveAttribute('draggable', 'true')
    })
  })

  it('sets the dataTransfer payload and effectAllowed on drag start', () => {
    render(<Sidebar />)

    sidebarNodes.forEach(({ type, testId }) => {
      const node = screen.getByTestId(testId)
      const dataTransfer = createMockDataTransfer()

      fireEvent.dragStart(node, { dataTransfer })

      expect(dataTransfer.setData).toHaveBeenCalledWith('application/reactflow', type)
      expect(dataTransfer.effectAllowed).toBe('move')
    })
  })
})
