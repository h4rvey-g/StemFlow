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

  return { textareaRef, syncHeight }
}
