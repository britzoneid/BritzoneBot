import fs from 'fs/promises';
import path from 'path';

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
		console.log('📂 StateManager initialized');
	} catch (error) {
		console.error('❌ Failed to initialize StateManager:', error);
	}
}

/**
 * Load state from disk
 */
async function loadState(): Promise<void> {
	try {
		const data = await fs.readFile(stateFile, 'utf8');
		inMemoryState = JSON.parse(data);
		console.log('📤 Loaded breakout state data');
	} catch (error: any) {
		if (error.code !== 'ENOENT') {
			console.error('❌ Error loading breakout state:', error);
		}
		inMemoryState = {};
		console.log('🆕 Created new breakout state data');
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
			console.log('💾 Saved breakout state data');
		} catch (error) {
			console.error('❌ Error saving breakout state:', error);
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

	console.log(
		`📝 Started tracking ${operationType} operation for guild ${guildId}`,
	);
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
		console.log(`⚠️ No operation in progress for guild ${guildId}`);
		return false;
	}

	guildState.currentOperation.progress.steps[step] = {
		completed: true,
		timestamp: Date.now(),
		...data,
	};

	console.log(`✅ Updated progress for guild ${guildId}: ${step}`);
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

	// Move current operation to history
	if (!guildState.history) {
		guildState.history = [];
	}

	guildState.history.push(guildState.currentOperation);

	// Clear current operation
	delete guildState.currentOperation;

	console.log(`🏁 Completed operation for guild ${guildId}`);
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
 * Clear the current operation without marking as completed
 * Used when resuming an operation to prevent infinite recursion
 */
async function clearCurrentOperation(guildId: string): Promise<void> {
	await initialize();
	const guildState = inMemoryState[guildId] as GuildState | undefined;

	if (guildState?.currentOperation) {
		delete guildState.currentOperation;
		await saveState();
	}
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
 * Clear state for a guild
 */
async function clearGuildState(guildId: string): Promise<void> {
	await initialize();
	delete inMemoryState[guildId];
	await saveState();
	console.log(`🧹 Cleared state data for guild ${guildId}`);
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
	console.log(`💾 Storing timer data for guild ${guildId}`);
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
	console.log(`🗑️ Clearing timer data for guild ${guildId}`);
	delete inMemoryState[`timer_${guildId}`];
	await saveState();
}
