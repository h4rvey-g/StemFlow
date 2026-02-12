import nodeGenerationPromptTemplate from '@/prompts/node-generation-prompt.md?raw'

export interface PromptSettings {
  visionSystemPrompt: string
  visionUserPromptWithContextTemplate: string
  visionUserPromptWithoutContext: string
  ratingExtractionSystemPrompt: string
  ratingExtractionUserPromptTemplate: string
  gradeSystemPrompt: string
  gradeUserPromptTemplate: string
  gradeGlobalGoalFallback: string
  nodeGuidanceHighPriorityHeading: string
  nodeGuidanceNoHighPriorityText: string
  nodeGuidanceAvoidHeading: string
  nodeGuidanceTypeLabel: string
  nodeGuidanceContentLabel: string
  nextStepsNoGradedNodesText: string
  nextStepsGlobalGoalFallback: string
  nextStepsAncestryContextFallback: string
  nextStepsPromptTemplate: string
  useAiSystemPrompt: string
  useAiUserMessageTemplate: string
  useAiActionSummarizeInstruction: string
  useAiActionSuggestMechanismInstruction: string
  useAiActionCritiqueInstruction: string
  useAiActionExpandInstruction: string
  useAiActionQuestionsInstruction: string
}

const PROMPT_SETTINGS_STORAGE = 'stemflow:prompt-settings'

const toPromptTemplate = (lines: string[]): string => lines.join('\n')

export const DEFAULT_PROMPT_SETTINGS: PromptSettings = {
  visionSystemPrompt:
    'You are a scientific research assistant. Describe uploaded images clearly and concisely for experiment documentation. Focus on observable structures, labels, axes, and notable patterns. Avoid speculation.',
  visionUserPromptWithContextTemplate:
    'Provide a concise description of this image for the following node context: {{context}}',
  visionUserPromptWithoutContext:
    'Provide a concise description of this image for a scientific research node.',
  ratingExtractionSystemPrompt:
    'Extract a 1-5 integer rating from the provided text. Return exactly one integer digit from 1 to 5.',
  ratingExtractionUserPromptTemplate: toPromptTemplate(['Text:', '{{text}}']),
  gradeSystemPrompt:
    'You are a strict scientific reviewer. Output must be valid JSON with a single integer rating from 1 to 5.',
  gradeUserPromptTemplate: toPromptTemplate([
    'Evaluate this OMV research node and assign a star rating from 1 to 5.',
    'Use this scale:',
    '- 5: Strong, clear, high-confidence node that should guide future work.',
    '- 4: Promising node with good evidence and practical value.',
    '- 3: Neutral/mixed evidence; useful but not decisive.',
    '- 2: Weak evidence, unclear mechanism, or limited usefulness.',
    '- 1: Poor, contradictory, or misleading node to avoid.',
    'Global research goal: {{goal}}',
    'Node ID: {{nodeId}}',
    'Node type: {{nodeType}}',
    'Node content: {{nodeContent}}',
    'Respond with ONLY JSON in this shape: {"rating": <1-5>}',
  ]),
  gradeGlobalGoalFallback: 'No global goal provided.',
  nodeGuidanceHighPriorityHeading: 'High-priority nodes (grade 4-5):',
  nodeGuidanceNoHighPriorityText: 'No nodes graded 4 or 5 yet.',
  nodeGuidanceAvoidHeading: 'Nodes to avoid (grade 1):',
  nodeGuidanceTypeLabel: 'Type',
  nodeGuidanceContentLabel: 'Content',
  nextStepsNoGradedNodesText: 'No graded nodes were provided.',
  nextStepsGlobalGoalFallback: 'No global goal provided.',
  nextStepsAncestryContextFallback: 'No ancestry context provided.',
  nextStepsPromptTemplate: nodeGenerationPromptTemplate.trim(),
  useAiSystemPrompt: 'You are assisting with scientific research using the OMV framework.',
  useAiUserMessageTemplate: '{{instruction}}\n\n{{context}}',
  useAiActionSummarizeInstruction: 'Summarize the context into a concise observation.',
  useAiActionSuggestMechanismInstruction:
    'Suggest a plausible mechanism based on the context.',
  useAiActionCritiqueInstruction: 'Critique the reasoning gaps or weaknesses in the context.',
  useAiActionExpandInstruction: 'Expand the context with additional relevant details.',
  useAiActionQuestionsInstruction:
    'Generate clarifying questions based on the context.',
}

