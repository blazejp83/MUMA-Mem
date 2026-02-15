#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { homedir } from "node:os";
import { MumaConfigSchema, type MumaConfig } from "../config.js";
import { createStore } from "../store/factory.js";
import { statsCommand } from "./stats.js";
import { exportCommand } from "./export.js";
import { consolidateCommand } from "./consolidate.js";
import { conflictsCommand } from "./conflicts.js";
import type { MemoryStore } from "../types/store.js";

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const HELP = `
muma - Memory management CLI for MUMA-Mem

Usage: muma <command> [options]

Commands:
  stats         Show memory counts, activation distribution, and domains
  export        Export all memories to JSON file
  consolidate   Trigger manual memory consolidation
  conflicts     List detected memory conflicts

Global Options:
  --config <path>   Config file path (default: .muma.json in cwd or home)
  --user <userId>   User ID (required for most commands)
  --help            Show this help message

Examples:
  muma stats --user alice
  muma export --user alice --output memories.json
  muma consolidate --user alice
  muma conflicts --user alice --all
`.trim();

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

async function loadConfig(configPath?: string): Promise<MumaConfig> {
  let raw: string | null = null;

  if (configPath) {
    raw = await readFile(resolve(configPath), "utf-8");
  } else if (existsSync(join(process.cwd(), ".muma.json"))) {
    raw = await readFile(join(process.cwd(), ".muma.json"), "utf-8");
  } else if (existsSync(join(homedir(), ".muma.json"))) {
    raw = await readFile(join(homedir(), ".muma.json"), "utf-8");
  }

  if (raw) {
    const parsed = JSON.parse(raw);
    return MumaConfigSchema.parse(parsed);
  }

  // Default config: SQLite at ~/.muma/memory.db (no Redis)
  const defaults = MumaConfigSchema.parse({
    sqlite: { path: join(homedir(), ".muma", "memory.db") },
  });
  // Clear Redis URL so createStore skips Redis connection
  defaults.redis.url = "";
  return defaults;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      config: { type: "string" },
      user: { type: "string" },
      output: { type: "string" },
      all: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.help || positionals.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  const command = positionals[0];

  if (
    command !== "stats" &&
    command !== "export" &&
    command !== "consolidate" &&
    command !== "conflicts"
  ) {
    console.error(`Unknown command: ${command}\n`);
    console.log(HELP);
    process.exit(1);
  }

  const userId = values.user as string | undefined;
  if (!userId) {
    console.error("Error: --user <userId> is required.\n");
    process.exit(1);
  }

  const config = await loadConfig(values.config as string | undefined);
  let store: MemoryStore | null = null;

  try {
    store = await createStore(config);

    switch (command) {
      case "stats":
        await statsCommand(store, userId);
        break;

      case "export":
        await exportCommand(store, userId, values.output as string | undefined);
        break;

      case "consolidate":
        await consolidateCommand(store, config, userId);
        break;

      case "conflicts":
        await conflictsCommand(store, userId, values.all as boolean);
        break;
    }
  } finally {
    if (store) {
      await store.close();
    }
  }
}

main().catch((err) => {
  console.error(`Error: ${(err as Error).message}`);
  process.exit(1);
});
