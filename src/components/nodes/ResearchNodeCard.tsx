import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { NodeProps } from 'reactflow'
import { Handle, Position, useUpdateNodeInternals } from 'reactflow'

import { useAiGeneration } from '@/hooks/useAiGeneration'
import { useAutoResizingTextarea } from '@/hooks/useAutoResizingTextarea'
import { describeImageWithVision } from '@/lib/ai-service'
import { processFileInWorker } from '@/lib/file-processing-client'
import {
  deleteFileAttachment,
  getFileAttachmentBlob,
  saveFileAttachment,
} from '@/lib/file-storage'
import { useStore } from '@/stores/useStore'
import type { NodeData, NodeFileAttachment } from '@/types/nodes'
import { NodePopover } from '@/components/ui/NodePopover'

type VisibleNodeType = 'OBSERVATION' | 'MECHANISM' | 'VALIDATION'

interface ResearchNodeCardProps extends NodeProps<NodeData> {
  title: string
  placeholder: string
  accentClassName: string
  focusRingClassName: string
  nodeType: VisibleNodeType
}

const FILE_ACCEPT = 'image/*,application/pdf,text/plain,.txt,.md,.json,.csv'
const EMPTY_ATTACHMENTS: NodeFileAttachment[] = []
const TEXT_CLAMP_WORD_THRESHOLD = 150
const AUXILIARY_HANDLE_STYLE: React.CSSProperties = {
  width: 8,
  height: 8,
  background: '#94a3b8',
  borderColor: '#64748b',
}

const COLLAPSED_TEXT_STYLE: React.CSSProperties = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 8,
  overflow: 'hidden',
}

