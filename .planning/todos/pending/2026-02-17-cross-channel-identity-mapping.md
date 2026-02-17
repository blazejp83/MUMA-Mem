---
created: 2026-02-17T23:00
title: Add cross-channel identity mapping
area: general
files:
  - src/utils/deriveUserId.ts
  - src/config.ts
---

## Problem

Currently `deriveUserId` derives userId purely from sessionKey string parsing (`telegram:12345:agent1` → `telegram:12345`). The same human on different channels (e.g. Telegram and Discord) gets separate memory stores with no way to share memories across channels.

Users need a way to declare that multiple channel identities belong to the same person so their memories are unified.

## Solution

Add an `identityMap` config option:

```json
{
  "identityMap": {
    "alice": ["telegram:12345", "discord:98765"],
    "bob": ["slack:U456", "telegram:67890"]
  }
}
```

Update `deriveUserId` to check this map before falling back to string parsing. If `telegram:12345` is found in any identity group, return the canonical name (`"alice"`) instead.

Changes: config.ts (add identityMap to schema), deriveUserId.ts (add lookup), tests.
