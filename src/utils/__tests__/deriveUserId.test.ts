import { describe, it, expect } from "vitest";
import { buildReverseIdentityMap, deriveUserId, deriveUserIdFromMessageCtx } from "../deriveUserId.js";

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

describe("buildReverseIdentityMap", () => {
  it("builds correct reverse map from identity map", () => {
    const identityMap = {
      alice: ["telegram:12345", "discord:98765"],
      bob: ["slack:U456"],
    };
    const reverseMap = buildReverseIdentityMap(identityMap);
    expect(reverseMap.get("telegram:12345")).toBe("alice");
    expect(reverseMap.get("discord:98765")).toBe("alice");
    expect(reverseMap.get("slack:U456")).toBe("bob");
    expect(reverseMap.size).toBe(3);
  });

  it("throws on duplicate channel identity across groups", () => {
    const identityMap = {
      alice: ["telegram:12345", "discord:98765"],
      bob: ["telegram:12345"],
    };
    expect(() => buildReverseIdentityMap(identityMap)).toThrow(
      'Duplicate channel identity "telegram:12345" found in both "alice" and "bob" identity groups',
    );
  });

  it("returns empty map for undefined input", () => {
    const reverseMap = buildReverseIdentityMap(undefined);
    expect(reverseMap.size).toBe(0);
  });

  it("returns empty map for empty object", () => {
    const reverseMap = buildReverseIdentityMap({});
    expect(reverseMap.size).toBe(0);
  });
});

describe("deriveUserId with identity map", () => {
  const reverseMap = new Map<string, string>([
    ["telegram:12345", "alice"],
    ["discord:98765", "alice"],
    ["slack:U456", "bob"],
  ]);

  it("resolves to canonical name when identity is in map", () => {
    expect(deriveUserId("telegram:12345:agent1", reverseMap)).toBe("alice");
  });

  it("resolves 2-segment key to canonical name", () => {
    expect(deriveUserId("discord:98765", reverseMap)).toBe("alice");
  });

  it("falls back to raw userId when not in map", () => {
    // "matrix:@user:server" has 3 segments, so raw userId is "matrix:@user"
    expect(deriveUserId("matrix:@user:server", reverseMap)).toBe("matrix:@user");
  });

  it("backward compatible without map (undefined)", () => {
    expect(deriveUserId("telegram:12345:agent1")).toBe("telegram:12345");
  });

  it("backward compatible without map (no second arg)", () => {
    expect(deriveUserId("telegram:12345")).toBe("telegram:12345");
  });
});

describe("deriveUserIdFromMessageCtx with identity map", () => {
  const reverseMap = new Map<string, string>([
    ["telegram:12345", "alice"],
    ["discord:98765", "alice"],
  ]);

  it("resolves via reverse map when identity matches", () => {
    expect(
      deriveUserIdFromMessageCtx({ channelId: "telegram", accountId: "12345" }, reverseMap),
    ).toBe("alice");
  });

  it("falls back to raw userId when not in map", () => {
    expect(
      deriveUserIdFromMessageCtx({ channelId: "web", accountId: "999" }, reverseMap),
    ).toBe("web:999");
  });

  it("backward compatible without map", () => {
    expect(
      deriveUserIdFromMessageCtx({ channelId: "telegram", accountId: "12345" }),
    ).toBe("telegram:12345");
  });
});
