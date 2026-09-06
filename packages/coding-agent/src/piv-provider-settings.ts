import {
	type Component,
	Container,
	getKeybindings,
	type SelectItem,
	SelectList,
	type SettingItem,
	SettingsList,
	Spacer,
	Text,
} from "@earendil-works/pi-tui";
import { getAgentDir } from "./config.ts";
import type { ExtensionAPI, ExtensionContext, ExtensionUIContext } from "./core/extensions/types.ts";
import { getSelectListTheme, getSettingsListTheme, theme } from "./modes/interactive/theme/theme.ts";
import {
	type ProviderCatalogRefetchResult,
	type ProviderCatalogSummary,
	refetchProviderCatalog,
	summarizeProviderCatalogs,
} from "./piv-provider.ts";

const PROVIDER_LIST_LAYOUT = {
	minPrimaryColumnWidth: 12,
	maxPrimaryColumnWidth: 32,
};
const LOCAL_REFETCH_STATUS_KEY = "piv-providers";
const NON_LOCAL_REFRESH_TIMEOUT_MS = 15_000;

export interface ProviderSettingsUi {
	notify(message: string, type?: "info" | "warning" | "error"): void;
	setStatus(key: string, text: string | undefined): void;
}

export interface ProvidersSubmenuOptions {
	summaries: ProviderCatalogSummary[];
	onRefetch: (providerId: string, signal?: AbortSignal) => Promise<ProviderCatalogRefetchResult>;
	onCancel: () => void;
	ui?: ProviderSettingsUi;
}

export function formatProviderDescription(summary: ProviderCatalogSummary): string {
	return `${summary.modelCount} models · ${summary.baseUrl ?? "built-in"}`;
}

export function createProvidersSubmenu(options: ProvidersSubmenuOptions): Component {
	return new ProvidersSubmenu(options);
}

class ProvidersSubmenu extends Container {
	private readonly onRefetch: ProvidersSubmenuOptions["onRefetch"];
	private readonly onCancel: () => void;
	private readonly ui?: ProviderSettingsUi;
	private summaries: ProviderCatalogSummary[];
	private selectedProviderId: string | undefined;
	private refetching = false;
	private focus: { handleInput(data: string): void } | undefined;

	constructor(options: ProvidersSubmenuOptions) {
		super();
		this.summaries = [...options.summaries];
		this.onRefetch = options.onRefetch;
		this.onCancel = options.onCancel;
		this.ui = options.ui;
		this.showList();
	}

	handleInput(data: string): void {
		this.focus?.handleInput(data);
	}

