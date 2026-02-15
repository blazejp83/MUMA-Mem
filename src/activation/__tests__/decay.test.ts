import { describe, it, expect } from "vitest";
import {
  computeRetention,
  reinforceHalfLife,
  isPruningCandidate,
} from "../decay.js";

describe("computeRetention", () => {
  it("returns 1.0 at time zero", () => {
    expect(computeRetention(168, 0)).toBeCloseTo(1.0, 5);
  });

  it("returns 0.5 at one half-life", () => {
    expect(computeRetention(168, 168)).toBeCloseTo(0.5, 5);
  });

  it("returns 0.25 at two half-lives", () => {
    expect(computeRetention(168, 336)).toBeCloseTo(0.25, 5);
  });
});

describe("reinforceHalfLife", () => {
  it("increases half-life by factor 0.1", () => {
    expect(reinforceHalfLife(168, 0.1)).toBeCloseTo(184.8, 1);
  });

  it("increases half-life by factor 0.2", () => {
    expect(reinforceHalfLife(168, 0.2)).toBeCloseTo(201.6, 1);
  });

  it("uses default factor 0.1 when not provided", () => {
    expect(reinforceHalfLife(100)).toBeCloseTo(110, 1);
  });
});

describe("isPruningCandidate", () => {
  it("returns true when activation below threshold and not pinned", () => {
    expect(isPruningCandidate(-3.0, -2.0, false)).toBe(true);
  });

  it("returns false when activation above threshold", () => {
    expect(isPruningCandidate(1.0, -2.0, false)).toBe(false);
  });

  it("returns false when pinned regardless of activation", () => {
    expect(isPruningCandidate(-3.0, -2.0, true)).toBe(false);
  });
});
