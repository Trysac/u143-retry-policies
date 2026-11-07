# @trysac/retry-policies

Composable, zero-dependency retry policies for TypeScript and Node.js 20+ / modern browsers.

## Problem

Every service retries flaky calls, but hand-written loops often fail to include caps, continue to sleep after the final attempt, ignore cancellation, or blindly retry errors that will never succeed. This library provides composable backoff functions and a single retry runner with injected dependencies, ensuring exact, deterministic behavior.

## Installation

```bash
npm install @trysac/retry-policies
```

## Usage Example

```typescript
import { retry, exponentialBackoff, capped, fullJitter } from "@trysac/retry-policies";

const backoff = capped(fullJitter(exponentialBackoff({ baseMs: 100, factor: 2 })), 3000);
const res = await retry(async (attempt, signal) => fetch("https://example.com", { signal }), {
  maxAttempts: 5,
  backoff,
  maxElapsedMs: 10000,
});
```

## API Summary

- `retry<T>(fn, policy, deps?): Promise<T>`
- `exponentialBackoff(opts): Backoff`
- `constantBackoff(ms): Backoff`
- `capped(b, maxMs): Backoff`
- `fullJitter(b): Backoff`
- `decorrelatedJitter(opts): Backoff`

Errors are thrown as `RetryError` with codes: `attempts_exhausted`, `deadline_exceeded`, `aborted`, `invalid_policy`. Limits: `maxAttempts` (1-1000), error message truncation (200 chars). Options like `maxElapsedMs` and `AbortSignal` are supported natively.

## Why not p-retry or cockatiel?

This library is tiny, dependency-free, and provides composable backoff functions with exact, injectable semantics for testing, unlike larger alternatives.

See [docs/SECURITY.md](docs/SECURITY.md) for security information.