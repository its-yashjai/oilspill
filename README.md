# BlueSentinel — Collaborative Oil-Spill Intelligence

A near-real-time collaborative platform for oil-spill investigation and response.

## Architecture

```mermaid
graph TD
    A[Frontend (Next.js 16.3.5)] -->|API Routes| B[Route Handlers]
    B --> C[Drizzle ORM]
    C -->|pg| D[PostgreSQL]
    C -->|pglite| E[Embedded DB]
    B -->|LiveKit| F[LiveKit Server]
    B -->|OpenAI| G[LLM Services]
    B -->|Resend| H[Email Services]
    style A fill:#f9f9f9,stroke:#333,stroke-width:2px
    style B fill:#e3f2fd,stroke:#333,stroke-width:2px
```

## Features

- **Collaborative real-time tracking** via LiveKit
- **AI-powered analysis** with OpenAI integration
- **Incident management** with PostgreSQL/pglite storage
- **Moss ecosystem integration** (optional)
- **Email notifications** via Resend (optional)

## Tech Stack

- **Framework**: Next.js 16.3.5 (App Router)
- **Database**: Drizzle ORM with PostgreSQL or embedded pglite
- **Real-time**: LiveKit client & server SDK
- **UI**: Tailwind CSS, shadcn-style components
- **LLM**: OpenAI API
- **Email**: Resend API

## Available Scripts

| Script | Description |
|--------|-------------|
| `dev` | Start development server |
| `build` | Build production app |
| `start` | Start production server |
| `lint` | Run ESLint |
| `db:generate` | Generate Drizzle migrations |
| `db:migrate` | Run database migrations |
| `db:seed` | Seed database with sample data |

## Environment Variables

Required `.env` variables:

```
DATABASE_URL=postgresql://...
MOSS_PROJECT_ID=...
MOSS_PROJECT_KEY=...
NEXT_PUBLIC_LIVEKIT_URL=...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
OPENAI_API_KEY=...
RESEND_API_KEY=...
```

## Phase 2 routing and rendering fixes

- `package.json`: development and production builds explicitly use Webpack. Next.js 16 defaults to Turbopack, which rejected this project's existing custom Webpack configuration. The reproduced failure ended with `Call retries were exceeded`; selecting Webpack resolved that build failure without changing Moss.
- `lib/db/memory.ts`: the existing memory store is shared through `globalThis` within the server process. Previously, incident creation returned 200 while the detail API and page returned 404 because separate module instances did not share the created incident.
- `app/demo/page.tsx`: navigation requires a successful response containing the expected demo incident ID. Start the demo before opening its incident room.
- `components/incident/TimelinePanel.tsx`: `font-medium` is part of `className`, not a boolean DOM attribute.
- `lib/utils.ts`, `components/incident/FindingsPanel.tsx`, and `components/incident/EvidencePanel.tsx`: structured evidence objects are formatted as text rather than rendered directly as React children. Source, detail, and classification remain visible.
- Next.js updated `tsconfig.json` to use `react-jsx` and include `.next/dev/types/**/*.ts` during the build.

### Verified results

- `npx tsc --noEmit`: passed.
- `npm run build`: passed on Next.js 16.3.5 with Webpack. Existing Moss platform-binding warnings remain; Moss was not changed.
- Direct React server-rendering regression checks through `tsx`: passed for string/object/null evidence formatting, FindingsPanel, EvidencePanel, and TimelinePanel. The timeline check emitted no React warnings.
- Development server on port 3004: `/demo` returned 200; after demo creation, `/api/incidents/demo-incident-001` returned 200 and `/incidents/demo-incident-001` returned 200 with incident-room markup and without the object-as-React-child error. An unknown incident ID still returned 404.
- `/api/health` returned:

```json
{"status":"ok","moss":"configured","livekit":"configured","llm":"real","email":"logged","incidents":1,"mode":"pg"}
```

### Remaining limitations

- `npm run lint` failed during configuration loading with the existing Rushstack ESLint patch error. `eslint-config-next` is still 15.4.5 while Next.js is 16.3.5; lint is not verified clean.
- The shared memory store is not durable storage and does not synchronize separate server processes. Restarting the server clears demo incidents; use Start Demo again. Current incident routes use this memory store, so the health endpoint's `mode: pg` does not prove incident persistence in PostgreSQL.
- Health labels reflect configuration, not verified external-service connectivity. LiveKit browser connectivity, Moss retrieval provenance, and database persistence were not verified by these routing/rendering checks.
- HTTP and server-rendering tests do not establish browser hydration or multiplayer correctness. Phase 3 was not started.

## License

MIT