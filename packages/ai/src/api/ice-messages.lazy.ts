import type { ProviderStreams } from "../types.ts";
import { lazyApi } from "./lazy.ts";

export const iceMessagesApi = (): ProviderStreams => lazyApi(() => import("./ice-messages.ts"));
