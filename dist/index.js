/**
 * Public entry point of @trysac/retry-policies.
 *
 * Provides composable backoff algorithms and an async retry runner
 * supporting cancellation, deadlines, and deterministic testing.
 */
/**
 * Error thrown by {@link retry} when a policy fails, limits are exceeded,
 * or execution is aborted.
 */
export class RetryError extends Error {
    code;
    attempts;
    cause;
    constructor(code, message, attempts, cause) {
        super(message);
        this.name = "RetryError";
        this.code = code;
        this.attempts = attempts;
        if (cause !== undefined) {
            this.cause = cause;
        }
        Object.setPrototypeOf(this, RetryError.prototype);
    }
}
/**
 * Creates an exponential backoff function: `baseMs * (factor ** (attempt - 1))`.
 *
 * @param opts - Backoff configuration specifying `baseMs` and optional `factor`.
 * @returns A backoff function.
 * @throws {RetryError} If `baseMs` or `factor` are invalid.
 */
export function exponentialBackoff(opts) {
    const { baseMs, factor = 2 } = opts;
    if (!Number.isFinite(baseMs) || baseMs < 0 || !Number.isFinite(factor) || factor < 0) {
        throw new RetryError("invalid_policy", `Invalid exponential backoff parameters: baseMs=${baseMs}, factor=${factor}`, 0);
    }
    return (attempt) => {
        if (attempt < 1) {
            return baseMs;
        }
        return baseMs * factor ** (attempt - 1);
    };
}
/**
 * Creates a constant backoff function returning `ms` for every attempt.
 *
 * @param ms - Delay in milliseconds.
 * @returns A backoff function.
 */
export function constantBackoff(ms) {
    return exponentialBackoff({ baseMs: ms, factor: 1 });
}
/**
 * Caps any backoff strategy at a maximum number of milliseconds.
 *
 * @param b - Backoff strategy to cap.
 * @param maxMs - Upper delay limit in milliseconds.
 * @returns Capped backoff function.
 * @throws {RetryError} If `maxMs` is negative or non-finite, or `b` is not a function.
 */
export function capped(b, maxMs) {
    if (typeof b !== "function") {
        throw new RetryError("invalid_policy", "backoff must be a function", 0);
    }
    if (!Number.isFinite(maxMs) || maxMs < 0) {
        throw new RetryError("invalid_policy", `maxMs must be a finite number >= 0, got ${maxMs}`, 0);
    }
    return (attempt, previousDelayMs, random) => {
        return Math.min(maxMs, b(attempt, previousDelayMs, random));
    };
}
/**
 * Applies full jitter to a backoff strategy: `Math.floor(random() * b(...))`.
 *
 * @param b - Base backoff strategy.
 * @returns Jittered backoff strategy.
 * @throws {RetryError} If `b` is not a function.
 */