	private showList(): void {
		this.selectedProviderId = undefined;
		this.clear();
		this.addChild(new Text(theme.bold(theme.fg("accent", "Providers")), 0, 0));
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("muted", "Select a provider to inspect or refetch its catalog"), 0, 0));
		this.addChild(new Spacer(1));

		if (this.summaries.length === 0) {
			this.addChild(new Text(theme.fg("warning", "No providers configured"), 0, 0));
			this.addChild(new Spacer(1));
			this.addChild(new Text(theme.fg("dim", "  Esc to go back"), 0, 0));
			this.focus = {
				handleInput: (data: string) => {
					if (getKeybindings().matches(data, "tui.select.cancel")) this.onCancel();
				},
			};
			return;
		}

		const items: SelectItem[] = this.summaries.map((summary) => ({
			value: summary.id,
			label: summary.id,
			description: formatProviderDescription(summary),
		}));
		const selectList = new SelectList(items, Math.min(items.length, 10), getSelectListTheme(), PROVIDER_LIST_LAYOUT);
		selectList.onSelect = (item) => {
			this.showDetail(item.value);
		};
		selectList.onCancel = () => this.onCancel();
		this.addChild(selectList);
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("dim", "  Enter to open · Esc to go back"), 0, 0));
		this.focus = selectList;
	}

	private showDetail(providerId: string): void {
		const summary = this.summaries.find((entry) => entry.id === providerId);
		if (!summary) {
			this.showList();
			return;
		}
		this.selectedProviderId = providerId;
		this.clear();
		this.addChild(new Text(theme.bold(theme.fg("accent", summary.id)), 0, 0));
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("muted", formatProviderDescription(summary)), 0, 0));
		this.addChild(new Spacer(1));

		const items: SettingItem[] = [
			{
				id: "models",
				label: "Models",
				description: summary.baseUrl ?? "built-in catalog",
				currentValue: String(summary.modelCount),
			},
			{
				id: "refetch",
				label: "Refetch catalog",
				description: this.refetching
					? "A refetch is already running"
					: "Fetch the latest model list for this provider",
				currentValue: this.refetching ? "working" : "run",
				values: this.refetching ? undefined : ["run"],
			},
		];
		const settingsList = new SettingsList(
			items,
			Math.min(items.length, 10),
			getSettingsListTheme(),
			(id) => {
				if (id === "refetch") void this.runRefetch(providerId);
			},
			() => this.showList(),
		);
		this.addChild(settingsList);
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("dim", "  Enter to refetch · Esc to go back"), 0, 0));
		this.focus = settingsList;
	}

	private async runRefetch(providerId: string): Promise<void> {
		if (this.refetching) return;
		this.refetching = true;
		this.ui?.setStatus(LOCAL_REFETCH_STATUS_KEY, `Refetching ${providerId}…`);
		this.showDetail(providerId);
		const signal = AbortSignal.timeout(NON_LOCAL_REFRESH_TIMEOUT_MS);
		try {
			const result = await this.onRefetch(providerId, signal);
			if (result.ok) {
				this.summaries = this.summaries.map((entry) =>
					entry.id === providerId ? { ...entry, modelCount: result.count } : entry,
				);
				this.ui?.notify(`Refetched ${providerId}: ${result.count} models`, "info");
			} else {
				this.ui?.notify(`Could not refetch ${providerId}: ${result.error}`, "error");
			}
		} catch (error) {
			this.ui?.notify(
				`Could not refetch ${providerId}: ${error instanceof Error ? error.message : String(error)}`,
				"error",
			);
		} finally {
			this.refetching = false;
			this.ui?.setStatus(LOCAL_REFETCH_STATUS_KEY, undefined);
			if (this.selectedProviderId === providerId) this.showDetail(providerId);
		}
	}
}

class UnavailableProvidersSubmenu extends Container {
	private readonly onCancel: () => void;

	constructor(onCancel: () => void) {
		super();
		this.onCancel = onCancel;
		this.addChild(new Text(theme.bold(theme.fg("accent", "Providers")), 0, 0));
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("warning", "Providers unavailable"), 0, 0));
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("dim", "  Esc to go back"), 0, 0));
	}

	handleInput(data: string): void {
		if (getKeybindings().matches(data, "tui.select.cancel")) this.onCancel();
	}
}

export default function pivProviderSettings(pi: ExtensionAPI): void {
	let sessionCtx: ExtensionContext | undefined;
	pi.on("session_start", (_event, ctx) => {
		sessionCtx = ctx;
	});
	pi.registerSettings("providers", {
		items: [
			{
				id: "providers",
				label: "Providers",
				description: "Inspect configured providers and refetch a catalog",
				currentValue: "configure",
				submenu: (_current, done) => {
					const ctx = sessionCtx;
					if (!ctx) return new UnavailableProvidersSubmenu(() => done());
					const runtime = ctx.modelRegistry.getRuntime();
					const ui: ExtensionUIContext = ctx.ui;
					return createProvidersSubmenu({
						summaries: summarizeProviderCatalogs(runtime),
						ui,
						onRefetch: (providerId, signal) =>
							refetchProviderCatalog({
								providerId,
								agentDir: getAgentDir(),
								refreshRuntime: (options) => ctx.modelRegistry.refresh(options),
								countModels: (id) => runtime.getModels(id).length,
								signal,
							}),
						onCancel: () => done(),
					});
				},
			},
		],
		onChange: () => {},
	});
}
