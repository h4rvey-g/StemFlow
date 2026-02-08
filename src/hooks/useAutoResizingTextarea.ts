import { useCallback, useEffect, useRef } from 'react'

export function useAutoResizingTextarea(value: string) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const syncHeight = useCallback((element?: HTMLTextAreaElement | null) => {
    const textarea = element ?? textareaRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [])

  useEffect(() => {
    syncHeight()
  }, [syncHeight, value])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    const handleKeyDown = (event: KeyboardEvent) => {
      const isUndoOrRedoKey = event.key.toLowerCase() === 'z'
      const hasModifier = event.ctrlKey || event.metaKey

      if (isUndoOrRedoKey && hasModifier) {
        event.stopPropagation()
      }
    }

    textarea.addEventListener('keydown', handleKeyDown, true)

    return () => {
      textarea.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [])

  return { textareaRef, syncHeight }
}
