# heartbeat
Polyglot SaaS dashboard (React, Go, Python) for multi-tenant project monitoring and log management

## Quickstart (local)

1) Backend
- Copy `backend/.env.example` to `backend/.env` and fill `SUPABASE_URL` + `SUPABASE_ANON_KEY`
- Run: `cd backend && go run .`

2) Frontend
- Copy `frontend/.env.example` to `frontend/.env` and fill `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
- Run: `cd frontend && npm install && npm run dev`

Frontend calls the backend via `/api/...` (Vite dev proxy), and shows a banner if the backend or Supabase env is missing.

## Docker Compose

- Copy env examples to `backend/.env` and `frontend/.env`
- Run: `docker compose up --build`
