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

Supabase adds one opt-in table and one participant-only collaboration table. Account-bound RPCs return up to 50 eligible connections and 20 collaboration summaries, with pending invitations shown first. There is no free-text field or unrestricted record access. The draft stays in the browser. An explicit invite sends the recipient profile identifier and a generic proposal type. The recipient sees the proposal and can accept or decline before the introduction is available. Only a still-eligible accepted connection can use the conversation handoff. There is no notification or automatic message. Participants should open the collaboration disclosure to check their invitations.

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

These tests establish behavior on synthetic evidence. They leave real-world usefulness, false-match rates, database latency at deployment scale, and comparative outcomes unmeasured.

## Charleston evaluation

Start with a small group of adults who freely opt in and can stop at any time. Validate the three scenarios above with synthetic accounts in staging first. Agree the workload, relevance and privacy criteria with community reviewers before involving real participants. Check that an unpaid activity does not displace an appropriate paid role.

For a comparison, give consenting participants the same brief and time limit in ordinary web search, AI-assisted discovery and HPOE. Use the same public facts and explicitly shareable capability descriptions in each condition. Counterbalance the order. Keep private profiles, personal circumstances and account identifiers out of external prompts. Compare whether each method identifies the necessary roles, offers a realistic first action and clearly marks unknown resources. Count unsupported claims, inappropriate matches, time to a usable next step and ability to decline. Review misses as well as successes.

Measure mutually accepted introductions, self-reported first actions and jointly confirmed first actions separately. Later measures can include mentoring, skills acquired, projects completed and support accessed, with separate research consent and approved instruments. Collect minimal aggregates with a defined denominator, include missingness and suppress small groups. Bookmarks, clicks and absence of response are not meaningful outcomes. A pilot comparison cannot establish a causal effect without an appropriate study design.

## Release and rollback

1. Keep `window.HPOECollaborationPilot` unset on production. The deployed HPE participation pilot uses independent flags and tables.
2. Apply `supabase/sql/migrations/20261128_hpoe_collaboration.sql` to a disposable staging Supabase project first. Use separate test accounts to verify real sign-in, opt-in, the invitation, messaging and project handoffs, both confirmations, profile visibility controls and deletion. Run a keyboard and screen-reader check and measure candidate RPC latency with representative data.
3. Before a production pilot, obtain release approval for audience, retention, withdrawal handling and abuse response. The current flag is site-wide for signed-in members and provides no cohort allowlist. Use a staging cohort until a limited production rollout is configured or a site-wide invitation is approved. Keep research off.
4. Apply the migration with the normal tracked deployment process. After gates pass, set `window.HPOECollaborationPilot = true` before Home initializes and deploy the reviewed shell. Monitor availability and test opt-out regularly.
5. To pause, unset the flag and redeploy. Coordinate a withdrawal route for people with stored records during the pause. For removal, the matching rollback drops the HPOE functions and tables, including all HPOE records. Rehearse on staging and approve data handling before dropping the tables. Existing HPE consent, opportunity inventory, conversations and projects have separate storage.

## Remaining objectives

This is a two-person vertical slice with three curated templates and self-listed skills. It does not yet combine multi-party teams, verified resources, project gaps and organization needs, support a broad adaptive development journey or measure longer-term community outcomes. Structured resource and organization consent, invitation discoverability beyond opening Home, accessibility of the downstream project form, comparison with external baselines and an approved evaluation are the next release milestones.
