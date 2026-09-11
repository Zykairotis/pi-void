# @zykairotis/ice-server

Experimental. This package is under active development and may change or be removed without notice. Its APIs and behavior are not yet stable.

Server package for ice.

## Session server core

The package exports the `IceServer` session server.

```ts
import type { IceSessionBackend } from "@zykairotis/ice-server";
import { createUnixServer } from "@zykairotis/ice-server/unix";

const backend: IceSessionBackend = {
  async listSessions() {
    return storage.listSessions();
  },
  async listModels() {
    return modelRegistry.listModels();
  },
  async createSession(options) {
    return storage.createAndOpen(options);
  },
  async openSession(sessionId) {
    return storage.open(sessionId);
  },
};

const server = createUnixServer(backend, {
  path: "/tmp/ice/server.sock",
});
await server.start();
```

`IceServer` composes transport listeners through the `IceServerListener` interface. Each listener must complete any transport-specific authentication and authorization before passing a connection to `IceServer`. For example, a WebSocket listener can validate credentials during the HTTP upgrade, while the Unix listener relies on socket filesystem permissions. The Unix submodule exports the `createUnixListener()` building block and `createUnixServer()` preset, keeping the common case concise without coupling the primary server to Unix sockets. The listener uses length-prefixed CBOR messages from `@zykairotis/ice-protocol`.

This package does not provide a standalone CLI or coding-agent backend. Applications supply the `IceSessionBackend` implementation.

## Transport testing

Custom transports can use `@zykairotis/ice-server/testing` for deterministic protocol conformance tests. It exports `createTestServer()`, `TestSessionBackend`, `ProtocolTestClient`, and the transport-neutral `WireChannel` contract. `connectUnixTestClient()` is provided for Unix transport tests.

## `ice-ai` protocol bridge

`@zykairotis/ice-ai` domain objects and `@zykairotis/ice-protocol` wire DTOs remain independent. This package owns their boundary and exports `toProtocolModelMetadata()`, `toProtocolAssistantMessage()`, `toProtocolUserMessage()`, and `toProtocolToolResultMessage()`.

The adapters reject invalid tool inputs, identifiers, timestamps, and mismatched tool results; `toProtocolToolResultMessage()` requires the original `ToolCall` so it can verify the association and convert its arguments itself. Diagnostic details are explicitly sanitized. Closed `ice-ai` unions are mapped exhaustively, and compile-time field manifests enumerate current `ice-ai` properties so additions require an explicit review. The protocol mirrors `ice-ai` vocabulary such as `toolCall` and `toolUse` where the semantics are identical. Protocol schemas enforce consistent lifecycle states, and tests encode adapter output through the runtime schemas so incompatible changes fail in the bridging package.
