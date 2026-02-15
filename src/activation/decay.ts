/**
 * Ebbinghaus decay and memory management functions.
 *
 * All functions are pure (no side effects, no external imports).
 */

/**
 * Ebbinghaus retention function: R(t) = 2^(-t / halfLife)
 *
 * @param halfLife - Half-life in hours
 * @param elapsedHours - Time elapsed since last reinforcement in hours
 * @returns Retention probability (0-1)
 */
export function computeRetention(
  halfLife: number,
  elapsedHours: number,
): number {
  return Math.pow(2, -elapsedHours / halfLife);
}

/**
 * Reinforce half-life on successful retrieval.
 *
 * new_hl = halfLife * (1 + factor)
 *
 * @param halfLife - Current half-life in hours
 * @param factor - Reinforcement factor (default 0.1)
 * @returns New half-life in hours
 */
export function reinforceHalfLife(
  halfLife: number,
  factor: number = 0.1,
): number {
  return halfLife * (1 + factor);
}

/**
 * Determine if a memory is a pruning candidate.
 *
 * A memory is a pruning candidate if its activation is below the threshold
 * AND it is not pinned.
 *
 * @param activation - Current activation score
 * @param threshold - Pruning threshold
 * @param pinned - Whether the memory is pinned (exempt from pruning)
 * @returns true if the memory should be considered for pruning
 */
export function isPruningCandidate(
  activation: number,
  threshold: number,
  pinned: boolean,
): boolean {
  if (pinned) return false;
  return activation < threshold;
}
