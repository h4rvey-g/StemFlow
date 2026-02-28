/**
 * Chat types for per-node AI chat panel
 */

/**
 * A single message in a chat thread (legacy v1 format — kept for migration only)
 */
export interface ChatMessage {
  /** Unique message ID */
  id: string
  /** Node this message belongs to */
  nodeId: string
  /** Message role */
  role: 'user' | 'assistant'
  /** Message content */
  content: string
  /** Timestamp when message was created */
  timestamp: number
  /** Response mode (only for assistant messages) */
  mode?: 'answer' | 'proposal'
  /** Proposal ID if this message contains a proposal */
  proposalId?: string
}

/**
 * Proposal payload for content modification
 */
export interface ProposalPayload {
  /** Proposal title/summary */
  title: string
  /** Proposed new content */
  content: string
  /** Rationale for the proposal */
  rationale: string
  /** Confidence level (0-1) */
  confidence?: number
  /** Summary of changes (for diff preview) */
  diffSummary?: string
}

/**
 * Chat response from AI - discriminated union
 */
export type ChatResponse =
  | {
      mode: 'answer'
      answerText: string
    }
  | {
      mode: 'proposal'
      proposal: ProposalPayload
    }

/**
 * A complete chat thread for a node (legacy v1 format — kept for migration only)
 */
export interface ChatThread {
  /** Node ID this thread belongs to */
  nodeId: string
  /** All messages in this thread */
  messages: ChatMessage[]
  /** When thread was created */
  createdAt: number
  /** When thread was last updated */
  updatedAt: number
}

/**
 * Status of a proposal in the chat workflow
 */
export type ProposalStatus = 'pending' | 'accepted' | 'rejected'

// ─── V2 Multi-thread storage types ────────────────────────────────────────────

/**
 * A chat thread (v2) — one node can have multiple threads.
 * Threads are pruned to max 20 per node (oldest by updatedAt first).
 */
export interface ChatThreadV2 {
  /** Unique thread ID (UUID) */
  id: string
  /** Node ID this thread belongs to */
  nodeId: string
  /**
   * Thread title.
   * Starts as "Chat {N}" and is updated to first user message snippet (32 chars).
   */
  title: string
  /** When thread was created */
  createdAt: number
  /** When thread was last updated — used for sort order and pruning */
  updatedAt: number
}

/**
 * A single user turn within a chat thread (v2).
 * Threads are capped at 120 turns; oldest turns pruned first.
 */
export interface ChatTurn {
  /** Unique turn ID (UUID) */
  id: string
  /** Thread this turn belongs to */
  threadId: string
  /** 0-based insertion order within thread */
  seq: number
  /** The user's message text */
  userText: string
  /** When the user sent this message */
  userCreatedAt: number
  /**
   * Which assistant variant ordinal is "selected" for use in AI context.
   * null means the first complete variant is implicitly used, or no variant exists yet.
   */
  selectedVariantOrdinal: number | null
}

/**
 * One assistant response version for a user turn (v2).
 * Each regeneration appends a new variant with incrementing ordinal.
 * Turns are capped at 5 variants; oldest non-selected variants pruned first.
 */
export interface AssistantVariant {
  /** Unique variant ID (UUID) */
  id: string
  /** Turn this variant belongs to */
  turnId: string
  /** 0-based generation ordinal; increments with each regeneration */
  ordinal: number
  /** Lifecycle status of this variant */
  status: 'streaming' | 'complete' | 'error' | 'aborted'
  /** Response mode */
  mode: 'answer' | 'proposal'
  /** Full text content of the response (streaming partials written here too) */
  contentText: string
  /** Proposal payload — only present when mode='proposal' */
  proposal?: ProposalPayload
  /** Proposal acceptance state — only present when mode='proposal' */
  proposalStatus?: ProposalStatus
  /** When this variant was created */
  createdAt: number
  /** When this variant was last updated */
  updatedAt: number
}

/**
 * Persists the currently active thread per node (v2).
 */
export interface NodeActiveThread {
  /** Node ID (primary key) */
  nodeId: string
  /** ID of the currently active ChatThreadV2 */
  threadId: string
}
