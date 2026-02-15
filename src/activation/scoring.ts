/**
 * ACT-R activation scoring functions.
 *
 * All functions are pure (no side effects, no external imports).
 */

/** Minimum time delta in hours to avoid division by zero. */
const MIN_DELTA_HOURS = 1 / 3600; // 1 second

/** Threshold for switching to Petrov 2006 hybrid approximation. */
const PETROV_THRESHOLD = 50;

/**
 * ACT-R base-level learning equation: B_i = ln(SUM_j t_j^(-d))
 *
 * For large access counts (>50), uses Petrov 2006 hybrid approximation:
 *   B_i ~= ln(n / (1 - d)) - d * ln(L)
 * where n = access count, L = hours since first access.
 *
 * @param accessLog - ISO 8601 timestamps of each retrieval
 * @param now - Current time
 * @param d - Decay parameter (default 0.5)
 * @returns Base-level activation score
 */
export function baseLevelActivation(
  accessLog: string[],
  now: Date,
  d: number,
): number {
  if (accessLog.length === 0) return -Infinity;

  const nowMs = now.getTime();

  if (accessLog.length > PETROV_THRESHOLD) {
    // Petrov 2006 hybrid approximation
    const n = accessLog.length;

    // Find earliest access to compute L (hours since first access)
    let earliestMs = nowMs;
    for (const ts of accessLog) {
      const t = new Date(ts).getTime();
      if (t < earliestMs) earliestMs = t;
    }

    const L = Math.max((nowMs - earliestMs) / 3_600_000, MIN_DELTA_HOURS);
    return Math.log(n / (1 - d)) - d * Math.log(L);
  }

  // Exact computation
  let sum = 0;
  for (const ts of accessLog) {
    const deltaMs = nowMs - new Date(ts).getTime();
    const deltaHours = Math.max(deltaMs / 3_600_000, MIN_DELTA_HOURS);
    sum += Math.pow(deltaHours, -d);
  }

  return Math.log(sum);
}

/**
 * Spreading activation from query context.
 *
 * S_i = W * similarity
 *
 * @param similarity - Cosine similarity between query and memory (0-1)
 * @param contextWeight - Weight parameter W (default 11.0 in ACT-R)
 * @returns Spreading activation contribution
 */
export function spreadingActivation(
  similarity: number,
  contextWeight: number,
): number {
  return contextWeight * similarity;
}

/**
 * ACT-R stochastic noise using logistic distribution.
 *
 * Scale: s = sigma * sqrt(3) / pi
 * Inverse CDF: s * ln(u / (1 - u)) where u ~ Uniform(0, 1)
 *
 * @param sigma - Standard deviation of the noise
 * @returns A single noise sample
 */
export function stochasticNoise(sigma: number): number {
  const s = (sigma * Math.sqrt(3)) / Math.PI;

  // Generate uniform random, clamped away from 0 and 1 to avoid +-Infinity
  let u = Math.random();
  while (u <= 0 || u >= 1) {
    u = Math.random();
  }

  return s * Math.log(u / (1 - u));
}

/**
 * Total activation: A_i = B_i + S_i + epsilon_i
 *
 * @param base - Base-level activation (B_i)
 * @param spreading - Spreading activation (S_i)
 * @param noise - Stochastic noise (epsilon_i)
 * @returns Total activation score
 */
export function totalActivation(
  base: number,
  spreading: number,
  noise: number,
): number {
  return base + spreading + noise;
}
