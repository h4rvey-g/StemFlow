import { db } from '@/lib/db'
import type { FileMetadata } from '@/types/nodes'

export interface StoredAttachment {
  id: string
  nodeId: string
  blob: Blob
  name: string
  mimeType: string
  size: number
  uploadedAt: number
}

const createAttachmentId = (): string =>
  `file-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

export const saveFileAttachment = async (nodeId: string, file: File): Promise<FileMetadata> => {
  const id = createAttachmentId()
  const uploadedAt = Date.now()

  const record: StoredAttachment = {
    id,
    nodeId,
    blob: file,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    uploadedAt,
  }

  await db.files.put(record)

  return {
    id,
    name: record.name,
    mimeType: record.mimeType,
    size: record.size,
    uploadedAt,
  }
}

export const getFileAttachmentBlob = async (id: string): Promise<Blob | null> => {
  const record = await db.files.get(id)
  return record?.blob ?? null
}

export const deleteFileAttachment = async (id: string): Promise<void> => {
  await db.files.delete(id)
}

export const deleteAttachmentsForNode = async (nodeId: string): Promise<void> => {
  await db.files.where('nodeId').equals(nodeId).delete()
}
