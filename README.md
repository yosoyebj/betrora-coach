# Betrora Coach Console

Cinematic, professional web app for Betrora coaches, built with Next.js App Router, TypeScript, Tailwind, Supabase, and SWR.

## Getting started

1. **Install dependencies**

```bash
npm install
```

2. **Configure environment**

Create a `.env.local` file in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://sjznxydffrcdhmkearob.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqem54eWRmZnJjZGhta2Vhcm9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTc0NDAsImV4cCI6MjA2NjI3MzQ0MH0.cPkReT3qIm-KrZrjtp0CRBphcAoLsAPHVv3XlCLvJNY

# Base URL of the existing Calmoraa/Betrora app that exposes /api/coach-messages, /api/coaches, /api/ask-ai, /api/wheel-feedback
NEXT_PUBLIC_CALMORAA_API_BASE_URL=http://localhost:3000
```

3. **Run dev server**

```bash
npm run dev
```

Then open `http://localhost:3000` in your browser.

## Key routes

- `/login` – Supabase auth (email/password and Google) with cinematic hero.
- `/dashboard` – KPIs for active clients, pending messages, goals, and stuck tasks.
- `/inbox` – Coach message inbox powered by `/api/coach-messages`.
- `/clients/[userId]` – Client profile with goals, microtasks timeline, and mood heatmap.
- `/profile` – Coach profile editor backed by the `coaches` table.

All database reads/writes use the existing Supabase project and respect RLS via the anon key.
