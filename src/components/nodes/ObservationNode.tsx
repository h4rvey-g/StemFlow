import React, { memo } from 'react'
import type { NodeProps } from 'reactflow'
import { Handle, Position } from 'reactflow'
import { useStore } from '@/stores/useStore'
import { useGenerate } from '@/hooks/useGenerate'

export const ObservationNode = memo(({ id, data, isConnectable }: NodeProps<{ text_content: string }>) => {
  const updateNode = useStore((state) => state.updateNode)
  const { generate, isGenerating } = useGenerate()

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNode(id, { data: { text_content: event.target.value } })
  }

  return (
    <div className="min-w-[180px] rounded-xl border-2 border-blue-500 bg-white/90 p-3 shadow-sm backdrop-blur-sm">
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} />
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-blue-600">Observation</div>
      <textarea
        className="nodrag w-full rounded-md border border-slate-200 bg-white p-2 text-sm text-slate-800 shadow-inner placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        value={data?.text_content ?? ''}
        onChange={handleChange}
        placeholder="Capture an observation"
        rows={3}
      />
      <button
        className="nodrag mt-2 w-full rounded-md bg-indigo-500 px-2 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-600 disabled:opacity-50"
        onClick={() => generate(id)}
        disabled={isGenerating}
      >
        {isGenerating ? 'Generating...' : 'Generate'}
      </button>
      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} />
    </div>
  )
})

ObservationNode.displayName = 'ObservationNode'
