import { create } from 'zustand'

import { db, DEFAULT_PROJECT_ID } from '@/lib/db'
import type { Project } from '@/types/nodes'

const ACTIVE_PROJECT_KEY = 'stemflow:activeProjectId'

const loadActiveProjectId = (): string | null => {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(ACTIVE_PROJECT_KEY)
  } catch {
    return null
  }
}

const persistActiveProjectId = (id: string) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ACTIVE_PROJECT_KEY, id)
  } catch {
    // ignore
  }
}

export interface ProjectStore {
  projects: Project[]
  activeProjectId: string | null
  isLoaded: boolean

  loadProjects: () => Promise<void>
  createProject: (name: string) => Promise<Project>
  renameProject: (id: string, name: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  setActiveProject: (id: string) => void
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  activeProjectId: null,
  isLoaded: false,

  loadProjects: async () => {
    const projects = await db.projects.toArray()

    if (projects.length === 0) {
      const now = new Date()
      const defaultProject: Project = {
        id: DEFAULT_PROJECT_ID,
        name: 'My Research',
        created_at: now,
        updated_at: now,
      }
      await db.projects.put(defaultProject)
      projects.push(defaultProject)
    }

    const savedId = loadActiveProjectId()
    const activeProjectId =
      savedId && projects.some((p) => p.id === savedId)
        ? savedId
        : projects[0].id

    persistActiveProjectId(activeProjectId)
    set({ projects, activeProjectId, isLoaded: true })
  },

  createProject: async (name: string) => {
    const now = new Date()
    const project: Project = {
      id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      created_at: now,
      updated_at: now,
    }
    await db.projects.put(project)
    set((state) => ({ projects: [...state.projects, project] }))
    return project
  },

  renameProject: async (id: string, name: string) => {
    const now = new Date()
    await db.projects.update(id, { name, updated_at: now })
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, name, updated_at: now } : p
      ),
    }))
  },

  deleteProject: async (id: string) => {
    const state = get()
    if (state.projects.length <= 1) return

    await db.transaction('rw', db.projects, db.nodes, db.edges, db.files, async () => {
      await db.nodes.where('projectId').equals(id).delete()
      await db.edges.where('projectId').equals(id).delete()
      await db.files.where('projectId').equals(id).delete()
      await db.projects.delete(id)
    })

    const remaining = state.projects.filter((p) => p.id !== id)
    const needSwitch = state.activeProjectId === id
    const nextActive = needSwitch ? remaining[0].id : state.activeProjectId

    if (needSwitch && nextActive) {
      persistActiveProjectId(nextActive)
    }

    set({
      projects: remaining,
      activeProjectId: nextActive,
    })
  },

  setActiveProject: (id: string) => {
    persistActiveProjectId(id)
    set({ activeProjectId: id })
  },
}))
