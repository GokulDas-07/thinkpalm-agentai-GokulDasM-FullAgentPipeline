# SpecToUI

Name:Gokul Das M
Track:Frontend Dev
Lab Name:Capstone Sandbox — Full Agent Pipeline

> Turn any Product Requirements Document into a complete React component tree — instantly.

SpecToUI is an AI-powered Next.js application where an agentic pipeline reads a PRD, plans a component hierarchy, and generates production-quality TSX code with Tailwind CSS — all streamed live to a 3-panel UI.

---

## What it does

1. **Paste or upload** a Product Requirements Document (PRD) in the left panel
2. **Click "Generate UI"** — the AI agent pipeline kicks off automatically
3. **Watch the Tree View** populate with a live component hierarchy
4. **Browse generated TSX code** per component in the Code Export panel
5. **Export as ZIP** — a complete, ready-to-use React component library

---

## Agentic Pipeline

This project implements a complete end-to-end agentic pipeline with the following components:

### Agents

**PlannerAgent** (`src/lib/agents/PlannerAgent.ts`)
- Receives the raw PRD text
- Uses Groq tool-calling to validate PRD quality, suggest layout patterns, and search NPM for relevant React component libraries
- Runs an explicit ReAct loop (Thought → Action → Observation) with bounded tool iterations
- Produces a validated, structured ComponentTree (via Zod schema)
- Stores the plan in AgentMemory for downstream use

**GeneratorAgent** (`src/lib/agents/GeneratorAgent.ts`)
- Receives the ComponentTree from PlannerAgent
- Iterates over every component in the tree
- Uses Groq tool-calling to validate TSX syntax and check accessibility
- Uses the same bounded ReAct loop pattern for tool-assisted code refinement
- Streams generated TSX code component by component
- Stores each result in AgentMemory

**SummarizerAgent** (`src/lib/agents/SummarizerAgent.ts`)
- Runs after component generation completes
- Reads `prd_analysis`, `component_tree`, and `library_suggestions` from AgentMemory
- Produces a structured generation report using model completion
- Stores the final report in AgentMemory under `generation_summary`

**AgentOrchestrator** (`src/lib/agents/AgentOrchestrator.ts`)
- Composes PlannerAgent, GeneratorAgent, and SummarizerAgent
- Passes shared AgentMemory to both agents
- Emits typed streaming events to the UI: `status`, `tree_ready`, `component_ready`, `done`, `summary_ready`, `error`

### Tool-Calling

Each agent is equipped with tools using the Groq function-calling API:

| Agent | Tool | Purpose |
|---|---|---|
| PlannerAgent | `validate_prd_quality` | Returns a structured PRD quality report (score, checks, warnings, next actions) |
| PlannerAgent | `suggest_layout_pattern` | Returns structured layout guidance based on app type and page complexity |
| PlannerAgent | `search_component_library` | Searches NPM for relevant React libraries and returns top package suggestions |
| GeneratorAgent | `validate_tsx_syntax` | Checks generated code has valid structure |
| GeneratorAgent | `check_accessibility` | Verifies aria labels and semantic HTML |

### Memory

**AgentMemory** (`src/lib/agents/AgentMemory.ts`)
- **Session memory** — stores PRD analysis, component tree, generated codes, and component library suggestions during a session
- **Persistent memory** — saves PRD history to localStorage (client) and all memory keys to a server-side filesystem store (`.memory-store.json`)
- Shared instance passed to both agents, enabling inter-agent communication

**Filesystem Memory Store** (`src/lib/memory-store.ts`)
- Persists agent memory on the server in `.memory-store.json`
- Supports writing per-key values and reading full memory snapshots across sessions

### Pipeline Flow

```
User PRD Input
      │
      ▼
PlannerAgent
  ├── Tool: validate_prd_quality
  ├── Tool: suggest_layout_pattern
  ├── Tool: search_component_library
  ├── Generates ComponentTree (JSON)
  ├── Stores in AgentMemory["library_suggestions"]
  └── Stores in AgentMemory["component_tree"]
      │
      ▼
GeneratorAgent
  ├── Reads ComponentTree from AgentMemory
  ├── For each component:
  │     ├── Tool: validate_tsx_syntax
  │     ├── Tool: check_accessibility
  │     └── Yields { componentId, componentName, code }
  └── Stores each in AgentMemory["code_{id}"]
      │
      ▼
SummarizerAgent
  ├── Reads PRD analysis + component tree + library suggestions from memory
  ├── Produces developer-facing generation summary
  └── Stores in AgentMemory["generation_summary"]
      │
      ▼
Streaming API Route (/api/generate)
      │
      ▼
useGenerate Hook (SSE consumer)
      │
      ▼
3-Panel UI (PRD Editor | Tree View | Code Export)
```

