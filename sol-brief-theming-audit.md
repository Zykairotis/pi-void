# Sol brief: theming example extension audit (read-only)

## Goal for Sol
Review correctness, UX, and docs drift in the theming example extension.
Suggest minimal example-only fixes. No core Ice loop rewrite.
No code was changed in this audit. No verification commands were run.

## Primary file under audit
- `packages/coding-agent/examples/extensions/theming.ts` (~653 lines)
  - Lines 1-204 (read): header comment, imports, `SCHEMA`, `USER_THEME = "user"`, `GROUPS`, `PALETTE`, `ThemeFile` interface, `themesDir()`, `userThemePath()`, `themingPath()`, `readState()`, `writeState()`, `currentThemeName()`, `findThemePath()`, `loadNamedTheme()`
  - Lines 205-653 (read): `resolveToken`, `rgb`, `swatch`, `paint`, `normalizeHex`, `writeUserTheme`, `ensureUserTheme`, `applyColor`, `themePreview`, `HexEditor`, `PreviewSelect`, `ColorGroupPanel.showList/createPalette/openHex`, `ThemingSubmenu.showHome/createThemeDropdown/resetToBase`, `UnavailableTheming`, `createThemingSubmenu`, default export with `registerSettings("theming")` + `registerCommand("theming")`

## Code sources checked
- `packages/coding-agent/src/modes/interactive/theme/theme.ts:299-313` — `resolveVarRefs`: recursive var resolution, throws on circular/missing refs
- `packages/coding-agent/src/modes/interactive/theme/theme.ts:315-334` — `resolveThemeColors`, `withThemeColorFallbacks` for `thinkingMax`, `thinkingUltra`, `scrollbarThumb`
- `packages/coding-agent/src/modes/interactive/theme/theme.ts:493-518` — `getAvailableThemesWithPaths`: dedupes by name via `seen` set, built-ins first, then custom
- `packages/coding-agent/src/modes/interactive/theme/theme.ts:655-659` — `loadThemeFromPath`
- `packages/coding-agent/src/modes/interactive/theme/theme.ts:670-676` — `getThemeByName`
- `packages/coding-agent/src/modes/interactive/theme/theme-schema.json` — required 51 color tokens; optional `thinkingMax`, `thinkingUltra`, `scrollbarThumb`; `$defs/colorValue` allows hex string, var alias, empty string, integer 0-255
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts:2800,3099` — extension `ui.custom(factory) => showExtensionCustom`
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts:2814-2826` — live wiring: `getAllThemes -> getAvailableThemesWithPaths()`, `setTheme -> controller + settingsManager.setTheme`, `getTheme -> getThemeByName`
- `packages/coding-agent/src/core/extensions/loader.ts:242,251` — `registerCommand` / `registerSettings` are separate namespaces
- `packages/coding-agent/src/core/extensions/runner.ts:263-265` — no-op UI context: `getAllThemes: () => []`, `getTheme: () => undefined`, `setTheme: () => ({success:false})`, `custom: async () => never`
- `packages/coding-agent/src/modes/rpc/rpc-mode.ts:271-274,333-344` — RPC: `custom()` unsupported, `getAllThemes: []`, `setTheme` returns failure
- `packages/tui/src/components/settings-list.ts:activateItem/closeSubmenu` — submenu `done(selectedValue?)`: `undefined` means cancel (no `onChange`, no `currentValue` update, just close)
- `packages/coding-agent/src/modes/interactive/components/theme-selector.ts` — built-in `/theme` picker component, no extension command-name collision
- `packages/coding-agent/examples/extensions/mac-system-theme.ts` — `session_start` forces `dark`/`light` from `osascript`, 2s poll interval, never reads `theming.json`
- `packages/coding-agent/src/config.ts:518-534` — `getAgentDir()`, `getCustomThemesDir() = join(agentDir, "themes")`
- Docs: `packages/coding-agent/docs/themes.md`, `packages/coding-agent/docs/theme-sources.md`, `packages/coding-agent/examples/extensions/README.md`
- Built-in theme dir `packages/coding-agent/src/modes/interactive/theme/`: 100 JSON files (`dark` + `light` + 98 lanes), no `user.json`

## Findings (severity-ordered)

