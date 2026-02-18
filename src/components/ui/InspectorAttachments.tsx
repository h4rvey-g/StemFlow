"use client"

import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getFileAttachmentBlob } from '@/lib/file-storage'
import type { NodeFileAttachment } from '@/types/nodes'

interface InspectorAttachmentsProps {
  attachments: NodeFileAttachment[]
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const InspectorAttachments = ({ attachments }: InspectorAttachmentsProps) => {
  const { t } = useTranslation()
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})

  useEffect(() => {
    let isActive = true
    const objectUrls: string[] = []

    const loadThumbnails = async () => {
      const imageAttachments = attachments.filter((att) => att.mimeType.startsWith('image/'))
      
      const entries = await Promise.all(
        imageAttachments.map(async (att): Promise<[string, string] | null> => {
          const blob = await getFileAttachmentBlob(att.id)
          if (!blob) return null
          const url = URL.createObjectURL(blob)
          objectUrls.push(url)
          return [att.id, url]
        })
      )

      if (isActive) {
        setThumbnails(Object.fromEntries(entries.filter((e): e is [string, string] => e !== null)))
      }
    }

    void loadThumbnails()

    return () => {
      isActive = false
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [attachments])

  if (attachments.length === 0) return null

  return (
    <div data-testid="attachments-section" className="mt-4 border-t border-slate-200 pt-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {t('inspector.attachments')}
      </h3>
      <div className="space-y-2">
        {attachments.map((att) => (
          <div key={att.id} data-testid={`attachment-${att.id}`} className="rounded border border-slate-200 p-2">
            <div className="flex items-start gap-2">
              {att.mimeType.startsWith('image/') && thumbnails[att.id] ? (
                <img
                  data-testid={`thumbnail-${att.id}`}
                  src={thumbnails[att.id]}
                  alt={att.name}
                  className="h-16 w-16 rounded object-cover"
                />
              ) : null}
              <div className="flex-1 min-w-0">
                <p data-testid="attachment-name" className="truncate text-sm font-medium text-slate-700">
                  {att.name}
                </p>
                <p data-testid="attachment-type" className="text-xs text-slate-500">
                  {att.mimeType} • {formatFileSize(att.size)}
                </p>
                <p data-testid="attachment-status" className="text-xs text-slate-400">
                  {att.processingStatus}
                </p>
              </div>
            </div>
            {att.mimeType === 'application/pdf' && att.textExcerpt ? (
              <div data-testid={`pdf-excerpt-${att.id}`} className="mt-2 border-t border-slate-100 pt-2">
                <p className="text-xs text-slate-600 line-clamp-3">{att.textExcerpt}</p>
              </div>
            ) : null}
            {!thumbnails[att.id] && att.mimeType.startsWith('image/') ? (
              <p data-testid="fallback-message" className="mt-1 text-xs text-slate-400">
                {t('inspector.fileNotAvailable')}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
