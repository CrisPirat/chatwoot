# Chatwoot Fork Guide

## Fork and License

- The initial clone has only the official `upstream` remote on `develop`. Create the GitHub fork and add it as `origin` before pushing; never push to `upstream`.
- Upstream `develop` is the current development branch. Use `master` or a `v*` tag as a stable baseline. The configured pre-push validation rejects direct pushes to both branches.
- Code outside `enterprise/` is MIT: retain the copyright and permission notice in `LICENSE` when modifying or distributing it.
- `enterprise/` has a separate Enterprise License. Development/testing changes are allowed, but production use or distribution requires a valid subscription. Do not copy Enterprise code into the OSS fork.

## Stack and Services

- Use Ruby `3.4.4`, Node `24.13.0`, and pnpm `10.2.0`; run Ruby CLIs through `bundle exec`.
- For native setup, copy `.env.example` to `.env`, change its Docker host names (`postgres`, `redis`) to local services if needed, then run `bundle install`, `pnpm install`, and `bundle exec rails db:chatwoot_prepare`.
- For Docker on a clean cache, set a non-empty `POSTGRES_PASSWORD` in `.env`, run `docker compose build base` before `docker compose up --build -d`, then run `docker compose exec rails bundle exec rails db:chatwoot_prepare`.
- `pnpm dev` starts Rails on `:3000`, Sidekiq, and Vite through `Procfile.dev`. `pnpm start:dev` is the Foreman alternative.
- Full backend CI uses PostgreSQL 16 with pgvector and Redis; CircleCI also provisions OpenSearch. Have those services available before debugging integration or full-suite failures.

## Verification

- JavaScript: `pnpm eslint`; focused Vitest spec: `pnpm test -- path/to/spec.js`.
- Ruby: `bundle exec rubocop --parallel`; focused spec: `bundle exec rspec spec/path/to/file_spec.rb[:line]`.
- After API Swagger changes, run `bundle exec rake swagger:build` and commit the regenerated `swagger/swagger.json`; CI rejects an out-of-sync artifact.

## Layout and Conventions

- Rails routes start in `config/routes.rb`; server code is in `app/`. Vite entrypoints in `app/javascript/entrypoints/` boot the dashboard, widget, SDK, portal, survey, and super-admin apps.
- Rails loads `enterprise/app`, `enterprise/lib`, Enterprise views, and Enterprise initializers. Account for that overlay in shared core changes without modifying proprietary code unless licensed.
- Add user-facing strings through i18n. Edit only `config/locales/en.yml` for backend copy and `app/javascript/dashboard/i18n/locale/en/` for dashboard copy; do not hand-edit community translations.
- New Vue work uses Composition API with `<script setup>` and Tailwind utilities, not scoped, inline, or custom CSS. Use `components-next/` for message bubbles.
- For white-labelable UI copy that says `Chatwoot`, call `replaceInstallationName` from `shared/composables/useBranding`.
