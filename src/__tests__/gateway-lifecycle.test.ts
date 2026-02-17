/**
 * Gateway lifecycle integration tests.
 *
 * Tests that gateway_start initializes all subsystems correctly
 * and gateway_stop cleans them all up.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks (available inside vi.mock factories) ───────────────────────

const {
  mockStore,
  mockEmbeddingProvider,
  mockLLMProvider,
  mockEventBus,
  mockFilesystemSync,
  mockSweepCleanup,
  mockConsolidationCleanup,
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
  mockSweepCleanup: vi.fn(),
  mockConsolidationCleanup: vi.fn(),
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
  startSweepScheduler: vi.fn().mockReturnValue(mockSweepCleanup),
  startConsolidationScheduler: vi.fn().mockReturnValue(mockConsolidationCleanup),
}));

vi.mock("../pipeline/write.js", () => ({
  write: vi.fn().mockResolvedValue({
    operation: "ADD",
    note: { id: "test-note", content: "test" },
    reason: "test",
  }),
}));

vi.mock("../pipeline/read.js", () => ({
  search: vi.fn().mockResolvedValue([]),
}));

vi.mock("../tools/index.js", () => ({
  registerTools: vi.fn(),
}));

vi.mock("../cli/openclaw.js", () => ({
  registerMemoryCli: vi.fn(),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { registerPlugin } from "../plugin.js";
import { createStore } from "../store/factory.js";
import { createEmbeddingProvider } from "../embedding/factory.js";
import { validateEmbeddingDimensions } from "../embedding/validation.js";
import { createLLMProvider } from "../llm/factory.js";
import { createEventBus } from "../sync/index.js";
import { startSweepScheduler, startConsolidationScheduler } from "../daemon/index.js";

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

describe("Gateway Lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gateway_start initializes all subsystems", async () => {
    const { api, hooks } = createMockApi();
    registerPlugin(api as any);

    // Invoke gateway_start
    await hooks.gateway_start({ port: 3000 }, {});

    // Verify all subsystems initialized
    expect(createStore).toHaveBeenCalled();
    expect(createEmbeddingProvider).toHaveBeenCalled();
    expect(validateEmbeddingDimensions).toHaveBeenCalled();
    expect(createLLMProvider).toHaveBeenCalled();
    expect(createEventBus).toHaveBeenCalled();
    expect(startSweepScheduler).toHaveBeenCalled();
    expect(startConsolidationScheduler).toHaveBeenCalled();

    // Verify logger reported Ready
    expect(api.logger.info).toHaveBeenCalledWith("[muma-mem] Ready.");
  });

  it("gateway_start throws on embedding dimension mismatch", async () => {
    const { api, hooks } = createMockApi();
    registerPlugin(api as any);

    // Override validation to fail
    vi.mocked(validateEmbeddingDimensions).mockResolvedValueOnce({
      ok: false,
      providerDimensions: 384,
      storedDimensions: 1536,
      error: "Dimension mismatch",
    });

    await expect(
      hooks.gateway_start({ port: 3000 }, {}),
    ).rejects.toThrow("Dimension mismatch");
  });

  it("gateway_stop cleans up all resources", async () => {
    const { api, hooks } = createMockApi();
    registerPlugin(api as any);

    // First, start the gateway to initialize state
    await hooks.gateway_start({ port: 3000 }, {});

    // Record call counts after startup to verify stop adds new calls
    const storeCloseCountBefore = mockStore.close.mock.calls.length;
    const embeddingCloseCountBefore = mockEmbeddingProvider.close.mock.calls.length;
    const eventBusCloseCountBefore = mockEventBus.close.mock.calls.length;
    const sweepCountBefore = mockSweepCleanup.mock.calls.length;
    const consolidationCountBefore = mockConsolidationCleanup.mock.calls.length;
    const fsSyncStopCountBefore = mockFilesystemSync.stop.mock.calls.length;

    // Now stop the gateway
    await hooks.gateway_stop({}, {});

    // Verify all resources cleaned up (new calls after stop)
    expect(mockStore.close.mock.calls.length).toBeGreaterThan(storeCloseCountBefore);
    expect(mockEmbeddingProvider.close.mock.calls.length).toBeGreaterThan(embeddingCloseCountBefore);
    expect(mockEventBus.close.mock.calls.length).toBeGreaterThan(eventBusCloseCountBefore);
    expect(mockSweepCleanup.mock.calls.length).toBeGreaterThan(sweepCountBefore);
    expect(mockConsolidationCleanup.mock.calls.length).toBeGreaterThan(consolidationCountBefore);
    expect(mockFilesystemSync.stop.mock.calls.length).toBeGreaterThan(fsSyncStopCountBefore);

    // Verify logger reported shutdown
    expect(api.logger.info).toHaveBeenCalledWith("[muma-mem] Shutdown complete.");
  });

  it("gateway_stop is safe when called without gateway_start", async () => {
    const { api, hooks } = createMockApi();
    registerPlugin(api as any);

    // gateway_stop without prior gateway_start should NOT throw
    await expect(
      hooks.gateway_stop({}, {}),
    ).resolves.not.toThrow();
  });
});
