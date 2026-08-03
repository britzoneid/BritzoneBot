import fs from 'node:fs/promises';
import path from 'node:path';
import {
	ChannelType,
	type Guild,
	type VoiceBasedChannel,
	type VoiceChannel,
} from 'discord.js';
import { logger } from '../../../lib/logger.js';

/**
 * Single operation step data
 */
interface OperationStep {
	completed: boolean;
	timestamp: number;
	[key: string]: unknown;
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
	params: Record<string, unknown>;
	progress: OperationProgress;
}

/**
 * Persisted room/session data structure
 */
export interface PersistedSession {
	mainRoomId?: string;
	roomIds?: string[];
}

/**
 * Timer data for breakout sessions
 */
export interface TimerData {
	timerId?: string;
	totalMinutes: number;
	startTime: number;
	guildId: string;
	breakoutRooms: string[];
	fiveMinSent: boolean;
	[key: string]: unknown;
}

/**
 * Guild state data structure on disk
 */
export interface GuildState {
	currentOperation?: CurrentOperation;
	history?: CurrentOperation[];
	session?: PersistedSession;
	timerData?: TimerData;
}

const statePath: string = path.join(process.cwd(), 'data');
const stateFile: string = path.join(statePath, 'breakoutState.json');
let inMemoryState: Record<string, GuildState> = {};
let initialized: boolean = false;
let saveQueue: Promise<void> = Promise.resolve();

/**
 * Initialize the state manager, ensuring the data directory exists
 * and loading any existing state
 */
