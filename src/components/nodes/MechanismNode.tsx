import React, { memo } from 'react'
import type { NodeProps } from 'reactflow'

import { ResearchNodeCard } from '@/components/nodes/ResearchNodeCard'
import type { NodeData } from '@/types/nodes'

export const MechanismNode = memo((props: NodeProps<NodeData>) => (
  <ResearchNodeCard
    {...props}
    title="Mechanism"
    placeholder="Describe the mechanism"
    accentClassName="bg-violet-500"
    focusRingClassName="focus:ring-violet-100"
    nodeType="MECHANISM"
  />
))

MechanismNode.displayName = 'MechanismNode'
