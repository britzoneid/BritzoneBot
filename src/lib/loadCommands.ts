import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { listModuleFiles, moduleExtensionOf } from '@/lib/moduleFiles.js';
import type { Command } from '@/types/command.js';

// Use this module's tree so source and compiled entry points load matching files.
export async function loadCommands(
	onError?: (error: unknown, filePath: string) => void,
): Promise<Command[]> {
	const directory = path.resolve(import.meta.dirname, '../commands');
	const extension = moduleExtensionOf(import.meta.url);
	const commands: Command[] = [];
	const names = new Set<string>();
	for (const folder of fs.readdirSync(directory).sort()) {
		const folderPath = path.join(directory, folder);
		for (const file of listModuleFiles(folderPath, extension).sort()) {
			const filePath = path.join(folderPath, file);
			try {
				const { default: command } = await import(pathToFileURL(filePath).href);
				if (
					!command?.data?.name ||
					typeof command.data.toJSON !== 'function' ||
					typeof command.execute !== 'function'
				) {
					throw new Error(`Invalid command module: ${filePath}`);
				}
				if (names.has(command.data.name)) {
					throw new Error(`Duplicate command name: ${command.data.name}`);
				}
				names.add(command.data.name);
				commands.push(command as Command);
			} catch (error) {
				if (!onError) throw error;
				onError(error, filePath);
			}
		}
	}
	return commands;
}
