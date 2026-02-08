import React, { memo } from 'react'
import type { NodeProps } from 'reactflow'

import { ResearchNodeCard } from '@/components/nodes/ResearchNodeCard'
import type { NodeData } from '@/types/nodes'

export const ObservationNode = memo((props: NodeProps<NodeData>) => (
  <ResearchNodeCard
    {...props}
    title="Observation"
    placeholder="Capture an observation"
    accentClassName="bg-blue-500"
    focusRingClassName="focus:ring-blue-100"
    nodeType="OBSERVATION"
  />
))

ObservationNode.displayName = 'ObservationNode'