### 1. Opening a color group immediately switches to `user`; Esc does not restore prior theme
- Source: `theming.ts: ColorGroupPanel.showList()` calls `ensureUserTheme(this.ui)` on entry. Group back path in `ThemingSubmenu.showHome()` is `() => done()` = `done(undefined)`.
- Contract: `settings-list.ts activateItem/closeSubmenu` — `done(undefined)` = cancel, no restore.
- Effect: merely opening e.g. Core UI clones active theme to `user.json`, writes `theming.json`, calls `ui.setTheme("user")`. Escaping everything still leaves `dark -> user`.
- Contrast: theme dropdown cancel correctly does `setTheme(previous); done()` in `createThemeDropdown` onCancel.
- Palette cancel (`applyColor(key, previous, true); finish(); queueMicrotask(showList)`) and hex cancel (`applyColor(key, previous, true)`) restore the color value but stay on `user`.
- Question for Sol: document as intended ("edits save to user.json") or add theme restore on group back?

### 2. `ensureUserTheme` persists state before `setTheme` succeeds
- Source: `theming.ts ensureUserTheme`: `structuredClone(loadNamedTheme(source))` -> `writeState({baseTheme: source})` -> `writeUserTheme(cloned)` -> `ui.setTheme(USER_THEME)` with `notify` on failure, then `return loadThemeFromPath(userThemePath())`.
- Contract: `interactive-mode.ts ~2816-2826` — `setTheme` returns `{success, error}`, failure observable.
- Effect: if `setTheme("user")` fails, `theming.json` + `user.json` already overwritten, error only notified, caller gets newly written file.
- Question for Sol: reorder (setTheme first) or add rollback? Example-only fix preferred.

### 3. `resolveToken` single-level; core recursive (preview-only)
- Source: `theming.ts ~205-216 resolveToken`: one `vars[value]` hop; unknown/circular returns raw string; numbers stringified.
- Contract: `theme.ts 299-324 resolveVarRefs/resolveThemeColors`: recursive, throws on circular/missing.
- Effect: chained aliases (`colors.accent -> vars.a -> vars.b -> #hex`) render blank swatch + intermediate name in preview, while core applies fully resolved color.
- Related: `rgb()` only parses `#rrggbb`, so 256-index (`39`) and `""` preview blank (expected for swatch, but numeric themes show empty).
- Question for Sol: accept as preview limitation or align single function?

### 4. `USER_THEME="user"` shadow risk (low probability, structural)
- Source: `theming.ts ~30 USER_THEME`, `findThemePath` = first `ui.getAllThemes()` match, `loadNamedTheme` falls back to `userThemePath()` only when no registry path matches. `writeUserTheme` always writes `name: "user"`.
- Contract: `theme.ts 493-518` dedupes by name, built-ins first.
- Verified: no built-in `user.json` in theme dir listing. No built-in collision.
- Residual: another custom file with internal `name:"user"` races extension `user.json` for clone source/preview/dropdown.
- Question for Sol: rename guard or document as example limitation?

### 5. Hex editor / palette cannot express full core value space (by design?)
- Source: `theming.ts normalizeHex`: `#rrggbb` (case-insensitive, lowercased) or `""`. Palette = hex-or-empty + `__custom__`.
- Contract: `theme-schema.json $defs/colorValue`, `theme.ts ColorValueSchema`: also 0-255 integers + var aliases.
- Mitigation verified: `writeUserTheme` round-trips `vars/colors/export` via loaded file, so hand-edits to `vars`/`export` survive color edits. UI never surfaces them.
- Question for Sol: keep UI minimal, or note as papercut?

### 6. Non-interactive degradation: silent file writes, not crash
- Contract: `runner.ts 263-265` no-op UI, `rpc-mode.ts 271-274,333-344` RPC UI.
- Source: `theming.ts` handler `await ctx.ui.custom(...)` no-ops there; with session present builds `ThemingSubmenu` with empty theme list instead of `UnavailableTheming` (which only guards `sessionCtx === undefined`, pre-session).
- Effect from source: color paths write `user.json`/`theming.json` then `notify("Could not ...")`. No crash in source.
- Unverified (read-only scope): actual RPC/no-op runtime behavior, live preview, `/theming` smoke test, test suite.
- `ctx.ui.custom` overlay lifecycle (`interactive-mode.ts 2800/3099`) confirmed to exist, not traced end-to-end — provisional.
- Question for Sol: is current degrade acceptable for an example?

### 7. Docs drift: `thinkingUltra` optional missing from `themes.md`
- Contract: schema required 51, optional `thinkingMax`, `thinkingUltra`, `scrollbarThumb`. `theme.ts Type.Optional` + `withThemeColorFallbacks 326-334` confirms.
- Drift: `docs/themes.md` Theme Format paragraph names only `thinkingMax` + `scrollbarThumb`; Thinking Level Borders table has `thinkingMax` row, no `thinkingUltra` row; example JSON includes `scrollbarThumb` + `thinkingMax`, not `thinkingUltra`. Color Tokens intro same omission.
- Extension correct: `GROUPS` covers all 51 required + all 3 optionals (content group has `scrollbarThumb`; thinking group has `thinkingMax`, `thinkingUltra`, `bashMode`). `export` (`pageBg/cardBg/infoBg`) correctly not editable, preserved via `structuredClone`.
- Question for Sol: docs-only fix?