export type PromptSettingsKey = keyof PromptSettings

export interface PromptSettingsField {
  key: PromptSettingsKey
  label: string
  description: string
  rows?: number
}

export const PROMPT_SETTINGS_FIELDS: PromptSettingsField[] = [
  {
    key: 'visionSystemPrompt',
    label: 'Vision System Prompt',
    description: 'System role for image description generation.',
    rows: 3,
  },
  {
    key: 'visionUserPromptWithContextTemplate',
    label: 'Vision Prompt With Context',
    description: 'Template for image descriptions with `{{context}}` placeholder.',
    rows: 3,
  },
  {
    key: 'visionUserPromptWithoutContext',
    label: 'Vision Prompt Without Context',
    description: 'Prompt used when no node context is available.',
    rows: 2,
  },
  {
    key: 'ratingExtractionSystemPrompt',
    label: 'Rating Extraction System Prompt',
    description: 'System role for extracting integer ratings.',
    rows: 2,
  },
  {
    key: 'ratingExtractionUserPromptTemplate',
    label: 'Rating Extraction User Template',
    description: 'Template for rating extraction with `{{text}}` placeholder.',
    rows: 3,
  },
  {
    key: 'gradeSystemPrompt',
    label: 'Node Grading System Prompt',
    description: 'System role for grading OMV nodes.',
    rows: 2,
  },
  {
    key: 'gradeUserPromptTemplate',
    label: 'Node Grading User Template',
    description:
      'Template for grading with placeholders: `{{goal}}`, `{{nodeId}}`, `{{nodeType}}`, `{{nodeContent}}`.',
    rows: 8,
  },
  {
    key: 'gradeGlobalGoalFallback',
    label: 'Node Grading Goal Fallback',
    description: 'Fallback goal text when no global goal is set for grading prompt.',
    rows: 2,
  },
  {
    key: 'nodeGuidanceHighPriorityHeading',
    label: 'Guidance High-Priority Heading',
    description: 'Section heading for 4-5 star node guidance.',
    rows: 2,
  },
  {
    key: 'nodeGuidanceNoHighPriorityText',
    label: 'Guidance Empty High-Priority Text',
    description: 'Fallback text when no 4-5 star nodes exist.',
    rows: 2,
  },
  {
    key: 'nodeGuidanceAvoidHeading',
    label: 'Guidance Avoid Heading',
    description: 'Section heading for 1-star nodes.',
    rows: 2,
  },
  {
    key: 'nodeGuidanceTypeLabel',
    label: 'Guidance Type Label',
    description: 'Label used before node type value.',
    rows: 2,
  },
  {
    key: 'nodeGuidanceContentLabel',
    label: 'Guidance Content Label',
    description: 'Label used before node content value.',
    rows: 2,
  },
  {
    key: 'nextStepsNoGradedNodesText',
    label: 'Next Steps No-Graded-Nodes Text',
    description: 'Fallback text when graded nodes context is empty.',
    rows: 2,
  },
  {
    key: 'nextStepsGlobalGoalFallback',
    label: 'Next Steps Goal Fallback',
    description: 'Fallback text when no global goal is set.',
    rows: 2,
  },
  {
    key: 'nextStepsAncestryContextFallback',
    label: 'Next Steps Ancestry Fallback',
    description: 'Fallback text when ancestry context is empty.',
    rows: 2,
  },
  {
    key: 'nextStepsPromptTemplate',
    label: 'Next Steps Master Template',
    description:
      'Main template for step generation with placeholders: `{{goal}}`, `{{context}}`, `{{currentType}}`, `{{expectedType}}`, `{{nodesContext}}`.',
    rows: 12,
  },
  {
    key: 'useAiSystemPrompt',
    label: 'Node AI System Prompt',
    description: 'System role for in-node AI actions.',
    rows: 2,
  },
  {
    key: 'useAiUserMessageTemplate',
    label: 'Node AI User Message Template',
    description: 'User message template with `{{instruction}}` and `{{context}}` placeholders.',
    rows: 4,
  },
  {
    key: 'useAiActionSummarizeInstruction',
    label: 'Node AI Summarize Instruction',
    description: 'Instruction text for summarize action.',
    rows: 2,
  },
  {
    key: 'useAiActionSuggestMechanismInstruction',
    label: 'Node AI Suggest Mechanism Instruction',
    description: 'Instruction text for suggest-mechanism action.',
    rows: 2,
  },
  {
    key: 'useAiActionCritiqueInstruction',
    label: 'Node AI Critique Instruction',
    description: 'Instruction text for critique action.',
    rows: 2,
  },
  {
    key: 'useAiActionExpandInstruction',
    label: 'Node AI Expand Instruction',
    description: 'Instruction text for expand action.',
    rows: 2,
  },
  {
    key: 'useAiActionQuestionsInstruction',
    label: 'Node AI Questions Instruction',
    description: 'Instruction text for questions action.',
    rows: 2,
  },
]

