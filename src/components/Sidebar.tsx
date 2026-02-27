import React, { memo, DragEvent, useState, useRef, useEffect } from 'react'
import { useProjectStore } from '@/stores/useProjectStore'
import { SettingsModal } from './ui/SettingsModal'
import { useTranslation } from 'react-i18next'
import { Settings, Plus, X, Check } from 'lucide-react'

const SettingsIcon = Settings
const PlusIcon = Plus
const XIcon = X
const CheckIcon = Check

export const Sidebar = memo(() => {
  const { t } = useTranslation()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const projects = useProjectStore((s) => s.projects)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const createProject = useProjectStore((s) => s.createProject)
  const renameProject = useProjectStore((s) => s.renameProject)
  const deleteProject = useProjectStore((s) => s.deleteProject)

  useEffect(() => {
    if (editingProjectId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingProjectId])

  const handleCreateProject = async () => {
    const newProject = await createProject(t('sidebar.defaultProjectName'))
    setActiveProject(newProject.id)
    setEditingProjectId(newProject.id)
    setEditName(newProject.name)
  }

  const handleStartEdit = (id: string, name: string) => {
    setEditingProjectId(id)
    setEditName(name)
  }

  const handleSaveEdit = async () => {
    if (editingProjectId && editName.trim()) {
      await renameProject(editingProjectId, editName.trim())
    }
    setEditingProjectId(null)
    setEditName('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      setEditingProjectId(null)
      setEditName('')
    }
  }

  const handleDeleteProject = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (projects.length <= 1) return
    if (window.confirm(t('sidebar.deleteConfirm'))) {
      await deleteProject(id)
    }
  }

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
    <aside className="flex h-full w-64 flex-col border-r border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
      <div className="flex-1 overflow-y-auto">
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{t('sidebar.projects')}</div>
            <button
              onClick={handleCreateProject}
              className="rounded-md bg-slate-100 p-1 text-slate-600 hover:bg-slate-200 hover:text-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
              title={t('sidebar.newProject')}
            >
              <PlusIcon />
            </button>
          </div>
          <div className="space-y-1">
            {projects.map((project) => (
              <div
                key={project.id}
                className={`group relative flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                  activeProjectId === project.id
                      ? 'bg-slate-100 font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-slate-100'
                }`}
                onClick={() => setActiveProject(project.id)}
              >
                {editingProjectId === project.id ? (
                  <div className="flex w-full items-center gap-1">
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={handleSaveEdit}
                      onKeyDown={handleKeyDown}
                      className="w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-xs focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSaveEdit()
                      }}
                      className="text-green-600 hover:text-green-700"
                    >
                      <CheckIcon />
                    </button>
                  </div>
                ) : (
                  <>
                    <span
                      className="truncate cursor-pointer"
                      onDoubleClick={() => handleStartEdit(project.id, project.name)}
                      title={project.name}
                    >
                      {project.name}
                    </span>
                    {projects.length > 1 && (
                      <button
                        onClick={(e) => handleDeleteProject(e, project.id)}
                        className="hidden text-slate-400 hover:text-red-500 group-hover:block dark:text-slate-500 dark:hover:text-red-400"
                        title={t('sidebar.deleteProject')}
                      >
                        <XIcon />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{t('sidebar.nodesHeading')}</div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-300">{t('sidebar.dragBadge')}</span>
        </div>

        <div
          className="mb-3 cursor-grab rounded-xl bg-gradient-to-r from-blue-500 to-sky-500 p-3 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          onDragStart={(event) => onDragStart(event, 'OBSERVATION')}
          onDragEnd={onDragEnd}
          draggable
          data-testid="sidebar-observation"
        >
          {t('sidebar.nodes.observation')}
        </div>

        <div
          className="mb-3 cursor-grab rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 p-3 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          onDragStart={(event) => onDragStart(event, 'MECHANISM')}
          onDragEnd={onDragEnd}
          draggable
          data-testid="sidebar-mechanism"
        >
          {t('sidebar.nodes.mechanism')}
        </div>

        <div
          className="mb-3 cursor-grab rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 p-3 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          onDragStart={(event) => onDragStart(event, 'VALIDATION')}
          onDragEnd={onDragEnd}
          draggable
          data-testid="sidebar-validation"
        >
          {t('sidebar.nodes.validation')}
        </div>

        <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          {t('sidebar.nodesHelper')}
        </div>
      </div>

        <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-200 hover:bg-slate-100 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800"
            data-testid="sidebar-settings"
          >
            <SettingsIcon />
            {t('sidebar.settings')}
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
