# StemFlow - Agent Guidelines

**Version:** 1.0  
**Project:** AI-Assisted Canvas for Scientific Research  
**Stack:** React + TypeScript + Zustand + React Flow + IndexedDB (Dexie.js)

---

## Project Overview

StemFlow is a local-first web application that provides an infinite canvas for scientific research using the Observation-Mechanism-Validation (OMV) triad. The application enforces privacy-first architecture with zero server-side data storage.

**Core Technologies:**
- Frontend: React (Next.js or Vite) + TypeScript
- Canvas: React Flow
- State: Zustand
- Storage: IndexedDB via Dexie.js
- AI: Anthropic Claude API (client-side)
- Background: Web Workers

---

## Build Commands

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Production build
npm run build

# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix

# Testing
npm test                    # Run all tests
npm test -- --watch        # Watch mode
npm test -- path/to/test   # Single test file

# Format code
npm run format
npm run format:check
```

---

## Code Style Guidelines

### File Organization

```
src/
├── components/          # React components
│   ├── nodes/          # Canvas node components
│   ├── ui/             # Reusable UI components
│   └── layout/         # Layout components
├── stores/             # Zustand stores
├── lib/                # Utilities and helpers
├── workers/            # Web Workers
├── types/              # TypeScript type definitions
└── hooks/              # Custom React hooks
```

### Imports

**Order:** External → Internal → Types → Styles

```typescript
// External libraries
import { useState, useEffect } from 'react'
import { useStore } from 'zustand'

// Internal modules (absolute imports preferred)
import { NodeType } from '@/types/nodes'
import { useProjectStore } from '@/stores/project'
import { parseDocument } from '@/lib/parser'

// Type-only imports
import type { Node, Edge } from 'reactflow'

// Styles (if applicable)
import styles from './Component.module.css'
```

**Avoid barrel imports** for large libraries (see vercel-react-best-practices):
```typescript
// ❌ Bad
import { Check, X, Menu } from 'lucide-react'

// ✅ Good
import Check from 'lucide-react/dist/esm/icons/check'
import X from 'lucide-react/dist/esm/icons/x'
```

### TypeScript

**Strict mode enabled.** Never suppress type errors.

```typescript
// ❌ Never use
as any
@ts-ignore
@ts-expect-error

// ✅ Define proper types
interface ObservationNode {
  id: string
  type: 'OBSERVATION'
  data: {
    text_content: string
    attachments: Attachment[]
    ai_context_summary: string
  }
  position: { x: number; y: number }
  parent_ids: string[]
}
```

**Prefer `type` for unions/intersections, `interface` for objects:**
```typescript
type NodeType = 'OBSERVATION' | 'MECHANISM' | 'VALIDATION'
interface NodeData { /* ... */ }
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `ObservationNode`, `EpisodeRating` |
| Hooks | camelCase with `use` prefix | `useProjectStore`, `useNodeSelection` |
| Functions | camelCase | `parseDocument`, `generateSummary` |
| Constants | UPPER_SNAKE_CASE | `MAX_CACHE_SIZE`, `API_ENDPOINT` |
| Types/Interfaces | PascalCase | `NodeData`, `Episode` |
| Files | kebab-case | `observation-node.tsx`, `use-canvas.ts` |

### Component Structure

```typescript
'use client' // Only if client component (Next.js)

import { memo } from 'react'
import type { FC } from 'react'

interface Props {
  nodeId: string
  onUpdate: (data: NodeData) => void
}

export const ObservationNode: FC<Props> = memo(({ nodeId, onUpdate }) => {
  // Hooks first
  const store = useProjectStore()
  const [isEditing, setIsEditing] = useState(false)

  // Derived state (no useMemo for simple expressions)
  const isActive = store.activeNodeId === nodeId

  // Event handlers
  const handleEdit = () => {
    setIsEditing(true)
  }

  // Early returns
  if (!nodeId) return null

  // Main render
  return (
    <div className={isActive ? 'active' : ''}>
      {/* ... */}
    </div>
  )
})

ObservationNode.displayName = 'ObservationNode'
```

### State Management (Zustand)

