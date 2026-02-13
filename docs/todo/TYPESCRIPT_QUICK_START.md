# TypeScript Migration Quick Start

This guide helps you get started with the TypeScript migration provided in `TYPESCRIPT_MIGRATION_GUIDE.md`.

## ⚡ Quick Start (5 Minutes)

### 1. Install TypeScript Dependencies

```bash
bun add -D typescript @types/node
```

### 2. Verify Files Are Created

The following files should already exist in your project:

```
✅ tsconfig.json                    (TypeScript configuration)
✅ src/types/                       (Type definitions)
  ├── command.ts                    (Command type interface)
  ├── event.ts                      (Event type interface)
  ├── client.ts                     (Extended Client type)
  └── index.ts                      (Export all types)
✅ src/index.ts                     (Entry point - migrated)
✅ src/events/
  ├── ready.ts                      (Ready event - migrated example)
  └── interactionCreate.ts          (Interaction handler - migrated example)
✅ src/helpers/
  ├── safeReply.ts                  (Helper - migrated example)
  └── isAdmin.ts                    (Helper - migrated example)
✅ src/commands/utility/ping.ts     (Simple command example)
```

### 3. Type Check Your Project

```bash
bun run type-check
```

**Expected output if no errors:**
```
(no output means no errors!)
```

### 4. Build TypeScript

```bash
bun run build
```

This compiles `src/` to `dist/` with TypeScript.

### 5. Run the Bot

```bash
# Option 1: Run compiled version
bun start

# Option 2: Development mode with watch
bun run dev
```

---

## 📁 Migration Strategy

### Step 1: Migrate Type Definitions (Already Done ✅)
- `src/types/command.ts` - Types for your commands
- `src/types/event.ts` - Types for your event handlers  
- `src/types/client.ts` - Extended Client type with your custom properties
- `src/types/index.ts` - Central export for all types

### Step 2: Migrate Your Files

**Start with helpers (utility files):**
1. Open `src/helpers/` (already has examples)
2. Copy one `.js` file: e.g., `helpers/distributeUsers.js`
3. Convert to TypeScript:
   - Rename to `.ts`
   - Replace JSDoc comments with TypeScript types
   - Add proper parameter and return types

**Example: distributeUsers**

**Before** (`distributeUsers.js`):
```javascript
/**
 * Distributes users evenly across breakout rooms
 * @param {string[]} userIds - Array of user IDs
 * @param {number} roomCount - Number of rooms
 * @returns {Map<number, string[]>} Map of room index to user IDs
 */
export function distributeUsers(userIds, roomCount) {
  const distribution = new Map();
  // ... implementation
  return distribution;
}
```

**After** (`distributeUsers.ts`):
```typescript
/**
 * Distributes users evenly across breakout rooms
 * @param userIds Array of user IDs to distribute
 * @param roomCount Number of rooms to distribute across
 * @returns Map of room index to user IDs
 */
export function distributeUsers(
  userIds: string[],
  roomCount: number,
): Map<number, string[]> {
  const distribution = new Map<number, string[]>();
  // ... implementation (same logic)
  return distribution;
}
```

**Then migrate events** (`src/events/`):
- Ready event ✅ (already migrated as example)
- InteractionCreate ✅ (already migrated as example)

**Then migrate commands** (`src/commands/`):
- Start with simpler commands
- Use `ping.ts` as a template
- Reference `TYPESCRIPT_MIGRATION_GUIDE.md` for complex commands like `breakout.ts`

### Step 3: Verify After Each Migration

After migrating each file:

```bash
# Check for type errors
bun run type-check

# Build to verify compilation
bun run build

# If both pass, you're good to commit!
```

---

## 🔍 File Migration Template

Use this template when migrating your files:

### JavaScript Version
```javascript
/**
 * @param {SomeType} param - Description
 * @returns {ReturnType} Description
 */
export function myFunction(param) {
  // implementation
}
```

### TypeScript Version
```typescript
import type { SomeType } from '../types/index.js';

/**
 * Description of function
 * @param param Description
 * @returns Description
 */
export function myFunction(param: SomeType): ReturnType {
  // implementation (same logic)
}
```

### Key Changes:
1. Add file extension to imports: `from '../helpers/myHelper.js'`
2. Replace JSDoc `@param {Type}` with `: Type`
3. Add return type: `: ReturnType`
4. Add `import type { ... }` for type-only imports
5. Add `export` if not already there

---

## 📚 Reference Files Provided

### Complete Examples:
- ✅ `src/index.ts` - Full entry point with comments
- ✅ `src/events/ready.ts` - Simple event example
- ✅ `src/events/interactionCreate.ts` - Complex event with error handling
- ✅ `src/helpers/safeReply.ts` - Complex helper with full types
- ✅ `src/helpers/isAdmin.ts` - Simple helper
- ✅ `src/commands/utility/ping.ts` - Simple command

### Use these to understand patterns for:
- **Event handlers** → See `src/events/`
- **Helper functions** → See `src/helpers/`
- **Commands** → See `src/commands/`
- **Complex types** → See `src/types/`

---

## 🐛 Common Issues & Quick Fixes

### "Cannot find module" errors
```typescript
// ❌ Wrong
import { helper } from './helpers/helper';

// ✅ Right
import { helper } from './helpers/helper.js';
```
**Solution:** Always use `.js` extension in ESM imports.

---

### "client.commands is not defined"
```typescript
// ❌ Wrong
const command = client.commands.get(...);

// ✅ Right
const client = interaction.client as BritzoneClient;
const command = client.commands.get(...);
```
**Solution:** Cast `client` as `BritzoneClient` type.

---

### Type errors on `interaction.options.get*()`
```typescript
// ❌ Wrong
const count = interaction.options.getInteger('number');
// Type: number | null

// ✅ Right (use true for required)
const count = interaction.options.getInteger('number', true);
// Type: number

// ✅ Or handle null
const count = interaction.options.getInteger('number') ?? 0;
// Type: number
```
**Solution:** Pass `true` for required options, or use nullish coalescing.

---

## 🚀 Next Steps

1. **Complete migration of remaining helpers** - Usually the easiest
2. **Migrate your breakout command** - Reference the guide for complex patterns
3. **Test all functionality** - Run the bot and test all commands
4. **Commit to git** - Your migration is complete!

```bash
git add .
git commit -m "migrate: Convert JavaScript bot to TypeScript

- Add TypeScript configuration and dev dependencies
- Migrate all type definitions to src/types/
- Migrate entry point and event handlers
- Migrate helper functions with full type annotations
- Update package.json with build/dev scripts
- Add example command and events for reference

Generated with Discord.js TypeScript migration guide"
```

---

## 📖 Full Documentation

For detailed explanations of:
- All TypeScript patterns
- How discord.js types work
- Advanced patterns and configurations
- Build and deployment
- Troubleshooting

**See:** `TYPESCRIPT_MIGRATION_GUIDE.md`

---

## ❓ Need Help?

- **TypeScript docs:** https://www.typescriptlang.org/docs/
- **discord.js docs:** https://discord.js.org/docs
- **Your migration guide:** `TYPESCRIPT_MIGRATION_GUIDE.md`

Good luck! 🎉
