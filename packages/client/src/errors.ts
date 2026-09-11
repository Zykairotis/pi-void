import type { JsonValue, ProtocolError, ProtocolErrorCode } from "@zykairotis/ice-protocol";

export class IceServerError extends Error {
	readonly code: ProtocolErrorCode;
	readonly details: JsonValue | undefined;

	constructor(error: ProtocolError) {
		super(error.message);
		this.name = "IceServerError";
		this.code = error.code;
		this.details = error.details;
	}
}

export class IceDisconnectedError extends Error {
	constructor(message = "Ice client is disconnected") {
		super(message);
		this.name = "IceDisconnectedError";
	}
}

export class IceClientDisposedError extends Error {
	constructor() {
		super("Ice client is disposed");
		this.name = "IceClientDisposedError";
	}
}

export class IceSessionOwnershipError extends Error {
	readonly sessionId: string;

	constructor(sessionId: string, message: string) {
		super(message);
		this.name = "IceSessionOwnershipError";
		this.sessionId = sessionId;
	}
}

export class IceSessionDetachedError extends Error {
	readonly sessionId: string;

	constructor(sessionId: string) {
		super(`Session ${sessionId} is not attached`);
		this.name = "IceSessionDetachedError";
		this.sessionId = sessionId;
	}
}

export function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

export function toDisconnectedError(error: unknown): IceDisconnectedError {
	const cause = toError(error);
	return cause instanceof IceDisconnectedError ? cause : new IceDisconnectedError(cause.message);
}