const PROMPT_SETTING_KEYS = Object.keys(DEFAULT_PROMPT_SETTINGS) as PromptSettingsKey[]

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null

  try {
    const { localStorage } = window
    if (!localStorage) return null

    const testKey = '__stemflow_prompt_settings_test__'
    localStorage.setItem(testKey, '1')
    localStorage.removeItem(testKey)

    return localStorage
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const normalizePromptSettings = (value: unknown): PromptSettings => {
  if (!isRecord(value)) {
    return { ...DEFAULT_PROMPT_SETTINGS }
  }

  const normalized = { ...DEFAULT_PROMPT_SETTINGS }
  for (const key of PROMPT_SETTING_KEYS) {
    const candidate = value[key]
    if (typeof candidate === 'string') {
      normalized[key] = candidate
    }
  }

  return normalized
}

export const loadPromptSettings = (): PromptSettings => {
  const storage = getStorage()
  if (!storage) {
    return { ...DEFAULT_PROMPT_SETTINGS }
  }

  try {
    const raw = storage.getItem(PROMPT_SETTINGS_STORAGE)
    if (!raw) {
      return { ...DEFAULT_PROMPT_SETTINGS }
    }

    const parsed: unknown = JSON.parse(raw)
    return normalizePromptSettings(parsed)
  } catch {
    return { ...DEFAULT_PROMPT_SETTINGS }
  }
}

export const savePromptSettings = (
  settings: PromptSettings
): { success: boolean; error?: string } => {
  const storage = getStorage()
  if (!storage) {
    return { success: false, error: 'Browser storage unavailable' }
  }

  try {
    const normalized = normalizePromptSettings(settings)
    storage.setItem(PROMPT_SETTINGS_STORAGE, JSON.stringify(normalized))
    return { success: true }
  } catch (error) {
    const name =
      error && typeof error === 'object' && 'name' in error
        ? String((error as { name?: unknown }).name)
        : undefined

    const message =
      error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message)
        : error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : ''

    if (name === 'QuotaExceededError') {
      return { success: false, error: 'Storage quota exceeded' }
    }

    if (message) {
      return { success: false, error: `Failed to save: ${name ? `${name}: ` : ''}${message}` }
    }

    return { success: false, error: `Failed to save prompt settings${name ? `: ${name}` : ''}` }
  }
}

export const interpolatePromptTemplate = (
  template: string,
  values: Record<string, string>
): string =>
  template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => values[key] ?? '')
