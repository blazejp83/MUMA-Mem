import type { MumaConfig } from "../config.js";
import type { Visibility } from "../types/note.js";

// --- Agent Profile ---

export interface AgentProfile {
  domains: string[];
  canSeePrivate: boolean;
}

/**
 * Resolve the memory profile for a given agent.
 * Returns the per-agent config if it exists, otherwise the default.
 */
export function resolveAgentProfile(
  agentId: string,
  config: MumaConfig
): AgentProfile {
  const perAgent = config.agentMemory[agentId];
  if (perAgent) {
    return perAgent;
  }
  return config.defaultAgentMemory;
}

// --- Domain Matching ---

/**
 * Check if a note's domain matches any of the agent's domains using
 * longest-prefix matching.
 *
 * Rules:
 * - "*" matches everything
 * - Exact match: "business/sales" matches "business/sales"
 * - Prefix match: "business/sales" matches "business" (prefix + "/" boundary)
 * - Child does NOT match parent: "business" does NOT match "business/sales"
 * - Empty domain "" matches only "" or "*"
 */
export function matchDomainPrefix(
  noteDomain: string,
  agentDomains: string[]
): boolean {
  for (const domain of agentDomains) {
    if (domain === "*") return true;
    if (noteDomain === domain) return true;
    if (domain !== "" && noteDomain.startsWith(domain + "/")) return true;
  }
  return false;
}

// --- Domain Rule Application ---

/**
 * Apply domain visibility rules to determine a note's effective visibility.
 * Finds the longest matching prefix in domainRules keys.
 * Falls back to defaultVisibility if no rule matches.
 */
export function applyDomainRule(
  noteDomain: string,
  domainRules: Record<string, Visibility>,
  defaultVisibility: Visibility
): Visibility {
  let bestKey = "";
  let bestVisibility: Visibility | undefined;

  for (const key of Object.keys(domainRules)) {
    const isMatch =
      noteDomain === key ||
      (key !== "" && noteDomain.startsWith(key + "/"));

    if (isMatch && key.length > bestKey.length) {
      bestKey = key;
      bestVisibility = domainRules[key];
    }
  }

  return bestVisibility ?? defaultVisibility;
}

// --- Visibility Gate ---

/**
 * Determine whether an agent can see a given note based on its visibility
 * level, domain, and agent profile.
 *
 * Visibility rules:
 * - "open": any agent with domain access can see it
 * - "scoped": agents in same domain can see it
 * - "private": only owning agent or agents with canSeePrivate
 * - "user-only": no agent can see it
 */
export function canAgentSeeNote(
  note: { visibility: Visibility; domain: string; created_by: string },
  agentId: string,
  profile: AgentProfile
): boolean {
  switch (note.visibility) {
    case "user-only":
      return false;

    case "private":
      return note.created_by === agentId || profile.canSeePrivate;

    case "scoped":
      return matchDomainPrefix(note.domain, profile.domains);

    case "open":
      return matchDomainPrefix(note.domain, profile.domains);

    default:
      return false;
  }
}
