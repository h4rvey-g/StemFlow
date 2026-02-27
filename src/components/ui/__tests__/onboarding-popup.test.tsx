import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { EmptyCanvasOverlay } from '@/components/ui/EmptyCanvasOverlay'
import { OnboardingPopup } from '@/components/ui/OnboardingPopup'

describe('OnboardingPopup', () => {
  it('renders when isOpen=true', () => {
    render(
      <OnboardingPopup
        isOpen={true}
        onClose={vi.fn()}
        onCreateNode={vi.fn()}
      />
    )

    expect(screen.getByTestId('onboarding-popup')).toBeInTheDocument()
  })

  it('is hidden when isOpen=false', () => {
    render(
      <OnboardingPopup
        isOpen={false}
        onClose={vi.fn()}
        onCreateNode={vi.fn()}
      />
    )

    expect(screen.queryByTestId('onboarding-popup')).not.toBeInTheDocument()
  })

  it('renders hypothesis and observation cards', () => {
    render(
      <OnboardingPopup
        isOpen={true}
        onClose={vi.fn()}
        onCreateNode={vi.fn()}
      />
    )

    expect(screen.getByTestId('onboarding-card-hypothesis')).toBeInTheDocument()
    expect(screen.getByTestId('onboarding-card-observation')).toBeInTheDocument()
  })

  it('selecting a card shows textarea', async () => {
    const user = userEvent.setup()

    render(
      <OnboardingPopup
        isOpen={true}
        onClose={vi.fn()}
        onCreateNode={vi.fn()}
      />
    )

    await user.click(screen.getByTestId('onboarding-card-hypothesis'))

    expect(screen.getByTestId('onboarding-textarea')).toBeInTheDocument()
  })

  it('keeps create button disabled for empty/whitespace textarea', async () => {
    const user = userEvent.setup()

    render(
      <OnboardingPopup
        isOpen={true}
        onClose={vi.fn()}
        onCreateNode={vi.fn()}
      />
    )

    await user.click(screen.getByTestId('onboarding-card-observation'))

    const textarea = screen.getByTestId('onboarding-textarea')
    const createButton = screen.getByTestId('onboarding-create-btn')

    expect(createButton).toBeDisabled()

    await user.type(textarea, '   ')
    expect(createButton).toBeDisabled()
  })

  it('enables create button when textarea has text', async () => {
    const user = userEvent.setup()

    render(
      <OnboardingPopup
        isOpen={true}
        onClose={vi.fn()}
        onCreateNode={vi.fn()}
      />
    )

    await user.click(screen.getByTestId('onboarding-card-observation'))

    const textarea = screen.getByTestId('onboarding-textarea')
    const createButton = screen.getByTestId('onboarding-create-btn')

    await user.type(textarea, 'Observed strong growth in sample B')

    expect(createButton).toBeEnabled()
  })

  it('clicking Create calls onCreateNode(type,text) with trimmed text', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onCreateNode = vi.fn()

    render(
      <OnboardingPopup
        isOpen={true}
        onClose={onClose}
        onCreateNode={onCreateNode}
      />
    )

    await user.click(screen.getByTestId('onboarding-card-observation'))
    await user.type(screen.getByTestId('onboarding-textarea'), '  My observation text  ')
    await user.click(screen.getByTestId('onboarding-create-btn'))

    expect(onCreateNode).toHaveBeenCalledTimes(1)
    expect(onCreateNode).toHaveBeenCalledWith('OBSERVATION', 'My observation text')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('close button calls onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <OnboardingPopup
        isOpen={true}
        onClose={onClose}
        onCreateNode={vi.fn()}
      />
    )

    await user.click(screen.getByTestId('onboarding-close-btn'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('backdrop click closes popup', () => {
    const onClose = vi.fn()

    render(
      <OnboardingPopup
        isOpen={true}
        onClose={onClose}
        onCreateNode={vi.fn()}
      />
    )

    fireEvent.click(screen.getByTestId('onboarding-popup'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape key closes popup', () => {
    const onClose = vi.fn()

    render(
      <OnboardingPopup
        isOpen={true}
        onClose={onClose}
        onCreateNode={vi.fn()}
      />
    )

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('EmptyCanvasOverlay', () => {
  it('renders get started button', () => {
    render(<EmptyCanvasOverlay onGetStarted={vi.fn()} />)

    expect(screen.getByTestId('empty-canvas-get-started')).toBeInTheDocument()
  })

  it('clicking get started button calls callback', async () => {
    const user = userEvent.setup()
    const onGetStarted = vi.fn()

    render(<EmptyCanvasOverlay onGetStarted={onGetStarted} />)

    await user.click(screen.getByTestId('empty-canvas-get-started'))

    expect(onGetStarted).toHaveBeenCalledTimes(1)
  })
})
