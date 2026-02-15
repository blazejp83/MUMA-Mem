import { describe, it, expect } from "vitest";
import type { MumaConfig } from "../../config.js";
import type { Visibility } from "../../types/note.js";
import {
  resolveAgentProfile,
  matchDomainPrefix,
  applyDomainRule,
  canAgentSeeNote,
  type AgentProfile,
} from "../visibility.js";

// --- Helpers ---

function makeConfig(overrides: Partial<MumaConfig> = {}): MumaConfig {
  return {
    redis: { url: "redis://localhost:6379", prefix: "muma:" },
    sqlite: {},
    embedding: { provider: "local", model: "Xenova/all-MiniLM-L6-v2" },
    llm: { temperature: 0.7, maxTokens: 1024 },
    activation: {
      contextWeight: 11.0,
      noiseStddev: 1.2,
      decayParameter: 0.5,
      retrievalThreshold: 0.0,
    },
    decay: {
      sweepIntervalMinutes: 60,
      pruneThreshold: -2.0,
      hardPruneThreshold: -5.0,
      minAgeHours: 72,
      maxAgeHours: 720,
    },
    visibility: {
      defaultVisibility: "scoped",
      domainRules: {},
      domainBoost: 1.0,
    },
    agentMemory: {},
    defaultAgentMemory: { domains: ["*"], canSeePrivate: false },
    ...overrides,
  } as MumaConfig;
}

function makeNote(overrides: {
  visibility?: Visibility;
  domain?: string;
  created_by?: string;
}) {
  return {
    visibility: overrides.visibility ?? "open",
    domain: overrides.domain ?? "general",
    created_by: overrides.created_by ?? "agent-a",
  };
}

// --- resolveAgentProfile ---

describe("resolveAgentProfile", () => {
  it("returns config.agentMemory[agentId] if exists", () => {
    const config = makeConfig({
      agentMemory: {
        "agent-sales": { domains: ["business/sales"], canSeePrivate: true },
      },
    });
    const profile = resolveAgentProfile("agent-sales", config);
    expect(profile.domains).toEqual(["business/sales"]);
    expect(profile.canSeePrivate).toBe(true);
  });

  it("falls back to config.defaultAgentMemory if agentId not found", () => {
    const config = makeConfig({
      defaultAgentMemory: { domains: ["*"], canSeePrivate: false },
    });
    const profile = resolveAgentProfile("unknown-agent", config);
    expect(profile.domains).toEqual(["*"]);
    expect(profile.canSeePrivate).toBe(false);
  });

  it("uses per-agent profile even if default exists", () => {
    const config = makeConfig({
      agentMemory: {
        "agent-x": { domains: ["personal"], canSeePrivate: false },
      },
      defaultAgentMemory: { domains: ["*"], canSeePrivate: true },
    });
    const profile = resolveAgentProfile("agent-x", config);
    expect(profile.domains).toEqual(["personal"]);
    expect(profile.canSeePrivate).toBe(false);
  });
});

// --- matchDomainPrefix ---

describe("matchDomainPrefix", () => {
  it("matches prefix: 'business/sales' matches agent domain 'business'", () => {
    expect(matchDomainPrefix("business/sales", ["business"])).toBe(true);
  });

  it("matches exact: 'business/sales' matches 'business/sales'", () => {
    expect(matchDomainPrefix("business/sales", ["business/sales"])).toBe(true);
  });

  it("does not match sibling: 'business/sales' does NOT match 'business/marketing'", () => {
    expect(matchDomainPrefix("business/sales", ["business/marketing"])).toBe(
      false
    );
  });

  it("does not match unrelated: 'business/sales' does NOT match 'personal'", () => {
    expect(matchDomainPrefix("business/sales", ["personal"])).toBe(false);
  });

  it("matches wildcard: 'business/sales' matches '*'", () => {
    expect(matchDomainPrefix("business/sales", ["*"])).toBe(true);
  });

  it("returns false for empty domains array", () => {
    expect(matchDomainPrefix("business/sales", [])).toBe(false);
  });

  it("matches wildcard for simple domain: 'general' matches '*'", () => {
    expect(matchDomainPrefix("general", ["*"])).toBe(true);
  });

  it("matches nested prefix: 'business/sales/q1' matches 'business/sales'", () => {
    expect(matchDomainPrefix("business/sales/q1", ["business/sales"])).toBe(
      true
    );
  });

  it("child domain does not match parent request: 'business' does NOT match 'business/sales'", () => {
    expect(matchDomainPrefix("business", ["business/sales"])).toBe(false);
  });

  it("empty noteDomain matches empty agent domain", () => {
    expect(matchDomainPrefix("", [""])).toBe(true);
  });

  it("empty noteDomain matches wildcard", () => {
    expect(matchDomainPrefix("", ["*"])).toBe(true);
  });

  it("empty noteDomain does not match non-empty domain", () => {
    expect(matchDomainPrefix("", ["business"])).toBe(false);
  });
});

