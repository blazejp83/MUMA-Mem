---
phase: 04-multi-agent
plan: 04
subsystem: sync
tags: [filesystem, markdown, yaml, fs-watch, bidirectional-sync]

# Dependency graph
requires:
  - phase: 04-02
    provides: EventBus abstraction for cross-agent notifications
provides:
  - Bidirectional filesystem sync between MemoryStore and ~/clawd/memory/
  - Human-readable YAML+markdown serialization for Note objects
  - FilesystemSync class with debounce and loop prevention
affects: [05-background-intelligence, cli-tools]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "YAML frontmatter + markdown body for human-readable note files"
    - "Bidirectional sync with recentWrites debounce to prevent loops"
    - "fs.watch with recursive fallback for Linux compatibility"

key-files:
  created:
    - src/sync/filesystem.ts
  modified:
    - src/sync/index.ts
    - src/plugin.ts

key-decisions:
  - "Simple YAML parser (no external dependency) — format is constrained enough for manual parsing"
  - "user_id in frontmatter (not just path) — enables round-trip without path context"
  - "recentWrites 2s debounce + 500ms file event debounce — prevents sync loops"
  - "fs.watch recursive with fallback to per-directory watching — Linux compat"
  - "Filesystem sync optional (non-fatal) — system works without it"

patterns-established:
  - "Note file format: {baseDir}/{userId}/{noteId}.md with YAML frontmatter"
  - "HTML comment for context field: <!-- context: ... -->"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 4 Plan 4: Filesystem Sync Summary

**Bidirectional markdown file sync between memory store and ~/clawd/memory/ with YAML frontmatter serialization and fs.watch-based change detection**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-15T17:11:18Z
- **Completed:** 2026-02-15T17:14:17Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Note-to-markdown serializer with YAML frontmatter (all metadata) + markdown body (content) + HTML comment (context)
- Bidirectional FilesystemSync class: store->file via event bus events, file->store via fs.watch
- Debounce strategy prevents sync loops (recentWrites 2s, file event 500ms)
- Plugin lifecycle integration: start after event bus, stop before event bus close
- Initial sync exports existing notes to files on startup

## Task Commits

Each task was committed atomically:

1. **Task 1: Note-to-markdown serializer/deserializer** - `5aea23b` (feat)
2. **Task 2: Bidirectional file watcher + plugin lifecycle integration** - `4dfac2c` (feat)

## Files Created/Modified
- `src/sync/filesystem.ts` - Serializer/deserializer, file I/O, FilesystemSync class
- `src/sync/index.ts` - Re-exports for FilesystemSync and serialization functions
- `src/plugin.ts` - Lifecycle integration (start/stop filesystem sync)

## Decisions Made
- Simple YAML parser without external dependency — the frontmatter format is constrained (flat key-value, inline arrays) so manual parsing is reliable
- user_id stored in frontmatter alongside path — enables round-trip deserialization without requiring path context
- 2-second recentWrites debounce prevents re-importing our own writes; 500ms file event debounce collapses rapid fs.watch events
- fs.watch with recursive mode, falling back to per-directory watching on Linux (recursive not always supported)
- Filesystem sync is optional and non-fatal — plugin continues normally if sync fails

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Filesystem sync complete, memories now inspectable/editable as markdown files
- Phase 4 has 1 remaining plan (04-03: Visibility Integration + Transactive Memory + Tools)
- After 04-03 completes, Phase 4 is done

---
*Phase: 04-multi-agent*
*Completed: 2026-02-15*
