import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { StemFlowDB } from '@/lib/db'
import {
  deleteThread,
  getThread,
  saveThread,
  migrateLegacyChatThreads,
  createThreadV2,
  listThreadsV2,
  appendTurn,
  listTurns,
  appendVariant,
  listVariants,
  setSelectedVariant,
  MAX_THREADS_PER_NODE,
  MAX_TURNS_PER_THREAD,
  MAX_VARIANTS_PER_TURN
} from '@/lib/db/chat-db'
import type { ChatThread } from '@/types/chat'

// ─── Legacy V1 tests ──────────────────────────────────────────────────────────

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

// ─── V2 tests — use injectable DB for full isolation ─────────────────────────

/**
 * Create a fresh StemFlowDB instance backed by a new in-memory IDB store.
 * fake-indexeddb/auto patches globalThis.indexedDB, so each `new StemFlowDB()`
 * with a unique name gets its own isolated store.
 */
let dbCounter = 0
function freshDb(): StemFlowDB {
  // Each call gets a unique DB name so stores never collide across tests
  return new StemFlowDB(`StemFlowDB-test-${++dbCounter}`)
}

describe('chat-db v2 — migrateLegacyChatThreads', () => {
  it('migrates legacy thread to v2 thread, turns, and variants', async () => {
    const testDb = freshDb()
    const now = Date.now()

    // Seed a legacy v1 thread with 2 user+assistant pairs
    const legacy: ChatThread = {
      nodeId: 'node-migrate-1',
      messages: [
        { id: 'm1', nodeId: 'node-migrate-1', role: 'user', content: 'Q1', timestamp: now },
        { id: 'm2', nodeId: 'node-migrate-1', role: 'assistant', content: 'A1', timestamp: now + 1, mode: 'answer' },
        { id: 'm3', nodeId: 'node-migrate-1', role: 'user', content: 'Q2', timestamp: now + 2 },
        { id: 'm4', nodeId: 'node-migrate-1', role: 'assistant', content: 'A2', timestamp: now + 3, mode: 'answer' }
      ],
      createdAt: now,
      updatedAt: now + 3
    }
    await testDb.chatThreads.put(legacy)

    await migrateLegacyChatThreads(testDb)

    // One v2 thread created for the node
    const v2Threads = await testDb.chatThreadsV2.where('nodeId').equals('node-migrate-1').toArray()
    expect(v2Threads).toHaveLength(1)
    expect(v2Threads[0].nodeId).toBe('node-migrate-1')
    expect(v2Threads[0].title).toBe('Migrated Chat')

    // Two turns created (one per user message)
    const threadId = v2Threads[0].id
    const turns = await testDb.chatTurns.where('threadId').equals(threadId).toArray()
    expect(turns).toHaveLength(2)

    const sortedTurns = turns.sort((a, b) => a.seq - b.seq)
    expect(sortedTurns[0].userText).toBe('Q1')
    expect(sortedTurns[1].userText).toBe('Q2')

    // Two variants created (one per assistant message)
    const variants0 = await testDb.chatVariants.where('turnId').equals(sortedTurns[0].id).toArray()
    expect(variants0).toHaveLength(1)
    expect(variants0[0].contentText).toBe('A1')
    expect(variants0[0].ordinal).toBe(0)
    expect(variants0[0].status).toBe('complete')

    const variants1 = await testDb.chatVariants.where('turnId').equals(sortedTurns[1].id).toArray()
    expect(variants1).toHaveLength(1)
    expect(variants1[0].contentText).toBe('A2')

    // Active thread set for node
    const active = await testDb.nodeActiveThread.get('node-migrate-1')
    expect(active?.threadId).toBe(threadId)

    await testDb.close()
  })

  it('migrates user-only turn (no assistant reply) with null selectedVariantOrdinal', async () => {
    const testDb = freshDb()
    const now = Date.now()

    const legacy: ChatThread = {
      nodeId: 'node-migrate-2',
      messages: [
        { id: 'm1', nodeId: 'node-migrate-2', role: 'user', content: 'Unanswered', timestamp: now }
      ],
      createdAt: now,
      updatedAt: now
    }
    await testDb.chatThreads.put(legacy)

    await migrateLegacyChatThreads(testDb)

    const v2Threads = await testDb.chatThreadsV2.where('nodeId').equals('node-migrate-2').toArray()
    expect(v2Threads).toHaveLength(1)

    const turns = await testDb.chatTurns.where('threadId').equals(v2Threads[0].id).toArray()
    expect(turns).toHaveLength(1)
    expect(turns[0].selectedVariantOrdinal).toBeNull()

    const variants = await testDb.chatVariants.where('turnId').equals(turns[0].id).toArray()
    expect(variants).toHaveLength(0)

    await testDb.close()
  })

  it('migration is idempotent — second call does not duplicate v2 records', async () => {
    const testDb = freshDb()
    const now = Date.now()

    const legacy: ChatThread = {
      nodeId: 'node-idempotent',
      messages: [
        { id: 'm1', nodeId: 'node-idempotent', role: 'user', content: 'Hello', timestamp: now },
        { id: 'm2', nodeId: 'node-idempotent', role: 'assistant', content: 'Hi', timestamp: now + 1, mode: 'answer' }
      ],
      createdAt: now,
      updatedAt: now + 1
    }
    await testDb.chatThreads.put(legacy)

    // Run migration twice
    await migrateLegacyChatThreads(testDb)
    await migrateLegacyChatThreads(testDb)

    // Still exactly one v2 thread
    const v2Threads = await testDb.chatThreadsV2.where('nodeId').equals('node-idempotent').toArray()
    expect(v2Threads).toHaveLength(1)

    // Still exactly one turn
    const turns = await testDb.chatTurns.where('threadId').equals(v2Threads[0].id).toArray()
    expect(turns).toHaveLength(1)

    // Still exactly one variant
    const variants = await testDb.chatVariants.where('turnId').equals(turns[0].id).toArray()
    expect(variants).toHaveLength(1)

    await testDb.close()
  })

  it('skips standalone assistant messages without a preceding user turn', async () => {
    const testDb = freshDb()
    const now = Date.now()

    const legacy: ChatThread = {
      nodeId: 'node-standalone-asst',
      messages: [
        // Starts with assistant — should be skipped
        { id: 'm1', nodeId: 'node-standalone-asst', role: 'assistant', content: 'Orphan', timestamp: now, mode: 'answer' },
        { id: 'm2', nodeId: 'node-standalone-asst', role: 'user', content: 'Real Q', timestamp: now + 1 },
        { id: 'm3', nodeId: 'node-standalone-asst', role: 'assistant', content: 'Real A', timestamp: now + 2, mode: 'answer' }
      ],
      createdAt: now,
      updatedAt: now + 2
    }
    await testDb.chatThreads.put(legacy)

    await migrateLegacyChatThreads(testDb)

    const v2Threads = await testDb.chatThreadsV2.where('nodeId').equals('node-standalone-asst').toArray()
    const turns = await testDb.chatTurns.where('threadId').equals(v2Threads[0].id).toArray()
    // Only the real user turn should be migrated
    expect(turns).toHaveLength(1)
    expect(turns[0].userText).toBe('Real Q')

    await testDb.close()
  })
})

