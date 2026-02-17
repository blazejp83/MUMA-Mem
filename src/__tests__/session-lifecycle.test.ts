/**
 * Session hook lifecycle integration tests.
 *
 * Tests session_start, before_agent_start, after_tool_call,
 * before_compaction, before_reset, session_end, and message_received
 * through the full plugin lifecycle.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ── Hoisted mocks (available inside vi.mock factories) ───────────────────────

const {
  mockStore,
  mockEmbeddingProvider,
  mockLLMProvider,
  mockEventBus,
  mockFilesystemSync,
  mockWrite,
  mockSearch,
} = vi.hoisted(() => ({
  mockStore: {
    backend: "sqlite" as const,
    dimensions: 384 as number | null,
    close: vi.fn().mockResolvedValue(undefined),
    initialize: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    read: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    search: vi.fn().mockResolvedValue([]),
    listByUser: vi.fn(),
    listAllNotes: vi.fn(),
    countByUser: vi.fn(),
    saveConflicts: vi.fn(),
    getConflicts: vi.fn(),
    resolveConflict: vi.fn(),
  },
  mockEmbeddingProvider: {
    modelName: "test",
    dimensions: 384,
    embed: vi.fn().mockResolvedValue(new Float32Array(384)),
    embedBatch: vi.fn().mockResolvedValue([]),
    initialize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  },
  mockLLMProvider: {
    modelName: "test",
    generate: vi.fn(),
    generateJSON: vi.fn(),
  },
  mockEventBus: {
    emit: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue(vi.fn()),
    close: vi.fn().mockResolvedValue(undefined),
  },
  mockFilesystemSync: {
    start: vi.fn().mockResolvedValue(undefined),
    initialSync: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  },
  mockWrite: vi.fn().mockResolvedValue({
    operation: "ADD" as const,
    note: { id: "test-note", content: "test" },
    reason: "test",
  }),
  mockSearch: vi.fn().mockResolvedValue([]),
}));

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("../store/factory.js", () => ({
  createStore: vi.fn().mockResolvedValue(mockStore),
}));

vi.mock("../embedding/factory.js", () => ({
  createEmbeddingProvider: vi.fn().mockResolvedValue(mockEmbeddingProvider),
}));

vi.mock("../embedding/validation.js", () => ({
  validateEmbeddingDimensions: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("../llm/factory.js", () => ({
  createLLMProvider: vi.fn().mockReturnValue(mockLLMProvider),
}));

vi.mock("../sync/index.js", () => {
  const MockFilesystemSync = function (this: any) {
    this.start = mockFilesystemSync.start;
    this.initialSync = mockFilesystemSync.initialSync;
    this.stop = mockFilesystemSync.stop;
  };
  return {
    createEventBus: vi.fn().mockResolvedValue(mockEventBus),
    FilesystemSync: MockFilesystemSync,
  };
});

vi.mock("../access/index.js", () => ({
  createTransactiveIndex: vi.fn().mockReturnValue({
    recordWrite: vi.fn(),
    clear: vi.fn(),
    getExpertsForDomain: vi.fn(),
  }),
  resolveAgentProfile: vi.fn(),
  canAgentSeeNote: vi.fn(),
}));

vi.mock("../daemon/index.js", () => ({
  startSweepScheduler: vi.fn().mockReturnValue(vi.fn()),
  startConsolidationScheduler: vi.fn().mockReturnValue(vi.fn()),
}));

vi.mock("../pipeline/write.js", () => ({
  write: mockWrite,
}));

vi.mock("../pipeline/read.js", () => ({
  search: mockSearch,
}));

vi.mock("../tools/index.js", () => ({
  registerTools: vi.fn(),
}));

vi.mock("../cli/openclaw.js", () => ({
  registerMemoryCli: vi.fn(),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { registerPlugin, getWorkingMemory } from "../plugin.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

type HookHandler = (...args: unknown[]) => unknown;

function createMockApi() {
  const hooks: Record<string, HookHandler> = {};
  return {
    api: {
      id: "test-plugin",
      name: "test",
      source: "test",
      config: {},
      pluginConfig: {},
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      registerTool: vi.fn(),
      registerHook: vi.fn(),
      registerCli: vi.fn(),
      on: vi.fn((hookName: string, handler: HookHandler) => {
        hooks[hookName] = handler;
      }),
      resolvePath: vi.fn((p: string) => p),
    },
    hooks,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Session Lifecycle", () => {
  let hooks: Record<string, HookHandler>;
  let api: ReturnType<typeof createMockApi>["api"];

  beforeAll(async () => {
    // Set up plugin and initialize gateway for all tests
    const mock = createMockApi();
    api = mock.api;
    hooks = mock.hooks;
    registerPlugin(api as any);

    // Initialize gateway to establish module-level state
    await hooks.gateway_start({ port: 3000 }, {});
  });

  beforeEach(() => {
    // Clear mock call history between tests but keep implementations
    mockWrite.mockClear();
    mockSearch.mockClear();
    mockEmbeddingProvider.embed.mockClear();
  });

  // 1. session_start creates WorkingMemory and maps sessionKey->sessionId
  it("session_start creates WorkingMemory and maps sessionKey to sessionId", async () => {
    await hooks.session_start(
      { sessionId: "sess-1" },
      { sessionId: "sess-1", sessionKey: "telegram:123:agent1" },
    );

    const wm = getWorkingMemory("sess-1");
    expect(wm).not.toBeNull();
  });

  // 2. session_start skips when sessionId is missing from ctx
  it("session_start skips when sessionId is missing", async () => {
    await hooks.session_start(
      { sessionId: "sess-skip" },
      {}, // no sessionId in ctx
    );

    const wm = getWorkingMemory("sess-skip");
    expect(wm).toBeNull();
  });

  // 3. before_agent_start returns prependContext with memories
  it("before_agent_start returns prependContext with memories", async () => {
    // Ensure session exists
    await hooks.session_start(
      { sessionId: "sess-ctx" },
      { sessionId: "sess-ctx", sessionKey: "telegram:456:agent1" },
    );

    // Mock search to return a memory result
    mockSearch.mockResolvedValueOnce([
      {
        note: { id: "n1", content: "test memory", links: [], access_log: [] },
        score: 0.9,
        similarity: 0.85,
      },
    ]);

    const result = await hooks.before_agent_start(
      { prompt: "hello" },
      { sessionId: "sess-ctx", sessionKey: "telegram:456:agent1", agentId: "agent1" },
    );

    expect(result).toBeDefined();
    expect((result as any).prependContext).toBeDefined();
    expect((result as any).prependContext).toContain("test memory");
  });

  // 4. before_agent_start returns undefined when no memories found
  it("before_agent_start returns undefined when no memories found", async () => {
    // Mock search to return empty array
    mockSearch.mockResolvedValueOnce([]);

    const result = await hooks.before_agent_start(
      { prompt: "hi" },
      { agentId: "agent1", sessionKey: "test:user" },
    );

    expect(result).toBeUndefined();
  });

  // 5. after_tool_call captures to L1 via sessionKeyToId lookup
  it("after_tool_call captures to L1 via sessionKeyToId lookup", async () => {
    // Ensure session exists with sessionKey mapping
    await hooks.session_start(
      { sessionId: "sess-tool" },
      { sessionId: "sess-tool", sessionKey: "telegram:789:agent1" },
    );

    // Mock embedding for L1 capture
    mockEmbeddingProvider.embed.mockResolvedValueOnce(new Float32Array(384));

    // Call after_tool_call with a long enough result
    await hooks.after_tool_call(
      { toolName: "test_tool", params: {}, result: "x".repeat(60) },
      { sessionKey: "telegram:789:agent1", agentId: "agent1", toolName: "test_tool" },
    );

    // Verify L1 has items
    const wm = getWorkingMemory("sess-tool");
    expect(wm).not.toBeNull();
    expect(wm!.size).toBeGreaterThan(0);
  });

  // 6. before_compaction promotes L1 without clearing
  it("before_compaction promotes L1 without clearing", async () => {
    // Ensure session exists and has L1 items
    await hooks.session_start(
      { sessionId: "sess-compact" },
      { sessionId: "sess-compact", sessionKey: "telegram:compact:agent1" },
    );

    // Add an item to L1 directly
    const wm = getWorkingMemory("sess-compact");
    expect(wm).not.toBeNull();
    wm!.add("compaction test memory", new Float32Array(384), {
      agentId: "agent1",
      userId: "telegram:compact",
      source: "experience",
    });
    expect(wm!.size).toBe(1);

    // Invoke before_compaction
    await hooks.before_compaction(
      { messageCount: 50 },
      { sessionId: "sess-compact" },
    );

    // Verify write was called (promotion happened)
    expect(mockWrite).toHaveBeenCalled();

    // Verify session continues (L1 NOT cleared)
    const wmAfter = getWorkingMemory("sess-compact");
    expect(wmAfter).not.toBeNull();
  });

  // 7. before_reset promotes and clears L1
  it("before_reset promotes and clears L1", async () => {
    // Ensure session exists and has L1 items
    await hooks.session_start(
      { sessionId: "sess-reset" },
      { sessionId: "sess-reset", sessionKey: "telegram:reset:agent1" },
    );

    const wm = getWorkingMemory("sess-reset");
    expect(wm).not.toBeNull();
    wm!.add("reset test memory", new Float32Array(384), {
      agentId: "agent1",
      userId: "telegram:reset",
      source: "experience",
    });
    expect(wm!.size).toBe(1);

    // Invoke before_reset
    await hooks.before_reset(
      { reason: "user_request" },
      { sessionId: "sess-reset", sessionKey: "telegram:reset:agent1" },
    );

    // Verify write was called (promotion)
    expect(mockWrite).toHaveBeenCalled();

    // Verify session cleaned up (L1 cleared)
    const wmAfter = getWorkingMemory("sess-reset");
    expect(wmAfter).toBeNull();
  });

  // 8. session_end promotes and cleans up
  it("session_end promotes and cleans up", async () => {
    // Create a new session
    await hooks.session_start(
      { sessionId: "sess-end" },
      { sessionId: "sess-end", sessionKey: "telegram:end:agent1" },
    );

    // Add an L1 item
    const wm = getWorkingMemory("sess-end");
    expect(wm).not.toBeNull();
    wm!.add("session end memory", new Float32Array(384), {
      agentId: "agent1",
      userId: "telegram:end",
      source: "experience",
    });

    // Invoke session_end
    await hooks.session_end(
      { sessionId: "sess-end", messageCount: 10 },
      { agentId: "agent1", sessionId: "sess-end" },
    );

    // Verify session cleaned up
    const wmAfter = getWorkingMemory("sess-end");
    expect(wmAfter).toBeNull();
  });

  // 9. message_received writes to L2 for messages >= 20 chars
  it("message_received writes to L2 for messages >= 20 chars", async () => {
    mockWrite.mockClear();

    await hooks.message_received(
      { from: "user", content: "This is a meaningful message that should be captured" },
      { channelId: "telegram", accountId: "123" },
    );

    expect(mockWrite).toHaveBeenCalled();
    const callArgs = mockWrite.mock.calls[0];
    expect(callArgs[0]).toContain("meaningful message");
  });

  // 10. message_received skips short messages
  it("message_received skips short messages", async () => {
    mockWrite.mockClear();

    await hooks.message_received(
      { from: "user", content: "ok" },
      { channelId: "telegram" },
    );

    expect(mockWrite).not.toHaveBeenCalled();
  });
});
