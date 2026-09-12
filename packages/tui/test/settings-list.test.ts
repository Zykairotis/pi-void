import assert from "node:assert/strict";
import { test } from "node:test";
import { type SettingItem, SettingsList, type SettingsListTheme } from "../src/components/settings-list.ts";

const theme: SettingsListTheme = {
	label: (text) => text,
	value: (text) => text,
	description: (text) => text,
	cursor: "> ",
	hint: (text) => text,
};

const LEFT = "\x1b[D";
const RIGHT = "\x1b[C";

function createList(items: SettingItem[], options?: { enableSearch?: boolean }) {
	const changes: Array<{ id: string; value: string }> = [];
	const list = new SettingsList(
		items,
		10,
		theme,
		(id, value) => changes.push({ id, value }),
		() => {},
		options,
	);
	return { list, changes };
}

test("Left/Right adjust the selected value and wrap like Enter", () => {
	const items: SettingItem[] = [
		{ id: "theme", label: "Theme", currentValue: "dark", values: ["dark", "light", "auto"] },
	];
	const { list, changes } = createList(items);

	list.handleInput(RIGHT);
	assert.deepEqual(changes.at(-1), { id: "theme", value: "light" });
	list.handleInput(RIGHT);
	assert.deepEqual(changes.at(-1), { id: "theme", value: "auto" });
	list.handleInput(RIGHT);
	assert.deepEqual(changes.at(-1), { id: "theme", value: "dark" });
	list.handleInput(LEFT);
	assert.deepEqual(changes.at(-1), { id: "theme", value: "auto" });
	list.handleInput(LEFT);
	assert.deepEqual(changes.at(-1), { id: "theme", value: "light" });

	// Enter still cycles forward for compatibility.
	list.handleInput("\r");
	assert.deepEqual(changes.at(-1), { id: "theme", value: "auto" });
});

test("Left/Right leave rows without values untouched", () => {
	const items: SettingItem[] = [
		{ id: "plain", label: "Plain", currentValue: "read only" },
		{
			id: "nested",
			label: "Nested",
			currentValue: "open",
			submenu: () => ({ render: () => [""], invalidate: () => {} }),
		},
	];
	const { list, changes } = createList(items);
	list.handleInput(RIGHT);
	list.handleInput(LEFT);
	list.handleInput("\x1b[B");
	list.handleInput(RIGHT);
	assert.equal(changes.length, 0);
});

test("typed search keeps Left/Right for the search cursor", () => {
	const items: SettingItem[] = [{ id: "a", label: "Alpha", currentValue: "1", values: ["1", "2"] }];
	const { list, changes } = createList(items, { enableSearch: true });
	list.handleInput("a");
	list.handleInput(RIGHT);
	list.handleInput(LEFT);
	assert.equal(changes.length, 0);
});
