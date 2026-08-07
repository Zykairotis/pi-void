import { join } from "node:path";
import type { ModelsStore, ModelsStoreEntry, ModelsStoreOperationOptions } from "@earendil-works/pi-ai";
import { getAgentDir } from "../config.ts";
import { raceWithAbortSignal } from "../utils/abort.ts";
import { type AuthStorageBackend, FileAuthStorageBackend } from "./auth-storage.ts";

type StoredModels = Record<string, ModelsStoreEntry>;

export class InMemoryCodingAgentModelsStore implements ModelsStore {
	private readonly entries = new Map<string, ModelsStoreEntry>();

	async read(providerId: string, options?: ModelsStoreOperationOptions): Promise<ModelsStoreEntry | undefined> {
		options?.signal?.throwIfAborted();
		const entry = this.entries.get(providerId);
		return entry ? structuredClone(entry) : undefined;
	}

	async write(providerId: string, entry: ModelsStoreEntry, options?: ModelsStoreOperationOptions): Promise<void> {
		options?.signal?.throwIfAborted();
		this.entries.set(providerId, structuredClone(entry));
	}

	async delete(providerId: string, options?: ModelsStoreOperationOptions): Promise<void> {
		options?.signal?.throwIfAborted();
		this.entries.delete(providerId);
	}
}

/** Locked JSON-backed storage for dynamically refreshed provider catalogs. */
export class FileModelsStore implements ModelsStore {
	private readonly storage: AuthStorageBackend;
	private snapshotRead: Promise<StoredModels> | undefined;

	constructor(path: string = join(getAgentDir(), "models-store.json")) {
		this.storage = new FileAuthStorageBackend(path);
	}

	private parse(content: string | undefined): StoredModels {
		return content ? (JSON.parse(content) as StoredModels) : {};
	}

	private loadSnapshot(): Promise<StoredModels> {
		if (this.snapshotRead) return this.snapshotRead;
		const read = this.storage.withLockAsync(async (content) => ({ result: this.parse(content) }));
		this.snapshotRead = read;
		const clear = () => {
			if (this.snapshotRead === read) this.snapshotRead = undefined;
		};
		void read.then(clear, clear);
		return read;
	}

	async read(providerId: string, options?: ModelsStoreOperationOptions): Promise<ModelsStoreEntry | undefined> {
		const snapshot = await raceWithAbortSignal(this.loadSnapshot(), options?.signal);
		return structuredClone(snapshot[providerId]);
	}

	async write(providerId: string, entry: ModelsStoreEntry, options?: ModelsStoreOperationOptions): Promise<void> {
		await this.storage.withLockAsync(async (content) => {
			const current = this.parse(content);
			current[providerId] = structuredClone(entry);
			return { result: undefined, next: JSON.stringify(current, null, 2) };
		}, options);
	}

	async delete(providerId: string, options?: ModelsStoreOperationOptions): Promise<void> {
		await this.storage.withLockAsync(async (content) => {
			const current = this.parse(content);
			delete current[providerId];
			return { result: undefined, next: JSON.stringify(current, null, 2) };
		}, options);
	}
}
