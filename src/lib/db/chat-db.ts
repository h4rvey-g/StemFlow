import type { ChatThread } from '@/types/chat'
import { db } from '@/lib/db'

/**
 * Get chat thread for a node
 * @param nodeId - Node ID to retrieve thread for
 * @returns ChatThread or undefined if not found
 */
export async function getThread(nodeId: string): Promise<ChatThread | undefined> {
  try {
    return await db.chatThreads.get(nodeId)
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      throw new Error('Storage quota exceeded: cannot retrieve chat thread')
    }
    throw error
  }
}

/**
 * Save or update chat thread for a node
 * @param thread - ChatThread to save
 * @throws Error if storage quota exceeded
 */
export async function saveThread(thread: ChatThread): Promise<void> {
  try {
    await db.chatThreads.put(thread)
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      throw new Error('Storage quota exceeded: cannot save chat thread')
    }
    throw error
  }
}

/**
 * Delete chat thread for a node
 * @param nodeId - Node ID to delete thread for
 */
export async function deleteThread(nodeId: string): Promise<void> {
  try {
    await db.chatThreads.delete(nodeId)
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      throw new Error('Storage quota exceeded: cannot delete chat thread')
    }
    throw error
  }
}