const countWords = (value: string): number => {
  const trimmed = value.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const normalizeAttachments = (nodeData?: NodeData): NodeFileAttachment[] => {
  if (Array.isArray(nodeData?.attachments)) {
    return nodeData.attachments
  }

  if (!nodeData?.fileMetadata) {
    return EMPTY_ATTACHMENTS
  }

  return [
    {
      ...nodeData.fileMetadata,
      processingStatus: nodeData.fileProcessingStatus ?? 'ready',
      processingError: nodeData.fileProcessingError ?? null,
      textExcerpt: nodeData.fileTextExcerpt ?? null,
      imageDescription: nodeData.imageDescription ?? null,
    },
  ]
}

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'File processing failed'

export function ResearchNodeCard({
  id,
  data,
  isConnectable,
  selected,
  title,
  placeholder,
  accentClassName,
  focusRingClassName,
  nodeType,
}: ResearchNodeCardProps) {
  const updateNode = useStore((state) => state.updateNode)
  const updateNodeData = useStore((state) => state.updateNodeData)
  const { generate, isGenerating } = useAiGeneration()
  const updateNodeInternals = useUpdateNodeInternals()

  const aiButtonRef = useRef<HTMLButtonElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [aiOpen, setAiOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({})
  const [isTextExpanded, setIsTextExpanded] = useState(false)

  const textContent = data?.text_content ?? ''
  const hasText = textContent.trim().length > 0
  const shouldOfferTextToggle = countWords(textContent) > TEXT_CLAMP_WORD_THRESHOLD
  const isTextCollapsed = shouldOfferTextToggle && !isTextExpanded
  const attachments = normalizeAttachments(data)
  const { textareaRef, syncHeight } = useAutoResizingTextarea(textContent)

  const setAttachments = useCallback((nextAttachments: NodeFileAttachment[]) => {
    updateNodeData(id, {
      attachments: nextAttachments,
      fileMetadata: null,
      fileProcessingStatus: null,
      fileProcessingError: null,
      fileTextExcerpt: null,
      imageDescription: null,
    })
  }, [id, updateNodeData])

  const getCurrentAttachments = useCallback((): NodeFileAttachment[] => {
    const node = useStore.getState().nodes.find((entry) => entry.id === id)
    return normalizeAttachments(node?.data)
  }, [id])

  const upsertAttachment = useCallback((attachment: NodeFileAttachment) => {
    const current = getCurrentAttachments()
    const existingIndex = current.findIndex((entry) => entry.id === attachment.id)
    if (existingIndex === -1) {
      setAttachments([...current, attachment])
      return
    }

    const next = [...current]
    next[existingIndex] = attachment
    setAttachments(next)
  }, [getCurrentAttachments, setAttachments])

  useEffect(() => {
    if (!selected) setAiOpen(false)
  }, [selected])

  useEffect(() => {
    if (!shouldOfferTextToggle && isTextExpanded) {
      setIsTextExpanded(false)
    }
  }, [isTextExpanded, shouldOfferTextToggle])

  useEffect(() => {
    if (!data?.attachments && data?.fileMetadata) {
      setAttachments(normalizeAttachments(data))
    }
  }, [data, setAttachments])

  useEffect(() => {
    updateNodeInternals(id)
  }, [
    id,
    textContent,
    attachments,
    thumbnailUrls,
    updateNodeInternals,
  ])

  useEffect(() => {
    if (selected) {
      syncHeight(textareaRef.current)
    }
  }, [selected, syncHeight, textareaRef])

  useEffect(() => {
    let isActive = true
    const localObjectUrls: string[] = []

    const loadImagePreviews = async () => {
      const imageAttachments = attachments.filter((attachment) =>
        attachment.mimeType.startsWith('image/')
      )

      if (imageAttachments.length === 0) {
        setThumbnailUrls((previous) => (Object.keys(previous).length === 0 ? previous : {}))
        return
      }

      const entries = await Promise.all(
        imageAttachments.map(async (attachment): Promise<[string, string] | null> => {
          const blob = await getFileAttachmentBlob(attachment.id)
          if (!blob) return null

          const objectUrl = URL.createObjectURL(blob)
          localObjectUrls.push(objectUrl)
          return [attachment.id, objectUrl]
        })
      )

      if (!isActive) return
      setThumbnailUrls(Object.fromEntries(entries.filter((entry): entry is [string, string] => entry !== null)))
    }

    void loadImagePreviews().catch(() => {
      if (isActive) setThumbnailUrls({})
    })

    return () => {
      isActive = false
      localObjectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl))
    }
  }, [attachments])

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNode(id, { data: { text_content: event.target.value } })
  }

  const handleFileUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) return

    setIsUploading(true)

    try {
      for (const file of files) {
        const metadata = await saveFileAttachment(id, file)
        let currentAttachment: NodeFileAttachment = {
          ...metadata,
          processingStatus: 'processing',
          processingError: null,
          textExcerpt: null,
          imageDescription: null,
        }
        upsertAttachment(currentAttachment)

        try {
          const processed = await processFileInWorker(file)

          if (processed.kind === 'image' && processed.imageBase64) {
            const description = await describeImageWithVision(processed.imageBase64, textContent)
            currentAttachment = {
              ...currentAttachment,
              processingStatus: 'ready',
              imageDescription: description,
            }
            upsertAttachment(currentAttachment)
            continue
          }

          if ((processed.kind === 'pdf' || processed.kind === 'text') && processed.textExcerpt) {
            currentAttachment = {
              ...currentAttachment,
              processingStatus: 'ready',
              textExcerpt: processed.textExcerpt,
            }
            upsertAttachment(currentAttachment)
            continue
          }

          currentAttachment = {
            ...currentAttachment,
            processingStatus: 'ready',
          }
          upsertAttachment(currentAttachment)
        } catch (error) {
          currentAttachment = {
            ...currentAttachment,
            processingStatus: 'error',
            processingError: toErrorMessage(error),
          }
          upsertAttachment(currentAttachment)
        }
      }
    } finally {
      setIsUploading(false)
    }
  }, [id, textContent, upsertAttachment])

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : []
    event.currentTarget.value = ''
    if (files.length === 0) return

    await handleFileUpload(files)
  }

  const handleRemoveFile = useCallback(async (attachmentId: string) => {
    try {
      await deleteFileAttachment(attachmentId)
    } catch (error) {
      const current = getCurrentAttachments()
      const next: NodeFileAttachment[] = current.map((attachment) =>
        attachment.id === attachmentId
          ? {
              ...attachment,
              processingStatus: 'error',
              processingError: toErrorMessage(error),
            }
          : attachment
      )
      setAttachments(next)
      return
    }

    const current = getCurrentAttachments()
    setAttachments(current.filter((attachment) => attachment.id !== attachmentId))
  }, [getCurrentAttachments, setAttachments])

  return (
    <div className="relative w-[320px] overflow-hidden rounded-xl bg-white py-3 pl-4 pr-3 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
      <div className={`pointer-events-none absolute inset-y-0 left-0 w-1.5 ${accentClassName}`} aria-hidden />
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        style={{ top: '50%', opacity: 0, pointerEvents: 'none' }}
      />
      <Handle
        type="target"
        id="t-top"
        position={Position.Left}
        isConnectable={isConnectable}
        style={{ ...AUXILIARY_HANDLE_STYLE, top: '28%' }}
      />
      <Handle type="target" id="t-middle" position={Position.Left} isConnectable={isConnectable} />
      <Handle
        type="target"
        id="t-bottom"
        position={Position.Left}
        isConnectable={isConnectable}
        style={{ ...AUXILIARY_HANDLE_STYLE, top: '72%' }}
      />
      <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{title}</div>
      {selected ? (
        <textarea
          ref={textareaRef}
          className={`nodrag w-full resize-none overflow-hidden rounded-sm bg-transparent py-0 text-sm leading-7 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${focusRingClassName}`}
          value={textContent}
          onChange={handleChange}
          onInput={(event) => syncHeight(event.currentTarget)}
          placeholder={placeholder}
          rows={1}
        />
      ) : (
        <div className="space-y-1">
          <p
            className={`whitespace-pre-wrap break-words text-sm leading-7 ${hasText ? 'text-slate-700' : 'text-slate-400'}`}
            style={isTextCollapsed ? COLLAPSED_TEXT_STYLE : undefined}
          >
            {hasText ? textContent : placeholder}
          </p>
          {shouldOfferTextToggle ? (
            <button
              type="button"
              className="nodrag text-xs font-semibold text-slate-500 transition-colors hover:text-slate-700"
              onClick={() => setIsTextExpanded((value) => !value)}
            >
              {isTextCollapsed ? 'Read more' : 'Show less'}
            </button>
          ) : null}
        </div>
      )}

      {attachments.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {attachments.map((attachment) => {
            const thumbnailUrl = thumbnailUrls[attachment.id]
            return (
              <div key={attachment.id} className="group relative max-w-full">
                <div className="flex max-w-[240px] items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-700 shadow-sm">
                  <p className="truncate font-semibold">{attachment.name}</p>
                  <p className="shrink-0 text-[10px] text-slate-500">{formatFileSize(attachment.size)}</p>
                  <button
                    type="button"
                    className="shrink-0 text-[12px] font-semibold leading-none text-slate-500 transition-colors hover:text-slate-700"
                    onClick={() => {
                      void handleRemoveFile(attachment.id)
                    }}
                    aria-label={`Remove ${attachment.name}`}
                  >
                    ×
                  </button>
                </div>

                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 opacity-0 shadow-lg transition duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                  <p className="truncate text-[11px] font-semibold text-slate-800">{attachment.name}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">{formatFileSize(attachment.size)}</p>

                  {thumbnailUrl ? (
                    <img
                      src={thumbnailUrl}
                      alt={`Preview for ${attachment.name}`}
                      className="mt-2 h-24 w-full rounded-md border border-slate-200 object-cover"
                    />
                  ) : null}

                  {attachment.processingStatus === 'processing' ? (
                    <p className="mt-2 text-[11px] text-slate-500">Processing file...</p>
                  ) : null}

                  {attachment.processingError ? (
                    <p className="mt-2 text-[11px] text-rose-600">{attachment.processingError}</p>
                  ) : null}

                  {attachment.imageDescription ? (
                    <p className="mt-2 max-h-24 overflow-y-auto rounded-md bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-700">
                      {attachment.imageDescription}
                    </p>
                  ) : null}

                  {attachment.textExcerpt ? (
                    <p className="mt-2 max-h-24 overflow-y-auto rounded-md bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-700">
                      {attachment.textExcerpt}
                    </p>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {selected ? (
        <div className="nodrag mt-2 flex gap-2">
          <button
            className="flex-1 rounded-md bg-indigo-500 px-2 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-600 disabled:opacity-50"
            onClick={() => generate(id)}
            disabled={isGenerating}
          >
            {isGenerating ? 'Generating...' : 'Generate'}
          </button>

          <button
            type="button"
            className="rounded-md bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? 'Uploading...' : 'Attach'}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={FILE_ACCEPT}
            multiple
            onChange={(event) => {
              void handleFileChange(event)
            }}
          />

          <button
            ref={aiButtonRef}
            type="button"
            className="rounded-md bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
            aria-label="AI Actions"
            onClick={() => setAiOpen((value) => !value)}
          >
            AI
          </button>

          {aiOpen && aiButtonRef.current ? (
            <NodePopover
              nodeId={id}
              nodeType={nodeType}
              isOpen={aiOpen}
              onClose={() => setAiOpen(false)}
              anchorEl={aiButtonRef.current}
            />
          ) : null}
        </div>
      ) : null}

      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={{ top: '50%', opacity: 0, pointerEvents: 'none' }}
      />
      <Handle
        type="source"
        id="s-top"
        position={Position.Right}
        isConnectable={isConnectable}
        style={{ ...AUXILIARY_HANDLE_STYLE, top: '28%' }}
      />
      <Handle type="source" id="s-middle" position={Position.Right} isConnectable={isConnectable} />
      <Handle
        type="source"
        id="s-bottom"
        position={Position.Right}
        isConnectable={isConnectable}
        style={{ ...AUXILIARY_HANDLE_STYLE, top: '72%' }}
      />
    </div>
  )
}
