# Security

## Threat Model

### Resource Exhaustion (DoS)
- `maxAttempts` is strictly capped between 1 and 1000 to prevent infinite loops.
- `maxElapsedMs` enforces a deadline, preventing runaway retry chains during upstream degradation.
- Truncated error messages (max 200 characters) prevent memory inflation when upstream services return massive payloads.

### Defenses
- The library uses standard language primitives.
- Random numbers are generated via `Math.random` (default) or the injected `random` function.
- `AbortSignal` provides native, safe cancellation of operations.
- Error messages are truncated to prevent log injection or memory exhaustion from large error strings.