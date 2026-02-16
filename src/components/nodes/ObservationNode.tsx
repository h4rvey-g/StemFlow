import React, { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { NodeProps } from 'reactflow'

import { ResearchNodeCard } from '@/components/nodes/ResearchNodeCard'
import type { NodeData } from '@/types/nodes'

export const ObservationNode = memo((props: NodeProps<NodeData>) => {
  const { t } = useTranslation()
  return (
    <ResearchNodeCard
      {...props}
      title={t('nodes.observation.title')}
      placeholder={t('nodes.observation.placeholder')}
      accentClassName="bg-blue-500"
      focusRingClassName="focus:ring-blue-100"
      nodeType="OBSERVATION"
    />
  )
})

ObservationNode.displayName = 'ObservationNode'
