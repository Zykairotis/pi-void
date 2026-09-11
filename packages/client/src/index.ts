/** @deprecated Historical names are aliases, not separate clients or error types. */
export { IceClient, IceClient as PiClient } from "./client.ts";
export {
	IceClientDisposedError as PiClientDisposedError,
	IceClientDisposedError,
	IceDisconnectedError as PiDisconnectedError,
	IceDisconnectedError,
	IceServerError as PiServerError,
	IceServerError,
	IceSessionDetachedError as PiSessionDetachedError,
	IceSessionDetachedError,
	IceSessionOwnershipError as PiSessionOwnershipError,
	IceSessionOwnershipError,
} from "./errors.ts";
export type {
	AcquireSessionOptions,
	IceSessionHandle as PiSessionHandle,
	IceSessionHandle,
	SessionLease,
	SessionLeaseMode,
} from "./session-handle.ts";
export type { ByteTransport, ByteTransportFactory, ByteTransportHandlers } from "./transport.ts";
export type {
	ConnectionState,
	ConnectionStateChange,
	CreateSessionOptions,
	IceClientOptions as PiClientOptions,
	IceClientOptions,
	ListenerErrorHandler,
	Unsubscribe,
} from "./types.ts";
