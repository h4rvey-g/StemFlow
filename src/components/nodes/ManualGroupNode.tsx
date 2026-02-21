import React, { memo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import type { NodeProps } from 'reactflow'

import { useStore } from '@/stores/useStore'
import type { ManualGroupNodeData } from '@/types/nodes'

interface MenuPosition {
  x: number
  y: number
}

export const ManualGroupNode = memo(({ data }: NodeProps<ManualGroupNodeData>) => {
  const { t } = useTranslation()
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editLabel, setEditLabel] = useState(data.label)
  
  const deleteManualGroup = useStore((s) => s.deleteManualGroup)
  const renameManualGroup = useStore((s) => s.renameManualGroup)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuPosition({ x: e.clientX, y: e.clientY })
  }, [])

  const closeMenu = useCallback(() => {
    setMenuPosition(null)
  }, [])

  const handleDelete = useCallback(() => {
    deleteManualGroup(data.groupId)
    closeMenu()
  }, [deleteManualGroup, data.groupId, closeMenu])

  const handleRename = useCallback(() => {
    setIsEditing(true)
    closeMenu()
  }, [closeMenu])

  const handleRenameSubmit = useCallback(() => {
    if (editLabel.trim() && editLabel !== data.label) {
      renameManualGroup(data.groupId, editLabel.trim())
    }
    setIsEditing(false)
  }, [editLabel, data.label, data.groupId, renameManualGroup])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit()
    } else if (e.key === 'Escape') {
      setEditLabel(data.label)
      setIsEditing(false)
    }
  }, [handleRenameSubmit, data.label])

  return (
    <div 
      className="relative h-full w-full rounded-2xl border-[3px] border-dashed border-cyan-500/95 bg-cyan-200/20"
      onContextMenu={handleContextMenu}
    >
      <div className="pointer-events-auto absolute left-2 top-2 rounded-lg border border-cyan-300 bg-white/95 px-2 py-1 shadow-sm">
        {isEditing ? (
          <input
            type="text"
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleKeyDown}
            className="w-24 border-b border-cyan-400 bg-transparent text-[10px] font-semibold uppercase tracking-[0.08em] text-cyan-700 outline-none"
            autoFocus
          />
        ) : (
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-cyan-700">{data.label}</p>
        )}
        <p className="text-[10px] text-cyan-600">{t('canvas.nodeCount', { count: data.count })}</p>
      </div>
      
      {menuPosition && createPortal(
        <>
          <div 
            className="fixed inset-0 z-[9998]" 
            onClick={closeMenu}
          />
          <div 
            className="fixed z-[9999] min-w-[120px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
            style={{ left: menuPosition.x, top: menuPosition.y }}
          >
            <button
              type="button"
              onClick={handleRename}
              className="flex w-full items-center px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100"
            >
              {t('common.rename')}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="flex w-full items-center px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
            >
              {t('canvas.ungroup')}
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  )
})

ManualGroupNode.displayName = 'ManualGroupNode'
