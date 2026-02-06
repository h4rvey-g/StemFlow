import React, { useEffect, useRef } from 'react'

type Props = {
  text: string
  isLoading: boolean
  className?: string
}

export function StreamingText({ text, isLoading, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [text])

  return (
    <div
      ref={containerRef}
      data-testid="streaming-text-container"
      className={
        className ??
        'max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white/80 p-3 text-sm text-slate-800 shadow-inner'
      }
    >
      <div className="whitespace-pre-wrap leading-relaxed">
        {text}
        {isLoading ? (
          <span
            data-testid="typing-cursor"
            className="ml-0.5 inline-block h-4 w-2 translate-y-[2px] animate-pulse rounded-sm bg-slate-500"
          />
        ) : null}
      </div>
    </div>
  )
}
