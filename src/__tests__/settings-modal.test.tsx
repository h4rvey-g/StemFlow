import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { SettingsModal } from '../components/ui/SettingsModal'
import { saveApiKeys, loadApiKeys } from '../lib/api-keys'
import {
  DEFAULT_PROMPT_SETTINGS,
  loadPromptSettings,
  savePromptSettings,
} from '../lib/prompt-settings'

const setThemeMock = vi.fn()

vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'bright',
    setTheme: setThemeMock,
  }),
}))

vi.mock('../lib/api-keys', () => ({
  saveApiKeys: vi.fn(),
  loadApiKeys: vi.fn(),
}))

vi.mock('../lib/prompt-settings', async () => {
  const actual = await vi.importActual<typeof import('../lib/prompt-settings')>(
    '../lib/prompt-settings'
  )

  return {
    ...actual,
    loadPromptSettings: vi.fn(() => ({ ...actual.DEFAULT_PROMPT_SETTINGS })),
    savePromptSettings: vi.fn(() => ({ success: true })),
  }
})

describe('SettingsModal', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    setThemeMock.mockReset()
    ;(loadPromptSettings as Mock).mockReturnValue({ ...DEFAULT_PROMPT_SETTINGS })
    ;(savePromptSettings as Mock).mockReturnValue({ success: true })
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
      openaiFastModel: null,
      anthropicFastModel: null,
      geminiFastModel: null,
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
      openaiFastModel: null,
      anthropicFastModel: null,
      geminiFastModel: null,
    })

    render(<SettingsModal isOpen={true} onClose={onClose} />)
    await waitFor(() => expect(loadApiKeys).toHaveBeenCalled())

    await userEvent.click(screen.getByRole('button', { name: 'Model Settings' }))

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/sk-/)).toHaveValue('sk-existing')
    })
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
      openaiFastModel: null,
      anthropicFastModel: null,
      geminiFastModel: null,
    })

    render(<SettingsModal isOpen={true} onClose={onClose} />)
    await waitFor(() => expect(loadApiKeys).toHaveBeenCalled())

    await userEvent.click(screen.getByRole('button', { name: 'Model Settings' }))

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

    await userEvent.click(screen.getByRole('button', { name: 'Model Settings' }))

    const select = screen.getByLabelText('AI Provider')
    await userEvent.selectOptions(select, 'openai')

    const input = screen.getByPlaceholderText(/sk-/)
    await userEvent.clear(input)
    await userEvent.type(input, 'sk-new-key')

    const saveBtn = screen.getByText('Save Model Settings')
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
      openaiFastModel: null,
      anthropicFastModel: null,
      geminiFastModel: null,
    })

    render(<SettingsModal isOpen={true} onClose={onClose} />)
    await waitFor(() => expect(loadApiKeys).toHaveBeenCalled())

    await userEvent.click(screen.getByRole('button', { name: 'Model Settings' }))

    const thinkSelect = screen.getByLabelText('Think Model')
    expect(thinkSelect).toHaveValue('gpt-4.1-mini')
  })

  it('shows persisted fast model even when not in fallback list', async () => {
    ;(loadApiKeys as Mock).mockResolvedValue({
      provider: 'openai',
      openaiKey: 'sk-existing',
      anthropicKey: null,
      geminiKey: null,
      openaiBaseUrl: null,
      anthropicBaseUrl: null,
      openaiModel: 'gpt-4o',
      anthropicModel: null,
      geminiModel: null,
      openaiFastModel: 'gpt-4.1-mini',
      anthropicFastModel: null,
      geminiFastModel: null,
    })

    render(<SettingsModal isOpen={true} onClose={onClose} />)
    await waitFor(() => expect(loadApiKeys).toHaveBeenCalled())

    await userEvent.click(screen.getByRole('button', { name: 'Model Settings' }))

    const fastSelect = screen.getByLabelText('Fast Model')
    expect(fastSelect).toHaveValue('gpt-4.1-mini')
  })

  it('closes modal on close button click', async () => {
    render(<SettingsModal isOpen={true} onClose={onClose} />)
    await waitFor(() => expect(loadApiKeys).toHaveBeenCalled())
    
    const closeBtn = screen.getByText('✕')
    await userEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })

  it('saves prompt settings from prompt tab', async () => {
    render(<SettingsModal isOpen={true} onClose={onClose} />)
    await waitFor(() => expect(loadApiKeys).toHaveBeenCalled())

    await userEvent.click(screen.getByRole('button', { name: 'Prompts' }))

    const observationToMechanismGenerationPrompt = screen.getByLabelText(
      'Generation Prompt (Observation → Mechanism)'
    )
    await userEvent.clear(observationToMechanismGenerationPrompt)
    await userEvent.type(
      observationToMechanismGenerationPrompt,
      'Custom observation to mechanism generation prompt'
    )

    const mechanismToValidationGenerationPrompt = screen.getByLabelText(
      'Generation Prompt (Mechanism → Validation)'
    )
    await userEvent.clear(mechanismToValidationGenerationPrompt)
    await userEvent.type(
      mechanismToValidationGenerationPrompt,
      'Custom mechanism to validation generation prompt'
    )

    await userEvent.click(screen.getByRole('button', { name: 'Save Prompt Settings' }))

    expect(onClose).toHaveBeenCalled()
    expect(savePromptSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        nextStepsObservationToMechanismPromptTemplate:
          'Custom observation to mechanism generation prompt',
        nextStepsMechanismToValidationPromptTemplate:
          'Custom mechanism to validation generation prompt',
      })
    )
  })

  it('saves selected theme from general tab', async () => {
    render(<SettingsModal isOpen={true} onClose={onClose} />)
    await waitFor(() => expect(loadApiKeys).toHaveBeenCalled())

    const themeSelect = screen.getByLabelText(/Theme|settings\.general\.theme/)
    await userEvent.selectOptions(themeSelect, 'dark')

    await userEvent.click(screen.getByRole('button', { name: 'Save General Settings' }))

    expect(setThemeMock).toHaveBeenCalledWith('dark')
    expect(onClose).toHaveBeenCalled()
  })
})