export async function initializeState(): Promise<void> {
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
 * Gets or creates the GuildState entry for a guild
 */
function getGuildState(guildId: string): GuildState {
	if (!inMemoryState[guildId]) {
		inMemoryState[guildId] = {};
	}
	return inMemoryState[guildId];
}

/**
 * Load state from disk
 */
async function loadState(): Promise<void> {
	try {
		const data = await fs.readFile(stateFile, 'utf8');
		inMemoryState = JSON.parse(data);
		logger.debug('📤 Loaded breakout state data');
	} catch (error: unknown) {
		const err = error as { code?: string };
		if (err.code === 'ENOENT') {
			inMemoryState = {};
			logger.info('🆕 Created new breakout state data');
		} else {
			logger.error({ err: error }, '❌ Error loading breakout state');
			throw error;
		}
	}
}

async function saveState(): Promise<void> {
	const nextSave = saveQueue.then(async () => {
		try {
			await initializeState();
			await fs.writeFile(stateFile, JSON.stringify(inMemoryState, null, 2));
			logger.trace('💾 Saved breakout state data');
		} catch (error) {
			logger.error({ err: error }, '❌ Error saving breakout state');
		}
	});

	saveQueue = nextSave.catch((error) => {
		logger.error({ err: error }, '❌ Unhandled error in state save queue');
	});

	return nextSave;
}

/**
 * Start tracking a new operation
 */
export async function startOperation(
	guildId: string,
	operationType: string,
	params: Record<string, unknown>,
): Promise<void> {
	await initializeState();
	const guildState = getGuildState(guildId);
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

	logger.info({ guildId, operationType }, '📝 Started tracking operation');
	await saveState();
}

/**
 * Update progress for an operation
 */
export async function updateProgress(
	guildId: string,
	step: string,
	data: Record<string, unknown> = {},
): Promise<boolean> {
	await initializeState();
	const guildState = inMemoryState[guildId];

	if (!guildState?.currentOperation) {
		logger.warn({ guildId }, '⚠️ No operation in progress');
		return false;
	}

	guildState.currentOperation.progress.steps[step] = {
		completed: true,
		timestamp: Date.now(),
		...data,
	};

	logger.debug({ guildId, step }, '✅ Updated progress');
	await saveState();
	return true;
}

/**
 * Complete an operation
 */
export async function completeOperation(guildId: string): Promise<void> {
	await initializeState();
	const guildState = inMemoryState[guildId];

	if (!guildState?.currentOperation) return;

	guildState.currentOperation.progress.completed = true;
	guildState.currentOperation.progress.completedTime = Date.now();

	if (!guildState.history) {
		guildState.history = [];
	}

	guildState.history.push(guildState.currentOperation);

	const HISTORY_MAX = 50;
	if (guildState.history.length > HISTORY_MAX) {
		guildState.history = guildState.history.slice(-HISTORY_MAX);
	}

	delete guildState.currentOperation;

	logger.info({ guildId }, '🏁 Completed operation');
	await saveState();
}

/**
 * Check if there's an operation in progress
 */
export async function hasOperationInProgress(
	guildId: string,
): Promise<boolean> {
	await initializeState();
	const guildState = inMemoryState[guildId];

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
	await initializeState();
	const guildState = inMemoryState[guildId];
	return guildState?.currentOperation;
}

/**
 * Get completed steps for the current operation (returns shallow copy)
 */
export async function getCompletedSteps(
	guildId: string,
): Promise<Record<string, OperationStep>> {
	await initializeState();
	const guildState = inMemoryState[guildId];

	if (!guildState?.currentOperation) return {};
	return { ...guildState.currentOperation.progress.steps };
}

/**
 * Stores breakout rooms for a guild on disk
 */
export async function storeRooms(
	guildId: string,
	rooms: VoiceChannel[],
): Promise<void> {
	await initializeState();
	const guildState = getGuildState(guildId);
	guildState.session = {
		...guildState.session,
		roomIds: rooms.map((r) => r.id),
	};
	logger.debug({ guildId, count: rooms.length }, '📝 Stored breakout rooms');
	await saveState();
}

/**
 * Sets the main room for a guild's breakout session on disk
 */
export async function setMainRoom(
	guildId: string,
	mainRoom: VoiceBasedChannel,
): Promise<void> {
	await initializeState();
	const guildState = getGuildState(guildId);
	guildState.session = {
		...guildState.session,
		mainRoomId: mainRoom.id,
	};
	logger.debug(
		{ guildId, mainRoom: mainRoom.name },
		'📝 Set main room for breakout session',
	);
	await saveState();
}

/**
 * Gets the breakout rooms for a guild resolved from Discord client cache
 */
export function getRooms(guild: Guild): VoiceChannel[] {
	const guildState = inMemoryState[guild.id];
	const roomIds = guildState?.session?.roomIds || [];

	return roomIds
		.map((id) => guild.channels.cache.get(id))
		.filter((ch): ch is VoiceChannel => ch?.type === ChannelType.GuildVoice);
}

/**
 * Gets the main room for a guild resolved from Discord client cache
 */
export function getMainRoom(guild: Guild): VoiceBasedChannel | undefined {
	const guildState = inMemoryState[guild.id];
	const mainRoomId = guildState?.session?.mainRoomId;
	if (!mainRoomId) return undefined;

	const ch = guild.channels.cache.get(mainRoomId);
	if (ch?.isVoiceBased()) {
		return ch as VoiceBasedChannel;
	}
	return undefined;
}

/**
 * Clears session data for a guild from disk
 */
export async function clearSession(guildId: string): Promise<void> {
	await initializeState();
	const guildState = getGuildState(guildId);
	delete guildState.session;
	logger.debug({ guildId }, '🧹 Cleared breakout session');
	await saveState();
}

/**
 * Sets timer data for a guild
 */
export async function setTimerData(
	guildId: string,
	timerData: TimerData,
): Promise<void> {
	await initializeState();
	const guildState = getGuildState(guildId);
	guildState.timerData = timerData;
	logger.debug({ guildId }, '💾 Storing timer data');
	await saveState();
}

/**
 * Gets timer data for a guild
 */
export async function getTimerData(guildId: string): Promise<TimerData | null> {
	await initializeState();
	const guildState = inMemoryState[guildId];
	return guildState?.timerData || null;
}

/**
 * Clears timer data for a guild
 */
export async function clearTimerData(guildId: string): Promise<void> {
	await initializeState();
	const guildState = getGuildState(guildId);
	delete guildState.timerData;
	logger.debug({ guildId }, '🗑️ Clearing timer data');
	await saveState();
}
