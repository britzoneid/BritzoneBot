import crypto from 'node:crypto';
import os from 'node:os';
import {
	ChannelType,
	type Client,
	type Guild,
	PermissionFlagsBits,
	type TextChannel,
} from 'discord.js';
import { loadGuildConfig } from '@/lib/guildConfig.js';
import { logger } from '@/lib/logger.js';

export const LOCK_CHANNEL_NAME = 'bot-instance-lock';
export const LOCK_EXPIRATION_MS = 25_000;
export const HEARTBEAT_INTERVAL_MS = 10_000;
export const CURRENT_INSTANCE_ID = crypto.randomUUID();

export interface LockPayload {
	instanceId: string;
	developer: string;
	hostname: string;
	pid: number;
	timestamp: number;
}

let activeHeartbeatTimer: NodeJS.Timeout | null = null;
let currentLockMessageId: string | null = null;
let activeLockChannel: TextChannel | null = null;

export function getDeveloperIdentity(): string {
	let username = 'developer';
	try {
		username =
			os.userInfo().username ||
			process.env.USER ||
			process.env.USERNAME ||
			'developer';
	} catch {
		username = process.env.USER || process.env.USERNAME || 'developer';
	}
	const devName = process.env.DEV_NAME || username;
	return `${devName}@${os.hostname()}`;
}

export async function getOrCreateLockChannel(
	guild: Guild,
): Promise<TextChannel | null> {
	try {
		const channels = await guild.channels.fetch();
		const existing = channels.find(
			(c) =>
				c !== null &&
				c.name === LOCK_CHANNEL_NAME &&
				c.type === ChannelType.GuildText,
		) as TextChannel | undefined;

		if (existing) return existing;

		const me =
			guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
		if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
			logger.warn(
				{ guild: guild.name },
				`⚠️ Bot lacks 'Manage Channels' permission to auto-create #${LOCK_CHANNEL_NAME}.`,
			);
			return null;
		}

		logger.info(
			{ guild: guild.name },
			`🛠️ Auto-creating private lock channel #${LOCK_CHANNEL_NAME}...`,
		);

		return await guild.channels.create({
			name: LOCK_CHANNEL_NAME,
			type: ChannelType.GuildText,
			topic:
				'Internal lock channel to prevent duplicate bot instances across developers.',
			permissionOverwrites: [
				{
					id: guild.roles.everyone.id,
					deny: [PermissionFlagsBits.ViewChannel],
				},
				{
					id: me.id,
					allow: [
						PermissionFlagsBits.ViewChannel,
						PermissionFlagsBits.SendMessages,
						PermissionFlagsBits.ReadMessageHistory,
						PermissionFlagsBits.ManageMessages,
					],
				},
			],
		});
	} catch (err) {
		logger.error(
			{ err },
			`❌ Failed to find or auto-create #${LOCK_CHANNEL_NAME}`,
		);
		return null;
	}
}

export async function acquireDistributedLock(client: Client): Promise<void> {
	try {
		const guildConfigs = loadGuildConfig();
		const targetGuildId =
			Object.keys(guildConfigs)[0] || client.guilds.cache.first()?.id;

		if (!targetGuildId) {
			logger.warn('⚠️ No guilds available to bind distributed lock. Skipping.');
			return;
		}

		const guild =
			client.guilds.cache.get(targetGuildId) ||
			(await client.guilds.fetch(targetGuildId).catch(() => null));

		if (!guild) {
			logger.warn(
				{ targetGuildId },
				'⚠️ Could not fetch guild for lock. Skipping.',
			);
			return;
		}

		const channel = await getOrCreateLockChannel(guild);
		if (!channel) return;

		activeLockChannel = channel;
		const devId = getDeveloperIdentity();

		const messages = await channel.messages.fetch({ limit: 10 });
		const lockMessages = messages.filter((m) =>
			m.content.startsWith('🔒 [INSTANCE_LOCK]'),
		);

		for (const lockMsg of lockMessages.values()) {
			try {
				const jsonStr = lockMsg.content
					.replace('🔒 [INSTANCE_LOCK]', '')
					.trim();
				const data = JSON.parse(jsonStr) as LockPayload;

				const age = Date.now() - data.timestamp;
				const isRecent = age < LOCK_EXPIRATION_MS;
				const isDifferentInstance = data.instanceId !== CURRENT_INSTANCE_ID;

				if (isRecent && isDifferentInstance) {
					const isSameMachine = data.hostname === os.hostname();

					if (isSameMachine) {
						logger.fatal(
							{ pid: data.pid },
							`❌ Another bot instance is already running on this machine in another terminal (PID: ${data.pid})!`,
						);
					} else {
						logger.fatal(
							{
								runningDev: data.developer,
								hostname: data.hostname,
								pid: data.pid,
							},
							`❌ Another developer (${data.developer} on ${data.hostname}) is already running this bot!`,
						);
					}

					logger.fatal('👉 Stop the active instance before starting this one.');
					await client.destroy();
					process.exit(1);
				}

				await lockMsg.delete().catch(() => {});
			} catch {
				// Corrupted message, overwrite safely by deleting
				await lockMsg.delete().catch(() => {});
			}
		}

		const initialPayload: LockPayload = {
			instanceId: CURRENT_INSTANCE_ID,
			developer: devId,
			hostname: os.hostname(),
			pid: process.pid,
			timestamp: Date.now(),
		};

		const lockMsg = await channel.send(
			`🔒 [INSTANCE_LOCK] ${JSON.stringify(initialPayload)}`,
		);
		currentLockMessageId = lockMsg.id;

		logger.info(
			{ developer: devId, channel: `#${channel.name}` },
			'🔐 Instance lock acquired successfully',
		);

		activeHeartbeatTimer = setInterval(async () => {
			try {
				if (!currentLockMessageId || !activeLockChannel) return;
				const msg =
					await activeLockChannel.messages.fetch(currentLockMessageId);
				if (msg) {
					const update: LockPayload = {
						instanceId: CURRENT_INSTANCE_ID,
						developer: devId,
						hostname: os.hostname(),
						pid: process.pid,
						timestamp: Date.now(),
					};
					await msg.edit(`🔒 [INSTANCE_LOCK] ${JSON.stringify(update)}`);
				}
			} catch (err) {
				logger.warn({ err }, '⚠️ Heartbeat update failed');
			}
		}, HEARTBEAT_INTERVAL_MS);

		activeHeartbeatTimer.unref();
	} catch (err) {
		logger.error({ err }, '❌ Unexpected error in acquireDistributedLock');
	}
}

export async function releaseDistributedLock(): Promise<void> {
	if (activeHeartbeatTimer) {
		clearInterval(activeHeartbeatTimer);
		activeHeartbeatTimer = null;
	}

	if (activeLockChannel && currentLockMessageId) {
		try {
			const msg = await activeLockChannel.messages.fetch(currentLockMessageId);
			if (msg) await msg.delete();
			logger.info('🔓 Distributed lock released from Discord');
		} catch {
			// Channel or message already deleted
		} finally {
			currentLockMessageId = null;
			activeLockChannel = null;
		}
	}
}
