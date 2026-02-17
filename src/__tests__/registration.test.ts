/**
 * Integration test: registerPlugin correctly wires up all OpenClaw integration points.
 *
 * Verifies:
 * - All 9 hooks registered (gateway_start, session_start, before_agent_start,
 *   session_end, before_compaction, before_reset, message_received, after_tool_call, gateway_stop)
 * - Tool factory registered with all 10 tool names
 * - CLI registrar registered with "memory" command
 * - Registration log messages emitted
 */
import { describe, it, expect, vi } from "vitest";

// Mock all heavy dependencies that are imported by plugin.ts but not called during registerPlugin()
vi.mock("../store/factory.js", () => ({ createStore: vi.fn() }));
vi.mock("../embedding/factory.js", () => ({ createEmbeddingProvider: vi.fn() }));
vi.mock("../embedding/validation.js", () => ({ validateEmbeddingDimensions: vi.fn() }));
vi.mock("../llm/factory.js", () => ({ createLLMProvider: vi.fn() }));
vi.mock("../pipeline/write.js", () => ({ write: vi.fn() }));
vi.mock("../pipeline/read.js", () => ({ search: vi.fn() }));
vi.mock("../sync/index.js", () => ({
  createEventBus: vi.fn(),
  FilesystemSync: vi.fn(),
}));
vi.mock("../access/index.js", () => ({
  createTransactiveIndex: vi.fn(),
  TransactiveMemoryIndex: vi.fn(),
  resolveAgentProfile: vi.fn(),
  canAgentSeeNote: vi.fn(),
}));
vi.mock("../daemon/index.js", () => ({
  startSweepScheduler: vi.fn(),
  startConsolidationScheduler: vi.fn(),
}));
vi.mock("../memory/index.js", () => ({
  WorkingMemory: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    getContextItems: vi.fn().mockReturnValue([]),
    getTopActivated: vi.fn().mockReturnValue([]),
    clear: vi.fn(),
    size: 0,
  })),
}));
vi.mock("../consolidation/consolidate.js", () => ({ consolidate: vi.fn() }));
vi.mock("../consolidation/distill.js", () => ({
  distillMemoryMd: vi.fn(),
  writeMemoryMdFile: vi.fn(),
}));

import { registerPlugin } from "../plugin.js";
import { createMockApi } from "./mock-api.js";

describe("registerPlugin registration contract", () => {
  it("registers all 9 hooks", () => {
    const api = createMockApi();
    registerPlugin(api);

    const expectedHooks = [
      "gateway_start",
      "session_start",
      "before_agent_start",
      "session_end",
      "before_compaction",
      "before_reset",
      "message_received",
      "after_tool_call",
      "gateway_stop",
    ];

    for (const hookName of expectedHooks) {
      expect(api._hooks.has(hookName), `hook '${hookName}' should be registered`).toBe(true);
      expect(typeof api._hooks.get(hookName)!.handler).toBe("function");
    }

    expect(api._hooks.size).toBe(9);
  });

  it("registers tool factory", () => {
    const api = createMockApi();
    registerPlugin(api);

    expect(api._tools.length).toBe(1);

    const entry = api._tools[0];
    expect(typeof entry.factory).toBe("function");
    expect(entry.opts).toBeDefined();
    expect(entry.opts!.names).toBeDefined();

    const expectedToolNames = [
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
    ];

    expect(entry.opts!.names).toEqual(expect.arrayContaining(expectedToolNames));
    expect(entry.opts!.names!.length).toBe(10);
  });

  it("registers CLI", () => {
    const api = createMockApi();
    registerPlugin(api);

    expect(api._cli.length).toBe(1);

    const entry = api._cli[0];
    expect(typeof entry.registrar).toBe("function");
    expect(entry.opts).toBeDefined();
    expect(entry.opts!.commands).toContain("memory");
  });

  it("logs registration messages", () => {
    const api = createMockApi();
    registerPlugin(api);

    const infoCalls = (api.logger.info as ReturnType<typeof vi.fn>).mock.calls;
    const messages = infoCalls.map((call: unknown[]) => String(call[0]));

    expect(messages.some((m: string) => m.includes("tools registered"))).toBe(true);
    expect(messages.some((m: string) => m.includes("CLI commands registered"))).toBe(true);
  });
});