**Store structure:**
```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ProjectStore {
  // State
  nodes: Node[]
  edges: Edge[]
  
  // Actions
  addNode: (node: Node) => void
  updateNode: (id: string, data: Partial<Node>) => void
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      nodes: [],
      edges: [],
      
      addNode: (node) => set((state) => ({
        nodes: [...state.nodes, node]
      })),
      
      updateNode: (id, data) => set((state) => ({
        nodes: state.nodes.map(n => n.id === id ? { ...n, ...data } : n)
      }))
    }),
    { name: 'stemflow-project' }
  )
)
```

**Selector pattern for performance:**
```typescript
// ❌ Subscribes to entire store
const store = useProjectStore()

// ✅ Subscribe only to needed slice
const nodes = useProjectStore(state => state.nodes)
const addNode = useProjectStore(state => state.addNode)
```

### Error Handling

**Never use empty catch blocks:**
```typescript
// ❌ Bad
try {
  await saveToIndexedDB(data)
} catch (e) {}

// ✅ Good
try {
  await saveToIndexedDB(data)
} catch (error) {
  console.error('Failed to save to IndexedDB:', error)
  showErrorToast('Failed to save project')
}
```

**API calls:**
```typescript
async function generateAISuggestion(prompt: string): Promise<string> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({ prompt })
    })
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Network error: Check your connection')
    }
    throw error
  }
}
```

### Async Patterns

**Eliminate waterfalls** (see vercel-react-best-practices):
```typescript
// ❌ Sequential
const user = await fetchUser()
const config = await fetchConfig()

// ✅ Parallel
const [user, config] = await Promise.all([
  fetchUser(),
  fetchConfig()
])
```

**Use functional setState for state updates:**
```typescript
// ❌ Stale closure risk
const addItem = () => {
  setItems([...items, newItem])
}

// ✅ Always current
const addItem = () => {
  setItems(curr => [...curr, newItem])
}
```

### Performance

**Dynamic imports for heavy components:**
```typescript
import dynamic from 'next/dynamic'

const MonacoEditor = dynamic(
  () => import('./monaco-editor'),
  { ssr: false }
)
```

**Lazy state initialization:**
```typescript
// ❌ Runs on every render
const [data, setData] = useState(expensiveComputation())

// ✅ Runs once
const [data, setData] = useState(() => expensiveComputation())
```

**Web Workers for heavy processing:**
```typescript
// workers/pdf-parser.ts
self.onmessage = async (e) => {
  const { file } = e.data
  const text = await parsePDF(file)
  self.postMessage({ text })
}

// Usage
const worker = new Worker(new URL('./workers/pdf-parser', import.meta.url))
worker.postMessage({ file })
worker.onmessage = (e) => {
  const { text } = e.data
  // Use parsed text
}
```

---

## Testing

**Test file naming:** `component-name.test.tsx`

**Structure:**
```typescript
import { render, screen } from '@testing-library/react'
import { ObservationNode } from './observation-node'

describe('ObservationNode', () => {
  it('renders node content', () => {
    render(<ObservationNode nodeId="1" onUpdate={jest.fn()} />)
    expect(screen.getByText('Content')).toBeInTheDocument()
  })
})
```

---

## Git Workflow

**Never commit unless explicitly requested.**

**Commit message format:**
```
type(scope): brief description

- Detailed change 1
- Detailed change 2
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

---

## Privacy & Security

**Critical constraints:**
- Zero server-side data storage
- API keys stored in localStorage only
- All processing client-side
- No telemetry without explicit consent

**API key handling:**
```typescript
// ✅ Store in localStorage with version
const VERSION = 'v1'
try {
  localStorage.setItem(`apiKey:${VERSION}`, encryptedKey)
} catch {
  // Handle quota/privacy mode
}
```

---

## Common Patterns

**IndexedDB via Dexie:**
```typescript
import Dexie from 'dexie'

class StemFlowDB extends Dexie {
  nodes!: Dexie.Table<Node, string>
  
  constructor() {
    super('StemFlowDB')
    this.version(1).stores({
      nodes: 'id, type, *parent_ids'
    })
  }
}

export const db = new StemFlowDB()
```

**React Flow custom nodes:**
```typescript
const nodeTypes = {
  OBSERVATION: ObservationNode,
  MECHANISM: MechanismNode,
  VALIDATION: ValidationNode
}

<ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} />
```

---

## Verification

Before marking work complete:
1. Run `npm run type-check` - must pass
2. Run `npm run lint` - must pass
3. Run `npm test` - must pass (or note pre-existing failures)
4. Verify in browser if UI changes

**Never suppress type errors to "pass" checks.**