### 8. `mac-system-theme.ts` clobbers `user` customization
- Source: `mac-system-theme.ts`: `session_start` forces `dark`/`light`, 2s `osascript` poll, no `theming.json` awareness.
- Effect: running both extensions, OS flap silently discards `user` session-wide; theming "Reset to base" restores stale entry.
- Question for Sol: document "do not run both", or example guard? Guidance only, no code in this audit.

## Checked clean (do not re-audit unless Sol disagrees)
- Esc-restore paths that exist: theme dropdown, palette select/cancel, hex paths + `queueMicrotask(showList)` / sync `showList()` after `finish` ordering.
- `values:["reset"]` cycling: `currentValue(baseTheme)->"reset"`, `onChange("reset","reset")`, handler ignores value, calls `resetToBase()`. No misfire on cancel.
- Registration: command vs settings namespaces separate; no `/theme` collision (built-in picker is settings UI component).
- Live wiring matches extension usage.
- `$schema` branch (`void`), save path `~/.ice/agent/themes/user.json`, 100-theme count, README row — all match.
- Token coverage: every required token in exactly one GROUPS entry.

## Explicitly unverified (read-only)
Live preview behavior, `/theming` smoke test, test-suite results, RPC/no-op runtime.

## Ask for Sol
1. Confirm/reject findings 1-8.
2. Minimal example-only patch direction, no core loop change.
3. Any missed contract in listed sources.

---

## Appendix A — step-by-step reproduction flows (source-derived, not live-run)

### A1. Group open silently migrates dark -> user (finding 1)
1. `/settings` -> Theming -> e.g. Core UI -> Enter.
2. `SettingsList.activateItem` opens `ColorGroupPanel(group.keys, ui, () => done())` (`theming.ts ThemingSubmenu.showHome`).
3. `ColorGroupPanel` constructor calls `showList()`, which calls `ensureUserTheme(ui)` first thing.
4. `ensureUserTheme`: `active = currentThemeName(ui)` (e.g. `dark`); `sourceName = dark`; `cloned = structuredClone(loadNamedTheme(ui, "dark"))`; `writeState({baseTheme:"dark"})`; `writeUserTheme(cloned)` to `~/.ice/agent/themes/user.json`; `ui.setTheme("user")`.
5. Esc from palette/group unwinds via `done(undefined)` / `finish()` with no `setTheme(previous)` on the group-back path.
6. Observable end state: theme is `user`, `user.json` + `theming.json` written, even if the user changed nothing.
Contrast: `createThemeDropdown` onCancel does `ui.setTheme(previous); done()` — the only path that restores the theme.

### A2. Failed setTheme leaves files behind (finding 2)
1. Same entry as A1, or any `applyColor` call.
2. `writeState` + `writeUserTheme` complete before `ui.setTheme(USER_THEME)` is attempted.
3. On `{success:false}`, extension calls `ui.notify(error, "error")` and still returns `loadThemeFromPath(userThemePath())` — the just-written file, not the prior theme.
4. `ColorGroupPanel.showList` try/catch covers load throws (`notify` + `onBack`) but not the setTheme-failed-with-files-written case.
Core contract making failure observable: `interactive-mode.ts setTheme` returns `{success, error}`; `themeController.setThemeName/applyThemeName` returns `ThemeResult`.

### A3. Preview divergence on chained aliases (finding 3)
1. Theme with `vars: {a: "#112233", b: "a"}`, `colors: {accent: "b"}`.
2. Extension `resolveToken(file, "b")`: `vars["b"] = "a"`, single hop returns `"a"`; `rgb("a")` fails (no `#`, wrong length) -> blank swatch + label `a` (`paletteName` falls through to raw hex-or-name).
3. Core `resolveVarRefs("b", vars)`: `b -> a -> "#112233"` recursive; applied color is `#112233`.
4. Same class: numeric `39` -> extension `String(39)` -> `rgb("39")` blank; core maps through 256-palette ANSI (`theme.ts` bg/fg builders). Empty `""` -> blank in both (terminal default) — expected.

