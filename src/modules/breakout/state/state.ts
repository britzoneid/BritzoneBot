import fs from 'node:fs/promises';
import path from 'node:path';
import {
	ChannelType,
	type Guild,
	type VoiceBasedChannel,
	type VoiceChannel,
} from 'discord.js';
import { logger } from '../../../lib/logger.js';

export type BreakoutSubcommand =
	| 'create'
	| 'distribute'
	| 'end'
	| 'timer'
	| 'broadcast'
	| 'send-message';

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
export interface CurrentOperation {
	type: BreakoutSubcommand | string;
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

	saveQueue = nextSave.catch((err) => {
		logger.error({ err }, '❌ Save queue encountered an unhandled rejection');
	});
	return nextSave;
}

/**
 * Start tracking a new operation
 */
export async function startOperation(
	guildId: string,
	operationType: BreakoutSubcommand | string,
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
	logger.info(
		{ guildId, operationType },
		'🚀 Started tracking new breakout operation',
	);
	await saveState();
}

/**
 * Update progress for a step
 */
export async function updateProgress(
	guildId: string,
	step: string,
	data: Record<string, unknown> = {},
): Promise<boolean> {
	await initializeState();
	const guildState = inMemoryState[guildId];

	if (!guildState?.currentOperation) {
		logger.warn(
			{ guildId, step },
			'⚠️ Cannot update progress: No active operation',
		);
		return false;
	}

	guildState.currentOperation.progress.steps[step] = {
		completed: true,
		timestamp: Date.now(),
		...data,
	};
	logger.debug({ guildId, step }, '🔄 Updated operation progress');
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
	delete guildState.currentOperation;

	logger.info({ guildId }, '✅ Completed breakout operation');
	await saveState();
}

/**
 * Check if operation is in progress
 */
export async function hasOperationInProgress(
	guildId: string,
): Promise<boolean> {
	await initializeState();
	const guildState = inMemoryState[guildId];

	return (
		Boolean(guildState?.currentOperation) &&
		!guildState?.currentOperation?.progress?.completed
	);
}

/**
 * Get current operation
 */
export async function getCurrentOperation(
	guildId: string,
): Promise<CurrentOperation | undefined> {
	await initializeState();
	const guildState = inMemoryState[guildId];
	return guildState?.currentOperation;
}

/**
 * Get completed steps for current operation
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
 * Stores breakout room IDs for a guild on disk
 */
export async function storeRoomIds(
	guildId: string,
	roomIds: string[],
): Promise<void> {
	await initializeState();
	const guildState = getGuildState(guildId);
	guildState.session = {
		...guildState.session,
		roomIds,
	};
	logger.debug(
		{ guildId, count: roomIds.length },
		'📝 Stored breakout room IDs',
	);
	await saveState();
}

/**
 * Sets the main room ID for a guild's breakout session on disk
 */
export async function setMainRoomId(
	guildId: string,
	mainRoomId: string,
): Promise<void> {
	await initializeState();
	const guildState = getGuildState(guildId);
	guildState.session = {
		...guildState.session,
		mainRoomId,
	};
	logger.debug(
		{ guildId, mainRoomId },
		'📝 Set main room ID for breakout session',
	);
	await saveState();
}

/**
 * Gets the breakout rooms for a guild resolved from Discord client cache
 */
export function getRooms(guild: Guild): VoiceChannel[] {
	if (!initialized) {
		logger.warn('getRooms called before initializeState');
	}
	const guildState = inMemoryState[guild.id];
	const roomIds = guildState?.session?.roomIds || [];

	if (roomIds.length === 0) {
		return Array.from(
			guild.channels.cache
				.filter(
					(channel): channel is VoiceChannel =>
						channel.type === ChannelType.GuildVoice &&
						channel.name.startsWith('breakout-room-'),
				)
				.values(),
		);
	}

	return roomIds
		.map((id) => guild.channels.cache.get(id))
		.filter(
			(channel): channel is VoiceChannel =>
				channel !== undefined && channel.type === ChannelType.GuildVoice,
		);
}

/**
 * Gets the main room for a guild resolved from Discord client cache
 */
export function getMainRoom(guild: Guild): VoiceBasedChannel | undefined {
	if (!initialized) {
		logger.warn('getMainRoom called before initializeState');
	}
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
