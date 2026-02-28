import React from 'react'
import type { FormEvent } from 'react'

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
  const canSend = draftMessage.trim().length > 0 && !isLoading

  const submitMessage = async () => {
    const trimmed = draftMessage.trim()
    if (!trimmed || isLoading) return

    setDraftMessage('')
    await sendMessage(trimmed)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await submitMessage()
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-slate-200 p-4">
      <div className="flex items-center gap-2">
        <textarea
          value={draftMessage}
          onChange={(event) => setDraftMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return

            if (event.shiftKey) return

            if (!(event.metaKey || event.ctrlKey)) return

            event.preventDefault()
            void submitMessage()
          }}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          placeholder="Ask about this node or request a revision..."
          rows={3}
        />
        <button
          type="submit"
          disabled={!canSend}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
        >
          {isLoading ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  )
}
