// ---------------------------------------------------------------------------
// OpenClaw Plugin SDK Type Definitions (local, no npm dependency)
//
// These types mirror the actual OpenClaw plugin SDK shapes from the OpenClaw
// source. They are self-contained local definitions — the real SDK types live
// in the OpenClaw repo but are not published as an npm package.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Plugin Logger (Section 2)
// ---------------------------------------------------------------------------

export type PluginLogger = {
  debug?: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

// ---------------------------------------------------------------------------
// Plugin API (Section 2) — the `api` object passed to `register()`
// ---------------------------------------------------------------------------

export type OpenClawPluginApi = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  source: string;
  config: unknown;
  pluginConfig?: Record<string, unknown>;
  logger: PluginLogger;
  registerTool: (
    tool: AgentTool | OpenClawPluginToolFactory,
    opts?: OpenClawPluginToolOptions,
  ) => void;
  registerHook: (
    events: string | string[],
    handler: (...args: unknown[]) => unknown,
    opts?: { priority?: number },
  ) => void;
  registerCli: (
    registrar: OpenClawPluginCliRegistrar,
    opts?: { commands?: string[] },
  ) => void;
  on: <K extends string>(
    hookName: K,
    handler: (...args: unknown[]) => unknown,
    opts?: { priority?: number },
  ) => void;
  resolvePath: (input: string) => string;
};

// ---------------------------------------------------------------------------
// Hook Event / Context Types (Section 3)
// ---------------------------------------------------------------------------

// 3.1 before_agent_start
export type PluginHookBeforeAgentStartEvent = {
  prompt: string;
  messages?: unknown[];
};

export type PluginHookAgentContext = {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  workspaceDir?: string;
  messageProvider?: string;
};

export type PluginHookBeforeAgentStartResult = {
  systemPrompt?: string;
  prependContext?: string;
};

// 3.2 session_end
export type PluginHookSessionEndEvent = {
  sessionId: string;
  messageCount: number;
  durationMs?: number;
};

export type PluginHookSessionEndContext = {
  agentId?: string;
  sessionId: string;
};

// 3.3 message_received
export type PluginHookMessageReceivedEvent = {
  from: string;
  content: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
};

export type PluginHookMessageReceivedContext = {
  channelId: string;
  accountId?: string;
  conversationId?: string;
};

// 3.4 after_tool_call
export type PluginHookAfterToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
  result?: unknown;
  error?: string;
  durationMs?: number;
};

export type PluginHookAfterToolCallContext = {
  agentId?: string;
  sessionKey?: string;
  toolName: string;
};

// 3.5 gateway_start
export type PluginHookGatewayStartEvent = {
  port: number;
};

// 3.6 gateway_stop
export type PluginHookGatewayStopEvent = {
  reason?: string;
};

// 3.5 / 3.6 shared gateway context
export type PluginHookGatewayContext = {
  port?: number;
};

// ---------------------------------------------------------------------------
// Tool Types (Section 4)
// ---------------------------------------------------------------------------

export type OpenClawPluginToolContext = {
  config?: unknown;
  workspaceDir?: string;
  agentDir?: string;
  agentId?: string;
  sessionKey?: string;
  messageChannel?: string;
  agentAccountId?: string;
  sandboxed?: boolean;
};

export type AgentTool = {
  label: string;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (
    toolCallId: string,
    params: unknown,
  ) => unknown | Promise<unknown>;
};

export type OpenClawPluginToolFactory = (
  ctx: OpenClawPluginToolContext,
) => AgentTool | AgentTool[] | null | undefined;

export type OpenClawPluginToolOptions = {
  name?: string;
  names?: string[];
  optional?: boolean;
};

// ---------------------------------------------------------------------------
// CLI Types (Section 6)
// ---------------------------------------------------------------------------

export type OpenClawPluginCliContext = {
  program: unknown;
  config: unknown;
  workspaceDir?: string;
  logger: PluginLogger;
};

export type OpenClawPluginCliRegistrar = (
  ctx: OpenClawPluginCliContext,
) => void;

// ---------------------------------------------------------------------------
// Plugin Definition
// ---------------------------------------------------------------------------

export type OpenClawPluginDefinition = {
  id?: string;
  name?: string;
  description?: string;
  version?: string;
  kind?: string;
  configSchema?: unknown;
  register?: (api: OpenClawPluginApi) => void | Promise<void>;
  activate?: (api: OpenClawPluginApi) => void | Promise<void>;
};
