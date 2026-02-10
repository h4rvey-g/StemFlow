import React, { memo, DragEvent, useState } from 'react'
import { SettingsModal } from './ui/SettingsModal'

const SettingsIcon = () => (
  <svg
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
  </svg>
)

export const Sidebar = memo(() => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const onDragStart = (event: DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.setData('text/plain', nodeType)
    event.dataTransfer.effectAllowed = 'move'

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('stemflow:sidebar-drag-start', {
          detail: { nodeType },
        })
      )
    }
  }

  const onDragEnd = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('stemflow:sidebar-drag-end'))
    }
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
      <div className="flex-1">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-semibold uppercase tracking-wide text-slate-600">Nodes</div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">Drag</span>
        </div>

        <div
          className="mb-3 cursor-grab rounded-xl bg-gradient-to-r from-blue-500 to-sky-500 p-3 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          onDragStart={(event) => onDragStart(event, 'OBSERVATION')}
          onDragEnd={onDragEnd}
          draggable
          data-testid="sidebar-observation"
        >
          Observation
        </div>

        <div
          className="mb-3 cursor-grab rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 p-3 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          onDragStart={(event) => onDragStart(event, 'MECHANISM')}
          onDragEnd={onDragEnd}
          draggable
          data-testid="sidebar-mechanism"
        >
          Mechanism
        </div>

        <div
          className="mb-3 cursor-grab rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 p-3 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          onDragStart={(event) => onDragStart(event, 'VALIDATION')}
          onDragEnd={onDragEnd}
          draggable
          data-testid="sidebar-validation"
        >
          Validation
        </div>

        <div className="mt-4 text-xs text-slate-500">
          Drag these nodes to the canvas.
        </div>
      </div>

      <div className="border-t border-slate-200 pt-4">
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-200 hover:bg-slate-100"
          data-testid="sidebar-settings"
        >
          <SettingsIcon />
          Settings
        </button>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </aside>
  )
})

Sidebar.displayName = 'Sidebar'
