'use strict';

// Offline pilot reporting only. Inputs are deduplicated, consented cohort
// records for one fixed observation window. No identifiers or individual scores.
function summarizeParticipation({ participated, notParticipated, missing }, minimumCohort = 10) {
  for (const n of [participated, notParticipated, missing, minimumCohort]) {
    if (!Number.isSafeInteger(n) || n < 0) throw new TypeError('Expected nonnegative safe integers');
  }
  if (minimumCohort < 10) throw new RangeError('Minimum cohort must be at least 10');
  const total = participated + notParticipated + missing;
  if (!Number.isSafeInteger(total)) throw new RangeError('Cohort too large');
  // Internal report only: public release requires separate disclosure review,
  // including small cells, repeated queries and overlapping cohorts.
  if (total < minimumCohort) return { suppressed: true };
  const observed = participated + notParticipated;
  return {
    suppressed: false,
    total,
    observed,
    missing,
    observedRate: observed ? participated / observed : null,
    lowerBound: participated / total,
    upperBound: (participated + missing) / total
  };
}

module.exports = { summarizeParticipation };
