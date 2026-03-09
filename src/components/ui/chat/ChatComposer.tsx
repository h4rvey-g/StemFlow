import React, { useRef } from 'react'
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'

interface ChatComposerProps {
  draftMessage: string
  setDraftMessage: (value: string) => void
  isLoading: boolean
  sendMessage: (text: string) => Promise<void>
}

export const ChatComposer = ({
  draftMessage,
  setDraftMessage,
  isLoading,
  sendMessage,
}: ChatComposerProps) => {
  const submitInFlightRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const hintId = 'chat-composer-shortcut-hint'
  const canSend = draftMessage.trim().length > 0 && !isLoading

  const submitMessage = async () => {
    const trimmed = draftMessage.trim()
    if (!trimmed || isLoading || submitInFlightRef.current) return

    submitInFlightRef.current = true

    try {
      await sendMessage(trimmed)
      setDraftMessage('')
      textareaRef.current?.focus()
    } finally {
      submitInFlightRef.current = false
    }
  }

  const triggerSubmitMessage = () => {
    void submitMessage().catch((error: unknown) => {
      console.error('Failed to send chat message:', error)
    })
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    triggerSubmitMessage()
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') return

    const syntheticIsComposing =
      Object.prototype.hasOwnProperty.call(event, 'isComposing') &&
      Boolean((event as ReactKeyboardEvent<HTMLTextAreaElement> & { isComposing?: boolean }).isComposing)

    if (event.nativeEvent.isComposing || syntheticIsComposing) return
    if (event.shiftKey) return
    if (!(event.metaKey || event.ctrlKey)) return

    event.preventDefault()
    event.stopPropagation()
    triggerSubmitMessage()
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-slate-200 p-4">
      <div className="flex items-center gap-2">
        <textarea
          ref={textareaRef}
          value={draftMessage}
          onChange={(event) => setDraftMessage(event.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Chat message input"
          aria-describedby={hintId}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          placeholder="Ask about this node or request a revision..."
          rows={3}
        />
        <button
          type="submit"
          aria-keyshortcuts="Control+Enter Meta+Enter"
          disabled={!canSend}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
        >
          {isLoading ? 'Sending…' : 'Send'}
        </button>
      </div>
      <p id={hintId} className="mt-2 text-xs text-slate-500">
        Shift+Enter for newline. Cmd/Ctrl+Enter to send.
      </p>
    </form>
  )
}