### A4. Custom name collision race (finding 4)
1. Attacker-or-accident file `~/.ice/agent/themes/evening.json` with internal `{name: "user", ...}`.
2. `getAvailableThemesWithPaths` dedupes by name; custom readdir order decides which `user` entry wins the registry.
3. Extension `findThemePath(ui, "user")` returns first registry match — possibly `evening.json`, not the extension's `user.json`.
4. `loadNamedTheme` then clones/previews the wrong file; `writeUserTheme` still overwrites the extension's `user.json` with that content on next color edit.
Verified absent: no built-in `user.json` among the 100 theme files, so built-ins cannot trigger this; only a second custom file can.

### A5. Value-space gap (finding 5)
1. User wants accent = 256-index `39` or alias `brandPrimary` defined in `vars`.
2. Palette offers hex-or-empty + `__custom__`; `HexEditor.onSubmit -> normalizeHex` rejects `39` / `brandPrimary` with `"Use #rrggbb or leave empty for terminal default"`.
3. Workaround (verified in source): hand-edit `user.json` `colors.accent`, or add `vars.brandPrimary` + reference; later color edits via UI call `ensureUserTheme` (loads full file) then `writeUserTheme` which copies `vars`/`colors`/`export` through `structuredClone`, so hand edits survive.

### A6. RPC / no-op degradation walk (finding 6)
1. `/theming` in RPC: `ctx.ui.custom(...)` returns `undefined as never` (`rpc-mode.ts 271-274`); `getAllThemes()` = `[]`; `setTheme` = `{success:false}`.
2. Settings path with session: `createThemingSubmenu(ctx)` builds `ThemingSubmenu` (not `UnavailableTheming`, which needs `sessionCtx === undefined`).
3. Theme dropdown shows zero items; `PreviewSelect` constructed with `items=[]`, `currentIndex=-1`, list height `max(1,1)` — source shows no crash, but selection/preview callbacks have nothing to fire.
4. Any `applyColor` still runs `ensureUserTheme` file writes, then `notify("Could not ...")`.
Unverified live: actual RPC rendering, focus behavior with empty list, notify surfacing.

### A7. thinkingUltra docs gap (finding 7)
Exact drift locations in `docs/themes.md`: Theme Format paragraph ("`thinkingMax` and `scrollbarThumb` are optional"), Thinking Level Borders table (rows through `thinkingMax`, no `thinkingUltra`), example JSON block (`scrollbarThumb` + `thinkingMax` present, `thinkingUltra` absent), Color Tokens intro sentence.
Schema + `theme.ts Type.Optional` + `withThemeColorFallbacks` all confirm three optionals. Extension `GROUPS.thinking.keys` already includes all nine incl. `thinkingUltra` + `bashMode`.

### A8. mac-system-theme clobber sequence (finding 8)
1. Both extensions loaded; user customizes accent via theming ext (now on `user`).
2. OS appearance flips; `mac-system-theme` 2s poll fires `ctx.ui.setTheme("light"|"dark")` directly — bypasses theming ext, never updates `theming.json`.
3. Theming ext "Reset to base" later restores `readState().baseTheme`, which predates the OS switch — stale.
4. Also note `interactive-mode.ts` extension `setTheme` persists via `settingsManager.setTheme`, while `themeController.preview` does not persist; the mac poll uses the persisting path, so each flap rewrites the saved theme setting.

## Appendix B — exact call chains and line-anchored symbols

