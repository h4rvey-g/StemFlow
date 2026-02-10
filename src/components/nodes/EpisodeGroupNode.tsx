import React, { memo, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import type { NodeProps } from 'reactflow'

import { gradeEpisode } from '@/lib/ai-service'
import { buildEpisodeSuggestionContext } from '@/lib/graph'
import { useStore } from '@/stores/useStore'
import type { EpisodeGroupNodeData } from '@/types/nodes'

const STAR_VALUES = [1, 2, 3, 4, 5] as const

interface MenuPosition {
  x: number
  y: number
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5">
      <path
        d="M10 1.6l2.47 5 5.52.8-4 3.9.94 5.5L10 14.2l-4.93 2.6.94-5.5-4-3.9 5.52-.8L10 1.6z"
        className={filled ? 'fill-amber-400 stroke-amber-500' : 'fill-transparent stroke-slate-400'}
        strokeWidth="1.2"
      />
    </svg>
  )
}

export const EpisodeGroupNode = memo(({ data }: NodeProps<EpisodeGroupNodeData>) => {
  const setEpisodeRating = useStore((state) => state.setEpisodeRating)
  const ungroupEpisode = useStore((state) => state.ungroupEpisode)
  const [isGrading, setIsGrading] = useState(false)
  const [gradingError, setGradingError] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const rating = Math.min(5, Math.max(1, Math.round(data.rating || 0)))

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setMenuPosition({ x: event.clientX, y: event.clientY })
  }, [])

  const closeMenu = useCallback(() => {
    setMenuPosition(null)
  }, [])

  const handleUngroup = useCallback(() => {
    ungroupEpisode(data.episodeId)
    closeMenu()
  }, [ungroupEpisode, data.episodeId, closeMenu])

  const handleAiGrade = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()

    if (isGrading) return

    const { nodes, edges, episodeRatings, globalGoal } = useStore.getState()

    const episodeContext = buildEpisodeSuggestionContext(nodes, edges, episodeRatings).find(
      (episode) => episode.id === data.episodeId
    )

    if (!episodeContext) {
      setGradingError('Episode context is not available yet.')
      return
    }

    setGradingError(null)
    setIsGrading(true)

    try {
      const aiRating = await gradeEpisode(episodeContext, globalGoal)
      setEpisodeRating(data.episodeId, aiRating)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to grade episode with AI.'
      setGradingError(message)
    } finally {
      setIsGrading(false)
    }
  }

  return (
    <div className="pointer-events-none relative z-10 h-full w-full rounded-2xl border-2 border-dashed border-amber-300/90 bg-transparent">
      <div
        className="pointer-events-auto absolute left-2 top-2 z-20 rounded-lg border border-amber-200 bg-white/95 px-2 py-1 shadow-sm backdrop-blur"
        onContextMenu={handleContextMenu}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700">Episode</p>
        <div className="mt-1 flex items-center gap-0.5" role="group" aria-label="Episode rating">
          {STAR_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              className="rounded-sm text-slate-600 transition-colors hover:text-amber-500"
              aria-label={`Rate episode ${value} star${value === 1 ? '' : 's'}`}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setEpisodeRating(data.episodeId, value)
              }}
            >
              <StarIcon filled={value <= rating} />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleAiGrade}
          disabled={isGrading}
          aria-label="Grade episode with AI"
        >
          {isGrading ? 'Grading...' : 'Grade with AI'}
        </button>
        {gradingError ? <p className="mt-1 max-w-[180px] text-[10px] text-rose-600">{gradingError}</p> : null}
      </div>
      {menuPosition && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={closeMenu} />
          <div
            className="fixed z-[9999] min-w-[120px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
            style={{ left: menuPosition.x, top: menuPosition.y }}
          >
            <button
              type="button"
              onClick={handleUngroup}
              className="flex w-full items-center px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
            >
              Ungroup
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  )
})

EpisodeGroupNode.displayName = 'EpisodeGroupNode'
