import React, { memo, useEffect, useRef, useState } from 'react'
import type { NodeProps } from 'reactflow'
import { Handle, Position, useUpdateNodeInternals } from 'reactflow'
import { useStore } from '@/stores/useStore'
import { useAiGeneration } from '@/hooks/useAiGeneration'
import { useAutoResizingTextarea } from '@/hooks/useAutoResizingTextarea'
import { NodePopover } from '@/components/ui/NodePopover'

export const ObservationNode = memo(({ id, data, isConnectable, selected }: NodeProps<{ text_content: string }>) => {
  const updateNode = useStore((state) => state.updateNode)
  const { generate, isGenerating } = useAiGeneration()
  const updateNodeInternals = useUpdateNodeInternals()
  const aiButtonRef = useRef<HTMLButtonElement | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const textContent = data?.text_content ?? ''
  const { textareaRef, syncHeight } = useAutoResizingTextarea(textContent)

  useEffect(() => {
    if (!selected) setAiOpen(false)
  }, [selected])

  useEffect(() => {
    updateNodeInternals(id)
  }, [id, textContent, updateNodeInternals])

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNode(id, { data: { text_content: event.target.value } })
  }

  return (
    <div className="w-[320px] rounded-xl border-2 border-blue-500 bg-white/90 p-3 shadow-sm backdrop-blur-sm">
      <Handle type="target" position={Position.Left} isConnectable={isConnectable} />
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-blue-600">Observation</div>
      <textarea
        ref={textareaRef}
        className="nodrag w-full resize-none overflow-hidden rounded-md border border-slate-200 bg-white p-2 text-sm text-slate-800 shadow-inner placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        value={textContent}
        onChange={handleChange}
        onInput={(event) => syncHeight(event.currentTarget)}
        placeholder="Capture an observation"
        rows={1}
      />
      {selected && (
        <div className="nodrag mt-2 flex gap-2">
          <button
            className="flex-1 rounded-md bg-indigo-500 px-2 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-600 disabled:opacity-50"
            onClick={() => generate(id)}
            disabled={isGenerating}
          >
            {isGenerating ? 'Generating...' : 'Generate'}
          </button>
          <button
            ref={aiButtonRef}
            type="button"
            className="rounded-md bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
            aria-label="AI Actions"
            onClick={() => setAiOpen((v) => !v)}
          >
            AI
          </button>
          {aiOpen && aiButtonRef.current ? (
            <NodePopover
              nodeId={id}
              nodeType="OBSERVATION"
              isOpen={aiOpen}
              onClose={() => setAiOpen(false)}
              anchorEl={aiButtonRef.current}
            />
          ) : null}
        </div>
      )}
      <Handle type="source" position={Position.Right} isConnectable={isConnectable} />
    </div>
  )
})

ObservationNode.displayName = 'ObservationNode'
