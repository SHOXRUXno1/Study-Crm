# IELTS Imperia — Frontend

React 18 + TypeScript + Vite, with TanStack Query, shadcn/ui and Tailwind.

For the high-level project overview, see the [root README](../README.md).

## Quick start

```powershell
cd frontend

# 1. Dependencies
npm install

# 2. Environment
copy .env.example .env
# .env: VITE_API_URL=http://127.0.0.1:8000/api/v1

# 3. Dev server
npm run dev
```

Open <http://localhost:5173>.

> The backend must be running on the URL configured in `VITE_API_URL`
> (see [`../backend/README.md`](../backend/README.md)).

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run build:dev` | Dev-mode build (sourcemaps, no minify) |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint over the project |
| `npm run test` | Run Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |

## Stack

| Area | Tech |
|------|------|
| Framework | React 18 · TypeScript · Vite 5 |
| Data | TanStack Query · Axios-style fetch wrapper (`src/lib/api.ts`) |
| UI | shadcn/ui (Radix primitives) · Tailwind CSS · `lucide-react` |
| Routing | React Router 6 |
| Forms | React Hook Form · Zod |
| Search | `cmdk` (command palette, Cmd/Ctrl+K) |
| i18n | Custom hook (`src/hooks/use-language.tsx`), EN / RU / UZ |
| Tests | Vitest · Testing Library · jsdom |

## Project layout

```
frontend/
├── public/                 static assets (favicon, robots.txt)
├── src/
│   ├── assets/             images / svgs imported by code
│   ├── components/
│   │   ├── ui/             shadcn components (button, dialog, …)
│   │   └── *.tsx           shared building blocks (Sidebar, KpiCard, …)
│   ├── hooks/
│   │   ├── use-auth.tsx    auth context + JWT lifecycle
│   │   ├── use-language.tsx i18n provider with EN/RU/UZ dictionary
│   │   └── use-*.ts        TanStack Query hooks per resource
│   ├── lib/
│   │   ├── api.ts          fetch client with token injection
│   │   └── utils.ts        cn(), formatters
│   ├── pages/              route components (Groups, Schedule, …)
│   ├── test/               Vitest setup + sample tests
│   ├── App.tsx             route table
│   ├── index.css           Tailwind layers + theme tokens
│   └── main.tsx            React entry
├── components.json         shadcn config
├── tailwind.config.ts
├── vite.config.ts
├── vitest.config.ts
└── package.json
```

## Conventions

- **Data fetching** lives in `src/hooks/use-*.ts` (one hook per resource). Components consume them — never call `apiClient` directly from a page.
- **Role-based UI:** read `useAuth().user?.role` and gate destructive actions client-side. Backend is the source of truth, this is just UX hygiene.
- **i18n:** add new strings to `src/hooks/use-language.tsx` with EN / RU / UZ at minimum. Use `t("namespace.key")`.
- **Status colors:** centralised in `src/components/StatusBadge.tsx` — don't hardcode tailwind classes per status.

## Environment variables

| Var | Default | Purpose |
|-----|---------|---------|
| `VITE_API_URL` | `http://127.0.0.1:8000/api/v1` | Backend API base URL |
| `VITE_TEACHER_METRICS_ENABLED` | unset | Show teacher performance tab (mock data) |
