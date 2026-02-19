import React, { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { NodeProps } from 'reactflow'

import { ResearchNodeCard } from '@/components/nodes/ResearchNodeCard'
import type { NodeData } from '@/types/nodes'

export const ValidationNode = memo((props: NodeProps<NodeData>) => {
  const { t } = useTranslation()
  return (
    <ResearchNodeCard
      {...props}
      title={t('nodes.validation.title')}
      placeholder={t('nodes.validation.placeholder')}
      accentClassName="bg-emerald-500"
      nodeType="VALIDATION"
    />
  )
})

ValidationNode.displayName = 'ValidationNode'
