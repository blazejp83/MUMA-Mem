/**
 * Build a reverse identity map from canonical userId → channel identities
 * to channel identity → canonical userId.
 *
 * @param identityMap - Map of canonical name → channel identities
 *   e.g. { "alice": ["telegram:12345", "discord:98765"] }
 * @returns Map from channel identity to canonical name
 *   e.g. Map { "telegram:12345" → "alice", "discord:98765" → "alice" }
 * @throws Error if any channel identity appears in more than one group
 */
export function buildReverseIdentityMap(
  identityMap?: Record<string, string[]>,
): Map<string, string> {
  const reverseMap = new Map<string, string>();
  if (!identityMap) return reverseMap;

  for (const [canonicalName, identities] of Object.entries(identityMap)) {
    for (const identity of identities) {
      const existing = reverseMap.get(identity);
      if (existing !== undefined) {
        throw new Error(
          `Duplicate channel identity "${identity}" found in both "${existing}" and "${canonicalName}" identity groups`,
        );
      }
      reverseMap.set(identity, canonicalName);
    }
  }

  return reverseMap;
}

/**
 * Derive a userId from an OpenClaw sessionKey.
 *
 * OpenClaw session keys follow the format:
 *   "channel:peerId" or "channel:peerId:agentId"
 *
 * This function extracts the first two segments ("channel:peerId") as
 * the userId, which uniquely identifies a user within a channel.
 *
 * If a reverseIdentityMap is provided, the raw userId is checked against
 * it. If found, the canonical name is returned instead. This enables
 * cross-channel identity mapping where multiple channel identities
 * resolve to the same user.
 *
 * @param sessionKey - The OpenClaw sessionKey (e.g. "telegram:12345:agent1")
 * @param reverseIdentityMap - Optional map from channel identity to canonical userId
 * @returns A userId string (e.g. "telegram:12345" or "alice"), or "default" if unparseable
 */
export function deriveUserId(
  sessionKey?: string,
  reverseIdentityMap?: Map<string, string>,
): string {
  if (!sessionKey) return "default";
  const colonIndex = sessionKey.indexOf(":");
  if (colonIndex === -1) return "default";

  // Extract "channel:peerId" — find the second colon to strip agentId
  const secondColon = sessionKey.indexOf(":", colonIndex + 1);
  let rawUserId: string;
  if (secondColon === -1) {
    // Only two segments: "channel:peerId"
    rawUserId = sessionKey;
  } else {
    // Three+ segments: return first two
    rawUserId = sessionKey.substring(0, secondColon);
  }

  // Check reverse identity map for canonical name
  if (reverseIdentityMap) {
    const canonical = reverseIdentityMap.get(rawUserId);
    if (canonical !== undefined) {
      return canonical;
    }
  }

  return rawUserId;
}

/**
 * Derive a userId from a `message_received` hook context.
 *
 * The message_received context provides `channelId` and optionally
 * `accountId` instead of a sessionKey. This function combines them
 * into the same "channel:peerId" format used by deriveUserId.
 *
 * If a reverseIdentityMap is provided, the raw userId is checked against
 * it for cross-channel identity resolution.
 *
 * @param ctx - The message_received hook context
 * @param reverseIdentityMap - Optional map from channel identity to canonical userId
 * @returns A userId string (e.g. "telegram:12345" or "alice")
 */
export function deriveUserIdFromMessageCtx(
  ctx: {
    channelId: string;
    accountId?: string;
  },
  reverseIdentityMap?: Map<string, string>,
): string {
  let rawUserId: string;
  if (ctx.accountId) {
    rawUserId = `${ctx.channelId}:${ctx.accountId}`;
  } else {
    rawUserId = ctx.channelId;
  }

  // Check reverse identity map for canonical name
  if (reverseIdentityMap) {
    const canonical = reverseIdentityMap.get(rawUserId);
    if (canonical !== undefined) {
      return canonical;
    }
  }

  return rawUserId;
}
