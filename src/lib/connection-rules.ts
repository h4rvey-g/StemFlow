import type { NodeType } from '@/types/nodes'

export const getSuggestedTargetTypes = (sourceType: NodeType): NodeType[] => {
  switch (sourceType) {
    case 'OBSERVATION':
      return ['MECHANISM']
    case 'MECHANISM':
      return ['VALIDATION']
    case 'VALIDATION':
      return ['OBSERVATION']
    default:
      return []
  }
}

export const isConnectionSuggested = (sourceType: NodeType, targetType: NodeType): boolean =>
  getSuggestedTargetTypes(sourceType).includes(targetType)
