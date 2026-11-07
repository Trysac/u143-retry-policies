# Architecture

`@trysac/retry-policies` is designed as a small, dependency-free library providing modular retry and backoff primitives for JavaScript and TypeScript runtimes (Node.js 20+, browsers, Cloudflare Workers, Deno, Bun).

## Core Concepts

1. **Pure Backoff Functions**: Backoff algorithms match the signature `(attempt, previousDelayMs, random) => number`. Strategies can be composed via functional decorators (such as `capped` or `fullJitter`).
2. **Deterministic Injectability**: The `retry` runner accepts custom implementations of `sleep`, `now`, and `random`, decoupling time and non-determinism from test suites.
3. **Cancellation & Deadlines**: Standard `AbortSignal` integrates directly into the execution loop and default timer mechanism. If `maxElapsedMs` is configured, deadline overrun is detected *before* initiating sleep.