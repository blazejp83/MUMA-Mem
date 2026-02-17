/**
 * Reusable mock OpenClawPluginApi factory for integration tests.
 *
 * Creates a mock API that captures all registrations (hooks, tools, CLI)
 * without executing any real logic, enabling verification of the plugin
 * registration contract.
 */
import { vi } from "vitest";
import type {
  OpenClawPluginApi,
  OpenClawPluginToolFactory,
  OpenClawPluginToolOptions,
  OpenClawPluginCliRegistrar,
  AgentTool,
} from "../types/openclaw.js";

export type MockApi = OpenClawPluginApi & {
  /** All hooks registered via api.on(hookName, handler) */
  _hooks: Map<string, { handler: Function; opts?: { priority?: number } }>;
  /** All tools registered via api.registerTool(factory, opts) */
  _tools: Array<{ factory: OpenClawPluginToolFactory | AgentTool; opts?: OpenClawPluginToolOptions }>;
  /** All CLI registrars registered via api.registerCli(registrar, opts) */
  _cli: Array<{ registrar: OpenClawPluginCliRegistrar; opts?: { commands?: string[] } }>;
};

/**
 * Create a mock OpenClawPluginApi that captures all registrations.
 *
 * @param pluginConfig - Optional plugin config object (defaults to {} which triggers MumaConfigSchema defaults)
 */
export function createMockApi(pluginConfig: Record<string, unknown> = {}): MockApi {
  const hooks = new Map<string, { handler: Function; opts?: { priority?: number } }>();
  const tools: MockApi["_tools"] = [];
  const cli: MockApi["_cli"] = [];

  const api: MockApi = {
    // Identity
    id: "test-plugin",
    name: "test-muma-mem",
    source: "test",

    // Config
    config: {},
    pluginConfig,

    // Logger with vi.fn() stubs
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },

    // Registration methods — capture into internal arrays/maps
    on: vi.fn((hookName: string, handler: Function, opts?: { priority?: number }) => {
      hooks.set(hookName, { handler, opts });
    }) as any,

    registerTool: vi.fn((factoryOrTool: OpenClawPluginToolFactory | AgentTool, opts?: OpenClawPluginToolOptions) => {
      tools.push({ factory: factoryOrTool, opts });
    }) as any,

    registerHook: vi.fn((events: string | string[], handler: Function, opts?: { priority?: number }) => {
      const names = Array.isArray(events) ? events : [events];
      for (const name of names) {
        hooks.set(name, { handler, opts });
      }
    }) as any,

    registerCli: vi.fn((registrar: OpenClawPluginCliRegistrar, opts?: { commands?: string[] }) => {
      cli.push({ registrar, opts });
    }) as any,

    // Utility
    resolvePath: (input: string) => input,

    // Internal state for assertions
    _hooks: hooks,
    _tools: tools,
    _cli: cli,
  };

  return api;
}
