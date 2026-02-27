import '@testing-library/jest-dom'
import { vi } from 'vitest'

// English locale keys from src/locales/en.json
const enTranslations = {
  'common.apply': 'Apply',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.loading': 'Loading...',
  'common.error': 'Error',
  'common.success': 'Success',
  'settings.title': 'Settings',
  'settings.tabs.general': 'General',
  'settings.tabs.model': 'Model Settings',
  'settings.tabs.prompts': 'Prompts',
  'settings.general.language': 'Language',
  'settings.general.languageDescription': 'Select your preferred language',
  'settings.model.provider': 'AI Provider',
  'settings.model.providerLabel': 'AI Provider',
  'settings.model.providerPlaceholder': 'Select provider...',
  'settings.model.apiKey': 'API Key',
  'settings.model.apiKeyLabel': 'API Key for {{provider}}',
  'settings.model.apiKeyPlaceholder': 'Enter {{placeholder}}',
  'settings.model.apiKeyHelper': 'Keys are stored locally and encrypted.',
  'settings.model.baseUrl': 'Base URL',
  'settings.model.baseUrlLabel': 'Custom Base URL',
  'settings.model.baseUrlPlaceholder': 'https://api.example.com/v1',
  'settings.model.baseUrlHelper': 'Used for OpenAI-compatible endpoints.',
  'settings.model.model': 'Model',
  'settings.model.thinkModelLabel': 'Think Model',
  'settings.model.thinkModelHelper': 'Used for node generation, summarization, and other reasoning tasks.',
  'settings.model.fastModel': 'Fast Model',
  'settings.model.fastModelLabel': 'Fast Model',
  'settings.model.fastModelHelper': 'Used for quick tasks like AI grading of nodes.',
  'settings.model.fetchModels': 'Fetch Models',
  'settings.model.fetching': 'Fetching...',
  'settings.model.researchGoalLabel': 'Research Goal (Optional)',
  'settings.model.researchGoalPlaceholder': 'Describe your overarching research question...',
  'settings.model.experimentalConditions': 'Experimental Conditions',
  'settings.model.experimentalConditionsDescription': 'Select the types of experiments you work with. AI suggestions will be tailored accordingly.',
  'settings.model.dryLab': 'Dry Lab Experiment',
  'settings.model.wetLab': 'Wet Lab Experiment',
  'settings.model.showKey': 'Show',
  'settings.model.hideKey': 'Hide',
  'settings.prompts.nodeGeneration': 'Node Generation Prompt',
  'settings.prompts.editorHelper': 'Node generation prompts are editable. Supported placeholders: {{goal}}, {{experimentalConditions}}, {{context}}, {{currentType}}, {{expectedType}}, {{nodesContext}}.',
  'settings.prompts.resetButton': 'Reset Default',
  'settings.prompts.observationToMechanismLabel': 'Generation Prompt (Observation → Mechanism)',
  'settings.prompts.observationToMechanismHelper': 'Template used when generating from observation nodes.',
  'settings.prompts.mechanismToValidationLabel': 'Generation Prompt (Mechanism → Validation)',
  'settings.prompts.mechanismToValidationHelper': 'Template used when generating from mechanism nodes.',
  'settings.prompts.suggestMechanismFromObservation': 'Suggest Mechanism from Observation',
  'settings.prompts.suggestValidationFromMechanism': 'Suggest Validation from Mechanism',
  'settings.prompts.resetToDefault': 'Reset to Default',
  'settings.status.saved': 'Settings saved successfully',
  'settings.status.error': 'Failed to save settings',
  'settings.actions.saveModel': 'Save Model Settings',
  'settings.actions.savePrompt': 'Save Prompt Settings',
  'settings.actions.saveGeneral': 'Save General Settings',
  'sidebar.projects': 'Projects',
  'sidebar.newProject': 'New Project',
  'sidebar.defaultProjectName': 'New Project',
  'sidebar.nodesHeading': 'Nodes',
  'sidebar.dragBadge': 'Drag',
  'sidebar.nodesHelper': 'Drag these nodes to the canvas.',
  'sidebar.deleteProject': 'Delete Project',
  'sidebar.settings': 'Settings',
  'sidebar.deleteConfirm': 'Are you sure you want to delete this project? This action cannot be undone.',
  'sidebar.nodes.observation': 'Observation',
  'sidebar.nodes.mechanism': 'Mechanism',
  'sidebar.nodes.validation': 'Validation',
  'popover.title': 'Node Actions',
  'popover.actions.summarize': 'Summarize',
  'popover.actions.suggestMechanism': 'Suggest Mechanism',
  'popover.actions.suggestValidation': 'Suggest Validation',
  'popover.actions.critique': 'Critique',
  'popover.actions.expand': 'Expand',
  'popover.actions.generateQuestions': 'Generate Questions',
  'popover.actions.translation': 'Translation',
  'popover.actions.chat': 'Chat',
  'popover.translation.languageLabel': 'Target language',
  'popover.translation.translate': 'Translate',
  'popover.translation.languages.zhCN': '简体中文',
  'popover.translation.languages.en': 'English',
  'popover.status.active': 'Active: {{action}}',
}

// Mock react-i18next with English-passthrough strategy
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, any>) => {
      const translation = enTranslations[key as keyof typeof enTranslations]
      if (!translation) return key
      
      // Handle interpolation
      if (options && typeof translation === 'string') {
        return Object.entries(options).reduce(
          (str, [k, v]) => str.replace(new RegExp(`{{${k}}}`, 'g'), String(v)),
          translation
        )
      }
      
      return translation
    },
    i18n: {
      language: 'en',
      changeLanguage: vi.fn(),
    },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
}))
