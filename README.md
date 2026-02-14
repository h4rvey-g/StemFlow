# StemFlow

A local-first, privacy-first infinite canvas for scientific research. StemFlow structures your thinking around the Observation–Mechanism–Validation (OMV) triad — a directed cycle that mirrors how real science works — and augments it with multi-provider AI and literature search so you can move from raw observations to validated mechanisms without leaving the canvas.

Everything runs in your browser. Your data stays in IndexedDB. Your API keys stay in localStorage. There is no backend.

## TODO
[] Bilingual support (English + Chinese)
[] Separate mechanism and validation prompt
[] Pin nodes to keep them expanded
[] Add a "Fold all" and "Expand all" button, which folds/expands all nodes on the canvas except the pinned ones
[] add bright and dark modes
[] Add example project and tutorial
[] Add translate button on each node to translate from English to Chinese and vice versa; add auto-translate option in settings
[] Opt for too many nodes/content: RAG?

## Features

### OMV Research Canvas

An infinite canvas built on React Flow where every node is one of three types — Observation, Mechanism, or Validation — connected in a directed cycle (O→M→V→O). Connection rules are enforced automatically. Ghost nodes appear as AI-suggested next steps you can accept or dismiss, keeping the research flow moving.

### AI-Powered Research Assistance

Bring your own API key for OpenAI, Anthropic, or Google Gemini. StemFlow uses your chosen model to:

- Generate scientifically grounded next steps (3+ suggestions per generation) with streaming responses
- Perform per-node actions: summarize, suggest mechanisms, critique, expand, or generate questions
- Prioritize high-rated nodes (4–5 stars) and downweight low-rated ones when building context
- Ground suggestions in real literature via Exa web search, with inline citations

### File Attachments & Processing

Upload images and PDFs directly onto nodes. Files are stored as Blobs in IndexedDB — not in memory — and processed off the main thread via Web Workers. Images get AI-generated descriptions; PDFs are parsed with pdfjs-dist and the extracted text feeds into AI context.

### Node Grading & Research Episodes

Rate any node from 1 to 5 stars. Ratings influence how the AI weighs that node's content when generating suggestions. Group related nodes into manual clusters to organize research threads visually.

### Experimental Conditions

Configure your project as dry lab (bioinformatics/computational), wet lab (bench experiments), or both. The selection shapes AI prompts so suggestions match your actual research context.

### Multi-Project Support

Create and switch between multiple research projects. Each project has its own canvas, nodes, edges, research goal, and experimental conditions.

### Local-First Architecture

- All data persisted in IndexedDB via Dexie.js with debounced auto-save
- API keys encrypted and stored in localStorage only (BYOK)
- No server, no telemetry, no data leaves your browser
- Undo/redo support (up to 100 actions)
- Canvas auto-layout with vertical collision resolution

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 + React 18 + TypeScript |
| Canvas | React Flow |
| State | Zustand |
| Storage | IndexedDB (Dexie.js) |
| AI | Vercel AI SDK (@ai-sdk/openai, @ai-sdk/anthropic) |
| Search | Exa API |
| Processing | Web Workers, pdfjs-dist |
| Styling | Tailwind CSS |
| Testing | Vitest, Playwright, Testing Library |

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to get started. Head to Settings to add your API key and configure your research project.
