import React, { memo, DragEvent } from 'react'

export const Sidebar = memo(() => {
  const onDragStart = (event: DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <aside className="w-64 border-r border-gray-200 p-4 bg-gray-50">
      <div className="mb-4 font-bold text-gray-700">Nodes</div>
      
      <div
        className="mb-3 p-3 rounded cursor-grab bg-blue-500 text-white font-medium shadow-sm hover:shadow-md transition-shadow"
        onDragStart={(event) => onDragStart(event, 'OBSERVATION')}
        draggable
        data-testid="sidebar-observation"
      >
        Observation
      </div>

      <div
        className="mb-3 p-3 rounded cursor-grab bg-purple-500 text-white font-medium shadow-sm hover:shadow-md transition-shadow"
        onDragStart={(event) => onDragStart(event, 'MECHANISM')}
        draggable
        data-testid="sidebar-mechanism"
      >
        Mechanism
      </div>

      <div
        className="mb-3 p-3 rounded cursor-grab bg-green-500 text-white font-medium shadow-sm hover:shadow-md transition-shadow"
        onDragStart={(event) => onDragStart(event, 'VALIDATION')}
        draggable
        data-testid="sidebar-validation"
      >
        Validation
      </div>

      <div className="mt-4 text-xs text-gray-500">
        Drag these nodes to the canvas.
      </div>
    </aside>
  )
})

Sidebar.displayName = 'Sidebar'
