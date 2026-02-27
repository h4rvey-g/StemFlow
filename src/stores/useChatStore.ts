import { create } from 'zustand'

import type { ProposalPayload } from '@/types/chat'

interface PendingProposal {
  nodeId: string
  proposalId: string
  payload: ProposalPayload
}

interface ChatStoreState {
  activeChatNodeId: string | null
  pendingProposal: PendingProposal | null
}

interface ChatStoreActions {
  openChat: (nodeId: string) => void
  closeChat: () => void
  setPendingProposal: (proposal: PendingProposal) => void
  clearPendingProposal: () => void
}

type ChatStore = ChatStoreState & ChatStoreActions

/**
 * Zustand store for chat UI state (ephemeral, not persisted).
 * Manages active chat node and pending proposal review state.
 */
export const useChatStore = create<ChatStore>((set) => ({
  activeChatNodeId: null,
  pendingProposal: null,

  openChat: (nodeId) => {
    set({ activeChatNodeId: nodeId })
  },

  closeChat: () => {
    set({ activeChatNodeId: null, pendingProposal: null })
  },

  setPendingProposal: (proposal) => {
    set({ pendingProposal: proposal })
  },

  clearPendingProposal: () => {
    set({ pendingProposal: null })
  },
}))
