import React, { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { NodeProps } from 'reactflow'

import { ResearchNodeCard } from '@/components/nodes/ResearchNodeCard'
import type { NodeData } from '@/types/nodes'

export const MechanismNode = memo((props: NodeProps<NodeData>) => {
  const { t } = useTranslation()
  return (
    <ResearchNodeCard
      {...props}
      title={t('nodes.mechanism.title')}
      placeholder={t('nodes.mechanism.placeholder')}
      accentClassName="bg-violet-500"
      nodeType="MECHANISM"
    />
  )
})

MechanismNode.displayName = 'MechanismNode'
