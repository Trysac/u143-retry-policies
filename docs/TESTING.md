# Testing

## Tools

- [Vitest](https://vitest.dev/) runs the suites in `test/index.test.ts`.

## Coverage

The test suite covers the following areas:

- **Backoff strategies**: Verification of exponential, constant, capped, full jitter, and decorrelated jitter calculations using fixed random inputs and boundary conditions.
- **Retry runner**: 
  - Successful resolution after initial failures.
  - Exhaustion of attempts (with correct error wrapping).
  - Predicate (`retryIf`) filtering.
  - Deadline enforcement via `maxElapsedMs`.
  - Cancellation handling via `AbortSignal`.
  - Policy configuration validation (e.g., bounds checking).
  - Handling of synchronous exceptions and non-Error rejections.

## Rules

- Tests use dependency injection for `sleep`, `now`, and `random` to ensure zero non-determinism.
- Each bug fix requires a regression test.