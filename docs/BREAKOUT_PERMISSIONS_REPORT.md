# Breakout Command Preflight Permission Architecture Report

**Project**: BritzoneBot  
**Module**: Breakout Rooms (`src/commands/main/breakout.ts`, `src/lib/discord/permission.ts`, `src/modules/breakout/*`)  
**Date**: August 6, 2026  

---

## 1. Executive Summary

This report documents the investigation, root cause analysis, refactoring, and resolution of permission checking issues in BritzoneBot's breakout room subsystem (`/breakout`). 

Previously, breakout operations (`create`, `delete`, `distribute`, `recall`, `broadcast`, `timer`, `send-message`) encountered runtime failures (`DiscordAPIError: Missing Access (50001), HTTP 403`) during operation execution. This left interrupted operation locks (`currentType: "delete"`) stuck in the `StateManager`, blocking subsequent breakout commands.

Through empirical runtime diagnostics and Discord API specification analysis, all permission checking gaps were identified and resolved.

---

## 2. Issues Encountered & Technical Root Cause Analysis

### Issue 1: Preflight Bypass on Operation Resumption & Multi-Handler Execution
* **Symptom**: Executing `/breakout delete` when bot permissions were missing resulted in runtime 403 API errors during channel operations, sticking the operation in an interrupted state.
* **Root Cause**: An initial attempt centralized preflight checks inside `breakout.ts` before dispatching to subcommand handlers. However, `breakout.ts` lacked context on target resource IDs—especially when operations were resumed from state files (`currentOp.params.roomIds`). As a result, top-level preflight returned `ok: true`, letting execution proceed to operation functions where Discord REST API rejected the un-validated channel modifications.
* **Solution**: 
  - Restored contextual preflight calls in individual subcommand handlers (`create`, `delete`, `distribute`, `recall`, `broadcast`, `timer`, `send-message`).
  - Added direct `preflightBreakout({ member, channels: breakoutRooms, requireManageChannels: true })` checks inside `executeDelete` immediately after resolving target room channels (covering both fresh executions and operation resumptions).

---

### Issue 2: Parent Category Permission Overwrites vs Child Channel Overwrites
* **Symptom**: Preflight checks passed when inspecting breakout room channels directly, but Discord REST API rejected HTTP `DELETE /channels/<id>` requests with `DiscordAPIError: Missing Access (50001)`.
* **Root Cause**: Under Discord API rules, modifying or deleting a channel that belongs to a category (`parentId`) requires the bot to possess `ManageChannels` and `ViewChannel` permissions on **both the channel AND its parent category**. Preflight was previously only inspecting permissions on the child voice channel.
* **Solution**:
  - Enhanced `preflightBreakout` to inspect `ch.parent` / `ch.parentId`.
  - Added parent category permission validation before child channel validation. If the parent category lacks permissions, preflight fails early with:  
    `I don't have Manage Channels, View Channel permission(s) on parent category (<name>). Ask an admin to grant it.`

---

### Issue 3: Omission of Voice Permission Flag (`Connect`) in Voice Breakout Checks
* **Symptom**: Both `ManageChannels` and `ViewChannel` were allowed on the target channels/category, yet Discord REST API still rejected HTTP `DELETE` operations with `50001 Missing Access`.
* **Root Cause**: Discord REST API requires `PermissionsBitField.Flags.Connect` on Voice Channels (`ChannelType.GuildVoice` = 2) for management API operations. The preflight check previously only validated `[ManageChannels, ViewChannel]`. Because `Connect` was denied in channel/category overwrites, preflight passed while Discord REST API failed.
* **Solution**:
  - Added `PermissionsBitField.Flags.Connect` to all required preflight permission checks for voice breakout channels and categories in `permission.ts`.

---

### Issue 4: Discord.js `CategoryChannel.permissionsFor()` Voice Flag Handling
* **Symptom**: When both `ViewChannel` and `Connect` were set to `deny` on a category overwrite, preflight output `I don't have View Channel permission(s)...` without listing `Connect`.
* **Root Cause**: 
  1. Discord.js `CategoryChannel.permissionsFor(me)` evaluates category overwrites for category-standard flags (`ViewChannel`, `ManageChannels`), but falls back to base role permissions for voice-specific flags (`Connect`).
  2. In Discord.js `GuildMember.permissionsIn()`, when `ViewChannel` is denied (`0n`), Discord.js returns bitmask `0n` (treating all bits as denied).
* **Solution**:
  - Added explicit `permissionOverwrites.cache` inspection in `getMissingBotPermissions` to detect voice flags (`Connect`) denied in category overwrites and aggregate them into the missing permissions array.

---

## 3. Current Architecture & Solved Capabilities

| Component | Responsibility | Solved Status |
| :--- | :--- | :--- |
| **`src/commands/main/breakout.ts`** | Top-level slash command entry point. Validates server context and manager role gate (`canInvokeBreakout`). | ✅ **Fully Working** |
| **Subcommand Handlers** (`handlers/*`) | Validates subcommand-specific inputs and invokes `preflightBreakout` with resolved options. | ✅ **Fully Working** |
| **`executeDelete` Operation** | Resolves target rooms (live fetch over API on resume) and runs `preflightBreakout` against all target rooms. | ✅ **Fully Working** |
| **`preflightBreakout` Helper** | Validates role gate, user permissions, parent category permissions, and child channel permissions (`ManageChannels`, `ViewChannel`, `Connect`). | ✅ **Fully Working** |
| **Git Commit History** | Organized into clean, atomic Conventional Commits (`dbbb396`, `70ccba3`, `6bec807`, `586a0c5`). | ✅ **Clean & Squashed** |

---

## 4. Remaining Items & Recommendations

1. **Admin Permission Documentation**:
   - Update server administrator documentation to state that the BritzoneBot role requires **View Channel**, **Manage Channels**, and **Connect** permissions on both breakout room channels and their parent categories.

2. **Emergency State Reset Subcommand**:
   - Consider implementing a `/breakout reset` subcommand (restricted to Server Administrators) that invokes `clearSession(guildId)` and `completeOperation(guildId)`. This will allow admins to clear stuck operation state locks without needing to manually modify state files if external API issues occur.

3. **Automated Unit Tests for Category Overwrites**:
   - Expand `tests/unit/permission.test.ts` to include mock `CategoryChannel` objects with voice permission overwrites to verify bitfield formatting in test suites.

---
*Report generated by Senior Engineering Advisor.*
