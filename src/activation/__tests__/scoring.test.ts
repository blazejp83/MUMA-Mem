import { describe, it, expect } from "vitest";
import {
  baseLevelActivation,
  spreadingActivation,
  stochasticNoise,
  totalActivation,
} from "../scoring.js";

describe("baseLevelActivation", () => {
  it("returns -Infinity for empty access log", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    expect(baseLevelActivation([], now, 0.5)).toBe(-Infinity);
  });

  it("returns 0 for a single access 1 hour ago (d=0.5)", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    const oneHourAgo = new Date("2026-01-15T11:00:00Z").toISOString();
    const result = baseLevelActivation([oneHourAgo], now, 0.5);
    // ln(1^(-0.5)) = ln(1) = 0
    expect(result).toBeCloseTo(0.0, 2);
  });

  it("returns ~2.302 for a single very recent access (0.01h ago, d=0.5)", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    // 0.01 hours = 36 seconds ago
    const recentAccess = new Date(now.getTime() - 36_000).toISOString();
    const result = baseLevelActivation([recentAccess], now, 0.5);
    // ln((0.01)^(-0.5)) = ln(100^0.5) = ln(10) ≈ 2.302
    expect(result).toBeCloseTo(2.302, 1);
  });

  it("returns ~0.535 for two accesses at 1h and 2h ago (d=0.5)", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    const oneHourAgo = new Date("2026-01-15T11:00:00Z").toISOString();
    const twoHoursAgo = new Date("2026-01-15T10:00:00Z").toISOString();
    const result = baseLevelActivation([oneHourAgo, twoHoursAgo], now, 0.5);
    // ln(1^(-0.5) + 2^(-0.5)) = ln(1 + 0.7071) = ln(1.7071) ≈ 0.535
    expect(result).toBeCloseTo(0.535, 2);
  });

  it("uses Petrov approximation for >50 accesses", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    const d = 0.5;
    // 100 accesses spread over 100 hours (1 per hour)
    const accessLog: string[] = [];
    for (let i = 1; i <= 100; i++) {
      accessLog.push(
        new Date(now.getTime() - i * 3_600_000).toISOString()
      );
    }
    const result = baseLevelActivation(accessLog, now, d);
    // Petrov: ln(n / (1-d)) - d * ln(L)
    // n=100, L=100h (span from first access)
    // ln(100/0.5) - 0.5*ln(100) = ln(200) - 0.5*ln(100) ≈ 5.298 - 2.302 = 2.996
    expect(result).toBeCloseTo(2.996, 1);
  });

  it("clamps minimum time delta to avoid division by zero", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    const simultaneous = now.toISOString();
    // Should not throw or return NaN
    const result = baseLevelActivation([simultaneous], now, 0.5);
    expect(Number.isFinite(result)).toBe(true);
  });
});

describe("spreadingActivation", () => {
  it("returns contextWeight * similarity for full similarity", () => {
    expect(spreadingActivation(1.0, 11.0)).toBeCloseTo(11.0, 5);
  });

  it("returns half weight for 0.5 similarity", () => {
    expect(spreadingActivation(0.5, 11.0)).toBeCloseTo(5.5, 5);
  });

  it("returns 0 for zero similarity", () => {
    expect(spreadingActivation(0.0, 11.0)).toBeCloseTo(0.0, 5);
  });
});

describe("stochasticNoise", () => {
  it("produces samples with mean near 0 and stddev near sigma", () => {
    const sigma = 1.2;
    const N = 10_000;
    const samples: number[] = [];
    for (let i = 0; i < N; i++) {
      samples.push(stochasticNoise(sigma));
    }
    const mean = samples.reduce((a, b) => a + b, 0) / N;
    const variance =
      samples.reduce((a, b) => a + (b - mean) ** 2, 0) / N;
    const stddev = Math.sqrt(variance);

    // mean should be within +-0.15 of 0
    expect(Math.abs(mean)).toBeLessThan(0.15);
    // stddev should be within +-0.2 of sigma
    expect(Math.abs(stddev - sigma)).toBeLessThan(0.2);
  });

  it("returns a finite number", () => {
    const result = stochasticNoise(1.2);
    expect(Number.isFinite(result)).toBe(true);
  });
});

describe("totalActivation", () => {
  it("sums base, spreading, and noise", () => {
    expect(totalActivation(2.0, 5.5, 0.1)).toBeCloseTo(7.6, 5);
  });

  it("returns -Infinity when base is -Infinity", () => {
    expect(totalActivation(-Infinity, 5.5, 0.1)).toBe(-Infinity);
  });
});
