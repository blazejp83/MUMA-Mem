import type { OpenClawPluginApi } from "../types/openclaw.js";
import { getStore, getConfig } from "../plugin.js";
import { statsCommand } from "./stats.js";
import { exportCommand } from "./export.js";
import { consolidateCommand } from "./consolidate.js";
import { conflictsCommand } from "./conflicts.js";

/**
 * Register MUMA-Mem CLI commands under the `memory` subcommand namespace
 * in OpenClaw's Commander-based CLI framework.
 *
 * This enables commands like:
 *   openclaw memory stats --user alice
 *   openclaw memory export --user alice --output memories.json
 *   openclaw memory consolidate --user alice
 *   openclaw memory conflicts --user alice --all
 */
export function registerMemoryCli(api: OpenClawPluginApi): void {
  api.registerCli(
    ({ program, logger }) => {
      const memory = program
        .command("memory")
        .description("MUMA-Mem memory management");

      // memory stats
      memory
        .command("stats")
        .description("Show memory counts, activation distribution, and domains")
        .requiredOption("--user <userId>", "User ID")
        .action(async (opts: { user: string }) => {
          try {
            const store = getStore();
            await statsCommand(store, opts.user);
          } catch (err) {
            logger.error(
              "Error: MUMA-Mem not initialized. Is the gateway running?",
            );
          }
        });

      // memory export
      memory
        .command("export")
        .description("Export all memories to JSON file")
        .requiredOption("--user <userId>", "User ID")
        .option("--output <path>", "Output file path")
        .action(async (opts: { user: string; output?: string }) => {
          try {
            const store = getStore();
            await exportCommand(store, opts.user, opts.output);
          } catch (err) {
            logger.error(
              "Error: MUMA-Mem not initialized. Is the gateway running?",
            );
          }
        });

      // memory consolidate
      memory
        .command("consolidate")
        .description("Trigger manual memory consolidation")
        .requiredOption("--user <userId>", "User ID")
        .action(async (opts: { user: string }) => {
          try {
            const store = getStore();
            const config = getConfig();
            await consolidateCommand(store, config, opts.user);
          } catch (err) {
            logger.error(
              "Error: MUMA-Mem not initialized. Is the gateway running?",
            );
          }
        });

      // memory conflicts
      memory
        .command("conflicts")
        .description("List detected memory conflicts")
        .requiredOption("--user <userId>", "User ID")
        .option("--all", "Show resolved conflicts too")
        .action(async (opts: { user: string; all?: boolean }) => {
          try {
            const store = getStore();
            await conflictsCommand(store, opts.user, opts.all);
          } catch (err) {
            logger.error(
              "Error: MUMA-Mem not initialized. Is the gateway running?",
            );
          }
        });
    },
    { commands: ["memory"] },
  );
}