describe('chat-db v2 — thread cap (max 20 per node)', () => {
  it(`prunes oldest threads when count exceeds ${MAX_THREADS_PER_NODE}`, async () => {
    const testDb = freshDb()
    const nodeId = 'node-thread-cap'

    // Create MAX + 1 threads with staggered updatedAt so order is deterministic
    const createdIds: string[] = []
    for (let i = 0; i < MAX_THREADS_PER_NODE + 1; i++) {
      // Manually insert with controlled updatedAt to avoid timestamp collisions
      const id = `thread-cap-${i}`
      await testDb.chatThreadsV2.put({
        id,
        nodeId,
        title: `Chat ${i + 1}`,
        createdAt: 1000 + i,
        updatedAt: 1000 + i   // ascending — thread-cap-0 is oldest
      })
      createdIds.push(id)
    }

    // Trigger pruning by creating one more via the facade
    const newest = await createThreadV2(nodeId, 'Trigger prune', testDb)

    const remaining = await listThreadsV2(nodeId, testDb)
    expect(remaining).toHaveLength(MAX_THREADS_PER_NODE)

    // The oldest thread (thread-cap-0, updatedAt=1000) must have been pruned
    const oldestStillExists = remaining.some((t) => t.id === createdIds[0])
    expect(oldestStillExists).toBe(false)

    // The newest thread must still exist
    const newestStillExists = remaining.some((t) => t.id === newest.id)
    expect(newestStillExists).toBe(true)

    await testDb.close()
  })
})

