# Human Potential Orchestration Engine pilot

## Repository audit

Audited Innovation Engine at `8b5c5041`, after the HPE participation pilot shipped. The existing browser application and Supabase policies are the integration surface. No runtime dependency, model call, job, tracking event or external credential was added. The package audit reported zero known vulnerabilities in the lockfile. This check does not inventory hosted CDN or platform dependencies.

| Existing surface | Verified in this repository | Use in this slice |
|---|---|---|
| Home and HPE | Keyword finder, inbox priority, project recommendations, verified external opportunities and separate consent | Preserve all of them. Add one experimental disclosure in the existing Home search card. |
| Relationships | Accepted connection records and existing visibility fields | Limit suggestions to accepted connections with a collaboration opt-in. Exclude hidden and disabled profiles. |
| Messaging and projects | Maintained conversation entry point, enhanced project form, project tasks and assistance | Open the existing conversation after acceptance. Open an editable project draft after a member records that work started. The draft contains template text only. |
| Capability memory | Private attempts and verified evidence tied to project workflows | Preserve those permissions. Use only self-listed skills for this experiment. |
| Nearify | Existing encounter integration and optional public feed for discovery candidates | Independent of collaboration eligibility. No encounter or feed signal is used here. |
| CharlestonHacks and BUILDSPACE | Local community context and the existing Innovation Engine project experience | Use CharlestonHacks as the proposed validation community. Use the existing project workflow in this repository for execution. External participation agreements need confirmation. |
| ROOK | No orchestration or outcome API contract was verified in this checkout | Review aggregate pilot findings with a research steward. Assess a ROOK integration once interface and data-handling terms are available. |

## Architecture and data

The browser recognizes specific phrases for three proposal types. It looks for two complementary skills listed by the member and an eligible connection. It abstains on unsupported, ambiguous or clearly negated requests and when no complementary pair is available. It explains the match in terms of what each person listed. Every proposal includes an achievable first action and a reminder to verify missing prerequisites. Places, resources, expertise, eligibility, capacity and results remain unconfirmed until people establish them.

Supabase adds an operator-only audience table, one opt-in table and one participant-only collaboration table. Account-bound RPCs return up to 50 eligible connections and 20 collaboration summaries per page, with pending invitations shown first. Members can navigate to older records to act on or remove them. There is no free-text field or unrestricted record access. The draft stays in the browser. An explicit invite sends the recipient profile identifier and a generic proposal type. The recipient sees the proposal and can accept or decline before the introduction is available. Only a still-eligible accepted connection can use the conversation handoff. An incoming invitation changes the existing Home disclosure label. There is no push, email, count badge, or automatic message. The indicator refreshes on Home mount and when the window regains focus.

| Event | Evidence retained |
|---|---|
| A proposal appears | In the current browser tab |
| Sender invites | Participant-only pending record |
| Recipient accepts or declines | Recipient action, enforced by the database |
| A participant says work started | Member-reported start |
| Each participant confirms the first action | Independent confirmations, visibly distinguished from joint confirmation |

Open collaborations and recent declines suppress repeat suggestions for the same pair while those records exist. Leaving the experiment or deleting an account cascades shared collaboration records. Either participant can remove a collaboration for both members. Existing independent project and messaging records follow their existing privacy and deletion rules. No confirmation outcome is written to analytics or used to rank people. Nonresponse carries no negative interpretation.

The experimental panel offers an independent path to local assistance through the provider's official 211 page. The link is available before opting in and sends no request text. The platform does not infer a need or determine eligibility. [Trident United Way 211](https://www.tuw.org/211)

## What the tests establish

- A synthetic garden scenario produces a new proposal and concrete first action from explicit complementary skills, even when the existing Home keyword finder finds no existing project or opportunity on the same fixture.
- The deterministic suite tests all three templates, unsupported and negated input, ambiguous input, duplicate skills, missing skills and the bounded candidate limit. Templates produce no invented participants or resource availability. The client uses zero model calls and the suite reports runtime for 1,000 local runs.
- Disposable PostgreSQL tests exercise anonymous and cross-account denial, consent and connection filtering, duplicate and invalid transitions, identity withholding before consent, independent outcome confirmation, withdrawal cascade and rollback.
- The two-account Chromium flow checks Home with the feature off, opt-in, support before opt-in, suggestion, invitation, acceptance, conversation and project-form handoffs, confirmation, opt-out, responsive layout and automated WCAG checks. It uses a synthetic database client. The separate PostgreSQL suite checks the actual policy and RPC enforcement.

A separate disposable local stack using GoTrue v2.177.0, PostgREST v12.2.12 and PostgreSQL 16 verified two genuine password sign-ins and their signed JWTs against the actual HPOE migration. The API smoke test covered default-deny audience, authenticated opt-in, actor mismatch, invitations, the private pending indicator, identity after acceptance, independent confirmation, audience removal and withdrawal cascades. It used the repository's minimal community and relationship fixtures. Hosted browser authentication, message delivery and project persistence on the full deployed schema still require a hosted staging run.

These tests establish behavior on synthetic evidence. They leave real-world usefulness, false-match rates, database latency at deployment scale, and comparative outcomes unmeasured.