---

## Tech Stack

| Technology | Purpose |
|---|---|
| Next.js 14 (App Router) | Framework |
| TypeScript | Type safety |
| Tailwind CSS | Styling |
| Groq SDK + Llama 3.3 70B | AI model (free) |
| Zod | Schema validation |
| Monaco Editor | PRD input editor |
| Framer Motion | Animations |
| React Syntax Highlighter | Code display |
| JSZip | ZIP export |
| StackBlitz SDK | Live preview |
| next-themes | Dark mode |

---

## Setup Instructions

### Prerequisites
- Node.js 18+
- A free Groq API key — get one at [console.groq.com](https://console.groq.com)

### 1. Clone the repository

```bash
git clone https://github.com/GokulDas-07/SpecToUI-Agent.git
cd spectoui
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env.local` file in the project root:

```env
GROQ_API_KEY=your_groq_api_key_here
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Generate your first UI

1. Click **"Sample"** and select "E-commerce" to load a sample PRD
2. Click **"Generate UI"**
3. Watch the component tree populate in real time
4. Click components in the right panel to view their code
5. Click **"Export ZIP"** to download all components

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                  # Main 3-panel layout
│   ├── layout.tsx                # Root layout with theme provider
│   └── api/generate/route.ts    # Streaming SSE API route
├── lib/
│   ├── agents/
│   │   ├── AgentMemory.ts       # Session + persistent memory
│   │   ├── PlannerAgent.ts      # PRD → ComponentTree agent
│   │   ├── GeneratorAgent.ts    # ComponentTree → TSX agent
│   │   ├── SummarizerAgent.ts   # Generated output → summary report agent
│   │   └── AgentOrchestrator.ts # Composes planner, generator, summarizer
│   ├── prompts.ts               # All AI prompt functions + sample PRDs
│   └── groq-client.ts           # Groq SDK wrapper with streaming helpers
├── hooks/
│   └── useGenerate.ts           # SSE consumer hook
├── components/
│   ├── PrdEditor/               # Left panel: Monaco editor + file upload
│   ├── ComponentPreview/        # Center panel: Tree view + StackBlitz preview
│   └── CodeExport/              # Right panel: Syntax highlighted code + ZIP export
└── types/
    └── component-tree.ts        # Zod schemas + TypeScript types
```

---

## Key Features

- **Streaming pipeline** — see each component generate in real time via Server-Sent Events
- **Recursive component tree** — proper parent-child nesting, not a flat list
- **Tool-calling agents** — agents use function tools to validate and improve output
- **Post-generation summary** — a final report is generated and streamed after code generation
- **Session + persistent memory** — history survives page refresh via localStorage
- **Server-side persistence** — agent memory survives server restarts via filesystem-backed store
- **Accessible code output** — every generated component includes aria labels and semantic HTML
- **Export options** — copy individual components or download full ZIP with index.tsx
- **Sample PRDs** — 3 built-in samples to demo instantly (e-commerce, dashboard, onboarding)
- **Dark mode** — full light/dark support via next-themes
- **Rate limiting** — API route protected with 10 requests/minute per IP

---

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `GROQ_API_KEY` | Your Groq API key from console.groq.com | Yes |

---

## How the Prompt Engineering Works

The AI pipeline uses 4 specialized prompts in sequence:

1. **System prompt** — establishes the AI as a senior frontend architect
2. **PRD parse prompt** — extracts structured data (pages, features, user roles) from free-form text
3. **Component plan prompt** — converts parsed PRD into a typed ComponentTree JSON
4. **Component code prompt** — generates TSX for each node with TypeScript interfaces, Tailwind classes, and accessibility attributes

Each prompt instructs the model to return only valid JSON or raw TSX — no markdown, no explanation — ensuring reliable parsing.
