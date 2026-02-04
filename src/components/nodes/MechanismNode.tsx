import React, { memo } from 'react'
import type { NodeProps } from 'reactflow'
import { Handle, Position } from 'reactflow'
import { useStore } from '@/stores/useStore'

export const MechanismNode = memo(({ id, data, isConnectable }: NodeProps<{ text_content: string }>) => {
  const updateNode = useStore((state) => state.updateNode)

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNode(id, { data: { text_content: event.target.value } })
  }

  return (
    <div className="bg-white rounded-lg border-2 border-violet-500 p-3 shadow-sm" style={{ minWidth: 160 }}>
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} />
      <div className="text-xs font-bold text-violet-600 mb-1">MECHANISM</div>
      <textarea
        className="nodrag w-full rounded-md border border-slate-200 p-2 text-sm"
        value={data?.text_content ?? ''}
        onChange={handleChange}
        placeholder="Describe the mechanism"
        rows={3}
      />
      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} />
    </div>
  )
})

MechanismNode.displayName = 'MechanismNode'
