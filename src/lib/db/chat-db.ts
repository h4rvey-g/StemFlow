import type {
  ChatThread,
  ChatThreadV2,
  ChatTurn,
  AssistantVariant,
  NodeActiveThread,
  ProposalStatus
} from '@/types/chat'
import { generateId } from '@/lib/uuid'
import { db } from '@/lib/db'
import type { StemFlowDB } from '@/lib/db'

// ─── Caps ─────────────────────────────────────────────────────────────────────

export const MAX_THREADS_PER_NODE = 20
export const MAX_TURNS_PER_THREAD = 120
export const MAX_VARIANTS_PER_TURN = 5

// ─── Legacy V1 Facade (read-only after v5 migration) ─────────────────────────

/**
 * Get chat thread for a node (legacy v1)
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
 * Save or update chat thread for a node (legacy v1)
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
 * Delete chat thread for a node (legacy v1)
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

// ─── V2 Migration ─────────────────────────────────────────────────────────────

type StemFlowDBInstance = typeof db

/**
 * Migrate legacy v1 chatThreads into v2 tables (idempotent).
 * Safe to call multiple times — skips nodes that already have a v2 thread.
 *
 * @param database - Optional DB instance (defaults to singleton); injectable for tests.
 */
export async function migrateLegacyChatThreads(
  database: StemFlowDBInstance = db
): Promise<void> {
  const legacyThreads = await database.chatThreads.toArray()

  for (const legacy of legacyThreads) {
    // Idempotency guard: skip if a v2 thread already exists for this nodeId
    const existing = await database.chatThreadsV2
      .where('nodeId')
      .equals(legacy.nodeId)
      .first()
    if (existing) continue

    const threadId = generateId()
    const now = Date.now()

    const thread: ChatThreadV2 = {
      id: threadId,
      nodeId: legacy.nodeId,
      title: 'Migrated Chat',
      createdAt: legacy.createdAt ?? now,
      updatedAt: legacy.updatedAt ?? now
    }
    await database.chatThreadsV2.put(thread)

    // Set as active thread for the node (if not already set)
    const currentActive = await database.nodeActiveThread.get(legacy.nodeId)
    if (!currentActive) {
      const activeRecord: NodeActiveThread = {
        nodeId: legacy.nodeId,
        threadId
      }
      await database.nodeActiveThread.put(activeRecord)
    }

    // Convert flat messages into turns + variants
    const messages = legacy.messages ?? []
    let seq = 0
    let i = 0
    while (i < messages.length) {
      const msg = messages[i]
      if (msg.role === 'user') {
        const turnId = generateId()
        const turnNow = msg.timestamp ?? now

        const nextMsg = messages[i + 1]
        const hasAssistant = Boolean(nextMsg && nextMsg.role === 'assistant')

        const turn: ChatTurn = {
          id: turnId,
          threadId,
          seq,
          userText: msg.content,
          userCreatedAt: turnNow,
          selectedVariantOrdinal: hasAssistant ? 0 : null
        }
        await database.chatTurns.put(turn)

        if (hasAssistant && nextMsg) {
          const variantNow = nextMsg.timestamp ?? now
          const variant: AssistantVariant = {
            id: generateId(),
            turnId,
            ordinal: 0,
            status: 'complete',
            mode: nextMsg.mode ?? 'answer',
            contentText: nextMsg.content,
            createdAt: variantNow,
            updatedAt: variantNow
          }
          await database.chatVariants.put(variant)
          i += 2
        } else {
          i += 1
        }
        seq += 1
      } else {
        // Standalone assistant message without preceding user turn — skip gracefully
        i += 1
      }
    }
  }
}

// ─── V2 Thread Operations ─────────────────────────────────────────────────────

/**
 * List all threads for a node, sorted by updatedAt descending (most recent first).
 */
