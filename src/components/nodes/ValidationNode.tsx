import React, { memo } from 'react'
import type { NodeProps } from 'reactflow'

import { ResearchNodeCard } from '@/components/nodes/ResearchNodeCard'
import type { NodeData } from '@/types/nodes'

export const ValidationNode = memo((props: NodeProps<NodeData>) => (
  <ResearchNodeCard
    {...props}
    title="Validation"
    placeholder="Document validation"
    accentClassName="bg-emerald-500"
    focusRingClassName="focus:ring-emerald-100"
    nodeType="VALIDATION"
  />
))

ValidationNode.displayName = 'ValidationNode'
