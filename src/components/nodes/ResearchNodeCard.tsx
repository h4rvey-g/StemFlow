import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { NodeProps } from 'reactflow'
import { Handle, Position, useUpdateNodeInternals } from 'reactflow'

import { useAiGeneration } from '@/hooks/useAiGeneration'
import { useAutoResizingTextarea } from '@/hooks/useAutoResizingTextarea'
import { describeImageWithVision } from '@/lib/ai-service'
import { gradeNode } from '@/lib/ai-service'
import { processFileInWorker } from '@/lib/file-processing-client'
import { renderMarkdownEmphasis } from '@/lib/markdown-emphasis'
import { createRightwardPosition } from '@/lib/node-layout'
import {
  deleteFileAttachment,
  getFileAttachmentBlob,
  saveFileAttachment,
} from '@/lib/file-storage'
import { useStore } from '@/stores/useStore'
import { useProjectStore } from '@/stores/useProjectStore'
import type { NodeData, NodeFileAttachment, Citation, OMVEdge, OMVNode } from '@/types/nodes'
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
const TEXT_CLAMP_LINE_THRESHOLD = 4
const STAR_VALUES = [1, 2, 3, 4, 5] as const
const PRIMARY_HANDLE_STYLE: React.CSSProperties = {
  width: 12,
  height: 12,
  background: '#0f172a',
  border: '2px solid #ffffff',
}

const COLLAPSED_TEXT_STYLE: React.CSSProperties = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: TEXT_CLAMP_LINE_THRESHOLD,
  overflow: 'hidden',
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

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5">
      <path
        d="M10 1.6l2.47 5 5.52.8-4 3.9.94 5.5L10 14.2l-4.93 2.6.94-5.5-4-3.9 5.52-.8L10 1.6z"
        className={filled ? 'fill-amber-400 stroke-amber-500' : 'fill-transparent stroke-slate-400'}
        strokeWidth="1.2"
      />
    </svg>
  )
}

