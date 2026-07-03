# GuildOps API

Express + TypeScript API for the Render `guildops-api` Web Service.

## Scripts

- `npm run dev` starts the API with `tsx`.
- `npm run build` compiles TypeScript into `dist/`.
- `npm run start:prod` runs the compiled server for Render.
- `npm run db:migrate` runs SQL migrations from `db/migrations`.
- `npm run db:migrate:dev` runs migrations without building first.
- `npm run typecheck` verifies TypeScript without emitting files.

## Render

The service expects:

- `PORT` from Render and binds on `0.0.0.0`.
- `DATABASE_URL` from Render Managed PostgreSQL.
- `CORS_ORIGIN` set to the frontend origin.
- `SESSION_SECRET` and `PASSWORD_PEPPER` generated as secrets.
- `APP_PUBLIC_URL` set to the frontend URL used in email verification links.
- `SMTP_URL` and `EMAIL_FROM` for transactional email delivery.

`/healthz` is a liveness endpoint and intentionally does not require the database. Use `/api/v1/readyz` for database readiness.

## Auth

Custom email/password auth uses bcrypt password hashes and database-backed sessions.

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/resend-verification`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/refresh-session`
- `GET /api/v1/me`
- `PATCH /api/v1/me/context`

Registration sends an email verification link and does not create a session. `verify-email` consumes the link, marks the user verified, then sets an `httpOnly` session cookie and a readable CSRF cookie. Unsafe requests with a session cookie must echo the CSRF cookie in the `x-csrf-token` header.

## Messages And Translation

Message responses expose a stable translation interface:

- `original.text`
- `original.language`
- `translated.text`
- `translated.language`
- `translated.status`: `original`, `cached`, or `queued`

If a translation is already present in `translations`, the API returns it. Otherwise it creates a `translation_jobs` row for the Render worker. The worker stores completed results back in `translations`, which is the persistent translation cache.
