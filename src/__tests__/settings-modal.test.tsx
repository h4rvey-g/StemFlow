import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { SettingsModal } from '../components/ui/SettingsModal'
import { saveApiKeys, loadApiKeys } from '../lib/api-keys'

vi.mock('../lib/api-keys', () => ({
  saveApiKeys: vi.fn(),
  loadApiKeys: vi.fn(),
}))

describe('SettingsModal', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(loadApiKeys as Mock).mockResolvedValue({
      provider: 'openai',
      openaiKey: null,
      anthropicKey: null,
      geminiKey: null,
      openaiBaseUrl: null,
      anthropicBaseUrl: null,
      openaiModel: null,
      anthropicModel: null,
      geminiModel: null,
    })
  })

  it('does not render when not open', () => {
    render(<SettingsModal isOpen={false} onClose={onClose} />)
    expect(screen.queryByText('Settings')).not.toBeInTheDocument()
  })

  it('renders and loads keys when open', async () => {
    ;(loadApiKeys as Mock).mockResolvedValue({
      provider: 'openai',
      openaiKey: 'sk-existing',
      anthropicKey: null,
      geminiKey: null,
      openaiBaseUrl: null,
      anthropicBaseUrl: null,
      openaiModel: null,
      anthropicModel: null,
      geminiModel: null,
      })

    render(<SettingsModal isOpen={true} onClose={onClose} />)
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/sk-/)).toHaveValue('sk-existing')
    })
    
    expect(loadApiKeys).toHaveBeenCalled()
  })

  it('switches provider and updates input value', async () => {
    ;(loadApiKeys as Mock).mockResolvedValue({
      provider: 'openai',
      openaiKey: 'sk-openai-key',
      anthropicKey: 'sk-anthropic-key',
      geminiKey: 'AIza-gemini-key',
      openaiBaseUrl: null,
      anthropicBaseUrl: null,
      openaiModel: null,
      anthropicModel: null,
      geminiModel: null,
    })

    render(<SettingsModal isOpen={true} onClose={onClose} />)
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/sk-/)).toHaveValue('sk-openai-key')
    })

    const select = screen.getByLabelText('AI Provider')
    await userEvent.selectOptions(select, 'anthropic')

    expect(screen.getByPlaceholderText(/sk-ant-/)).toHaveValue('sk-anthropic-key')

    await userEvent.selectOptions(select, 'gemini')
    expect(screen.getByPlaceholderText(/AIza/)).toHaveValue('AIza-gemini-key')
  })

  it('saves api keys', async () => {
    ;(saveApiKeys as Mock).mockResolvedValue({ success: true })
    
    render(<SettingsModal isOpen={true} onClose={onClose} />)
    
    await waitFor(() => expect(loadApiKeys).toHaveBeenCalled())

    const select = screen.getByLabelText('AI Provider')
    await userEvent.selectOptions(select, 'openai')

    const input = screen.getByPlaceholderText(/sk-/)
    await userEvent.clear(input)
    await userEvent.type(input, 'sk-new-key')

    const saveBtn = screen.getByText('Save Changes')
    await userEvent.click(saveBtn)

    expect(saveApiKeys).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'openai',
      openaiKey: 'sk-new-key',
    }))

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('shows persisted selected model even when not in fallback list', async () => {
    ;(loadApiKeys as Mock).mockResolvedValue({
      provider: 'openai',
      openaiKey: 'sk-existing',
      anthropicKey: null,
      geminiKey: null,
      openaiBaseUrl: null,
      anthropicBaseUrl: null,
      openaiModel: 'gpt-4.1-mini',
      anthropicModel: null,
      geminiModel: null,
    })

    render(<SettingsModal isOpen={true} onClose={onClose} />)

    await waitFor(() => {
      expect(loadApiKeys).toHaveBeenCalled()
    })

    expect(screen.getByLabelText('Model')).toHaveValue('gpt-4.1-mini')
    expect(screen.getByRole('option', { name: 'gpt-4.1-mini' })).toBeInTheDocument()
  })

  it('closes modal on close button click', async () => {
    render(<SettingsModal isOpen={true} onClose={onClose} />)
    await waitFor(() => expect(loadApiKeys).toHaveBeenCalled())
    
    const closeBtn = screen.getByText('✕')
    await userEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })
})
