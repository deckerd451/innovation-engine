# Logging System - Quick Reference

## Setup (Top of Every Module)

```javascript
const log = window.log || console;
log.moduleLoad('my-module.js');
```

## Basic Usage

```javascript
// Debug (only in debug mode)
log.debug('Verbose data:', data);

// Info (major milestones only)
log.info('✅ Module initialized');

// Warnings (always shown)
log.warn('⚠️ Deprecated feature');

// Errors (always shown)
log.error('❌ Operation failed:', error);
```

## Special Functions

```javascript
// Log once per session
log.once('unique-key', 'Message');

// Throttle (max once per interval)
log.throttle('key', 5000, 'Message');

// Performance timing
const start = performance.now();
// ... work ...
log.perf('Operation', start, performance.now());

// Debug-only groups
log.debugGroup('Details', () => {
  log.debug('Step 1');
  log.debug('Step 2');
});
```

## Enable Debug Mode

```javascript
// From console
log.enableDebug();

// From URL
?debug=1

// From localStorage
localStorage.setItem('DEBUG', '1');
```

## Migration Cheat Sheet

| Old | New |
|-----|-----|
| `console.log('data:', x)` | `log.debug('data:', x)` |
| `console.log('✅ Done')` | `log.info('✅ Done')` |
| `console.warn(...)` | `log.warn(...)` |
| `console.error(...)` | `log.error(...)` |

## Rules

1. **Use `debug` for verbose logs** - data dumps, iterations, detailed state
2. **Use `info` sparingly** - only major lifecycle events
3. **Use `once` for repeated messages** - prevents spam
4. **Use `throttle` for polling loops** - limits frequency
5. **Track module loads** - helps detect duplicates

## Check Status

```javascript
log.isDebugMode()  // Returns true/false
```