export function fullJitter(b) {
    if (typeof b !== "function") {
        throw new RetryError("invalid_policy", "backoff must be a function", 0);
    }
    return (attempt, previousDelayMs, random) => {
        const delay = b(attempt, previousDelayMs, random);
        return Math.floor(random() * delay);
    };
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
export function decorrelatedJitter(opts) {
    const { baseMs, capMs } = opts;
    if (!Number.isFinite(baseMs) || baseMs < 0 || !Number.isFinite(capMs) || capMs < 0) {
        throw new RetryError("invalid_policy", `Invalid decorrelated jitter options: baseMs=${baseMs}, capMs=${capMs}`, 0);
    }
    if (capMs < baseMs) {
        throw new RetryError("invalid_policy", `capMs (${capMs}) cannot be less than baseMs (${baseMs})`, 0);
    }
    return (_attempt, previousDelayMs, random) => {
        const prev = previousDelayMs || baseMs;
        const range = prev * 3 - baseMs;
        const jitter = Math.floor(random() * range);
        return Math.min(capMs, baseMs + jitter);
    };
}
function truncateMessage(msg) {
    if (msg.length <= 200) {
        return msg;
    }
    return `${msg.slice(0, 197)}...`;
}
function formatCauseMessage(cause) {
    if (cause instanceof Error) {
        return truncateMessage(cause.message);
    }
    if (typeof cause === "string") {
        return truncateMessage(cause);
    }
    try {
        return truncateMessage(JSON.stringify(cause));
    }
    catch {
        return "[Unknown Error]";
    }
}
/**
 * Default sleep implementation using `setTimeout` with `AbortSignal` listener support.
 */
function defaultSleep(ms, signal) {
    if (signal?.aborted) {
        return Promise.reject(new RetryError("aborted", "Operation aborted", 0));
    }
    return new Promise((resolve, reject) => {
        let timer;
        let onAbort;
        if (signal) {
            onAbort = () => {
                if (timer !== undefined) {
                    clearTimeout(timer);
                }
                reject(new RetryError("aborted", "Operation aborted during sleep", 0));
            };
            signal.addEventListener("abort", onAbort, { once: true });
        }
        timer = setTimeout(() => {
            if (signal && onAbort) {
                signal.removeEventListener("abort", onAbort);
            }
            resolve();
        }, ms);
    });
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
export async function retry(fn, policy, deps) {
    if (!policy || typeof policy !== "object") {
        throw new RetryError("invalid_policy", "policy must be an object", 0);
    }
    const { maxAttempts, backoff, retryIf, maxElapsedMs, signal } = policy;
    if (typeof maxAttempts !== "number" ||
        !Number.isInteger(maxAttempts) ||
        maxAttempts < 1 ||
        maxAttempts > 1000) {
        throw new RetryError("invalid_policy", `maxAttempts must be a safe integer between 1 and 1000, got ${maxAttempts}`, 0);
    }
    if (typeof backoff !== "function") {
        throw new RetryError("invalid_policy", "backoff must be a function", 0);
    }
    if (maxElapsedMs !== undefined && (!Number.isFinite(maxElapsedMs) || maxElapsedMs < 0)) {
        throw new RetryError("invalid_policy", `maxElapsedMs must be a finite number >= 0, got ${maxElapsedMs}`, 0);
    }
    if (signal?.aborted) {
        throw new RetryError("aborted", "Operation was aborted before start", 0);
    }
    const now = deps?.now ?? Date.now;
    const random = deps?.random ?? Math.random;
    const sleep = deps?.sleep ?? defaultSleep;
    const startTime = now();
    let previousDelayMs = 0;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (signal?.aborted) {
            throw new RetryError("aborted", "Operation aborted", attempt - 1);
        }
        try {
            return await fn(attempt, signal);
        }
        catch (error) {
            // 1. Check predicate (default: retry all errors)
            if (retryIf !== undefined) {
                const shouldRetry = retryIf(error, attempt);
                if (!shouldRetry) {
                    throw error;
                }
            }
            // 2. Attempts exhausted check
            if (attempt >= maxAttempts) {
                const causeMsg = formatCauseMessage(error);
                throw new RetryError("attempts_exhausted", `Retries exhausted after ${maxAttempts} attempts: ${causeMsg}`, maxAttempts, error);
            }
            // 3. Compute delay (negative or non-finite delays become 0)
            let rawDelay = backoff(attempt, previousDelayMs, random);
            if (!Number.isFinite(rawDelay) || rawDelay < 0) {
                rawDelay = 0;
            }
            const delayMs = rawDelay;
            previousDelayMs = delayMs;
            // 4. Deadline check: now() - startTime + delayMs > maxElapsedMs
            if (maxElapsedMs !== undefined) {
                const elapsed = now() - startTime;
                if (elapsed + delayMs > maxElapsedMs) {
                    throw new RetryError("deadline_exceeded", `Deadline of ${maxElapsedMs}ms would be exceeded by next attempt delay (${delayMs}ms, elapsed ${elapsed}ms)`, attempt, error);
                }
            }
            // 5. Abort check before sleep
            if (signal?.aborted) {
                throw new RetryError("aborted", "Operation aborted before sleep", attempt, error);
            }
            // 6. Sleep
            try {
                await sleep(delayMs, signal);
            }
            catch (sleepErr) {
                if (signal?.aborted || (sleepErr instanceof RetryError && sleepErr.code === "aborted")) {
                    throw new RetryError("aborted", "Operation aborted during sleep", attempt, sleepErr);
                }
                throw sleepErr;
            }
        }
    }
    /* Unreachable, but satisfies compiler */
    throw new RetryError("attempts_exhausted", "Retries exhausted", maxAttempts);
}
