/**
 * ================================================================
 * INTELLIGENCE / EXPLAINABILITY  — thin re-export shim
 * ================================================================
 * The full implementation lives at ../../explainability.js (root).
 * This shim lets daily-brief-engine.js (which lives here in
 * assets/js/intelligence/) import from a same-directory path
 * without duplicating code.
 * ================================================================
 */
export { registerWhy, getWhy, clearExplainability } from '../explainability.js';
