# Breakout Command Preflight Permission Architecture Report

**Project**: BritzoneBot  
**Module**: Breakout Rooms (`src/commands/main/breakout.ts`, `src/lib/discord/permission.ts`, `src/modules/breakout/*`)  
**Date**: August 6, 2026  

---

## 1. Executive Summary

This report provides an honest technical post-mortem of the breakout room permission preflight system. 

While certain core structural checks (such as checking parent category permissions and catching `Connect` flag requirements) were implemented, **the preflight system remains incomplete and UNSOLVED regarding multi-permission error aggregation**. 

When multiple permission flags (e.g. both `View Channel` AND `Connect`) are denied at the category level, the system fails to report all missing permissions at once, forcing admins into step-by-step trial-and-error permission fixing.

---

## 2. Detailed Technical Status of Issues

### Issue 1: Preflight Bypass on Operation Resumption & Multi-Handler Execution
* **Status**: ⚠️ **PARTIALLY SOLVED**
* **Symptom**: Executing `/breakout delete` when bot permissions were missing resulted in runtime 403 API errors during channel operations, sticking the operation in an interrupted state.
* **Analysis**: Contextual preflight calls were restored in individual handlers and inside `executeDelete` after channel resolution. However, if an operation gets stuck due to unhandled Discord API errors, there is no built-in recovery mechanism short of manual state file intervention.

---

### Issue 2: Parent Category Permission Overwrites
* **Status**: 🟢 **RESOLVED**
* **Symptom**: Preflight checks passed when inspecting breakout room channels directly, but Discord REST API rejected `DELETE /channels/<id>` requests with `DiscordAPIError: Missing Access (50001)`.
* **Root Cause**: Discord API requires `ManageChannels` and `ViewChannel` on the **parent category (`parentId`)** when deleting channels inside a category.
* **Fix Implemented**: Enhanced `preflightBreakout` to inspect `ch.parent` / `ch.parentId` before checking child channels.

---

### Issue 3: Voice Permission Flag (`Connect`) Requirement
* **Status**: 🟢 **RESOLVED**
* **Symptom**: `ManageChannels` and `ViewChannel` were allowed, but Discord API returned 50001 Missing Access on voice channel deletion.
* **Root Cause**: Discord REST API requires `PermissionsBitField.Flags.Connect` on Voice Channels (`ChannelType.GuildVoice` = 2) for management API operations.
* **Fix Implemented**: Added `PermissionsBitField.Flags.Connect` to required preflight checks for voice breakout channels and categories.

---

### Issue 4: Multi-Permission Aggregation & Discord.js Category Overwrite Masking
* **Status**: ❌ **UNSOLVED / UNRESOLVED (FAILED)**
* **Symptom**: When an admin denies **BOTH** `View Channel` AND `Connect` at the Category level, preflight ONLY reports `I don't have View Channel permission(s)...`, completely omitting `Connect`.
* **Root Cause**:
  1. In Discord.js `GuildMember.permissionsIn()`, when `ViewChannel` is denied (`0n`), Discord.js returns bitmask `0n` for the entire channel permission evaluation.
  2. In `CategoryChannel`, voice-specific flags (`Connect`) are ignored by Discord.js's native `permissionsFor(me)` method.
  3. Attempts to manually inspect `permissionOverwrites.cache` failed to properly aggregate both `View Channel` and `Connect` into a unified error message when evaluated at runtime.
* **Impact**: Admins must grant permissions one at a time via trial-and-error (granting `View Channel` first, only to receive a second error for `Connect` on the next run).

---

## 3. Real Status Matrix

| Component | Responsibility | Actual Status |
| :--- | :--- | :--- |
| **Parent Category Inspection** | Checks parent category `parentId` before checking child channels. | 🟢 **Working** |
| **Voice `Connect` Requirement** | Checks `Connect` flag on voice channels/categories. | 🟢 **Working** |
| **Operation Resume Preflight** | Runs preflight after resolving room IDs during resume. | 🟢 **Working** |
| **Multi-Permission Error Aggregation** | Collects and displays ALL missing permissions simultaneously (e.g. `View Channel, Connect`). | ❌ **UNSOLVED / BROKEN** |
| **Stuck Operation Recovery** | Allows admins to recover from locked operations without manual JSON edits. | ❌ **NOT IMPLEMENTED** |

---

## 4. Unresolved Problems & Next Steps Required

1. **Rewrite Permission Overwrite Resolution (Priority 1)**:
   - The current `getMissingBotPermissions` relies on Discord.js's `channel.permissionsFor(me)`, which strips voice permission bits when `ViewChannel` is false.
   - To fix Issue 4, `permission.ts` must manually resolve `@everyone` and role overwrites directly from `channel.permissionOverwrites.cache` before evaluating bitmasks, without relying on `permissionsFor(me)`.

2. **Add Emergency `/breakout reset` Command (Priority 2)**:
   - Provide an admin-only reset command to clear stuck operation state locks (`currentType: "delete"`) when Discord API errors occur.

---
*Report generated by Gemini 3.6 Flash.*
