# Project Tasks

Lightweight, persistent tasks that live inside an existing Project. This is
an extension of the Projects feature, not a separate task-management
product — see `SYSTEM_BOUNDARIES.md` for the project's general "extend,
don't replace" philosophy.

## Mental model

```
Project = container
Task    = actionable work inside that project
```

Example:

```
Project: CharlestonHacks Website
  - Update HarborHack sponsor section
  - Verify registration links
  - Replace outdated homepage image
  - Review admin access
  - Confirm fall programming dates
```

## Applying the schema

Tasks are stored in a new `public.project_tasks` table, following the same
"manual SQL script" convention as every other table in `supabase/sql/`
(not run automatically by application code):

1. Open the Supabase SQL Editor for the project's database.
2. Run `supabase/sql/tables/PROJECT_TASKS_SCHEMA.sql`.

That script creates the table, indexes, a status/timestamp trigger, RLS
policies, and grants. It's idempotent (`IF NOT EXISTS` / `DROP POLICY IF
EXISTS` throughout) so it's safe to re-run.

## Data model

| Column | Notes |
|---|---|
| `id` | UUID PK |
| `project_id` | FK → `projects.id`, `ON DELETE CASCADE` |
| `title` | required |
| `description` | optional |
| `status` | `open` \| `in_progress` \| `done` (default `open`) |
| `priority` | `high` \| `medium` \| `low` (default `medium`) |
| `owner_id` | FK → `community.id` (nullable — reuses the existing Person model, no new member system) |
| `related_url` | optional URL or root-relative path (e.g. `/harborhack-2026/`) |
| `due_date` | optional |
| `created_at` / `updated_at` | managed automatically |
| `completed_at` | set when `status` becomes `done`, cleared when reopened — enforced by a DB trigger so behavior is consistent regardless of which client writes the row |
| `created_by` / `updated_by` | FK → `community.id` |

## Authorization

Mirrors the existing Projects authorization exactly:

- **View**: any authenticated user (same as `projects` — "Users can view
  all projects").
- **Create / edit / delete**: only the project's creator (same bar as the
  existing "Users can update own projects" policy). Enforced via RLS on
  `project_tasks`, not just hidden in the UI.

This was the deliberate, simplest choice consistent with how the app
already gates project edits. A future enhancement could extend mutation
rights to active project members/admins if that's wanted — deferred here
to keep the authorization model identical to Projects.

## UI

Tasks live in the existing Project detail overlay
(`window.viewProjectDetails`, opened from a project node or "View Full
Details"), which now has four tabs: **Overview**, **Tasks**, **People**,
**Activity**. The network graph and Projects list are unchanged.

The Tasks tab groups work into **Needs Attention** (open), **In
Progress**, and **Done Recently** (newest-completed-first, capped at 10
with a "Show more" button). Status is changed with a compact 3-way
toggle (Open / In Progress / Done) — completing a task is one click.
Lightweight status/priority/owner filters and a text search are
client-side (task lists per project are small).

The Projects list (Command Dashboard "Your Resources" panel) shows an
unfinished-task count next to each project's status, e.g. `active · 4
open`, sourced from one batched query (`ProjectTasks.fetchOpenCounts`)
rather than one query per project.

## Activity log

Task create/complete/reopen/delete/owner-change events are written to the
existing `activity_log` table (same table used elsewhere in the app) via
`action_type` values `task_created`, `task_completed`, `task_reopened`,
`task_deleted`, `task_owner_changed`, with `details` JSONB carrying
`project_id`/`task_id`/`title`. The Activity tab reads this back, filtered
by `project_id` (the table already has a generated `project_id` column
for this).

## Creating the example project + tasks

No seed data is created automatically. To reproduce the example from the
spec, sign in and use the normal UI:

1. Open the Projects flow and create a project titled **CharlestonHacks
   Website**.
2. Open its detail view → **Tasks** tab → **+ Add task**, and add:
   - Update HarborHack sponsor section
   - Verify registration links
   - Replace outdated homepage image
   - Review admin access
   - Confirm fall programming dates

Each can be created with just a title — priority defaults to Medium and
status to Open, per the spec.

## Testing

`scripts/tests/test-project-tasks.js` is a live-database smoke test,
following this repo's existing browser-console test convention (see
`scripts/tests/test-profile-linking.js`). It creates a throwaway project
it owns, exercises create/edit/status/reopen/delete/ordering/unfinished-count/
authorization, then archives the project and deletes the tasks it made.

```js
// In the browser console, signed in:
await testProjectTasks();
```

## Agent compatibility

The schema and `window.ProjectTasks` API expose everything a future
coding agent needs to read a project's work queue — project, title,
description, priority, status, owner, related URL/path, due date, and
timestamps — without any automated pickup/execution being wired up yet
(deliberately out of scope for this change).
