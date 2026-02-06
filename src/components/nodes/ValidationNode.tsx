import React, { memo, useEffect, useRef, useState } from 'react'
import type { NodeProps } from 'reactflow'
import { Handle, Position } from 'reactflow'
import { useStore } from '@/stores/useStore'
import { useAiGeneration } from '@/hooks/useAiGeneration'
import { NodePopover } from '@/components/ui/NodePopover'

export const ValidationNode = memo(({ id, data, isConnectable, selected }: NodeProps<{ text_content: string }>) => {
  const updateNode = useStore((state) => state.updateNode)
  const { generate, isGenerating } = useAiGeneration()
  const aiButtonRef = useRef<HTMLButtonElement | null>(null)
  const [aiOpen, setAiOpen] = useState(false)

  useEffect(() => {
    if (!selected) setAiOpen(false)
  }, [selected])

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNode(id, { data: { text_content: event.target.value } })
  }

  return (
    <div className="min-w-[180px] rounded-xl border-2 border-emerald-500 bg-white/90 p-3 shadow-sm backdrop-blur-sm">
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} />
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Validation</div>
      <textarea
        className="nodrag w-full rounded-md border border-slate-200 bg-white p-2 text-sm text-slate-800 shadow-inner placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        value={data?.text_content ?? ''}
        onChange={handleChange}
        placeholder="Document validation"
        rows={3}
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
              nodeType="VALIDATION"
              isOpen={aiOpen}
              onClose={() => setAiOpen(false)}
              anchorEl={aiButtonRef.current}
            />
          ) : null}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} />
    </div>
  )
})

ValidationNode.displayName = 'ValidationNode'
