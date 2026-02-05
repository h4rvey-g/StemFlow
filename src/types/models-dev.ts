/**
 * Models.dev API types
 *
 * Source: https://models.dev/api.json
 *
 * Notes:
 * - Fields are marked optional (?) when not present on every model/provider
 * - Unknown extra fields are allowed via index signature
 * - Cost units: per 1M tokens (input/output)
 * - Limit units: token counts for context window and max output
 */

export type Modality = 'text' | 'image' | 'audio' | 'video' | 'pdf'

export interface Modalities {
  /** Input modalities the model accepts (e.g. "text", "image", "audio") */
  input: Modality[]
  /** Output modalities the model produces (usually "text") */
  output: Modality[]
}

/** Cost per 1M tokens */
export interface ModelCost {
  /** Cost for model input per 1M tokens */
  input: number
  /** Cost for model output per 1M tokens */
  output: number
}

/** Token limits for context window and output */
export interface ModelLimit {
  /** Context window size in tokens */
  context: number
  /** Max output length in tokens */
  output: number
}

/** Single model entry (value in provider.models map) */
export interface ModelEntry {
  /** Canonical model id (matches the key) */
  id: string
  /** Human-readable name */
  name?: string
  /** Model family (e.g. 'qwen', 'gemma', 'gpt-oss') */
  family?: string
  /** Whether the model accepts attachments */
  attachment?: boolean
  /** Whether the model supports interleaved input */
  interleaved?: boolean
  /** Whether model performs general reasoning */
  reasoning?: boolean
  /** Supports tool calling */
  tool_call?: boolean
  /** Supports structured output */
  structured_output?: boolean
  /** Whether a temperature parameter is supported */
  temperature?: boolean
  /** Knowledge cutoff date (e.g. '2025-06') */
  knowledge?: string
  /** ISO date string for release date */
  release_date?: string
  /** ISO date string for last updated */
  last_updated?: string
  /** Supported input/output modalities */
  modalities?: Modalities
  /** Whether model weights are open */
  open_weights?: boolean
  /** Cost information (per 1M tokens) */
  cost?: ModelCost
  /** Usage limits like context and output window */
  limit?: ModelLimit
  /** Provider id reference */
  provider?: string
  /** Provider-specific status */
  status?: string
  /** Fallback for future/unknown fields */
  [k: string]: unknown
}

/** Provider-level metadata */
export interface Provider {
  /** Canonical provider id (key in top-level object) */
  id: string
  /** Environment variables recommended/required (e.g. API keys, endpoints) */
  env?: string[]
  /** npm package hint */
  npm?: string
  /** API base URL or endpoint */
  api?: string
  /** Display name for the provider */
  name?: string
  /** Documentation URL */
  doc?: string
  /** Map of model-id -> model entry */
  models: Record<string, ModelEntry>
  /** Allow future/unknown fields on provider */
  [k: string]: unknown
}

/** Full models.dev snapshot type: top-level mapping provider-id -> Provider */
export type ModelsDevSnapshot = Record<string, Provider>
