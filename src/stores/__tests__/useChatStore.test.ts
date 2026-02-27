import { beforeEach, describe, expect, it } from 'vitest'

import { useChatStore } from '@/stores/useChatStore'

const CHAT_NODE_ID = 'node-chat-1'
const PROPOSAL_ID = 'proposal-1'

const resetStore = () => {
  useChatStore.setState({
    activeChatNodeId: null,
    pendingProposal: null,
  })
}

describe('useChatStore', () => {
  beforeEach(() => {
    resetStore()
  })

  it('opens and closes chat', () => {
    useChatStore.getState().openChat(CHAT_NODE_ID)
    expect(useChatStore.getState().activeChatNodeId).toBe(CHAT_NODE_ID)

    useChatStore.getState().closeChat()
    expect(useChatStore.getState().activeChatNodeId).toBeNull()
  })

  it('clears pending proposal when closing chat', () => {
    useChatStore.getState().openChat(CHAT_NODE_ID)
    useChatStore.getState().setPendingProposal({
      nodeId: CHAT_NODE_ID,
      proposalId: PROPOSAL_ID,
      payload: {
        title: 'Test Proposal',
        content: 'New content',
        rationale: 'Because it is better',
      },
    })

    useChatStore.getState().closeChat()
    expect(useChatStore.getState().pendingProposal).toBeNull()
  })

  it('sets and clears pending proposal', () => {
    const proposal = {
      nodeId: CHAT_NODE_ID,
      proposalId: PROPOSAL_ID,
      payload: {
        title: 'Update Title',
        content: 'Updated content here',
        rationale: 'Improved clarity',
        confidence: 0.85,
      },
    }

    useChatStore.getState().setPendingProposal(proposal)
    expect(useChatStore.getState().pendingProposal).toEqual(proposal)

    useChatStore.getState().clearPendingProposal()
    expect(useChatStore.getState().pendingProposal).toBeNull()
  })

  it('keeps active chat node when clearing proposal', () => {
    useChatStore.getState().openChat(CHAT_NODE_ID)
    useChatStore.getState().setPendingProposal({
      nodeId: CHAT_NODE_ID,
      proposalId: PROPOSAL_ID,
      payload: {
        title: 'Test',
        content: 'Content',
        rationale: 'Reason',
      },
    })

    useChatStore.getState().clearPendingProposal()
    expect(useChatStore.getState().activeChatNodeId).toBe(CHAT_NODE_ID)
    expect(useChatStore.getState().pendingProposal).toBeNull()
  })

  it('switches active chat node', () => {
    const nodeId1 = 'node-1'
    const nodeId2 = 'node-2'

    useChatStore.getState().openChat(nodeId1)
    expect(useChatStore.getState().activeChatNodeId).toBe(nodeId1)

    useChatStore.getState().openChat(nodeId2)
    expect(useChatStore.getState().activeChatNodeId).toBe(nodeId2)
  })

  it('replaces pending proposal when setting new one', () => {
    const proposal1 = {
      nodeId: CHAT_NODE_ID,
      proposalId: 'proposal-1',
      payload: {
        title: 'First',
        content: 'First content',
        rationale: 'First reason',
      },
    }

    const proposal2 = {
      nodeId: CHAT_NODE_ID,
      proposalId: 'proposal-2',
      payload: {
        title: 'Second',
        content: 'Second content',
        rationale: 'Second reason',
      },
    }

    useChatStore.getState().setPendingProposal(proposal1)
    expect(useChatStore.getState().pendingProposal?.proposalId).toBe('proposal-1')

    useChatStore.getState().setPendingProposal(proposal2)
    expect(useChatStore.getState().pendingProposal?.proposalId).toBe('proposal-2')
  })
})