describe('chat-db v2 — turn cap (max 120 per thread)', () => {
  it(`prunes oldest turns when count exceeds ${MAX_TURNS_PER_THREAD}`, async () => {
    const testDb = freshDb()
    const nodeId = 'node-turn-cap'
    const thread = await createThreadV2(nodeId, 'Turn cap thread', testDb)

    // Insert MAX turns directly (bypass facade to avoid slow loop)
    const turnRecords = Array.from({ length: MAX_TURNS_PER_THREAD }, (_, i) => ({
      id: `turn-${i}`,
      threadId: thread.id,
      seq: i,
      userText: `Q${i}`,
      userCreatedAt: 1000 + i,
      selectedVariantOrdinal: null as null
    }))
    await testDb.chatTurns.bulkPut(turnRecords)

    // Append one more via facade — triggers pruning
    const extraTurn = await appendTurn(thread.id, 'Extra Q', testDb)

    const remaining = await listTurns(thread.id, testDb)
    expect(remaining).toHaveLength(MAX_TURNS_PER_THREAD)

    // Oldest turn (seq=0, id=turn-0) must be pruned
    const oldestStillExists = remaining.some((t) => t.id === 'turn-0')
    expect(oldestStillExists).toBe(false)

    // The extra turn must still exist
    const extraStillExists = remaining.some((t) => t.id === extraTurn.id)
    expect(extraStillExists).toBe(true)

    await testDb.close()
  }, 15000)
})