## CharlestonHacks controlled pilot

Recruit 10–15 Charleston-area adults after the organizer and privacy steward approve the plan. Target 12 to balance the six possible sequences of three discovery methods. Recruitment is voluntary and participation remains independent of access to support. Use only shareable challenge briefs, explicitly offered capabilities and provider-confirmed resources. Agree on accessibility accommodations and compensation before recruitment.

Each adult uses conventional web search, AI-assisted discovery and HPOE once, against three matched Charleston briefs. Rotate both method order and which brief goes with which method. Allow the same preparation time and the same public fact packet. Give each method a fixed session length and the same ability to ask a facilitator for clarifications. Exclude real participant data and private needs from search queries and external AI prompts. Blind reviewers to the discovery method when they assess the proposed plan, feasibility and unsupported claims.

Run a separate voluntary action period. Participants select one proposal they are willing to pursue. Track denominator, invitation acceptance, a first action taken within 14 days and independent confirmation from both people where applicable. Ask each person separately whether they already intended to work with that collaborator and whether the action probably would have happened without the method. Report self-reported counterfactuals as perceptions. The selection step and small sample prevent causal attribution across conditions.

Keep proposal, acceptance, action started and jointly confirmed action distinct. Record declines only if voluntarily explained and leave nonresponse as missing. Do not use clicks or time on site as outcomes. For participant-reported belonging, autonomy or competence, use a separately consented and reviewed instrument. Set the deletion deadline and the date of aggregate publication before collecting research. Limit access to the approved steward and suppress small cells. Research collection stays off pending approvals and separate consent.

Each method receives the same minimum evidence rubric. Check complementary roles, current resource evidence, a specific achievable first action, non-coercive consent and clear unresolved prerequisites. Stop the pilot if participants report privacy breaches, pressure to participate or resource claims that cause harm. Only approved aggregates may leave the evaluation workspace.

## Compositional experiment

The separate `HPOECompositionalPilot` module takes permission-filtered structured facts for an existing project or organization objective. It combines shared capability gaps and needs, up to four explicitly opted-in prospective participants, and resource records with a verification reference and future availability cutoff. When there is room on the proposed team, the planner can suggest one additional person whose stated learning goal matches a supplied capability. Learning goals never count as capability coverage. It returns a proposal with coverage, remaining prerequisites and one first action. It does not claim global optimality, confirm commitments or book resources.

Inputs must come from an authorized adapter. A verification reference by itself is not proof of a real resource, so the engine has no production data connector, UI action, or invitation path. Both experimental flags remain unset. Tests exercise project and organization objectives, multi-person composition, consent filtering, stale or unverifiable resources and abstention. The current production HPE catalog remains independent.

Verified interfaces are the existing Innovation Engine profile and connection schema, project-creation and messaging entry points, and the Nearify feed and identity-bound presence paths described in the repository. The checkout does not establish independent CharlestonHacks or ROOK APIs or a separate BUILDSPACE project API. Treat CharlestonHacks as the proposed human partner, use the existing project tools, and defer other dependencies until interface ownership and data-sharing terms are verified.

## Release and rollback

1. Keep `window.HPOECollaborationPilot` unset on production. The deployed HPE participation pilot uses independent flags and tables.
2. Apply `supabase/sql/migrations/20261128_hpoe_collaboration.sql` to a disposable staging Supabase project first. Use separate test accounts to verify real sign-in, opt-in, the invitation, messaging and project handoffs, both confirmations, profile visibility controls and deletion. Run a keyboard and screen-reader check and measure candidate RPC latency with representative data.
3. Before a production pilot, obtain release approval for audience, retention, withdrawal handling and abuse response. The database audience defaults to empty. After approval, an operator adds only the approved test account UUIDs to `public.hpoe_audience`. Remove a UUID to block new invitations and progression while retaining the member’s ability to withdraw. The client flag and database audience must both permit new participation. Keep research off.
   Use the supported operator migration connection to add or remove approved auth UUIDs. Treat the values as private operational data and do not commit them. For example, use `INSERT INTO public.hpoe_audience(user_id) VALUES ('<approved-auth-uuid>') ON CONFLICT DO NOTHING` to allow one test account. For suspension, use `DELETE FROM public.hpoe_audience WHERE user_id = '<approved-auth-uuid>'`.

4. Apply the migration with the normal tracked deployment process. After gates pass, set `window.HPOECollaborationPilot = true` before Home initializes and deploy the reviewed shell. Monitor availability and test opt-out regularly.
5. To pause, unset the flag and redeploy. Coordinate a withdrawal route for people with stored records during the pause. For removal, the matching rollback drops the HPOE functions and tables, including all HPOE records. Rehearse on staging and approve data handling before dropping the tables. Existing HPE consent, opportunity inventory, conversations and projects have separate storage.

## Remaining objectives

The connected workflow supports two members and three curated templates. The isolated compositional planner combines multiple structured inputs but does not yet feed production invitations or verify resource records itself. Long-term development and real-world outcomes remain unmeasured. Structured resource and organization consent, invitation discoverability beyond opening Home, accessibility of the downstream project form, comparison with external baselines and an approved evaluation are the next release milestones.