const ReferencesSection = ({ citations }: { citations: Citation[] }) => {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="nodrag nopan mt-2 border-t border-slate-200 pt-2">
      <button
        type="button"
        className="flex w-full items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-500 transition-colors"
        onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
      >
        <span className="transition-transform" style={{ display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
        References ({citations.length})
      </button>
      {expanded ? (
        <div className="mt-1">
          {citations.map((c) => (
            <div key={c.index} className="text-[11px] leading-4 text-slate-500 mb-0.5">
              <span className="font-medium text-slate-600">[{c.index}]</span>{' '}
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="nodrag text-blue-600 hover:underline">
                {c.title}
              </a>
              {c.publishedDate ? <span className="text-slate-400 ml-1">({c.publishedDate})</span> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

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
  const setNodeGrade = useStore((state) => state.setNodeGrade)
  const addNode = useStore((state) => state.addNode)
  const addEdge = useStore((state) => state.addEdge)
  const globalGoal = useStore((state) => state.globalGoal)
  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  const { generate, isGenerating } = useAiGeneration()
  const updateNodeInternals = useUpdateNodeInternals()

  const aiButtonRef = useRef<HTMLButtonElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textMeasurementRef = useRef<HTMLDivElement | null>(null)

  const [aiOpen, setAiOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isGradingWithAi, setIsGradingWithAi] = useState(false)
  const [gradingError, setGradingError] = useState<string | null>(null)
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({})
  const [isTextExpanded, setIsTextExpanded] = useState(false)
  const [shouldOfferTextToggle, setShouldOfferTextToggle] = useState(false)

  const textContent = data?.text_content ?? ''
  const summaryTitle = data?.summary_title?.trim() ?? ''
  const hasSummaryTitle = summaryTitle.length > 0
  const hasText = textContent.trim().length > 0
  const isTextCollapsed = shouldOfferTextToggle && !isTextExpanded
  const nodeGrade = Math.min(5, Math.max(1, Math.round(data?.grade ?? 3)))
  const attachments = normalizeAttachments(data)
  const citations = data?.citations ?? []
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
    if (!selected) {
      setGradingError(null)
      setIsGradingWithAi(false)
    }
  }, [selected])

  useEffect(() => {
    if (!shouldOfferTextToggle && isTextExpanded) {
      setIsTextExpanded(false)
    }
  }, [isTextExpanded, shouldOfferTextToggle])

  useEffect(() => {
    if (selected || !hasText) {
      setShouldOfferTextToggle(false)
      return
    }

    const measurementElement = textMeasurementRef.current
    if (!measurementElement) return

    const evaluateTextOverflow = () => {
      const computedStyles = window.getComputedStyle(measurementElement)
      const lineHeight = Number.parseFloat(computedStyles.lineHeight)
      const maxVisibleHeight = Number.isFinite(lineHeight)
        ? lineHeight * TEXT_CLAMP_LINE_THRESHOLD
        : Number.POSITIVE_INFINITY

      const nextShouldOfferToggle = measurementElement.scrollHeight > maxVisibleHeight + 1
      setShouldOfferTextToggle(nextShouldOfferToggle)
    }

    evaluateTextOverflow()

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
        evaluateTextOverflow()
      })
      : null
    resizeObserver?.observe(measurementElement)

    window.addEventListener('resize', evaluateTextOverflow)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', evaluateTextOverflow)
    }
  }, [citations, hasText, selected, textContent])

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
        if (!activeProjectId) throw new Error('No active project')
        const metadata = await saveFileAttachment(activeProjectId, id, file)
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
  }, [id, textContent, upsertAttachment, activeProjectId])

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

  const handleAiGrade = useCallback(async () => {
    if (isGradingWithAi) return

    setGradingError(null)
    setIsGradingWithAi(true)

    try {
      const nextGrade = await gradeNode(
        {
          id,
          type: nodeType,
          content: textContent.trim(),
        },
        globalGoal
      )
      setNodeGrade(id, nextGrade)
    } catch (error) {
      setGradingError(error instanceof Error ? error.message : 'Failed to grade node with AI.')
    } finally {
      setIsGradingWithAi(false)
    }
  }, [globalGoal, id, isGradingWithAi, nodeType, setNodeGrade, textContent])

  const handleAddObservation = useCallback(() => {
    if (nodeType !== 'VALIDATION') return

    const sourceNode = useStore.getState().nodes.find((node) => node.id === id)
    const sourcePosition = sourceNode?.position ?? { x: 0, y: 0 }
    const newNodeId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const newNode: OMVNode = {
      id: newNodeId,
      type: 'OBSERVATION',
      position: createRightwardPosition(sourcePosition),
      data: {
        text_content: '',
      },
    }

    const edge: OMVEdge = {
      id: `edge-${id}-${newNodeId}`,
      source: id,
      target: newNodeId,
    }

    addNode(newNode)
    addEdge(edge)
  }, [addEdge, addNode, id, nodeType])

  return (
    <div className="relative w-[320px] overflow-hidden rounded-xl bg-white py-3 pl-4 pr-3 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
      <div className={`pointer-events-none absolute inset-y-0 left-0 w-1.5 ${accentClassName}`} aria-hidden />
      <Handle
        type="target"
        id="t-middle"
        position={Position.Left}
        isConnectable={isConnectable}
        style={PRIMARY_HANDLE_STYLE}
      />
      <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{title}</div>
      {hasSummaryTitle ? (
        <div className="mb-1 whitespace-pre-wrap break-words text-base font-semibold leading-6 text-slate-700">
          {summaryTitle}
        </div>
      ) : null}
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
        <div className="relative space-y-1">
          <div
            ref={textMeasurementRef}
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 invisible whitespace-pre-wrap break-words text-sm leading-7"
            aria-hidden
          >
            {hasText ? renderMarkdownEmphasis(textContent, citations) : placeholder}
          </div>
          <div
            className={`whitespace-pre-wrap break-words text-sm leading-7 ${hasText ? 'text-slate-700' : 'text-slate-400'}`}
            style={isTextCollapsed ? COLLAPSED_TEXT_STYLE : undefined}
          >
            {hasText ? renderMarkdownEmphasis(textContent, citations) : placeholder}
          </div>
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
      {citations.length > 0 ? <ReferencesSection citations={citations} /> : null}

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
        <div className="nodrag mt-2 space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1">
            <div className="flex items-center gap-0.5" role="group" aria-label="Node grade">
              {STAR_VALUES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="rounded-sm text-slate-600 transition-colors hover:text-amber-500"
                  aria-label={`Set grade ${value} star${value === 1 ? '' : 's'}`}
                  onClick={() => setNodeGrade(id, value)}
                >
                  <StarIcon filled={value <= nodeGrade} />
                </button>
              ))}
            </div>
            <button
              type="button"
              className="rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => {
                void handleAiGrade()
              }}
              disabled={isGradingWithAi}
            >
              {isGradingWithAi ? 'Grading...' : 'Grade with AI'}
            </button>
          </div>
          {gradingError ? <p className="text-[11px] text-rose-600">{gradingError}</p> : null}

          <div className="flex gap-2">
            <button
              className="flex-1 rounded-md bg-indigo-500 px-2 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-600 disabled:opacity-50"
              onClick={nodeType === 'VALIDATION' ? handleAddObservation : () => generate(id)}
              disabled={nodeType === 'VALIDATION' ? false : isGenerating}
            >
              {nodeType === 'VALIDATION' ? 'Add observation' : isGenerating ? 'Generating...' : 'Generate'}
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
        </div>
      ) : null}

      <Handle
        type="source"
        id="s-middle"
        position={Position.Right}
        isConnectable={isConnectable}
        style={PRIMARY_HANDLE_STYLE}
      />
    </div>
  )
}
