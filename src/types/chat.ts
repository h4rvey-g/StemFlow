/**
 * Chat types for per-node AI chat panel
 */

/**
 * A single message in a chat thread
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
 * A complete chat thread for a node
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
