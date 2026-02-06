import { useGenerate } from '@/hooks/useGenerate'

// Plan compatibility: the codebase originally implemented `useGenerate`.
// This wrapper provides the planned name without changing behavior.
export const useAiGeneration = useGenerate
