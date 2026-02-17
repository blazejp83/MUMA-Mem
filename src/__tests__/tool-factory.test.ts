/**
 * Integration test: tool factory produces correctly shaped tools.
 *
 * Verifies:
 * - Factory registration: registerTools registers 1 tool factory entry
 * - Factory produces 10 tools when called with a session context
 * - Each tool has required fields: name, label, description, parameters, execute
 * - Tool names match the expected 10-name set
 * - Factory captures userId from sessionKey via deriveUserId
 * - Factory captures agentId from context
 * - Factory defaults agentId to "unknown" when not provided
 */
import { describe, it, expect, vi } from "vitest";

// Mock dependencies imported by tools/index.ts from plugin.ts
vi.mock("../plugin.js", () => ({
  getStore: vi.fn().mockReturnValue({
    read: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    listByUser: vi.fn().mockResolvedValue([]),
    countByUser: vi.fn().mockResolvedValue(0),
    backend: "sqlite",
  }),
  getWorkingMemory: vi.fn().mockReturnValue(null),
  getTransactiveIndex: vi.fn().mockReturnValue(null),
  getConfig: vi.fn().mockReturnValue({
    activation: { decayParameter: 0.5, contextWeight: 1.0, noiseStddev: 0.1, retrievalThreshold: -1.0 },
  }),
  getEmbeddingProvider: vi.fn(),
  getLLMProvider: vi.fn(),
}));

// Mock pipeline modules
vi.mock("../pipeline/write.js", () => ({
  write: vi.fn().mockResolvedValue({ operation: "create", note: { id: "test-id" }, reason: "new" }),
}));
vi.mock("../pipeline/read.js", () => ({
  search: vi.fn().mockResolvedValue([]),
}));

// Mock consolidation modules
vi.mock("../consolidation/consolidate.js", () => ({ consolidate: vi.fn() }));
vi.mock("../consolidation/distill.js", () => ({
  distillMemoryMd: vi.fn(),
  writeMemoryMdFile: vi.fn(),
}));

// Mock access module
vi.mock("../access/index.js", () => ({
  resolveAgentProfile: vi.fn().mockReturnValue({ domains: [] }),
  canAgentSeeNote: vi.fn().mockReturnValue(true),
}));

import { registerTools } from "../tools/index.js";
import { createMockApi } from "./mock-api.js";
import type { OpenClawPluginToolContext, AgentTool } from "../types/openclaw.js";

const EXPECTED_TOOL_NAMES = [
  "memory_write",
  "memory_query",
  "memory_forget",
  "memory_pin",
  "memory_set_visibility",
  "memory_get_context",
  "memory_stats",
  "memory_link",
  "memory_search_agents",
  "memory_consolidate",
] as const;

describe("tool factory", () => {
  it("registers 1 tool factory entry", () => {
    const api = createMockApi();
    registerTools(api);

    expect(api._tools.length).toBe(1);
    expect(typeof api._tools[0].factory).toBe("function");
  });

  it("factory produces 10 tools", () => {
    const api = createMockApi();
    registerTools(api);

    const factory = api._tools[0].factory as (ctx: OpenClawPluginToolContext) => AgentTool[];
    const tools = factory({ sessionKey: "telegram:123:agent1", agentId: "agent1" });

    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBe(10);
  });

  it("each tool has required fields", () => {
    const api = createMockApi();
    registerTools(api);

    const factory = api._tools[0].factory as (ctx: OpenClawPluginToolContext) => AgentTool[];
    const tools = factory({ sessionKey: "telegram:123:agent1", agentId: "agent1" });

    for (const tool of tools) {
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);

      expect(typeof tool.label).toBe("string");
      expect(tool.label.length).toBeGreaterThan(0);

      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(0);

      expect(typeof tool.parameters).toBe("object");
      expect(tool.parameters.type).toBe("object");

      expect(typeof tool.execute).toBe("function");
    }
  });

  it("tool names match expected set", () => {
    const api = createMockApi();
    registerTools(api);

    const factory = api._tools[0].factory as (ctx: OpenClawPluginToolContext) => AgentTool[];
    const tools = factory({ sessionKey: "telegram:123:agent1", agentId: "agent1" });

    const names = tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining([...EXPECTED_TOOL_NAMES]));
    expect(names.length).toBe(EXPECTED_TOOL_NAMES.length);
  });

  it("factory captures userId from sessionKey", async () => {
    const api = createMockApi();
    registerTools(api);

    const factory = api._tools[0].factory as (ctx: OpenClawPluginToolContext) => AgentTool[];
    const tools = factory({ sessionKey: "telegram:123:agent1", agentId: "agent1" });

    // Find memory_write tool and invoke it
    const writeTool = tools.find((t) => t.name === "memory_write")!;
    expect(writeTool).toBeDefined();

    await writeTool.execute("call-1", { content: "test memory" });

    // Verify the write() mock was called with userId derived from "telegram:123:agent1" -> "telegram:123"
    const { write } = await import("../pipeline/write.js");
    expect(write).toHaveBeenCalledWith("test memory", expect.objectContaining({
      userId: "telegram:123",
    }));
  });

  it("factory captures agentId from context", async () => {
    const api = createMockApi();
    registerTools(api);

    const factory = api._tools[0].factory as (ctx: OpenClawPluginToolContext) => AgentTool[];
    const tools = factory({ sessionKey: "telegram:123:agent1", agentId: "agent1" });

    const writeTool = tools.find((t) => t.name === "memory_write")!;
    await writeTool.execute("call-2", { content: "test memory 2" });

    const { write } = await import("../pipeline/write.js");
    expect(write).toHaveBeenCalledWith("test memory 2", expect.objectContaining({
      agentId: "agent1",
    }));
  });

  it("factory defaults agentId to 'unknown'", async () => {
    const api = createMockApi();
    registerTools(api);

    const factory = api._tools[0].factory as (ctx: OpenClawPluginToolContext) => AgentTool[];
    // No agentId in context
    const tools = factory({ sessionKey: "test:user" });

    const writeTool = tools.find((t) => t.name === "memory_write")!;
    await writeTool.execute("call-3", { content: "test memory 3" });

    const { write } = await import("../pipeline/write.js");
    expect(write).toHaveBeenCalledWith("test memory 3", expect.objectContaining({
      agentId: "unknown",
    }));
  });
});
