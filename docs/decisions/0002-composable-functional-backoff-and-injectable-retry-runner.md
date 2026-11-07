# Composable Functional Backoff and Injectable Retry Runner

Status: accepted (generated, pending human review)

## Context

Services need reliable retry mechanisms with backoff algorithms like decorrelated jitter, explicit caps, and deadline enforcement. Many existing libraries couple timers, randomness, and execution loops tightly, making deterministic testing difficult and introducing unnecessary dependencies.

## Decision

Implement backoff strategies as pure higher-order functions adhering to `(attempt, previousDelayMs, random) => number`. Provide a single runner `retry<T>` accepting injected `sleep`, `now`, and `random` dependencies, standard `AbortSignal` cancellation, and typed `RetryError` codes.

## Consequences

Retries can be tested deterministically with zero real-time pauses; consumers compose arbitrary jitter, caps, and backoff functions with zero runtime dependencies.