- Group entry: `ThemingSubmenu.showHome` items `...GROUPS.map(g => ({submenu: (_c, done) => new ColorGroupPanel(g.keys, ui, () => done())}))` -> `ColorGroupPanel.constructor -> showList -> ensureUserTheme`.
- Theme dropdown: `showHome theme item -> createThemeDropdown(done)` -> `PreviewSelect(onPreview=setTheme live (no base-state write), onSelect=setTheme + writeState-if-not-user + done(value) + queueMicrotask(showHome), onCancel=setTheme(previous) + done()) — note live hover persists via settingsManager.setTheme but does not touch theming.json; cancel restores theme but a hovered non-user value is NOT written to theming.json, so Reset-to-base after cancel restores the pre-dropdown base, which is correct`.
- Palette: `showList item submenu=(cur, finish)=>createPalette(key,resolved,finish)` -> `PreviewSelect(onPreview=applyColor(quiet:true) unless __custom__, onSelect=applyColor(quiet:false)+finish(value)+queueMicrotask(showList), onCancel=applyColor(previous,quiet:true)+finish()+queueMicrotask(showList))`; `__custom__` branch: `finish(); queueMicrotask(()=>openHex(key,previous,finish))`.
- Hex: `openHex -> HexEditor(input.onSubmit=normalizeHex->onDone(normalized)|error, onEscape=onDone())` -> callback: `value===undefined ? applyColor(previous,quiet) : applyColor(value,loud)`; `finish(value)`; `showList()` synchronously.
- Persistence helpers: `readState` (tolerant: missing/invalid -> `{baseTheme:"dark"}`); `writeState` (mkdir agent dir, tab-indented JSON); `writeUserTheme` (`$schema,name:"user",vars,colors,export`, tab-indented + trailing newline); `currentThemeName` (`ui.theme.name` unless absent/`"<in-memory>"`, else `readState().baseTheme` — note: controller `setThemeInstance` sets `activeThemeName="<in-memory>"`, so ext falls back to file state there).
- `themePreview(ui,name)`: try/catch -> loads full file, resolves accent/success/warning/error one hop, four swatches; catch -> `""`.
- `paletteChoices`: if current hex already in PALETTE return as-is, else prepend `{id:"current",hex:current}` — so dropdown always contains the live value even when off-palette. `paletteName` maps known hex->id else raw-or-`"default"`.
- `resetToBase`: `readState().baseTheme -> ui.setTheme(base)`; fail -> `notify`; success -> `notify(Restored)` + `showHome()` rebuild. Home `reset` row: `currentValue=readState().baseTheme`, `values=["reset"]`, `onChange(id==="reset")` fires it.
- Settings registration: `registerSettings("theming", {items:[{id:"theming",...submenu:()=>createThemingSubmenu(sessionCtx,done)}], onChange:()=>{}})`; `sessionCtx` captured on `session_start`, cleared on `session_shutdown`; pre-session -> `UnavailableTheming` (Esc-only, `tui.select.cancel`).
- Command: `registerCommand("theming", {handler: ctx.ui.custom(()=>createThemingSubmenu(ctx, ()=>done(undefined)))})` — note `done(undefined)` discards; settings path `onClose` receives `currentThemeName` (harmless: parent `SettingsList` ignores non-undefined via its own `done`, top-level `onChange` is noop).

## Appendix C — data-loss / overwrite surface

| Writer | Path | When | Overwrites what | Recovery |
|---|---|---|---|---|
| `writeUserTheme` | `~/.ice/agent/themes/user.json` | group open, any color apply, hex apply | entire `user.json` (pre-existing custom theme with `name:"user"` is cloned over on first open if active theme != user; if active == user and file exists, loaded as-is) | re-select base theme; but custom edits already merged/lost unless backed up |
| `writeState` | `~/.ice/agent/theming.json` | `ensureUserTheme` (group open / color apply), theme dropdown keep (non-user only) | `baseTheme` string | no history; `readState` defaults `dark` on corrupt/missing |
| `settingsManager.setTheme` via ext `setTheme` | settings store | every preview-step in dropdown + every palette hover (`applyColor quiet:true`) + mac poll | persisted theme setting flips `dark<->user<->other` rapidly during preview; Esc in dropdown restores, but palette/group paths never restore | dropdown cancel; group paths: manual reselect |
| mac poll `setTheme` | same store | every OS flap, 2s poll | saved theme + active theme, discards `user` session | reselect `user` (custom file intact, but session lost it) |

Notes: `parseThemeFile` validates only `name`+`colors` object, not token completeness — a hand-corrupted `user.json` with missing tokens loads in ext but core `parseThemeJson` (validateThemeJson) would reject on `setTheme`; ext `showList` catches load throws, `applyColor` does not catch `ensureUserTheme` throws (palette onPreview path could throw on corrupt file — unhandled in `PreviewSelect` callback; source shows no try/catch there). `loadNamedTheme` throws `Theme not found: <name>` when registry path missing and no `user.json` fallback — surfaces via `themePreview` catch (blank) or `showList` catch (notify+back) or uncaught in `ensureUserTheme`-from-`applyColor`.

## Appendix D — provisional / needs Sol confirmation

- `ctx.ui.custom` overlay lifecycle (`showExtensionCustom` options, focus restore, disposal on done) — confirmed signature only, not traced.
- Empty-list `PreviewSelect`/`SelectList` behavior with `items=[]` in RPC settings path — no crash in source, live focus/render unverified.
- Whether `settingsManager.setTheme` on every preview hover (palette quiet applies call full `applyColor` -> `setTheme`) is intended vs `themeController.preview` (non-persisting) — the built-in `theme-selector.ts` uses `onPreview` (non-persisting) + `onSelect` (persist); the example persists on hover. Flag as possible example bug or deliberate "preview applies immediately" UX (its hint text says "preview applies immediately").
- `THEME_SELECT_LIST_LAYOUT` vs example `minPrimaryColumnWidth:14/max:28` — cosmetic only.
- `Input` handling in `HexEditor.handleInput` clears error on any keypress before delegating — trivial, verified clean.
