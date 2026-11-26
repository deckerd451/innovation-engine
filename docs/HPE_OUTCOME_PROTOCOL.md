# HPE outcome protocol

Primary endpoint: at least one self-confirmed meaningful contribution in a fixed 30-day window, among separately research-consenting adults enrolled before that window.

Proposed follow-up question: During [start] through [end], did you take part in at least one activity that you personally consider a meaningful contribution? Yes / No / Prefer not to answer. Nonresponse and prefer not to answer are missing. Clicking, joining, or expressing interest is not evidence of completion.

Research consent must be separate from participation enrollment. Declining or withdrawing must not change recommendations or access. Before collection, approve a retention/deletion policy, authenticated participant-only response access, correction and withdrawal, deduplication, and a fixed cohort definition. Do not collect names or free text in aggregate reporting files. Do not commit real participant data.

An authorized research steward may run node scripts/hpe-outcome-report.js aggregate.json on an offline tally containing only windowStart, windowEnd, participated, notParticipated, missing. Counts must represent distinct eligible consenting participants, with one final response per person. The script cannot establish that upstream condition. Report observed rate and worst/best-case missingness bounds; suppress cohorts below ten. Internal use only; separate disclosure review required for small cells and overlapping cohorts.

Secondary outcomes (relatedness, autonomy, competence and barriers) require separately reviewed instruments and collection design. No causal or crime reduction claims from descriptive results.

The research UI and private consent migrations are staged. Research remains disabled pending the cohort, retention and approval gates in the [activation runbook](HPE_PRIVATE_CONSENT_RELEASE.md).
