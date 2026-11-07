import { describe, expect, it } from "vitest";
import {
  type Backoff,
  capped,
  constantBackoff,
  decorrelatedJitter,
  exponentialBackoff,
  fullJitter,
  RetryError,
  type RetryPolicy,
  retry,
} from "../src/index.js";

describe("Backoff strategies", () => {
  it("calculates exponential backoff with default and custom factor", () => {
    const bDefault = exponentialBackoff({ baseMs: 100 });
    expect(bDefault(1, 0, () => 0.5)).toBe(100);
    expect(bDefault(2, 100, () => 0.5)).toBe(200);
    expect(bDefault(3, 200, () => 0.5)).toBe(400);
    expect(bDefault(0, 0, () => 0.5)).toBe(100);

    const bFactor3 = exponentialBackoff({ baseMs: 50, factor: 3 });
    expect(bFactor3(1, 0, () => 0.5)).toBe(50);
    expect(bFactor3(2, 50, () => 0.5)).toBe(150);
    expect(bFactor3(3, 150, () => 0.5)).toBe(450);
  });

  it("validates exponentialBackoff options", () => {
    expect(() => exponentialBackoff({ baseMs: -1 })).toThrow(RetryError);
    expect(() => exponentialBackoff({ baseMs: Number.NaN })).toThrow(RetryError);
    expect(() => exponentialBackoff({ baseMs: 100, factor: -2 })).toThrow(RetryError);
  });

  it("calculates constant backoff", () => {
    const b = constantBackoff(250);
    expect(b(1, 0, () => 0.5)).toBe(250);
    expect(b(2, 250, () => 0.5)).toBe(250);
    expect(b(3, 250, () => 0.5)).toBe(250);
  });

  it("capped(exponentialBackoff({ baseMs: 100, factor: 2 }), 250) yields delays [100, 200, 250, 250] for attempts 1 to 4", () => {
    const b = capped(exponentialBackoff({ baseMs: 100, factor: 2 }), 250);
    const delays = [1, 2, 3, 4].map((attempt) => b(attempt, 0, () => 0.5));
    expect(delays).toEqual([100, 200, 250, 250]);
  });

  it("validates capped options", () => {
    expect(() => capped(undefined as unknown as Backoff, 100)).toThrow(RetryError);
    expect(() => capped(constantBackoff(50), -1)).toThrow(RetryError);
    expect(() => capped(constantBackoff(50), Number.POSITIVE_INFINITY)).toThrow(RetryError);
  });

  it("fullJitter(exponentialBackoff({ baseMs: 100, factor: 2 })) with random () => 0.5 yields [50, 100]", () => {
    const b = fullJitter(exponentialBackoff({ baseMs: 100, factor: 2 }));
    const rand = () => 0.5;
    const delays = [1, 2].map((attempt) => b(attempt, 0, rand));
    expect(delays).toEqual([50, 100]);
  });

  it("fullJitter handles random edge near 1.0", () => {
    const b = fullJitter(exponentialBackoff({ baseMs: 100, factor: 2 }));
    const rand = () => 0.999999;
    expect(b(1, 0, rand)).toBe(99);
    expect(() => fullJitter(null as unknown as Backoff)).toThrow(RetryError);
  });

  it("decorrelatedJitter({ baseMs: 100, capMs: 1000 }) with random () => 0.5 yields [200, 350, 575] for attempts 1 to 3", () => {
    const b = decorrelatedJitter({ baseMs: 100, capMs: 1000 });
    const rand = () => 0.5;

    // Attempt 1: prev = 0 || 100 = 100; range = 100*3 - 100 = 200; floor(0.5*200) = 100; 100 + 100 = 200
    const d1 = b(1, 0, rand);
    expect(d1).toBe(200);

    // Attempt 2: prev = 200; range = 200*3 - 100 = 500; floor(0.5*500) = 250; 100 + 250 = 350
    const d2 = b(2, d1, rand);
    expect(d2).toBe(350);

    // Attempt 3: prev = 350; range = 350*3 - 100 = 950; floor(0.5*950) = 475; 100 + 475 = 575
    const d3 = b(3, d2, rand);
    expect(d3).toBe(575);
  });

  it("decorrelatedJitter caps properly and validates bounds", () => {
    const b = decorrelatedJitter({ baseMs: 100, capMs: 500 });
    const rand = () => 0.999999;
    const delay = b(1, 400, rand);
    expect(delay).toBe(500);

    expect(() => decorrelatedJitter({ baseMs: -10, capMs: 100 })).toThrow(RetryError);
    expect(() => decorrelatedJitter({ baseMs: 200, capMs: 100 })).toThrow(RetryError);
  });
});

