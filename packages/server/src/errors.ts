import type { JsonValue, ProtocolErrorCode } from "@zykairotis/ice-protocol";

export type IceServerOperationErrorCode = Extract<
	ProtocolErrorCode,
	"busy" | "session_locked" | "not_found" | "invalid_request"
>;

/** A backend/runtime error that can safely cross the protocol boundary. */
export class IceServerError extends Error {
	readonly code: IceServerOperationErrorCode;
	readonly details: JsonValue | undefined;

	constructor(code: IceServerOperationErrorCode, message: string, details?: JsonValue) {
		super(message);
		this.name = "IceServerError";
		this.code = code;
		this.details = details;
	}
}

export class SessionBusyError extends IceServerError {
	constructor(message = "Session is busy", details?: JsonValue) {
		super("busy", message, details);
		this.name = "SessionBusyError";
	}
}

export class SessionLockedError extends IceServerError {
	constructor(message = "Session is locked", details?: JsonValue) {
		super("session_locked", message, details);
		this.name = "SessionLockedError";
	}
}

export class SessionNotFoundError extends IceServerError {
	constructor(message = "Session was not found", details?: JsonValue) {
		super("not_found", message, details);
		this.name = "SessionNotFoundError";
	}
}