// --- applyDomainRule ---

describe("applyDomainRule", () => {
  it("returns matching rule's visibility for prefix match", () => {
    expect(
      applyDomainRule("business/sales", { business: "scoped" }, "open")
    ).toBe("scoped");
  });

  it("returns longest matching prefix rule when multiple match", () => {
    expect(
      applyDomainRule(
        "business/sales",
        { "business/sales": "private", business: "scoped" },
        "open"
      )
    ).toBe("private");
  });

  it("falls back to defaultVisibility if no rule matches", () => {
    expect(
      applyDomainRule("personal/health", { business: "scoped" }, "open")
    ).toBe("open");
  });

  it("returns defaultVisibility when domainRules is empty", () => {
    expect(applyDomainRule("general", {}, "scoped")).toBe("scoped");
  });

  it("matches exact domain key", () => {
    expect(
      applyDomainRule("business", { business: "private" }, "open")
    ).toBe("private");
  });

  it("matches nested domain against shorter key", () => {
    expect(
      applyDomainRule("business/sales/q1", { business: "scoped" }, "open")
    ).toBe("scoped");
  });
});

// --- canAgentSeeNote ---

describe("canAgentSeeNote", () => {
  describe("open visibility", () => {
    it("returns true for any agent with domain match", () => {
      const note = makeNote({
        visibility: "open",
        domain: "general",
        created_by: "agent-a",
      });
      const profile: AgentProfile = { domains: ["*"], canSeePrivate: false };
      expect(canAgentSeeNote(note, "agent-b", profile)).toBe(true);
    });

    it("returns false for agent WITHOUT domain match", () => {
      const note = makeNote({
        visibility: "open",
        domain: "business/sales",
        created_by: "agent-a",
      });
      const profile: AgentProfile = {
        domains: ["personal"],
        canSeePrivate: false,
      };
      expect(canAgentSeeNote(note, "agent-b", profile)).toBe(false);
    });
  });

  describe("scoped visibility", () => {
    it("returns true for same-domain agent", () => {
      const note = makeNote({
        visibility: "scoped",
        domain: "business/sales",
        created_by: "agent-a",
      });
      const profile: AgentProfile = {
        domains: ["business"],
        canSeePrivate: false,
      };
      expect(canAgentSeeNote(note, "agent-b", profile)).toBe(true);
    });

    it("returns false for different-domain agent", () => {
      const note = makeNote({
        visibility: "scoped",
        domain: "business/sales",
        created_by: "agent-a",
      });
      const profile: AgentProfile = {
        domains: ["personal"],
        canSeePrivate: false,
      };
      expect(canAgentSeeNote(note, "agent-b", profile)).toBe(false);
    });
  });

  describe("private visibility", () => {
    it("returns true for the owning agent", () => {
      const note = makeNote({
        visibility: "private",
        domain: "business",
        created_by: "agent-a",
      });
      const profile: AgentProfile = {
        domains: ["business"],
        canSeePrivate: false,
      };
      expect(canAgentSeeNote(note, "agent-a", profile)).toBe(true);
    });

    it("returns true for agent with canSeePrivate=true", () => {
      const note = makeNote({
        visibility: "private",
        domain: "business",
        created_by: "agent-a",
      });
      const profile: AgentProfile = {
        domains: ["business"],
        canSeePrivate: true,
      };
      expect(canAgentSeeNote(note, "agent-b", profile)).toBe(true);
    });

    it("returns false for other agent without canSeePrivate", () => {
      const note = makeNote({
        visibility: "private",
        domain: "business",
        created_by: "agent-a",
      });
      const profile: AgentProfile = {
        domains: ["business"],
        canSeePrivate: false,
      };
      expect(canAgentSeeNote(note, "agent-b", profile)).toBe(false);
    });
  });

  describe("user-only visibility", () => {
    it("returns false for any agent", () => {
      const note = makeNote({
        visibility: "user-only",
        domain: "general",
        created_by: "agent-a",
      });
      const profile: AgentProfile = {
        domains: ["*"],
        canSeePrivate: true,
      };
      expect(canAgentSeeNote(note, "agent-a", profile)).toBe(false);
    });
  });
});