describe('chat-db v2 — variant cap (max 5 per turn)', () => {
  it(`prunes oldest non-selected variants when count exceeds ${MAX_VARIANTS_PER_TURN}`, async () => {
    const testDb = freshDb()
    const nodeId = 'node-variant-cap'
    const thread = await createThreadV2(nodeId, 'Variant cap thread', testDb)
    const turn = await appendTurn(thread.id, 'User question', testDb)

    // Add MAX variants
    for (let i = 0; i < MAX_VARIANTS_PER_TURN; i++) {
      await appendVariant(turn.id, { status: 'complete', mode: 'answer', contentText: `Answer ${i}` }, testDb)
    }

    // Select ordinal 2 as the "keeper"
    await setSelectedVariant(turn.id, 2, testDb)

    // Add one more — triggers pruning; ordinal 0 (oldest non-selected) should be removed
    const extra = await appendVariant(turn.id, { status: 'complete', mode: 'answer', contentText: 'Extra answer' }, testDb)

    const remaining = await listVariants(turn.id, testDb)
    expect(remaining).toHaveLength(MAX_VARIANTS_PER_TURN)

    // Ordinal 0 (oldest non-selected) must be pruned
    const ordinal0Exists = remaining.some((v) => v.ordinal === 0)
    expect(ordinal0Exists).toBe(false)

    // Selected ordinal 2 must survive
    const selectedExists = remaining.some((v) => v.ordinal === 2)
    expect(selectedExists).toBe(true)

    // The extra (newest) variant must survive
    const extraExists = remaining.some((v) => v.id === extra.id)
    expect(extraExists).toBe(true)

    await testDb.close()
  })

  it('preserves selected variant even when it is the oldest ordinal', async () => {
    const testDb = freshDb()
    const nodeId = 'node-variant-selected-oldest'
    const thread = await createThreadV2(nodeId, 'Selected oldest', testDb)
    const turn = await appendTurn(thread.id, 'Q', testDb)

    // Add MAX variants
    for (let i = 0; i < MAX_VARIANTS_PER_TURN; i++) {
      await appendVariant(turn.id, { status: 'complete', mode: 'answer', contentText: `V${i}` }, testDb)
    }

    // Select ordinal 0 (the oldest) as the keeper
    await setSelectedVariant(turn.id, 0, testDb)

    // Add one more — triggers pruning; ordinal 1 (next oldest non-selected) should be removed
    await appendVariant(turn.id, { status: 'complete', mode: 'answer', contentText: 'New' }, testDb)

    const remaining = await listVariants(turn.id, testDb)
    expect(remaining).toHaveLength(MAX_VARIANTS_PER_TURN)

    // Ordinal 0 (selected) must survive
    const ordinal0Exists = remaining.some((v) => v.ordinal === 0)
    expect(ordinal0Exists).toBe(true)

    // Ordinal 1 (oldest non-selected) must be pruned
    const ordinal1Exists = remaining.some((v) => v.ordinal === 1)
    expect(ordinal1Exists).toBe(false)

    await testDb.close()
  })
})

describe('chat-db v2 — CRUD operations', () => {
  it('createThreadV2 auto-titles as Chat N+1', async () => {
    const testDb = freshDb()
    const nodeId = 'node-autotitle'

    const t1 = await createThreadV2(nodeId, undefined, testDb)
    expect(t1.title).toBe('Chat 1')

    const t2 = await createThreadV2(nodeId, undefined, testDb)
    expect(t2.title).toBe('Chat 2')

    await testDb.close()
  })

  it('listThreadsV2 returns threads sorted by updatedAt descending', async () => {
    const testDb = freshDb()
    const nodeId = 'node-sort'

    await testDb.chatThreadsV2.bulkPut([
      { id: 'old', nodeId, title: 'Old', createdAt: 100, updatedAt: 100 },
      { id: 'new', nodeId, title: 'New', createdAt: 200, updatedAt: 200 }
    ])

    const threads = await listThreadsV2(nodeId, testDb)
    expect(threads[0].id).toBe('new')
    expect(threads[1].id).toBe('old')

    await testDb.close()
  })

  it('appendTurn increments seq correctly', async () => {
    const testDb = freshDb()
    const nodeId = 'node-seq'
    const thread = await createThreadV2(nodeId, 'Seq test', testDb)

    const t1 = await appendTurn(thread.id, 'First', testDb)
    const t2 = await appendTurn(thread.id, 'Second', testDb)
    const t3 = await appendTurn(thread.id, 'Third', testDb)

    expect(t1.seq).toBe(0)
    expect(t2.seq).toBe(1)
    expect(t3.seq).toBe(2)

    await testDb.close()
  })

  it('appendVariant increments ordinal correctly', async () => {
    const testDb = freshDb()
    const nodeId = 'node-ordinal'
    const thread = await createThreadV2(nodeId, 'Ordinal test', testDb)
    const turn = await appendTurn(thread.id, 'Q', testDb)

    const v1 = await appendVariant(turn.id, { status: 'complete', mode: 'answer', contentText: 'A1' }, testDb)
    const v2 = await appendVariant(turn.id, { status: 'complete', mode: 'answer', contentText: 'A2' }, testDb)

    expect(v1.ordinal).toBe(0)
    expect(v2.ordinal).toBe(1)

    await testDb.close()
  })
})
