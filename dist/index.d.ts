/**
 * Public entry point of @trysac/retry-policies.
 *
 * Provides composable backoff algorithms and an async retry runner
 * supporting cancellation, deadlines, and deterministic testing.
 */
/**
 * Machine-readable error codes produced by {@link RetryError}.
 */
export type RetryErrorCode = "attempts_exhausted" | "deadline_exceeded" | "aborted" | "invalid_policy";
/**
 * Error thrown by {@link retry} when a policy fails, limits are exceeded,
 * or execution is aborted.
 */
export declare class RetryError extends Error {
    readonly code: RetryErrorCode;
    readonly attempts: number;
    readonly cause?: unknown;
    constructor(code: RetryErrorCode, message: string, attempts: number, cause?: unknown);
}
/**
 * Calculates the next sleep delay in milliseconds given the attempt number,
 * the previous delay, and an injected pseudorandom generator.
 *
 * @param attempt - 1-based attempt count that just failed.
 * @param previousDelayMs - Delay used in the previous backoff, or 0 before the first backoff.
 * @param random - Pseudorandom generator returning a float in `[0, 1)`.
 * @returns Calculated delay in milliseconds.
 */
export type Backoff = (attempt: number, previousDelayMs: number, random: () => number) => number;
/**
 * Options for {@link exponentialBackoff}.
 */
export interface ExponentialBackoffOptions {
    /** Base delay in milliseconds for the first failed attempt. */
    baseMs: number;
    /** Multiplier applied per attempt. Defaults to 2. */
    factor?: number;
}
/**
 * Creates an exponential backoff function: `baseMs * (factor ** (attempt - 1))`.
 *
 * @param opts - Backoff configuration specifying `baseMs` and optional `factor`.
 * @returns A backoff function.
 * @throws {RetryError} If `baseMs` or `factor` are invalid.
 */
export declare function exponentialBackoff(opts: ExponentialBackoffOptions): Backoff;
/**
 * Creates a constant backoff function returning `ms` for every attempt.
 *
 * @param ms - Delay in milliseconds.
 * @returns A backoff function.
 */
export declare function constantBackoff(ms: number): Backoff;
/**
 * Caps any backoff strategy at a maximum number of milliseconds.
 *
 * @param b - Backoff strategy to cap.
 * @param maxMs - Upper delay limit in milliseconds.
 * @returns Capped backoff function.
 * @throws {RetryError} If `maxMs` is negative or non-finite, or `b` is not a function.
 */
export declare function capped(b: Backoff, maxMs: number): Backoff;
/**
 * Applies full jitter to a backoff strategy: `Math.floor(random() * b(...))`.
 *
 * @param b - Base backoff strategy.
 * @returns Jittered backoff strategy.
 * @throws {RetryError} If `b` is not a function.
 */
export declare function fullJitter(b: Backoff): Backoff;
/**
 * Options for {@link decorrelatedJitter}.
 */
export interface DecorrelatedJitterOptions {
    /** Base delay in milliseconds. */
    baseMs: number;
    /** Maximum ceiling delay in milliseconds. */
    capMs: number;
}
/**
 * Decorrelated jitter backoff following AWS Architecture Blog (2015).
 * `prev = previousDelayMs || baseMs`
 * `delay = Math.min(capMs, baseMs + Math.floor(random() * (prev * 3 - baseMs)))`
 *
 * @param opts - Configuration specifying `baseMs` and `capMs`.
 * @returns A backoff function.
 * @throws {RetryError} If `baseMs` or `capMs` are invalid or `capMs < baseMs`.
 */
export declare function decorrelatedJitter(opts: DecorrelatedJitterOptions): Backoff;
/**
 * Retry policy configuration.
 */
export interface RetryPolicy {
    /** Maximum total attempts (safe integer between 1 and 1000). */
    maxAttempts: number;
    /** Backoff calculation strategy. */
    backoff: Backoff;
    /**
     * Predicate determining whether a given error qualifies for retry.
     * Defaults to retrying every error.
     */
    retryIf?: (error: unknown, attempt: number) => boolean;
    /** Maximum overall wall-clock elapsed time in milliseconds across all attempts. */
    maxElapsedMs?: number;
    /** Cancellation signal. */
    signal?: AbortSignal;
}
/**
 * Injectable dependencies for deterministic testing.
 */
export interface RetryDependencies {
    /** Sleep function that pauses for `ms` milliseconds unless `signal` is aborted. */
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    /** Random number generator returning `[0, 1)`. Defaults to `Math.random`. */
    random?: () => number;
    /** Clock returning millisecond timestamp. Defaults to `Date.now`. */
    now?: () => number;
}
/**
 * Executes `fn` repeatedly according to `policy`.
 *
 * @param fn - Asynchronous function invoked per attempt. Receives attempt (1-based) and optional signal.
 * @param policy - Policy controlling max attempts, backoff, retry predicates, and deadlines.
 * @param deps - Optional injected dependencies for sleep, clock, and randomness.
 * @returns The resolved result of `fn`.
 * @throws {RetryError} On attempts exhausted, deadline exceeded, cancellation, or invalid policy.
 */
export declare function retry<T>(fn: (attempt: number, signal?: AbortSignal) => Promise<T>, policy: RetryPolicy, deps?: RetryDependencies): Promise<T>;