export async function listThreadsV2(
  nodeId: string,
  database: StemFlowDBInstance = db
): Promise<ChatThreadV2[]> {
  const threads = await database.chatThreadsV2
    .where('nodeId')
    .equals(nodeId)
    .toArray()
  // Sort descending by updatedAt
  return threads.sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Create a new thread for a node with auto-generated title.
 * Prunes oldest threads if node exceeds MAX_THREADS_PER_NODE.
 *
 * @returns The newly created ChatThreadV2
 */
export async function createThreadV2(
  nodeId: string,
  title?: string,
  database: StemFlowDBInstance = db
): Promise<ChatThreadV2> {
  const now = Date.now()

  // Build an auto-title like "Chat {N+1}" if not provided
  let resolvedTitle = title
  if (!resolvedTitle) {
    const existingCount = await database.chatThreadsV2
      .where('nodeId')
      .equals(nodeId)
      .count()
    resolvedTitle = `Chat ${existingCount + 1}`
  }

  const thread: ChatThreadV2 = {
    id: generateId(),
    nodeId,
    title: resolvedTitle,
    createdAt: now,
    updatedAt: now
  }
  await database.chatThreadsV2.put(thread)

  // Enforce cap: prune oldest threads (by updatedAt asc) until at cap
  await pruneOldestThreads(nodeId, database)

  return thread
}

/**
 * Delete a thread and all its turns and variants.
 */
export async function deleteThreadV2(
  threadId: string,
  database: StemFlowDBInstance = db
): Promise<void> {
  // Collect all turn IDs for this thread
  const turns = await database.chatTurns
    .where('threadId')
    .equals(threadId)
    .toArray()

  // Delete all variants for each turn
  for (const turn of turns) {
    await database.chatVariants.where('turnId').equals(turn.id).delete()
  }

  // Delete all turns
  await database.chatTurns.where('threadId').equals(threadId).delete()

  // Delete the thread itself
  await database.chatThreadsV2.delete(threadId)
}

/**
 * Update a thread's title.
 */
export async function updateThreadTitle(
  threadId: string,
  title: string,
  database: StemFlowDBInstance = db
): Promise<void> {
  await database.chatThreadsV2.update(threadId, { title, updatedAt: Date.now() })
}

// ─── V2 Active Thread ─────────────────────────────────────────────────────────

/**
 * Get the active thread ID for a node.
 * Returns undefined if no active thread is set.
 */
export async function getActiveThreadId(
  nodeId: string,
  database: StemFlowDBInstance = db
): Promise<string | undefined> {
  const record = await database.nodeActiveThread.get(nodeId)
  return record?.threadId
}

/**
 * Set the active thread for a node.
 */
export async function setActiveThreadId(
  nodeId: string,
  threadId: string,
  database: StemFlowDBInstance = db
): Promise<void> {
  const record: NodeActiveThread = { nodeId, threadId }
  await database.nodeActiveThread.put(record)
}

// ─── V2 Turn Operations ───────────────────────────────────────────────────────

/**
 * Append a new user turn to a thread.
 * Updates the thread's updatedAt timestamp.
 * Prunes oldest turns if thread exceeds MAX_TURNS_PER_THREAD.
 *
 * @returns The newly created ChatTurn
 */
export async function appendTurn(
  threadId: string,
  userText: string,
  database: StemFlowDBInstance = db
): Promise<ChatTurn> {
  // Determine next seq by counting existing turns
  const existingTurns = await database.chatTurns
    .where('threadId')
    .equals(threadId)
    .toArray()
  const nextSeq = existingTurns.length

  const now = Date.now()
  const turn: ChatTurn = {
    id: generateId(),
    threadId,
    seq: nextSeq,
    userText,
    userCreatedAt: now,
    selectedVariantOrdinal: null
  }
  await database.chatTurns.put(turn)

  // Update thread timestamp
  await database.chatThreadsV2.update(threadId, { updatedAt: now })

  // Enforce turn cap
  await pruneOldestTurns(threadId, database)

  return turn
}

/**
 * List all turns for a thread, sorted by seq ascending.
 */
export async function listTurns(
  threadId: string,
  database: StemFlowDBInstance = db
): Promise<ChatTurn[]> {
  const turns = await database.chatTurns
    .where('threadId')
    .equals(threadId)
    .toArray()
  return turns.sort((a, b) => a.seq - b.seq)
}

/**
 * Set the selected variant ordinal for a turn.
 * The selected variant is used as context in subsequent AI requests.
 */
export async function setSelectedVariant(
  turnId: string,
  ordinal: number,
  database: StemFlowDBInstance = db
): Promise<void> {
  await database.chatTurns.update(turnId, { selectedVariantOrdinal: ordinal })
}

// ─── V2 Variant Operations ────────────────────────────────────────────────────

/**
 * Append a new assistant variant to a turn.
 * Prunes oldest non-selected variants if turn exceeds MAX_VARIANTS_PER_TURN.
 *
 * @param turnId - Turn to append the variant to
 * @param data - Variant fields (excluding id, turnId, ordinal, createdAt, updatedAt)
 * @returns The newly created AssistantVariant
 */
export async function appendVariant(
  turnId: string,
  data: Pick<AssistantVariant, 'status' | 'mode' | 'contentText'> &
    Partial<Pick<AssistantVariant, 'proposal' | 'proposalStatus'>>,
  database: StemFlowDBInstance = db
): Promise<AssistantVariant> {
  // Determine next ordinal
  const existingVariants = await database.chatVariants
    .where('turnId')
    .equals(turnId)
    .toArray()
  const nextOrdinal =
    existingVariants.length > 0
      ? Math.max(...existingVariants.map((v) => v.ordinal)) + 1
      : 0

  const now = Date.now()
  const variant: AssistantVariant = {
    id: generateId(),
    turnId,
    ordinal: nextOrdinal,
    status: data.status,
    mode: data.mode,
    contentText: data.contentText,
    proposal: data.proposal,
    proposalStatus: data.proposalStatus,
    createdAt: now,
    updatedAt: now
  }
  await database.chatVariants.put(variant)

  // Update thread timestamp by going up through the turn
  const turn = await database.chatTurns.get(turnId)
  if (turn) {
    await database.chatThreadsV2.update(turn.threadId, { updatedAt: now })
  }

  // Enforce variant cap
  await pruneOldestVariants(turnId, database)

  return variant
}

/**
 * Update fields on an existing variant (e.g., stream content, change status).
 */
export async function updateVariant(
  variantId: string,
  patch: Partial<
    Pick<
      AssistantVariant,
      'status' | 'contentText' | 'proposal' | 'proposalStatus' | 'updatedAt'
    >
  >,
  database: StemFlowDBInstance = db
): Promise<void> {
  // DEBUG: Log updateVariant call
  console.log('💾 [updateVariant called]', {
    variantId,
    patchKeys: Object.keys(patch),
    contentLength: patch.contentText?.length || 0,
    status: patch.status,
  })
  
  const result = await database.chatVariants.update(variantId, {
    ...patch,
    updatedAt: patch.updatedAt ?? Date.now()
  })
  
  console.log('✅ [updateVariant complete]', {
    variantId,
    rowsAffected: result,
  })
}

/**
 * List all variants for a turn, sorted by ordinal ascending.
 */
export async function listVariants(
  turnId: string,
  database: StemFlowDBInstance = db
): Promise<AssistantVariant[]> {
  const variants = await database.chatVariants
    .where('turnId')
    .equals(turnId)
    .toArray()
  return variants.sort((a, b) => a.ordinal - b.ordinal)
}

/**
 * Set the proposal status (accepted/rejected/pending) on a variant.
 */
export async function setProposalStatus(
  variantId: string,
  status: ProposalStatus,
  database: StemFlowDBInstance = db
): Promise<void> {
  await database.chatVariants.update(variantId, {
    proposalStatus: status,
    updatedAt: Date.now()
  })
}

// ─── Cap Enforcement Helpers ──────────────────────────────────────────────────

/**
 * Prune oldest threads for a node if count exceeds MAX_THREADS_PER_NODE.
 * "Oldest" is determined by updatedAt ascending.
 */
async function pruneOldestThreads(
  nodeId: string,
  database: StemFlowDBInstance
): Promise<void> {
  const threads = await database.chatThreadsV2
    .where('nodeId')
    .equals(nodeId)
    .toArray()

  if (threads.length <= MAX_THREADS_PER_NODE) return

  // Sort by updatedAt ascending (oldest first)
  const sorted = threads.sort((a, b) => a.updatedAt - b.updatedAt)
  const excess = sorted.slice(0, threads.length - MAX_THREADS_PER_NODE)

  for (const thread of excess) {
    await deleteThreadV2(thread.id, database)
  }
}

/**
 * Prune oldest turns for a thread if count exceeds MAX_TURNS_PER_THREAD.
 * "Oldest" is determined by seq ascending. Also deletes variants of pruned turns.
 */
async function pruneOldestTurns(
  threadId: string,
  database: StemFlowDBInstance
): Promise<void> {
  const turns = await database.chatTurns
    .where('threadId')
    .equals(threadId)
    .toArray()

  if (turns.length <= MAX_TURNS_PER_THREAD) return

  // Sort by seq ascending (oldest first)
  const sorted = turns.sort((a, b) => a.seq - b.seq)
  const excess = sorted.slice(0, turns.length - MAX_TURNS_PER_THREAD)

  for (const turn of excess) {
    // Delete all variants for this turn
    await database.chatVariants.where('turnId').equals(turn.id).delete()
    // Delete the turn
    await database.chatTurns.delete(turn.id)
  }
}

/**
 * Prune oldest non-selected variants for a turn if count exceeds MAX_VARIANTS_PER_TURN.
 * The selected variant (from the turn's selectedVariantOrdinal) is never pruned.
 * Pruning removes lowest-ordinal non-selected variants first.
 */
async function pruneOldestVariants(
  turnId: string,
  database: StemFlowDBInstance
): Promise<void> {
  const variants = await database.chatVariants
    .where('turnId')
    .equals(turnId)
    .toArray()

  if (variants.length <= MAX_VARIANTS_PER_TURN) return

  // Get the selected variant ordinal from the turn record
  const turn = await database.chatTurns.get(turnId)
  const selectedOrdinal = turn?.selectedVariantOrdinal ?? null

  // Sort ascending by ordinal
  const sorted = variants.sort((a, b) => a.ordinal - b.ordinal)

  // Non-selected candidates (oldest ordinal first)
  const nonSelected = sorted.filter(
    (v) => selectedOrdinal === null || v.ordinal !== selectedOrdinal
  )

  // How many to delete
  const deleteCount = variants.length - MAX_VARIANTS_PER_TURN
  const toDelete = nonSelected.slice(0, deleteCount)

  for (const variant of toDelete) {
    await database.chatVariants.delete(variant.id)
  }
}

// ─── Convenience: turns with variants ────────────────────────────────────────

export interface TurnWithVariants {
  turn: ChatTurn
  variants: AssistantVariant[]
}

/**
 * List all turns for a thread with their variants, sorted by seq ascending.
 * Each turn's variants array is sorted by ordinal ascending.
 */
export async function listTurnsWithVariants(
  threadId: string,
  database: StemFlowDBInstance = db
): Promise<TurnWithVariants[]> {
  const turns = await listTurns(threadId, database)

  const result: TurnWithVariants[] = []
  for (const turn of turns) {
    const variants = await listVariants(turn.id, database)
    result.push({ turn, variants })
  }
  return result
}

// Export the DB type for consumers that need to pass it as an injectable
export type { StemFlowDB }
