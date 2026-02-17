# Functional Architecture Migration Plan

**Date:** February 17, 2026  
**Branch:** `refactor/functional-architecture`  
**Status:** Planning Phase  
**Author:** Claude Opus 4.6 + Claude Sonnet 4.5

---

## Executive Summary

This document outlines a comprehensive plan to migrate the breakout module from a class-based Object-Oriented Programming (OOP) approach to a functional programming approach. This migration will reduce boilerplate, improve code clarity, and better reflect the actual usage patterns in the codebase.

**Key metrics:**
- **Files to refactor:** 9 (7 services/operations, 2 state managers)
- **Estimated effort:** 4-6 hours
- **Risk level:** Low (no logic changes, only structural)
- **Breaking changes:** Internal only (no API changes to command handlers)

---

## Table of Contents

1. [Problem Analysis](#problem-analysis)
2. [Why Functional?](#why-functional)
3. [Architecture Comparison](#architecture-comparison)
4. [Migration Strategy](#migration-strategy)
5. [Detailed Migration Steps](#detailed-migration-steps)
6. [Code Examples](#code-examples)
7. [Testing Plan](#testing-plan)
8. [Rollback Plan](#rollback-plan)
9. [Best Practices](#best-practices)

---

## Problem Analysis

### Current State Issues

#### 1. **Unnecessary Class Wrapper Pattern**

Every service and operation follows this anti-pattern:

```ts
class SomeService {
    async doSomething(args) { /* ... */ }
}
export default new SomeService();
```

**Problems:**
- Classes without instance state are just functions with extra ceremony
- The singleton pattern (`export default new`) means you never instantiate multiple copies
- No use of `this` in most methods — a red flag that the class is unnecessary
- Adds cognitive overhead: developers must understand class semantics for no benefit

#### 2. **False Abstraction**

Classes are typically used for:
- **Encapsulation:** Grouping related data + behavior → *Not applicable here (no instance data)*
- **Inheritance:** Code reuse via subclasses → *Not used anywhere*
- **Polymorphism:** Different implementations of same interface → *Not used anywhere*

None of these benefits apply to our codebase, yet we pay the cost in boilerplate.

#### 3. **Inconsistent Patterns**

- `src/lib/discord/` → ✅ Already uses plain functions
- `src/modules/breakout/utils/` → ✅ Already uses plain functions
- `src/modules/breakout/services/` → ❌ Uses singleton classes
- `src/modules/breakout/operations/` → ❌ Uses singleton classes

This inconsistency makes the codebase harder to understand.

#### 4. **Import Awkwardness**

Current:
```ts
import createOperation from '../operations/CreateOperation.js';
// ...
await createOperation.execute(interaction, numRooms, force);
```

The `.execute()` call is noise — it's always the same method name. Compare to functional:

```ts
import { executeCreate } from '../operations/create.js';
// ...
await executeCreate(interaction, numRooms, force);
```

More direct, less indirection.

---

## Why Functional?

### Benefits for This Codebase

#### 1. **Simplicity**
Functions are the simplest building block. No classes, constructors, `this`, or instantiation patterns to reason about.

#### 2. **Tree-Shaking**
Bundlers can eliminate unused exports more effectively with named function exports than with class methods.

#### 3. **Explicitness**
Function names directly describe what they do: `moveUserToRoom(user, room)` vs `distributionService.moveUserToRoom(user, room)`.

#### 4. **Testability**
Pure functions (input → output) are trivial to test. Stateless functions are nearly as easy.

#### 5. **Composability**
Functions compose naturally:
```ts
const result = await pipe(
  createRooms,
  distributeUsers,
  notifyUsers
)(interaction);
```

#### 6. **TypeScript Alignment**
TypeScript excels at typing functions. Classes add complexity (access modifiers, inheritance, etc.) that TS must track.

### When Classes *Are* Appropriate

To be clear, classes aren't bad — they're just wrong *here*. Use classes when you have:

1. **Multiple instances with different state**
   - Example: `User` class where each instance represents a different user
   - Not applicable: We have exactly one `SessionManager` instance (singleton)

2. **Inheritance hierarchies**
   - Example: `Animal` → `Dog` extends `Animal`
   - Not applicable: No inheritance in our codebase

3. **Complex lifecycle management**
   - Example: `DatabaseConnection` with `connect()`, `query()`, `disconnect()`
   - Not applicable: Our services are stateless

4. **Framework requirements**
   - Example: React class components (before hooks)
   - Not applicable: Discord.js doesn't require classes

**In our codebase:** Only `SessionManager` and `StateManager` have legitimate state, but even they are singletons, so module-level state + functions is cleaner.

---

## Architecture Comparison

### Current: Class-Based

```
src/modules/breakout/
├── operations/
│   ├── CreateOperation.ts      [class with .execute()]
│   ├── DistributeOperation.ts  [class with .execute()]
│   └── EndOperation.ts         [class with .execute()]
├── services/
│   ├── DistributionService.ts  [class with methods]
│   ├── MessageService.ts       [class with methods]
│   ├── RoomService.ts          [class with methods]
│   └── TimerService.ts         [class with methods]
└── state/
    ├── SessionManager.ts       [class with Map state]
    └── StateManager.ts         [class with file I/O state]
```

**Characteristics:**
- 9 classes, 7 are stateless singletons
- PascalCase filenames (class convention)
- Default exports (`export default new X()`)
- Method calls (`service.method()`)

### Proposed: Functional

```
src/modules/breakout/
├── operations/
│   ├── create.ts         [named exported functions]
│   ├── distribute.ts     [named exported functions]
│   └── end.ts            [named exported functions]
├── services/
│   ├── distribution.ts   [named exported functions]
│   ├── message.ts        [named exported functions]
│   ├── room.ts           [named exported functions]
│   └── timer.ts          [named exported functions]
└── state/
    ├── session.ts        [module state + exported functions]
    └── state.ts          [module state + exported functions]
```

**Characteristics:**
- No classes (except for type definitions if needed)
- camelCase filenames (module convention)
- Named exports (`export function x()`)
- Direct function calls (`executeCreate()`)

---

## Migration Strategy

### Principles

1. **No logic changes** — This is a refactor, not a rewrite
2. **Incremental** — Migrate one file at a time, commit frequently
3. **Type-safe** — Maintain or improve type safety throughout
4. **Backward compatible** — Use adapter pattern during transition if needed
5. **Test continuously** — Run type checks and tests after each file

### Order of Migration

**Phase 1: Stateless Services** (Lowest risk)
1. `services/distribution.ts`
2. `services/message.ts`
3. `services/room.ts`
4. `services/timer.ts`

**Phase 2: Operations** (Medium risk — used by command handlers)
5. `operations/create.ts`
6. `operations/distribute.ts`
7. `operations/end.ts`

**Phase 3: State Managers** (Higher risk — have actual state)
8. `state/session.ts`
9. `state/state.ts`

**Phase 4: Update Consumers**
10. Update imports in `commands/main/breakout.ts`
11. Update any other consumers

**Phase 5: Cleanup**
12. Remove old files
13. Update documentation

---

## Detailed Migration Steps

### Step 1: Migrate Stateless Services

For each service file (e.g., `DistributionService.ts`):

#### 1.1 Create New File

Rename to camelCase: `DistributionService.ts` → `distribution.ts`

#### 1.2 Convert Class Methods to Functions

**Before:**
```ts
class DistributionService {
    async hasActiveDistribution(guildId: string): Promise<boolean> {
        const mainRoom = sessionManager.getMainRoom(guildId);
        // ... rest of logic
    }

    async moveUserToRoom(user: GuildMember, room: VoiceChannel): Promise<void> {
        await moveUser(user, room);
    }
}

export default new DistributionService();
```

**After:**
```ts
/**
 * Checks if a distribution is currently active
 */
export async function hasActiveDistribution(guildId: string): Promise<boolean> {
    const mainRoom = getMainRoom(guildId);
    // ... rest of logic (identical)
}

/**
 * Moves a user to a specific room
 */
export async function moveUserToRoom(user: GuildMember, room: VoiceChannel): Promise<void> {
    await moveUser(user, room);
}
```

**Changes:**
- Remove `class` declaration
- Remove `async` from class (keep on methods)
- Change method syntax to function syntax
- Add `export` to each function
- Remove `export default`
- Update JSDoc to be above each function

#### 1.3 Update Imports

Update consumers from:
```ts
import distributionService from '../services/DistributionService.js';
const result = await distributionService.hasActiveDistribution(guildId);
```

To:
```ts
import { hasActiveDistribution } from '../services/distribution.js';
const result = await hasActiveDistribution(guildId);
```

### Step 2: Migrate Operations

Operations follow the same pattern as services but have a single `execute` function. Consider naming conventions:

**Before:**
```ts
class CreateOperation {
    async execute(interaction, numRooms, force): Promise<OperationResult> {
        // ... logic
    }
}
export default new CreateOperation();
```

**After (Option A - Keep "execute" name):**
```ts
export async function execute(
    interaction: CommandInteraction,
    numRooms: number,
    force: boolean = false,
): Promise<OperationResult> {
    // ... logic (identical)
}
```

**After (Option B - More descriptive name):**
```ts
export async function executeCreate(
    interaction: CommandInteraction,
    numRooms: number,
    force: boolean = false,
): Promise<OperationResult> {
    // ... logic (identical)
}
```

**Recommendation:** Option B. It makes imports clearer:
```ts
import { executeCreate } from '../operations/create.js';
import { executeDistribute } from '../operations/distribute.js';
import { executeEnd } from '../operations/end.js';
```

vs.

```ts
import { execute as executeCreate } from '../operations/create.js';
import { execute as executeDistribute } from '../operations/distribute.js';
// Must use aliases, more verbose
```

### Step 3: Migrate State Managers

State managers are special because they have actual state. Use module-level variables:

**Before (SessionManager.ts):**
```ts
export class SessionManager {
    private sessions: Map<string, BreakoutSession>;

    constructor() {
        this.sessions = new Map();
    }

    storeRooms(guildId: string, rooms: VoiceChannel[]): void {
        const session = this.sessions.get(guildId) || {};
        session.rooms = rooms;
        this.sessions.set(guildId, session);
    }

    getRooms(guildId: string): VoiceChannel[] {
        return this.sessions.get(guildId)?.rooms || [];
    }
}

export default new SessionManager();
```

**After (session.ts):**
```ts
/**
 * Internal state: breakout sessions by guild ID
 */
const sessions = new Map<string, BreakoutSession>();

/**
 * Stores breakout rooms for a guild
 */
export function storeRooms(guildId: string, rooms: VoiceChannel[]): void {
    const session = sessions.get(guildId) || {};
    session.rooms = rooms;
    sessions.set(guildId, session);
    console.log(`📝 Stored ${rooms.length} breakout rooms for guild ${guildId}`);
}

/**
 * Gets the breakout rooms for a guild
 */
export function getRooms(guildId: string): VoiceChannel[] {
    return sessions.get(guildId)?.rooms || [];
}

/**
 * Clears all sessions (useful for testing)
 */
export function clearAllSessions(): void {
    sessions.clear();
}
```

**Key differences:**
- `private sessions` → `const sessions` at module level
- Remove `constructor()`
- Remove `this.` references
- Access `sessions` directly
- Optionally add utility functions like `clearAllSessions()` for testing

**Important:** Module-level state is still singleton-like, but it's more explicit and requires less boilerplate.

### Step 4: Update Command Handlers

Update `src/commands/main/breakout.ts`:

**Before:**
```ts
import createOperation from '../../modules/breakout/operations/CreateOperation.js';
import distributeOperation from '../../modules/breakout/operations/DistributeOperation.js';
import endOperation from '../../modules/breakout/operations/EndOperation.js';
import messageService from '../../modules/breakout/services/MessageService.js';
import timerService from '../../modules/breakout/services/TimerService.js';
import sessionManager from '../../modules/breakout/state/SessionManager.js';
import stateManager from '../../modules/breakout/state/StateManager.js';

// In handlers:
await createOperation.execute(interaction, numRooms, force);
await distributeOperation.execute(interaction, mainRoom, distribution, force);
await endOperation.execute(interaction, mainChannel, force);
```

**After:**
```ts
import { executeCreate } from '../../modules/breakout/operations/create.js';
import { executeDistribute } from '../../modules/breakout/operations/distribute.js';
import { executeEnd } from '../../modules/breakout/operations/end.js';
import { broadcastToBreakoutRooms, sendMessageToChannel } from '../../modules/breakout/services/message.js';
import { monitorBreakoutTimer } from '../../modules/breakout/services/timer.js';
import { getRooms, getMainRoom, setMainRoom, clearSession } from '../../modules/breakout/state/session.js';
import { hasOperationInProgress, getCurrentOperation, setTimerData, clearTimerData } from '../../modules/breakout/state/state.js';

// In handlers:
await executeCreate(interaction, numRooms, force);
await executeDistribute(interaction, mainRoom, distribution, force);
await executeEnd(interaction, mainChannel, force);
```

**Benefits:**
- Explicit imports: you see exactly which functions are used
- No more `.execute()` or `.method()` ceremony
- Better IDE autocomplete (named imports)
- Easier to spot unused imports

---

## Code Examples

### Example 1: Simple Service Migration

**File:** `services/DistributionService.ts` → `services/distribution.ts`

<details>
<summary>Before (Click to expand)</summary>

```typescript
import type { GuildMember, VoiceChannel } from 'discord.js';
import { moveUser } from '../../../lib/discord/member.js';
import sessionManager from '../state/SessionManager.js';

class DistributionService {
    /**
     * Checks if a distribution is currently active
     */
    async hasActiveDistribution(guildId: string): Promise<boolean> {
        const mainRoom = sessionManager.getMainRoom(guildId);
        if (!mainRoom) return false;

        const rooms = sessionManager.getRooms(guildId);
        if (!rooms || rooms.length === 0) return false;

        return rooms.some((room) => room.members && room.members.size > 0);
    }

    /**
     * Moves a user to a specific room
     */
    async moveUserToRoom(user: GuildMember, room: VoiceChannel): Promise<void> {
        await moveUser(user, room);
    }
}

export default new DistributionService();
```
</details>

<details>
<summary>After (Click to expand)</summary>

```typescript
import type { GuildMember, VoiceChannel } from 'discord.js';
import { moveUser } from '../../../lib/discord/member.js';
import { getMainRoom, getRooms } from '../state/session.js';

/**
 * Checks if a distribution is currently active
 */
export async function hasActiveDistribution(guildId: string): Promise<boolean> {
    const mainRoom = getMainRoom(guildId);
    if (!mainRoom) return false;

    const rooms = getRooms(guildId);
    if (!rooms || rooms.length === 0) return false;

    return rooms.some((room) => room.members && room.members.size > 0);
}

/**
 * Moves a user to a specific room
 */
export async function moveUserToRoom(user: GuildMember, room: VoiceChannel): Promise<void> {
    await moveUser(user, room);
}
```
</details>

**Changes made:**
1. Removed `class` declaration and singleton export
2. Converted methods to exported `async function`
3. Updated `sessionManager` imports to named imports
4. Kept all logic identical — **zero behavioral changes**

---

### Example 2: Operation Migration

**File:** `operations/CreateOperation.ts` → `operations/create.ts`

<details>
<summary>Before (Click to expand)</summary>

```typescript
export class CreateOperation {
    async execute(
        interaction: CommandInteraction,
        numRooms: number,
        force: boolean = false,
    ): Promise<OperationResult> {
        const guildId = interaction.guildId;
        if (!guildId || !interaction.guild) {
            return {
                success: false,
                message: 'This command can only be used in a guild.',
            };
        }
        // ... rest of implementation
    }
}

export default new CreateOperation();
```
</details>

<details>
<summary>After (Click to expand)</summary>

```typescript
/**
 * Executes the create breakout rooms operation
 */
export async function executeCreate(
    interaction: CommandInteraction,
    numRooms: number,
    force: boolean = false,
): Promise<OperationResult> {
    const guildId = interaction.guildId;
    if (!guildId || !interaction.guild) {
        return {
            success: false,
            message: 'This command can only be used in a guild.',
        };
    }
    // ... rest of implementation (identical)
}
```
</details>

**Changes made:**
1. Removed `class CreateOperation {}`
2. Renamed `execute` → `executeCreate` for clarity
3. Converted to exported `async function`
4. All logic remains identical

---

### Example 3: State Manager Migration

**File:** `state/SessionManager.ts` → `state/session.ts`

<details>
<summary>Before (Click to expand)</summary>

```typescript
interface BreakoutSession {
    rooms?: VoiceChannel[];
    mainRoom?: VoiceBasedChannel;
}

export class SessionManager {
    private sessions: Map<string, BreakoutSession>;

    constructor() {
        this.sessions = new Map<string, BreakoutSession>();
    }

    storeRooms(guildId: string, rooms: VoiceChannel[]): void {
        const session = this.sessions.get(guildId) || {};
        session.rooms = rooms;
        this.sessions.set(guildId, session);
    }

    getRooms(guildId: string): VoiceChannel[] {
        const session = this.sessions.get(guildId);
        return session?.rooms || [];
    }

    clearSession(guildId: string): void {
        this.sessions.delete(guildId);
    }
}

export default new SessionManager();
```
</details>

<details>
<summary>After (Click to expand)</summary>

```typescript
interface BreakoutSession {
    rooms?: VoiceChannel[];
    mainRoom?: VoiceBasedChannel;
}

/**
 * Internal module state: breakout sessions by guild ID
 * This Map is encapsulated within this module
 */
const sessions = new Map<string, BreakoutSession>();

/**
 * Stores breakout rooms for a guild
 */
export function storeRooms(guildId: string, rooms: VoiceChannel[]): void {
    const session = sessions.get(guildId) || {};
    session.rooms = rooms;
    sessions.set(guildId, session);
    console.log(`📝 Stored ${rooms.length} breakout rooms for guild ${guildId}`);
}

/**
 * Gets the breakout rooms for a guild
 */
export function getRooms(guildId: string): VoiceChannel[] {
    const session = sessions.get(guildId);
    return session?.rooms || [];
}

/**
 * Clears session data for a guild
 */
export function clearSession(guildId: string): void {
    sessions.delete(guildId);
    console.log(`🧹 Cleared breakout session for guild ${guildId}`);
}

/**
 * Clears all sessions (useful for testing)
 */
export function clearAllSessions(): void {
    sessions.clear();
}
```
</details>

**Changes made:**
1. Converted `private sessions` → module-level `const sessions`
2. Removed `constructor()`
3. Changed `this.sessions` → `sessions` throughout
4. Made functions exported
5. Added utility function `clearAllSessions()` for testability
6. Module state is still encapsulated (not directly exported)

---

## Testing Plan

### During Migration

After each file migration:

```bash
# 1. Type check
bunx tsc --noEmit

# 2. Lint check
bunx biome check --write

# 3. Run tests (when available)
bun test

# 4. Commit
git add .
git commit -m "refactor: migrate [filename] to functional pattern"
```

### Integration Testing (manual testing through Discord App)

After completing all migrations:

1. **Start the bot locally**
   ```bash
   bun run src/index.ts
   ```

2. **Test each breakout command:**
   - `/breakout create number:3`
   - `/breakout distribute mainroom:[channel]`
   - `/breakout timer minutes:10`
   - `/breakout broadcast message:"Test"`
   - `/breakout send-message channel:[channel] message:"Test"`
   - `/breakout end`

3. **Test error scenarios:**
   - Try to create rooms when they already exist (without `force`)
   - Try to distribute without creating first
   - Try to end without active session
   - Test with network interruptions

4. **Verify state persistence:**
   - Start an operation
   - Kill the bot process
   - Restart and resume the operation

---

## Rollback Plan

### If Migration Fails

1. **Immediate rollback:**
   ```bash
   git checkout main
   git branch -D refactor/functional-architecture
   ```

2. **Partial migration (some files done):**
   ```bash
   # Revert specific file
   git checkout HEAD~1 -- src/modules/breakout/services/distribution.ts
   
   # Or reset to specific commit
   git reset --hard <commit-hash>
   ```

3. **Adapter pattern (temporary bridge):**
   If you need to support both patterns during transition:
   
   ```typescript
   // services/distribution.ts (new functional)
   export function hasActiveDistribution(guildId: string) { ... }
   
   // services/DistributionService.ts (old class, adapter)
   import * as distributionFns from './distribution.js';
   
   class DistributionService {
       hasActiveDistribution(guildId: string) {
           return distributionFns.hasActiveDistribution(guildId);
       }
   }
   export default new DistributionService();
   ```

### Risk Mitigation

- ✅ **Low Risk:** No logic changes, only structure
- ✅ **Incremental:** One file at a time, easy to locate issues
- ✅ **Type-safe:** TypeScript catches import/usage errors
- ✅ **Reversible:** Git history preserves old implementation
- ✅ **No user impact:** Internal refactor, no API changes

---

## Best Practices

### 1. File Naming Conventions

- **Functions/modules:** `camelCase.ts` (e.g., `distribution.ts`, `roomService.ts`)
- **Classes:** `PascalCase.ts` (e.g., `User.ts`, `Connection.ts`) — rare in this codebase
- **Types/interfaces:** `PascalCase.ts` or within the module (e.g., `types/command.ts`)

### 2. Export Patterns

**Prefer named exports:**
```typescript
// ✅ Good
export function hasActiveDistribution(guildId: string) { }
export function moveUserToRoom(user, room) { }

// ❌ Avoid (makes tree-shaking harder)
export default {
    hasActiveDistribution,
    moveUserToRoom,
};
```

**When to use default export:**
- Single-purpose modules (e.g., command definition in `commands/utility/ping.ts`)
- Framework requirements (e.g., Next.js pages)

### 3. Module Organization

Group related functions in one file:

```typescript
// services/room.ts — All room-related operations
export async function createRoom(...) { }
export async function deleteRoom(...) { }
export async function hasExistingBreakoutRooms(...) { }
```

Don't create one file per function (anti-pattern):
```typescript
// ❌ Bad: Too granular
// services/createRoom.ts
// services/deleteRoom.ts
// services/hasExistingBreakoutRooms.ts
```

### 4. State Encapsulation

If a module has internal state, **don't export it directly:**

```typescript
// ✅ Good: State is encapsulated
const sessions = new Map(); // Not exported
export function getRooms(id) { return sessions.get(id); }

// ❌ Bad: Exposes internal implementation
export const sessions = new Map(); // External code can mutate directly
```

### 5. Type Definitions

Keep shared types/interfaces in:
- `src/types/` for project-wide types
- Top of module file for module-specific types

```typescript
// src/modules/breakout/services/message.ts

// Local to this module
interface BroadcastResult {
    success: boolean;
    sent: string[];
    failed: string[];
}

// Export if needed elsewhere
export interface ChannelMessageResult {
    success: boolean;
    message: string;
}

export async function broadcastToBreakoutRooms(...): Promise<BroadcastResult> { }
```

### 6. Documentation

Document the "why" and "what", not the "how":

```typescript
// ✅ Good
/**
 * Checks if users are currently distributed across breakout rooms.
 * Returns true if at least one room has members in it.
 */
export async function hasActiveDistribution(guildId: string): Promise<boolean>

// ❌ Bad (obvious from signature)
/**
 * This function takes a guildId string parameter and returns a Promise of boolean
 */
export async function hasActiveDistribution(guildId: string): Promise<boolean>
```

---

## Checklist

Use this checklist to track migration progress:

### Phase 1: Stateless Services
- [ ] `services/DistributionService.ts` → `services/distribution.ts`
- [ ] `services/MessageService.ts` → `services/message.ts`
- [ ] `services/RoomService.ts` → `services/room.ts`
- [ ] `services/TimerService.ts` → `services/timer.ts`

### Phase 2: Operations
- [ ] `operations/CreateOperation.ts` → `operations/create.ts`
- [ ] `operations/DistributeOperation.ts` → `operations/distribute.ts`
- [ ] `operations/EndOperation.ts` → `operations/end.ts`

### Phase 3: State Managers
- [ ] `state/SessionManager.ts` → `state/session.ts`
- [ ] `state/StateManager.ts` → `state/state.ts`

### Phase 4: Update Consumers
- [ ] Update `commands/main/breakout.ts` imports
- [ ] Search for other usages: `git grep "from.*Operation" src/`
- [ ] Search for other usages: `git grep "from.*Service" src/`

### Phase 5: Cleanup & Verification
- [ ] Delete old `*Operation.ts` files
- [ ] Delete old `*Service.ts` and `*Manager.ts` files
- [ ] Run type check: `bunx tsc --noEmit`
- [ ] Run linter: `bunx biome check --write`
- [ ] Test all commands manually
- [ ] Update this document's status to "Completed"

### Phase 6: Commit & PR
- [ ] Review all changes
- [ ] Commit with descriptive message
- [ ] Push branch
- [ ] Create PR with link to this document
- [ ] Request code review

---

## Questions & Answers

### Q: Why not keep classes for consistency with Discord.js?

**A:** Discord.js uses classes for entities that have instance state (e.g., `Client`, `Message`, `Guild`). Our services are stateless utilities, which don't benefit from classes. Consistency should be with the *pattern*, not the syntax.

### Q: What if we need to add state to a service later?

**A:** You can convert back to a class if needed. But consider:
1. Can the state be module-level? (Like `sessions` in `session.ts`)
2. Is it truly instance state, or could it be a parameter?
3. Would dependency injection be better?

In most cases, module-level state is sufficient and simpler.

### Q: Won't this make the codebase less "professional"?

**A:** This is a common misconception. Functional programming is dominant in modern JavaScript/TypeScript (React hooks, Next.js, etc.). Many large codebases (e.g., Vercel, Cloudflare) use functional patterns. Classes aren't inherently more "professional" — using the right tool for the job is.

### Q: What about performance?

**A:** No performance difference. Functions and class methods compile to similar JavaScript. Module-level state is just as fast as instance properties.

---

## Conclusion

This migration will modernize the breakout module's architecture, making it simpler, more maintainable, and consistent with modern TypeScript best practices. The risk is low, the benefits are clear, and the migration path is well-defined.

**Next Steps:**
1. Review this document with the team
2. Get approval to proceed
3. Follow the checklist in Phases 1-6
4. Celebrate cleaner code! 🎉

---

**Document Status:** Draft → Ready for Review  
**Last Updated:** February 17, 2026
