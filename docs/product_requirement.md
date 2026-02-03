# Product Requirements Document: StemFlow
**Version:** 1.0
**Type:** Open Source / Local-First Web Application
**Core Concept:** AI-Assisted Spatial Reasoning for Scientific Research

---

## 1. Executive Summary
**StemFlow** is a web-based "Visual Lab Partner" designed for individual academic researchers. Unlike linear chatbots (ChatGPT), StemFlow offers an infinite canvas where research is mapped out as a branching tree of logical nodes.

It enforces a specific scientific workflow—the **"Observation-Mechanism-Validation" (OMV) Triad**—to structure the AI’s reasoning. By allowing users to rate the significance of their findings ("Research Episodes"), StemFlow transforms from a simple diagramming tool into a narrative engine capable of drafting research papers based on the user's most critical discoveries.

**Primary Goal:** To reduce the cognitive load of complex research by spatializing logic and automating the suggestion of next steps.

---

## 2. The Core Philosophy: "Guided Flexibility"

The application relies on two structural pillars to manage AI context and user focus.

### A. The OMV Logic Loop
The AI does not just "chat"; it follows the scientific method loop:
1. **Observation Node (Fact):** Input data (Images, PDFs, Text).
2. **Mechanism Node (Hypothesis):** AI suggests *why* the observation happened (citing literature).
3. **Validation Node (Experiment):** AI suggests *how* to test the mechanism.
4. **Result (New Observation):** The loop closes and restarts.

### B. The "Research Episode" & Narrative Rating
- **The Unit:** A completed `Mechanism -> Validation -> Result` chain is grouped into an **"Episode."**
- **The Rating:** The user rates each Episode from **1 to 5 stars** based on scientific significance (not just success).
- **The Payoff:**
    - **AI Attention:** Future suggestions prioritize logic from 5-star episodes.
    - **Paper Drafting:** The "Generate Report" feature uses 5-star episodes as the core content for the Results/Discussion sections.

---

## 3. Technical Architecture (Local-First)

**Constraint:** Zero server-side data storage. Total privacy.

### Stack
- **Frontend Framework:** React (Next.js or Vite).
- **Canvas Engine:** **React Flow** (for node rendering and virtualization).
- **State Management:** **Zustand** (High performance, transient state).
- **Local Database:** **IndexedDB** via **Dexie.js** (Stores full file blobs and text).
- **File System:** **File System Access API** (Allows "Save Project to Disk").
- **AI Layer:** Client-side fetch to **Anthropic API (Claude 3.5 Sonnet)** or OpenAI.
- **Background Processing:** **Web Workers** (Crucial for PDF parsing and data prep to prevent UI freeze).

### Performance Strategy

| Bottleneck | Solution |
| :--- | :--- |
| **Rendering Lag** | Use React Flow's **Viewport Virtualization** (only render visible nodes). |
| **Memory Bloat** | Store raw images/PDFs in **IndexedDB**, not React State. Render thumbnails only. |
| **Context Window** | **Pruning Strategy:** Send only the active branch (Ancestors) + Summaries of older nodes. |
| **PDF Latency** | Parse text via **PDF.js** inside a Web Worker. |

---

## 4. Data Model (JSON Schema)

### The Node Object

```json
{
  "id": "node_uuid",
  "type": "OBSERVATION" | "MECHANISM" | "VALIDATION",
  "data": {
    "text_content": "User notes...",
    "attachments": [{ "id": "file_1", "vision_summary": "Auto-generated description of image" }],
    "ai_context_summary": "Compressed summary for history"
  },
  "position": { "x": 0, "y": 0 },
  "parent_ids": ["node_parent"]
}
```

### The Global Project State

```json
{
  "project_id": "stemflow_01",
  "goal": "Cure X via Pathway Y",
  "constraints": ["Low Budget", "No Sequencer"],
  "episodes": [
    {
      "id": "episode_01",
      "node_ids": ["A", "B", "C"],
      "significance_score": 5, // 1-5
      "reasoning": "Confirmed primary hypothesis"
    }
  ]
}
```

---

## 5. Functional Requirements (MVP)

### Phase 1: The Canvas (Foundation)
- **Infinite Whiteboard:** Pan, zoom, create nodes.
- **Node Types:** distinct UI styling (color/icon) for O, M, V nodes.
- **Connection Logic:** Drag-and-drop connections.
- **Local Persistence:** Auto-save to IndexedDB; Export to `.json`.

### Phase 2: The Brain (AI Integration)
- **BYO Key:** Settings panel to input API Key.
- **Vision-to-Text:** On image upload, AI generates a text description (saved to `vision_summary`).
- **"Generate Next Step":**
    - Backend logic (in browser) traverses the graph to find Ancestors.
    - Constructs prompt with Global State + Ancestor Summaries + Current Node.
    - Renders 3 "Ghost Node" options.

### Phase 3: The Scientist (Advanced Logic)
- **Episode Grouping:** Auto-detect `M->V->O` loops and draw a bounding box.
- **Rating UI:** 5-star widget on the Episode box.
- **Context Pruning:** Implement the "Summary" background worker to compress old nodes.
- **PDF Parsing:** Drag-and-drop PDF to extract text for the context window.

### Phase 4: Launch Polish
- **Export to Report:** A "Drafting" button that compiles 5-star episodes into a Markdown document (Abstract/Results).
- **Templates:** Pre-loaded graphs for "Literature Review" or "Wet Lab Experiment."

---

## 6. UX/UI Flow (The "Happy Path")

1. **Setup:** User opens StemFlow -> Settings -> Pastes API Key -> Creates "New Project."
2. **Input:** User drags a PDF onto the canvas. It becomes an **Observation Node**.
3. **Analysis:** User clicks "Analyze." AI reads PDF text and summaries it.
4. **Ideation:** User drags a line out -> selects "Suggest Mechanisms."
5. **Selection:** 3 Ghost Nodes appear. User confirms one: "Hypothesis: Protein Misfolding."
6. **Planning:** User clicks "Suggest Validation." AI proposes "Western Blot."
7. **Execution (Offline):** User performs the blot in real life.
8. **Result:** User uploads the photo of the blot to the Validation node.
9. **Rating:** System detects the loop is closed. User rates it **5/5**.
10. **Writing:** User clicks "Draft Paper." AI uses this 5-star loop to write the core argument.

