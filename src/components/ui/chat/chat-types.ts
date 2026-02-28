export type ChatMessageView = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export type AssistantVariantView = {
  variantId: string
  ordinal: number
  status: 'streaming' | 'complete' | 'error' | 'aborted'
  mode: 'answer' | 'proposal'
  contentText: string
  proposal?: {
    title: string
    rationale: string
    content: string
    confidence?: number
    diffSummary?: string
  }
  proposalStatus?: 'pending' | 'accepted' | 'rejected'
}

export type ChatTurnView = {
  turnId: string
  seq: number
  userText: string
  selectedVariantOrdinal: number | null
  viewingVariantOrdinal: number | null
  variants: AssistantVariantView[]
}

export type ChatThreadView = {
  id: string
  title: string
  updatedAt: number
}

export type PendingProposalView = {
  proposalId: string
  payload: {
    title: string
    rationale: string
    content: string
  }
}
