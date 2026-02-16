/**
 * Derive a userId from an OpenClaw sessionKey.
 *
 * OpenClaw session keys follow the format:
 *   "channel:peerId" or "channel:peerId:agentId"
 *
 * This function extracts the first two segments ("channel:peerId") as
 * the userId, which uniquely identifies a user within a channel.
 *
 * @param sessionKey - The OpenClaw sessionKey (e.g. "telegram:12345:agent1")
 * @returns A userId string (e.g. "telegram:12345"), or "default" if unparseable
 */
export function deriveUserId(sessionKey?: string): string {
  if (!sessionKey) return "default";
  const colonIndex = sessionKey.indexOf(":");
  if (colonIndex === -1) return "default";

  // Extract "channel:peerId" — find the second colon to strip agentId
  const secondColon = sessionKey.indexOf(":", colonIndex + 1);
  if (secondColon === -1) {
    // Only two segments: "channel:peerId"
    return sessionKey;
  }
  // Three+ segments: return first two
  return sessionKey.substring(0, secondColon);
}

/**
 * Derive a userId from a `message_received` hook context.
 *
 * The message_received context provides `channelId` and optionally
 * `accountId` instead of a sessionKey. This function combines them
 * into the same "channel:peerId" format used by deriveUserId.
 *
 * @param ctx - The message_received hook context
 * @returns A userId string (e.g. "telegram:12345")
 */
export function deriveUserIdFromMessageCtx(ctx: {
  channelId: string;
  accountId?: string;
}): string {
  if (ctx.accountId) {
    return `${ctx.channelId}:${ctx.accountId}`;
  }
  return ctx.channelId;
}
