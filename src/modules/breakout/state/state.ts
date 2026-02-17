import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../../lib/logger.js';

/**
 * Single operation step data
 */
interface OperationStep {
	completed: boolean;
	timestamp: number;
	[key: string]: any;
}

/**
 * Operation progress tracking
 */
interface OperationProgress {
	started: boolean;
	completed: boolean;
	steps: Record<string, OperationStep>;
	startTime: number;
	completedTime?: number;
}

/**
 * Current operation details
 */
interface CurrentOperation {
	type: string;
	params: Record<string, any>;
	progress: OperationProgress;
}

/**
 * Guild state data
 */
interface GuildState {
	currentOperation?: CurrentOperation;
	history?: CurrentOperation[];
}

/**
 * Timer data for breakout sessions
 */
export interface TimerData {
	totalMinutes: number;
	startTime: number;
	guildId: string;
	breakoutRooms: string[];
	fiveMinSent: boolean;
	[key: string]: any;
}

const statePath: string = path.join(process.cwd(), 'data');
const stateFile: string = path.join(statePath, 'breakoutState.json');
let inMemoryState: Record<string, GuildState | TimerData> = {};
let initialized: boolean = false;
let saveQueue: Promise<void> = Promise.resolve();

/**
 * Initialize the state manager, ensuring the data directory exists
 * and loading any existing state
 */
async function initialize(): Promise<void> {
	if (initialized) return;

	try {
		await fs.mkdir(statePath, { recursive: true });
		await loadState();
		initialized = true;
		logger.info('📂 StateManager initialized');
	} catch (error) {
		logger.error({ err: error }, '❌ Failed to initialize StateManager');
	}
}

/**
 * Load state from disk
 */
async function loadState(): Promise<void> {
	try {
		const data = await fs.readFile(stateFile, 'utf8');
		inMemoryState = JSON.parse(data);
		logger.debug('📤 Loaded breakout state data');
	} catch (error: any) {
		if (error.code === 'ENOENT') {
			// File doesn't exist yet, create new state
			inMemoryState = {};
			logger.info('🆕 Created new breakout state data');
		} else {
			// Other error (parse error, permission error, etc.)
			logger.error({ err: error }, '❌ Error loading breakout state');
			throw error;
		}
	}
}

/**
 * Save state to disk with concurrency safety
 */
async function saveState(): Promise<void> {
	// Queue the save operation to prevent race conditions with file writes
	const nextSave = saveQueue.then(async () => {
		try {
			await initialize();
			await fs.writeFile(stateFile, JSON.stringify(inMemoryState, null, 2));
			logger.trace('💾 Saved breakout state data');
		} catch (error) {
			logger.error({ err: error }, '❌ Error saving breakout state');
		}
	});

	// Update the queue reference, catching errors to ensure the queue allows future writes
	saveQueue = nextSave.catch(() => {});

	return nextSave;
}

/**
 * Start tracking a new operation
 */
export async function startOperation(
	guildId: string,
	operationType: string,
	params: Record<string, any>,
): Promise<void> {
	await initialize();
	if (!inMemoryState[guildId]) {
		inMemoryState[guildId] = {} as GuildState;
	}

	const guildState = inMemoryState[guildId] as GuildState;
	guildState.currentOperation = {
		type: operationType,
		params,
		progress: {
			started: true,
			completed: false,
			steps: {},
			startTime: Date.now(),
		},
	};

	logger.info({ guildId, operationType }, `📝 Started tracking operation`);
	await saveState();
}

/**
 * Update progress for an operation
 */
export async function updateProgress(
	guildId: string,
	step: string,
	data: Record<string, any> = {},
): Promise<boolean> {
	await initialize();
	const guildState = inMemoryState[guildId] as GuildState | undefined;

	if (!guildState?.currentOperation) {
		logger.warn({ guildId }, `⚠️ No operation in progress`);
		return false;
	}

	guildState.currentOperation.progress.steps[step] = {
		completed: true,
		timestamp: Date.now(),
		...data,
	};

	logger.debug({ guildId, step }, `✅ Updated progress`);
	await saveState();
	return true;
}

/**
 * Complete an operation
 */
export async function completeOperation(guildId: string): Promise<void> {
	await initialize();
	const guildState = inMemoryState[guildId] as GuildState | undefined;

	if (!guildState?.currentOperation) return;

	guildState.currentOperation.progress.completed = true;
	guildState.currentOperation.progress.completedTime = Date.now();

	// Move current operation to history with capping to prevent unbounded growth
	if (!guildState.history) {
		guildState.history = [];
	}

	guildState.history.push(guildState.currentOperation);

	// Cap history to last 50 entries to prevent memory/disk bloat
	const HISTORY_MAX = 50;
	if (guildState.history.length > HISTORY_MAX) {
		guildState.history = guildState.history.slice(-HISTORY_MAX);
	}

	// Clear current operation
	delete guildState.currentOperation;

	logger.info({ guildId }, `🏁 Completed operation`);
	await saveState();
}

/**
 * Check if there's an operation in progress
 */
export async function hasOperationInProgress(
	guildId: string,
): Promise<boolean> {
	await initialize();
	const guildState = inMemoryState[guildId] as GuildState | undefined;

	return (
		!!guildState?.currentOperation &&
		!guildState.currentOperation.progress.completed
	);
}

/**
 * Get the current operation details
 */
export async function getCurrentOperation(
	guildId: string,
): Promise<CurrentOperation | undefined> {
	await initialize();
	const guildState = inMemoryState[guildId] as GuildState | undefined;
	return guildState?.currentOperation;
}

/**
 * Get completed steps for the current operation
 */
export async function getCompletedSteps(
	guildId: string,
): Promise<Record<string, OperationStep>> {
	await initialize();
	const guildState = inMemoryState[guildId] as GuildState | undefined;

	if (!guildState?.currentOperation) return {};
	return guildState.currentOperation.progress.steps;
}

/**
 * Sets timer data for a guild
 * @param guildId The guild ID
 * @param timerData Timer data object
 */
export async function setTimerData(
	guildId: string,
	timerData: TimerData,
): Promise<void> {
	await initialize();
	logger.debug({ guildId }, `💾 Storing timer data`);
	inMemoryState[`timer_${guildId}`] = timerData;
	await saveState();
}

/**
 * Gets timer data for a guild
 * @param guildId The guild ID
 * @returns Timer data object or null if not found
 */
export async function getTimerData(guildId: string): Promise<TimerData | null> {
	await initialize();
	const timerKey = `timer_${guildId}`;
	return (inMemoryState[timerKey] as TimerData) || null;
}

/**
 * Clears timer data for a guild
 * @param guildId The guild ID
 */
export async function clearTimerData(guildId: string): Promise<void> {
	await initialize();
	logger.debug({ guildId }, `🗑️ Clearing timer data`);
	delete inMemoryState[`timer_${guildId}`];
	await saveState();
}
