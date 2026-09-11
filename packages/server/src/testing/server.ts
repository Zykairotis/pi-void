import { IceServer } from "../server.ts";
import type { IceServerOptions, IceSessionBackend } from "../types.ts";
import { TestSessionBackend } from "./backend.ts";

export interface TestServerOptions extends IceServerOptions {
	backend?: IceSessionBackend;
}

export interface TestServer {
	server: IceServer;
	backend: IceSessionBackend;
}

/** Create an unstarted IceServer with deterministic defaults for transport conformance tests. */
export function createTestServer(options: TestServerOptions): TestServer {
	const backend = options.backend ?? new TestSessionBackend();
	return {
		server: new IceServer(backend, {
			listeners: options.listeners,
			maxFrameLength: options.maxFrameLength,
			handshakeTimeoutMs: options.handshakeTimeoutMs,
			serverId: options.serverId,
			onError: options.onError,
		}),
		backend,
	};
}
