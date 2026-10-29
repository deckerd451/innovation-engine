# Member email privacy (database)

Members and visitors can read every member's email address today: `anon` and
`authenticated` hold `SELECT` on all of `public.community`, and the
hidden-profile policy limits rows, not columns. Stage B (PR #313, merged)
stopped the website reading email. This change stops the database handing it
out, in two migrations:

| Part | File | What it does | Removes access? |
|---|---|---|---|
| A, prepare | `supabase/sql/migrations/20261029_member_email_privacy_prepare.sql` | Views and functions stop returning email; the claim works server-side only; admin-only email functions are added | No |
| B, lock | `supabase/sql/migrations/20261029b_member_email_privacy_lock.sql` | `anon`/`authenticated` lose `SELECT` on `community.email` (every other column stays readable) | Yes |

Rollbacks: `supabase/sql/rollback/20261029_member_email_privacy_prepare_rollback.sql`
and `20261029b_member_email_privacy_lock_rollback.sql`.

## 1. Audit: what reads `community.email`

Sources: the production catalog checks already run (2026-10-28), the
production claim definition (fingerprint `aa77d108…`), this repository, and
read-only checkouts of `nearify-ios` (main, 49887ef, 2026-09-21),
`nearify-web` and `Charlestonhacks/charlestonhacks.github.io` (main, 76a4dce,
2026-10-28). Nothing in production was read beyond those catalog checks.

### Database

| Object | How it reads email | After the lock, unchanged | This change |
|---|---|---|---|
| `community` table | `anon`/`authenticated` `SELECT` on every column | Anyone can read every email | B: column `SELECT` on email removed |
| `community_with_last_seen` (view, `security_invoker`) | Includes `email` | Would fail for **every** query, not just ones asking for email (tested) | A: email returned as null; same columns, options and grants |
| `admin_ideas_overview` (view, `security_invoker`) | Includes email | Same | A: same |
| `get_start_sequence_data(uuid)` (invoker; prod = repo, `97558dd2…`) | `'email', c.email` for any visible profile, by any caller | Would fail | A: returns `email: null`; nothing else changes |
| `get_project_interest_requests(uuid)` (definer, project owners) | Requester email, hidden members included | Keeps exposing email | A: returns `email: null` |
| `claim_community_profile_by_email()` (definer) | Matches the caller's sign-in email | Keeps working | A: replaced; see section 2 |
| `get_community_id_from_auth()` (definer; used by connection policies) | Finds the caller's profile by `auth.email()` | Keeps working (runs as owner) | None |
| RLS policies | None reference email (production check) | — | B stops if any appear |
| Other functions, views, policies in production | Not yet listed | Unknown | Preflight P2 lists them; B stops on any that would break |

### Website (this repository)

After PR #313 the only email reads left were marked ones:

- **Sign-in fallback** (`auth.js`): an email lookup used when the claim failed. It's removed. A failed claim now fails the profile load, and the dashboard retries it, claim included (`window.retrySignedInProfile`). Nothing is created in the meantime.
- **Admin People panel** (`adminPeopleService.js`, `dashboard-actions.js`): list, search, details, the "already exists" check, the export and sorting by email. These now use the admin functions.

`scripts/tests/test-profile-email-reads.js` now allows no email selects,
filters or sorts at all.

### Nearify iOS

The app talks to two Supabase projects:

- **Nearify's own** (`unndey…`): its `profiles` table, `ensure_profile`, events.
- **Buildspace's** (`mqbsj…`): only through `InnovationEngineBridgeService`'s RPCs:
  - `link_nearify_account`, `unlink_nearify_account`, `get_nearify_link_status`
  - `get_nearify_authorization_status`, `reconfirm_nearify_authorization`
  - `ingest_nearify_event_presence`, `set_nearify_event_live_presence`
  - `get_nearify_event_recommendations`, `get_nearify_live_attendee_signals`
  - `get_nearify_relationship_enrichment`, `get_nearify_between_intelligence`

It never queries Buildspace's `community` table:

- `CommunityIdentityService.swift` does select and filter on `email`, but it has no callers, and it uses Nearify's own client.
- `ingest_nearify_interaction` appears only in the nested `nearify-ios/` copy, which isn't built.

The repository versions of those RPCs don't read email.

**Unverified:**
- **Production versions of the bridge RPCs:** if one reads `community.email` as an invoker, preflight P2 lists it and part B stops.
- **Whether the App Store build matches main 49887ef.**

### charlestonhacks.com (not changed)

The site uses Buildspace's Supabase project directly:

- **Portal (`hub.html`):** embeds the Buildspace site in a frame and reads only `name, is_disabled`. Unaffected.
- **Home page (`index.html`):** calls `get_pulse_metrics`; preflight P2 shows whether that function touches email. Organizations pages and `admin/index.html` read no email.
- **Would break after part B:** the site still hosts an **old copy of the Buildspace dashboard** (`dashboard.html` with its own `auth.js`, `profile.js` and `assets/js/*`). It uses `select('*')` and email selects and filters throughout, including its sign-in.
  - It isn't linked from the portal or home page, but it's publicly reachable.
  - `cynq.html` imports the same old `supabaseClient.js`, whose profile helpers also read email, though nothing on that page appears to call them.
  - Decide before part B whether these pages can break or should be taken down. This change doesn't touch that site.

## 2. Design

**Lock by column privilege.** Part B revokes table-level `SELECT` from `anon` and `authenticated`, and grants `SELECT` on every column except email.
- **Rows:** still governed by the unchanged hidden-profile policy.
- **Writes:** `INSERT`/`UPDATE` are untouched, so profiles are still created with the sign-in email.
- **What fails:** selecting email, filtering or sorting on it, `select=*`, whole-row references and `RETURNING email`. All of these fail with "permission denied".
- **Admins:** like members, they can't read the column directly.
- **Unaffected:** `service_role`, the SQL editor (`postgres`) and functions owned by `postgres`.
- **Caveat:** a column added to `community` later is not readable by members until granted (`GRANT SELECT (col) ON public.community TO anon, authenticated;`).

**Views keep running as the caller.** `CREATE OR REPLACE VIEW` without its `WITH (...)` clause silently resets `security_invoker`. The view would then run as its owner and **bypass the hidden-profile policy**. Part A restates the saved options and stops if options, grants or columns change. The tests check that hidden profiles stay hidden through both views.

**Rewritten from production, not from this repository.** Part A doesn't contain copies of the two functions or two views. At apply time it takes production's own definition and changes only the email expression:
- **Functions:** `'email', c.email` becomes `'email', NULL::text`, and the expression must occur exactly once.
- **Views:** each `<community alias>.email` output becomes `NULL::<type> AS <same name>`.
- **Stops if:** the expression isn't found as expected, or the result would still read email, change columns, or change options or grants. Nothing is left half-applied (one transaction).
- **Reviewing first:** preflight P3 shows the current definitions.

**Claiming, server-side only.** Part A's `claim_community_profile_by_email()` keeps production's behaviour:
- It returns the caller's linked profile.
- Otherwise it picks one unclaimed profile with the sign-in email (completed, then onboarded, then oldest) and links it.
- It leaves other duplicates exactly as they are; their projects and connections are untouched.

It differs from production in five ways:
- It links in one statement, and returns only a profile now linked to the caller. Production can return the picked id even when another account linked it first.
- A profile locked by another statement (an admin edit, a concurrent claim) is waited for, not skipped. If unclaimed profiles with the email still remain after a few tries, it raises a retryable error ("Profile claim busy; try again"). It never reports "none", because that would make sign-in create an empty profile; sign-in retries the error.
- If another sign-in of the same account linked a profile meanwhile, it returns that profile.
- `anon` can no longer call it.
- NULL completion flags count as false. Production's `DESC` ordering may put NULLs first.

The website still checks that a returned profile is linked to the member, so it works with either version.

**Admin access.** Three functions refuse anyone whose own profile isn't `user_role = 'Admin'` and enabled:
- **`admin_member_emails(uuid[])`:** emails for up to 1000 given profiles.
- **`admin_find_members_by_email(text, boolean)`:** exact (case- and space-insensitive) or partial match, at most 200 rows. Used for the "already exists" checks.
- **`admin_search_people(...)`:** one page of the People list, matching name or email, with the panel's filters and sort (including by email) and the total count. It returns ids only, and the panel reads the rows by id.
  - Every match is reachable by paging; only the page size is capped, at 200.

In the searches, `%` and `_` match only themselves.

`EXECUTE` goes to `authenticated` only.

**Rollback copies.** Part A saves the exact original definitions, options and grants in `buildspace_rollback.member_email_privacy`. That schema isn't exposed by the API, and `anon`/`authenticated` have no access. Part B adds which roles held table-level `SELECT`. The rollbacks restore from these copies, then drop them.

## 3. Preflight (read-only; returns code and settings, no member data)

**P1. Columns and grants on `community`.** Expect: `anon` and `authenticated` hold table-level `SELECT`, no `PUBLIC` grant, and no column grants.
```sql
SELECT 'column' AS kind, column_name AS name, data_type AS detail
FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'community'
UNION ALL
SELECT 'table grant', grantee, string_agg(privilege_type, ',' ORDER BY privilege_type)
FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'community' GROUP BY grantee
UNION ALL
SELECT 'column grant', a.attname || ' -> ' || CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE x.grantee::regrole::text END, x.privilege_type
FROM pg_attribute a, aclexplode(a.attacl) x WHERE a.attrelid = 'public.community'::regclass
ORDER BY 1, 2;
```

**P2. Everything else that mentions email.** Expect:
- the two views
- `get_start_sequence_data` (invoker)
- `get_project_interest_requests`, the claim and `get_community_id_from_auth` (definer)
- no policies

Anything else needs a look before part B. Part B stops on any view, policy, or invoker function in this list.
```sql
SELECT 'view' AS kind, rw.ev_class::regclass::text AS name, c.relkind::text AS detail, md5(pg_get_viewdef(rw.ev_class)) AS fingerprint
FROM pg_depend d JOIN pg_rewrite rw ON rw.oid = d.objid JOIN pg_class c ON c.oid = rw.ev_class
WHERE d.classid = 'pg_rewrite'::regclass AND d.refobjid = 'public.community'::regclass
  AND d.refobjsubid = (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.community'::regclass AND attname = 'email')
  AND rw.ev_class <> 'public.community'::regclass
UNION ALL
SELECT 'function', p.oid::regprocedure::text,
       CASE WHEN p.prosecdef THEN 'definer' ELSE 'invoker' END || ' ' || coalesce(p.proacl::text, 'default'), md5(p.prosrc)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND p.prosrc ~* '\memail\M' AND p.prosrc ~* '\mcommunity\M'
UNION ALL
SELECT 'policy', schemaname || '.' || tablename || ': ' || policyname, cmd, md5(coalesce(qual, '') || coalesce(with_check, ''))
FROM pg_policies WHERE (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~* '\memail\M'
ORDER BY 1, 2;
```

**P3. The definitions part A rewrites.** Expect:
- `get_start_sequence_data` `97558dd2a13da70ee9712a460475fbe2`
- `get_project_interest_requests` `482f7bee15d24855f1a2b8d22e8a5584` (this repository's copy; production's is unverified)
- two views with `security_invoker=true`, each with an `<alias>.email` output column.
```sql
SELECT 'view' AS kind, c.oid::regclass::text AS name, array_to_string(c.reloptions, ',') AS detail, pg_get_viewdef(c.oid, true) AS definition
FROM pg_class c WHERE c.oid IN ('public.community_with_last_seen'::regclass, 'public.admin_ideas_overview'::regclass)
UNION ALL
SELECT 'function', p.oid::regprocedure::text, md5(p.prosrc), pg_get_functiondef(p.oid)
FROM pg_proc p WHERE p.oid IN ('public.get_start_sequence_data(uuid)'::regprocedure, 'public.get_project_interest_requests(uuid)'::regprocedure);
```

## 4. Rollout order

1. **Preflight.** Run P1 to P3 and review them, along with the charlestonhacks.com decision (section 1).
2. **Apply part A** in the SQL editor, then run verification A.
3. **Merge this PR**, which deploys the website. Check:
   - a returning member signs in and loads their profile
   - a new member gets one profile and onboarding
   - the admin People panel shows, searches and exports emails, and "Add person" says when an email already exists
   - Inbox, Explore, the profile page and the Network map work
   - Nearify linking status loads in the iOS app
4. **Apply part B**, then run verification B and repeat the checks in step 3.
5. **Watch Supabase's API and Postgres logs for "permission denied for table community".** Anything there is an outside reader, such as the charlestonhacks.com legacy pages or an unknown script.

Order matters: part B before part A stops itself. The website before part A works, but admin emails stay blank and "Add person" fails until part A is applied.

## 5. Verification

**After part A** (read-only). Expect:
- `claim_anon_execute` false
- the two admin functions present, executable by `authenticated` only
- both views `security_invoker=true`
- P2 shows no views

Fingerprints after part A (from the local model, whose functions match production's verified text):
- `get_start_sequence_data` `ed7ee3319fe8d304b5eb708b7983d6c9`
- `get_project_interest_requests` `2455e0331f615f2451808d2cd1d82361` (only if production's copy matched the repository's)
- `claim_community_profile_by_email` `b9177746253874dea5d6c94090c04b16`
```sql
SELECT has_function_privilege('anon', 'public.claim_community_profile_by_email()', 'EXECUTE') AS claim_anon_execute,
       has_function_privilege('anon', 'public.admin_member_emails(uuid[])', 'EXECUTE') AS admin_fn_anon,
       has_function_privilege('authenticated', 'public.admin_member_emails(uuid[])', 'EXECUTE') AS admin_fn_members_can_call,
       (SELECT string_agg(relname || ':' || array_to_string(reloptions, ','), ' ') FROM pg_class
         WHERE oid IN ('public.community_with_last_seen'::regclass, 'public.admin_ideas_overview'::regclass)) AS view_options,
       (SELECT string_agg(p.proname || ' ' || md5(p.prosrc), ', ' ORDER BY p.proname) FROM pg_proc p
         WHERE p.proname IN ('get_start_sequence_data', 'get_project_interest_requests', 'claim_community_profile_by_email')) AS fingerprints;
```
(`admin_fn_members_can_call` is true because the function itself checks for admins.)

**After part B** (read-only). Expect `false, false, true, true, true`. Then, as a member, the column read must be denied. `LIMIT 0` and `ROLLBACK` mean no row is read and nothing changes.
```sql
SELECT has_column_privilege('anon', 'public.community', 'email', 'SELECT') AS anon_email,
       has_column_privilege('authenticated', 'public.community', 'email', 'SELECT') AS member_email,
       has_column_privilege('authenticated', 'public.community', 'name', 'SELECT') AS member_name,
       has_column_privilege('authenticated', 'public.community', 'email', 'INSERT') AS member_insert_email,
       has_table_privilege('authenticated', 'public.community', 'UPDATE') AS member_update;

BEGIN; SET LOCAL ROLE authenticated; SELECT email FROM public.community LIMIT 0; ROLLBACK;
-- expect: ERROR: permission denied for table community
```

## 6. Rollback

- **Emergency (part B):** one statement makes email readable again at once.
  ```sql
  GRANT SELECT ON public.community TO anon, authenticated;
  ```
  Run the part B rollback file later to tidy up the column grants.
- **Part B:** `20261029b_member_email_privacy_lock_rollback.sql` restores table-level `SELECT` to the roles that held it, and removes the column grants.
- **Part A, after part B is rolled back:** `20261029_member_email_privacy_prepare_rollback.sql` restores the saved functions (and the claim's grants), views and options, then drops the admin functions and the copies. It refuses to run while part B is applied.
- **Website:** revert this PR if part A is rolled back, since the admin panel's emails depend on its functions; without them it falls back to name search and name sort, with no emails. The website works with or without part B.

The tests check that each rollback restores the catalog it started from exactly, and that both are safe to re-run.

## 7. Tests (synthetic data only)

- **Database tests** (`scripts/tests/run-email-privacy-db.sh`, run by `run-db-tests.sh` in CI) use a local PostgreSQL model of production (`fixtures/email-privacy-prod-baseline.sql` plus the repository files production matches). The suite:
  - fails before the migrations
  - applies A then B twice
  - checks that members and visitors can't get another member's email through:
    - the column, `select *`, filters, search and sorting
    - `RETURNING`, an `UPDATE` filter, or the whole row
    - either view, `get_start_sequence_data` or `get_project_interest_requests`
  - checks that admins get emails only through the admin functions: a disabled admin is refused, `_` is literal, the People search filters and sorts by email, and all 250 of 250 matches are reachable by paging
  - checks that hidden profiles stay hidden, through the views too
  - checks that profiles are created and updated, that claiming picks the completed duplicate and leaves the others, that a profile another account took meanwhile isn't returned, that a profile that can't be linked just now is a retryable error rather than "none", and that the connection helper still works
  - checks each safety stop, exact rollbacks, and the emergency statement
- **Website tests:**
  - `test-signin-profile-claim.js`: no email query in any case, with today's claim and part A's.
  - `test-profile-recovery.js`: a failed or raced claim is retried, not replaced with a new profile.
  - `test-admin-people-emails.js`: the admin panel uses only the admin functions, including search and email sort with paging; it fails on the previous service.
  - `test-profile-email-reads.js`: no email reads anywhere.
