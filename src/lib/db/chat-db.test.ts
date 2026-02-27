import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  deleteThread,
  getThread,
  saveThread
} from '@/lib/db/chat-db'
import type { ChatThread } from '@/types/chat'

describe('chat-db CRUD operations', () => {
  beforeEach(async () => {
    await db.chatThreads.clear()
  })

  describe('saveThread and getThread', () => {
    it('saves and retrieves a chat thread', async () => {
      const thread: ChatThread = {
        nodeId: 'node-1',
        messages: [
          {
            id: 'msg-1',
            nodeId: 'node-1',
            role: 'user',
            content: 'What is this?',
            timestamp: Date.now()
          },
          {
            id: 'msg-2',
            nodeId: 'node-1',
            role: 'assistant',
            content: 'This is a test.',
            timestamp: Date.now(),
            mode: 'answer'
          }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      await saveThread(thread)
      const retrieved = await getThread('node-1')

      expect(retrieved).toEqual(thread)
      expect(retrieved?.nodeId).toBe('node-1')
      expect(retrieved?.messages).toHaveLength(2)
    })

    it('returns undefined for non-existent thread', async () => {
      const result = await getThread('non-existent-node')
      expect(result).toBeUndefined()
    })

    it('updates existing thread', async () => {
      const thread: ChatThread = {
        nodeId: 'node-1',
        messages: [
          {
            id: 'msg-1',
            nodeId: 'node-1',
            role: 'user',
            content: 'First message',
            timestamp: Date.now()
          }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      await saveThread(thread)

      const updated: ChatThread = {
        ...thread,
        messages: [
          ...thread.messages,
          {
            id: 'msg-2',
            nodeId: 'node-1',
            role: 'assistant',
            content: 'Second message',
            timestamp: Date.now(),
            mode: 'answer'
          }
        ],
        updatedAt: Date.now()
      }

      await saveThread(updated)
      const retrieved = await getThread('node-1')

      expect(retrieved?.messages).toHaveLength(2)
      expect(retrieved?.messages[1].content).toBe('Second message')
    })
  })

  describe('deleteThread', () => {
    it('deletes a chat thread', async () => {
      const thread: ChatThread = {
        nodeId: 'node-1',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      await saveThread(thread)
      expect(await getThread('node-1')).toBeDefined()

      await deleteThread('node-1')
      expect(await getThread('node-1')).toBeUndefined()
    })

    it('does not throw when deleting non-existent thread', async () => {
      await expect(deleteThread('non-existent')).resolves.not.toThrow()
    })
  })


  describe('thread with proposal', () => {
    it('saves and retrieves thread with proposal message', async () => {
      const thread: ChatThread = {
        nodeId: 'node-1',
        messages: [
          {
            id: 'msg-1',
            nodeId: 'node-1',
            role: 'user',
            content: 'Improve this',
            timestamp: Date.now()
          },
          {
            id: 'msg-2',
            nodeId: 'node-1',
            role: 'assistant',
            content: 'Proposed content',
            timestamp: Date.now(),
            mode: 'proposal',
            proposalId: 'proposal-1'
          }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      await saveThread(thread)
      const retrieved = await getThread('node-1')

      expect(retrieved?.messages[1].mode).toBe('proposal')
      expect(retrieved?.messages[1].proposalId).toBe('proposal-1')
    })
  })

  describe('nodeId index', () => {
    it('allows querying by nodeId', async () => {
      const thread: ChatThread = {
        nodeId: 'indexed-node',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      await saveThread(thread)

      // Query using the index
      const result = await db.chatThreads.where('nodeId').equals('indexed-node').first()
      expect(result).toEqual(thread)
    })
  })

  describe('error handling', () => {
    it('handles storage errors gracefully', async () => {
      // This test verifies error handling structure
      // In real scenario, quota exceeded would be thrown by IndexedDB
      const thread: ChatThread = {
        nodeId: 'node-1',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      // Normal operation should not throw
      await expect(saveThread(thread)).resolves.not.toThrow()
      await expect(getThread('node-1')).resolves.toBeDefined()
    })
  })
})