describe("retry runner", () => {
  it("retry(fn, { maxAttempts: 3, backoff: exponentialBackoff({ baseMs: 100, factor: 2 }) }, deps) where fn rejects twice then resolves 'ok' resolves 'ok', and deps.sleep was called with 100 then 200", async () => {
    const recordedDelays: number[] = [];
    const deps = {
      sleep: async (ms: number): Promise<void> => {
        recordedDelays.push(ms);
      },
      random: () => 0.5,
      now: () => 1000,
    };

    let calls = 0;
    const fn = async (attempt: number) => {
      calls++;
      if (attempt < 3) {
        throw new Error(`failed at ${attempt}`);
      }
      return "ok";
    };

    const result = await retry(
      fn,
      { maxAttempts: 3, backoff: exponentialBackoff({ baseMs: 100, factor: 2 }) },
      deps,
    );

    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(recordedDelays).toEqual([100, 200]);
  });

  it("When every attempt rejects, retry rejects with RetryError whose code === 'attempts_exhausted', attempts === 3 and cause is the last rejection object (===), and sleep is not called after the last attempt", async () => {
    const recordedDelays: number[] = [];
    const lastError = new Error("permanent failure");
    const deps = {
      sleep: async (ms: number): Promise<void> => {
        recordedDelays.push(ms);
      },
    };

    let calls = 0;
    const fn = async (attempt: number) => {
      calls++;
      if (attempt === 3) {
        throw lastError;
      }
      throw new Error(`transient ${attempt}`);
    };

    try {
      await retry(fn, { maxAttempts: 3, backoff: constantBackoff(100) }, deps);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RetryError);
      const rErr = err as RetryError;
      expect(rErr.code).toBe("attempts_exhausted");
      expect(rErr.attempts).toBe(3);
      expect(rErr.cause).toBe(lastError);
      expect(recordedDelays).toEqual([100, 100]); // No sleep after attempt 3
      expect(calls).toBe(3);
    }
  });

  it("A retryIf returning false makes retry reject with the original error itself (not a RetryError) after 1 call", async () => {
    const specificError = new TypeError("invalid input");
    let callCount = 0;

    const policy: RetryPolicy = {
      maxAttempts: 5,
      backoff: constantBackoff(50),
      retryIf: (err) => !(err instanceof TypeError),
    };

    try {
      await retry(
        async () => {
          callCount++;
          throw specificError;
        },
        policy,
        { sleep: async () => {} },
      );
      expect.unreachable("should have rejected");
    } catch (err) {
      expect(err).toBe(specificError);
      expect(callCount).toBe(1);
    }
  });

  it("With maxElapsedMs: 250 and an injected now, a retry whose next delay would end after 250 ms since the start rejects with RetryError code 'deadline_exceeded' without sleeping", async () => {
    const currentTime = 1000;
    let slept = false;

    const deps = {
      now: () => currentTime,
      sleep: async () => {
        slept = true;
      },
    };

    // Attempt 1 fails at t=1000. Backoff returns 300 ms.
    // elapsed (0) + delay (300) = 300 > maxElapsedMs (250) -> deadline exceeded immediately
    try {
      await retry(
        async () => {
          throw new Error("flaky");
        },
        {
          maxAttempts: 3,
          backoff: constantBackoff(300),
          maxElapsedMs: 250,
        },
        deps,
      );
      expect.unreachable("should have failed deadline");
    } catch (err) {
      expect(err).toBeInstanceOf(RetryError);
      const rErr = err as RetryError;
      expect(rErr.code).toBe("deadline_exceeded");
      expect(rErr.attempts).toBe(1);
      expect(slept).toBe(false);
    }
  });

  it("An AbortSignal aborted during a sleep rejects with RetryError code 'aborted'; an already aborted signal rejects before the first call; maxAttempts 0 or 1.5 throws RetryError code 'invalid_policy' synchronously from retry", async () => {
    // 1. maxAttempts 0 or 1.5 throws synchronously
    await expect(
      retry(async () => "ok", {
        maxAttempts: 0,
        backoff: constantBackoff(10),
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "invalid_policy" }));

    await expect(
      retry(async () => "ok", {
        maxAttempts: 1.5,
        backoff: constantBackoff(10),
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "invalid_policy" }));

    // 2. Already aborted signal rejects before first call
    const alreadyAborted = AbortSignal.abort();
    let called = false;
    await expect(
      retry(
        async () => {
          called = true;
          return "ok";
        },
        {
          maxAttempts: 3,
          backoff: constantBackoff(10),
          signal: alreadyAborted,
        },
      ),
    ).rejects.toThrowError(expect.objectContaining({ code: "aborted", attempts: 0 }));
    expect(called).toBe(false);

    // 3. Aborted during sleep
    const ac = new AbortController();
    let attemptCount = 0;
    const sleepWithAbort = (_ms: number, sig?: AbortSignal) => {
      return new Promise<void>((_, reject) => {
        sig?.addEventListener("abort", () => {
          reject(new RetryError("aborted", "aborted during sleep", 1));
        });
        ac.abort();
      });
    };

    await expect(
      retry(
        async () => {
          attemptCount++;
          throw new Error("failed");
        },
        {
          maxAttempts: 3,
          backoff: constantBackoff(100),
          signal: ac.signal,
        },
        { sleep: sleepWithAbort },
      ),
    ).rejects.toThrowError(expect.objectContaining({ code: "aborted", attempts: 1 }));
    expect(attemptCount).toBe(1);
  });

  it("handles synchronous exceptions from fn gracefully", async () => {
    let calls = 0;
    const res = await retry(
      () => {
        calls++;
        if (calls < 2) {
          throw new Error("sync throw");
        }
        return Promise.resolve(42);
      },
      {
        maxAttempts: 2,
        backoff: constantBackoff(0),
      },
      { sleep: async () => {} },
    );
    expect(res).toBe(42);
    expect(calls).toBe(2);
  });

  it("propagates exceptions thrown inside retryIf", async () => {
    const boomErr = new Error("predicate crashed");
    await expect(
      retry(
        async () => {
          throw new Error("call failed");
        },
        {
          maxAttempts: 3,
          backoff: constantBackoff(10),
          retryIf: () => {
            throw boomErr;
          },
        },
      ),
    ).rejects.toBe(boomErr);
  });

  it("handles non-Error rejection causes and truncates long messages to 200 chars", async () => {
    const longStr = "a".repeat(300);
    try {
      await retry(
        async () => {
          throw longStr;
        },
        { maxAttempts: 1, backoff: constantBackoff(10) },
      );
      expect.unreachable("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(RetryError);
      const re = e as RetryError;
      expect(re.code).toBe("attempts_exhausted");
      expect(re.message.length).toBeLessThanOrEqual(250);
      expect(re.message.includes("...")).toBe(true);
    }

    try {
      await retry(
        async () => {
          throw { raw: "object-error" };
        },
        { maxAttempts: 1, backoff: constantBackoff(10) },
      );
      expect.unreachable("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(RetryError);
      const re = e as RetryError;
      expect(re.message).toContain("object-error");
    }
  });

  it("clamps negative or non-finite delays to 0", async () => {
    let recordedMs = -1;
    await retry(
      async (attempt) => {
        if (attempt === 1) throw new Error("f1");
        return "done";
      },
      {
        maxAttempts: 2,
        backoff: () => Number.NEGATIVE_INFINITY,
      },
      {
        sleep: async (ms) => {
          recordedMs = ms;
        },
      },
    );
    expect(recordedMs).toBe(0);
  });

  it("validates invalid policy arguments", async () => {
    await expect(retry(async () => "ok", null as unknown as RetryPolicy)).rejects.toThrowError(
      expect.objectContaining({ code: "invalid_policy" }),
    );

    await expect(
      retry(async () => "ok", {
        maxAttempts: 1001,
        backoff: constantBackoff(10),
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: "invalid_policy" }));

    await expect(
      retry(async () => "ok", {
        maxAttempts: 2,
        backoff: "not-a-fn" as unknown as Backoff,
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "invalid_policy" }));

    await expect(
      retry(async () => "ok", {
        maxAttempts: 2,
        backoff: constantBackoff(10),
        maxElapsedMs: -10,
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "invalid_policy" }));
  });

  it("exercises default sleep with 0 ms delay and abort handling", async () => {
    let attempts = 0;
    const result = await retry(
      async (att) => {
        attempts++;
        if (att === 1) throw new Error("one");
        return "success";
      },
      {
        maxAttempts: 2,
        backoff: constantBackoff(0),
      },
    );
    expect(result).toBe("success");
    expect(attempts).toBe(2);
  });

  it("checks abort signal during default sleep", async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 10);

    await expect(
      retry(
        async () => {
          throw new Error("sleep abort test");
        },
        {
          maxAttempts: 2,
          backoff: constantBackoff(100),
          signal: ac.signal,
        },
      ),
    ).rejects.toThrowError(expect.objectContaining({ code: "aborted" }));
  });

  it("aborts before sleep if signal becomes aborted right before sleep call", async () => {
    const ac = new AbortController();
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls++;
          ac.abort();
          throw new Error("failed");
        },
        {
          maxAttempts: 3,
          backoff: constantBackoff(100),
          signal: ac.signal,
        },
      ),
    ).rejects.toThrowError(expect.objectContaining({ code: "aborted", attempts: 1 }));
    expect(calls).toBe(1);
  });
});
