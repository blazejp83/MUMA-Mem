import { describe, it, expect } from "vitest";
import { deriveUserId, deriveUserIdFromMessageCtx } from "../deriveUserId.js";

describe("deriveUserId", () => {
  it("extracts channel:peerId from 3-segment sessionKey", () => {
    expect(deriveUserId("telegram:12345:agent1")).toBe("telegram:12345");
  });

  it("returns full key for 2-segment sessionKey", () => {
    expect(deriveUserId("telegram:12345")).toBe("telegram:12345");
  });

  it("handles discord channel with 3 segments", () => {
    expect(deriveUserId("discord:98765:helper")).toBe("discord:98765");
  });

  it("returns 'default' for 1-segment sessionKey (no colon)", () => {
    expect(deriveUserId("standalone")).toBe("default");
  });

  it("returns 'default' for undefined sessionKey", () => {
    expect(deriveUserId(undefined)).toBe("default");
  });

  it("returns 'default' for empty string sessionKey", () => {
    expect(deriveUserId("")).toBe("default");
  });

  it("handles sessionKey with more than 3 segments", () => {
    expect(deriveUserId("slack:U123:agent:extra")).toBe("slack:U123");
  });
});

describe("deriveUserIdFromMessageCtx", () => {
  it("combines channelId and accountId", () => {
    expect(
      deriveUserIdFromMessageCtx({ channelId: "telegram", accountId: "12345" }),
    ).toBe("telegram:12345");
  });

  it("returns channelId when accountId is missing", () => {
    expect(deriveUserIdFromMessageCtx({ channelId: "cli" })).toBe("cli");
  });

  it("returns channelId when accountId is undefined", () => {
    expect(
      deriveUserIdFromMessageCtx({ channelId: "web", accountId: undefined }),
    ).toBe("web");
  });
});
