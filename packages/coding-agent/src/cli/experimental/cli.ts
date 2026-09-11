import { type ClientCommandContext, clientCommand } from "./commands/client.ts";
import { type IceCommandContext, iceCommand } from "./commands/ice.ts";
import { type ServerCommandContext, serverCommand } from "./commands/server.ts";

export type ExperimentalCliContext = IceCommandContext & ServerCommandContext & ClientCommandContext;

export const experimentalCli = iceCommand.command(serverCommand).command(clientCommand);
