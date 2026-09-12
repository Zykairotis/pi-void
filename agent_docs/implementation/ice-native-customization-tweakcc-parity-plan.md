# ICE Native Appearance and Customization System — TweakCC-Grade Plan

Date: 2026-09-12

Status: Proposed. This document describes a target implementation; none of the new appearance contracts below should be treated as shipped until source and tests verify them.

Reference baseline: `Piebald-AI/tweakcc` `main` at `733d5ab89eb1727f089ec33db6cd3d03f6f03185` (inspected 2026-09-12).

Primary local audit: `sol-brief-theming-audit.md`.

## 1. Objective

Replace ICE's current narrow "theme editor" concept with a native, typed appearance/customization system that provides the same class of presentation customization as TweakCC while fitting ICE's own architecture.

The target is not to reproduce TweakCC's patching mechanism. TweakCC has to patch another product. ICE owns its source and should expose the relevant presentation controls directly through stable native contracts.

The end state should let a user customize, preview, persist, reset, import/export, and switch the major TUI presentation domains without editing source code:

- theme palette and semantic colors;
- user-message formatting and container geometry;
- input/editor border and prompt presentation;
- working/thinking indicator animation;
- thinking verbs/labels and thinking-block presentation;
- Markdown table rendering style;
- input pattern highlighting;
- reusable appearance profiles that bundle a palette with the presentation settings above.

Preserve ICE's existing theme catalog and current theme file format as the palette layer. Do not stuff component geometry, animation, or formatting behavior into `theme-schema.json`.

## 2. Verdict on the Current System

The current system is the wrong abstraction for the requested product.

`sol-brief-theming-audit.md` is useful for finding correctness problems in `packages/coding-agent/examples/extensions/theming.ts`, but its declared scope is intentionally limited to example-only fixes. Completing that brief would produce a safer color-token editor; it would not produce TweakCC-grade customization.

The current ICE implementation is split as follows:

| Area | Current ICE state | Why it is insufficient |
|---|---|---|
| Theme palette | Strong base: native theme loader, semantic tokens, dark/light/auto behavior, OhMyPi catalog | Palette only; component layout/presentation is not modeled |
| Color editor | Example extension with grouped tokens and a fixed palette | No full graphical color workflow, poor preview transaction semantics, incomplete core value-space editing |
| User messages | `UserMessageComponent` hard-codes box geometry and most presentation | Cannot configure border, independent X/Y padding, text styling, fit-to-content, formatting template |
| Editor/input | `EditorTheme` exposes border color plus select-list theme; `EditorOptions` exposes padding | Border is structurally hard-coded; no native border-off/style contract or pattern-highlighting contract |
| Working indicator | Runtime already supports custom frames and interval through `setWorkingIndicator()` | No durable native settings model or first-class customization UI |
| Thinking label/block | Hidden label and hide/show behavior exist; visible thinking is effectively fixed presentation | No persistent verbs, animation presentation editor, text-style controls, or expand-default appearance contract |
| Tables | Markdown renderer owns a single Unicode bordered table format | No selectable render strategy |
| Input highlighters | No native equivalent | No pattern-based input styling |
| Persistence | Native theme setting plus extension-owned `theming.json`/`user.json` behavior | The extension can write during navigation/preview; no cross-domain draft/apply/cancel transaction |
| Preview | Native theme selector has a non-persisting preview seam; example extension does not consistently use it | Preview and persistence semantics are inconsistent |

The redesign should therefore be a native appearance layer, not another expansion of the existing example extension.

## 3. What to Take From TweakCC

The useful TweakCC design is separation of customization domains.

Its current public model separates at least:

- `Theme`;
- thinking verbs;
- thinking animation/style;
- user-message display;
- input-box presentation;
- input pattern highlighters;
- table format;
- additional presentation preferences.

Its current UI likewise gives these domains dedicated editors rather than presenting one giant theme-token form.

For ICE, reproduce the capability and UX class, not the implementation technique.

### 3.1 In scope for presentation parity

- full theme editor with RGB/HEX/HSL editing and direct pasted values;
- representative live preview;
- user-message formatting, text style, foreground/background, borders, X/Y padding, and fit-to-content;
- input border style/off state and appearance;
- custom working/thinking frames, animation interval, reverse-mirror behavior, and presets;
- custom thinking verbs/labels;
- thinking block display preferences;
- table rendering styles;
- input pattern highlighting;
- reset, clone, import/export, and profile switching.

### 3.2 Deliberately out of scope for this appearance project

TweakCC also exposes unrelated product behavior such as system-prompt editing, toolsets, and subagent model settings. ICE already has its own architecture for instructions, tools, model routing, and subagents. Do not mix those concerns into the appearance subsystem merely to claim broad TweakCC parity.

## 4. Architectural Rules

### A1. Keep theme palettes and presentation settings separate

A theme remains a semantic color palette. Existing files under the normal ICE theme directories and the current `theme-schema.json` continue to mean colors.

Appearance settings describe how components use layout, decoration, animation, and formatting.

A theme switch must not silently change unrelated appearance geometry unless the user activates an explicit appearance profile that bundles both.

### A2. Use ICE's existing settings and interactive runtime

Persist user-facing appearance through the existing `SettingsManager`; do not create another authoritative settings store.

The appearance subsystem may have internal typed helpers/controllers, but it must not introduce another session store, event loop, or UI runtime.

### A3. User appearance is global by default

Presentation is a user preference, not repository policy.

The first implementation should read/write appearance from the global ICE settings scope only. A repository must not be able to silently alter user-message boxes, spinners, or input rendering merely because the user enters that repository.

If project-local appearance is ever added, make it a separate explicit opt-in with visible provenance. Do not inherit it from ordinary trusted-project configuration by accident.

### A4. Preview is always reversible and non-persistent

Opening an editor or moving selection must never write settings or create theme files.

The customization UI operates on a draft snapshot:

1. capture current persisted appearance + active theme;
2. edit an in-memory draft;
3. apply the draft as a live preview;
4. `Apply` persists once;
5. `Cancel`/`Esc` restores the exact baseline runtime state;
6. process failure before `Apply` leaves disk state unchanged.

Theme preview must use the existing non-persisting native preview path rather than extension `setTheme()` persistence behavior.

### A5. Use actual rendering paths in previews

Do not use a four-swatch approximation as the main preview.

The preview fixture should exercise the same render primitives as the real application for:

- sample user message;
- assistant Markdown with headings/list/code/table;
- thinking/working indicator;
- thinking block;
- input/editor box;
- tool/result/status colors where relevant.

A preview may use fixture data, but rendering logic should be shared with production components so the preview cannot drift materially.

### A6. No arbitrary executable customization

Appearance configuration is data only.

No JavaScript expressions, shell commands, dynamic imports, or executable formatter hooks should be allowed in appearance profiles.

Formatting templates use a bounded placeholder grammar such as `{message}` or `{verb}`, not `eval` or template execution.

### A7. Non-interactive transports are unaffected

`--print`, JSONL, RPC, and SDK semantic output must not acquire ANSI presentation changes or depend on TUI appearance settings.

Appearance can be projected through a settings API if useful, but it must remain a TUI concern unless a transport explicitly requests presentation metadata.

## 5. Proposed Native Data Model

Keep the existing top-level `theme` selection intact. Add one versioned global appearance object.

The exact TypeScript location should follow the existing settings type organization after implementation inspection, but the product contract should be equivalent to:

```ts
type AppearanceTextStyle = "bold" | "italic" | "underline" | "strikethrough" | "inverse";

type AppearanceBorderStyle =
  | "none"
  | "single"
  | "double"
  | "round"
  | "bold"
  | "single-double"
  | "double-single"
  | "classic"
  | "top-bottom-single"
  | "top-bottom-double"
  | "top-bottom-bold";

type AppearanceColor =
  | { kind: "theme"; token: string }
  | { kind: "custom"; value: string }
  | { kind: "terminal-default" }
  | { kind: "none" };

interface AppearanceSettingsV1 {
  version: 1;

  userMessage: {
    format: string;
    styles: AppearanceTextStyle[];
    foreground: AppearanceColor;
    background: AppearanceColor;
    borderStyle: AppearanceBorderStyle;
    borderColor: AppearanceColor;
    paddingX: number;
    paddingY: number;
    fitToContent: boolean;
  };

  inputBox: {
    borderStyle: "none" | "single" | "double" | "round" | "bold";
    idleBorderColor: AppearanceColor;
    activeBorderColor: AppearanceColor;
    paddingX: number;
  };

  thinking: {
    indicator: {
      frames: string[];
      intervalMs: number;
      reverseMirror: boolean;
      color: AppearanceColor;
    };
    label: {
      format: string;
      verbs: string[];
      selection: "cycle" | "random";
    };
    block: {
      showByDefault: boolean;
      hiddenLabel: string;
      styles: AppearanceTextStyle[];
      foreground: AppearanceColor;
    };
  };

  markdown: {
    tableStyle: "unicode" | "ascii" | "clean" | "clean-top-bottom" | "raw";
  };

  inputHighlighters: InputHighlighterRule[];
}
```

The exact default values must reproduce today's ICE rendering. Installing the new system must be a visual no-op until the user changes settings.

### 5.1 Color references

Do not eagerly copy resolved RGB values from the active theme into appearance settings. Prefer semantic references such as:

```json
{"kind":"theme","token":"userMessageText"}
```

or:

```json
{"kind":"theme","token":"borderAccent"}
```

This means an appearance profile can remain coherent while switching from a dark to a light palette.

A user may explicitly choose a custom color, in which case persist a normalized value supported by ICE's color parser.

### 5.2 Format strings

Use bounded literal substitution only.

Examples:

```text
{message}
> {message}
You: {message}
{verb}…
ICE · {verb}
```

Validation requirements:

- user-message format may contain `{message}` at most once;
- thinking-label format may contain `{verb}` at most once;
- unknown placeholders are rejected before persistence;
- output length is bounded;
- no control-sequence injection from settings values.

### 5.3 Bounds

Suggested hard bounds for the first native version:

- `paddingX`: 0–8;
- `paddingY`: 0–4;
- spinner frames: 1–128;
- spinner frame UTF-8 length: <= 64 bytes each;
- spinner interval: 16–5000 ms;
- thinking verbs: 1–256;
- verb UTF-8 length: <= 128 bytes;
- highlighter rules: <= 64;
- format strings: <= 512 bytes.

These are presentation settings, so malformed persisted values should fall back to the affected field's default and surface a bounded diagnostic rather than crash the TUI.

## 6. Appearance Controller

Add one small interactive controller analogous to `InteractiveThemeController`, for example:

```text
packages/coding-agent/src/modes/interactive/appearance/
  appearance-types.ts
  appearance-defaults.ts
  appearance-validate.ts
  appearance-controller.ts
```

Do not put UI rendering code into the controller.

Responsibilities:

- resolve validated persisted global appearance;
- own an optional in-memory preview overlay;
- expose the currently effective appearance snapshot;
- begin a draft transaction;
- preview a complete draft without writing disk state;
- commit a complete validated draft through `SettingsManager`;
- rollback preview to the captured baseline;
- notify InteractiveMode when affected components need invalidation/rebuild;
- expose deterministic defaults that reproduce current behavior.

Suggested API shape:

```ts
interface AppearanceController {
  getEffective(): ResolvedAppearance;
  beginPreview(): AppearancePreviewSession;
  preview(next: AppearanceSettingsV1): ValidationResult;
  commit(next: AppearanceSettingsV1): Promise<ValidationResult>;
  rollback(): void;
}
```

Only one customization preview transaction should be active per InteractiveMode instance. Starting another closes or replaces the previous draft explicitly; never stack hidden preview layers.

## 7. Persistence and Migration

### 7.1 Native storage

Add `appearance` to the existing global settings model managed by `SettingsManager`.

Required manager operations:

- `getAppearanceSettings()` returns a validated/defaulted immutable snapshot;
- `setAppearanceSettings()` replaces the complete appearance object atomically at the settings abstraction level;
- optionally expose narrow setters only if normal `/settings` machinery requires them;
- maintain normal save/flush behavior.

Do not scatter independent writes for each field during navigation.

### 7.2 Existing theme files

Preserve all existing native and imported theme files. The 98 OhMyPi themes plus ICE dark/light remain valid palette options.

Do not auto-rewrite every theme to a new schema just to support appearance.

### 7.3 Existing example extension state

`packages/coding-agent/examples/extensions/theming.ts` currently has its own user-theme/state behavior.

Do not silently delete user data or automatically migrate it during startup.

The native customization UI should be able to use existing theme files through the standard theme loader. If legacy extension state needs conversion, provide an explicit import/migration action with a preview of what changes.

The example extension can eventually be deprecated or reduced to a native-API example, but deleting intentional functionality requires separate approval.

## 8. Runtime Integration by Domain

### 8.1 User messages

Current insertion point:

```text
packages/coding-agent/src/modes/interactive/components/user-message.ts
```

Replace hard-coded geometry with a resolved presentation object.

Required behavior:

- selectable text styles: bold, italic, underline, strikethrough, inverse;
- semantic/custom foreground;
- semantic/custom/none background;
- border styles listed in the data model;
- independent horizontal/vertical padding;
- optional fit-to-content width;
- bounded `{message}` formatting;
- existing image-count suffix remains structurally correct;
- wrapping and terminal-width behavior remains valid at narrow widths;
- default appearance renders exactly as current ICE.

Do not create separate rendering logic just for preview. Extract/share a renderer or presentation primitive used by both the real component and preview fixture.

### 8.2 Input/editor box

Current insertion point:

```text
packages/tui/src/components/editor.ts
```

Today the editor structurally emits top/bottom borders and only makes their color configurable. Introduce a presentation contract rather than forcing callers to replace the entire editor.

Possible TUI-level type:

```ts
interface EditorPresentation {
  borderStyle: "none" | "single" | "double" | "round" | "bold";
  idleBorder: (text: string) => string;
  activeBorder: (text: string) => string;
  paddingX: number;
}
```

Requirements:

- no-border mode removes border rows without leaving blank structural rows;
- cursor/wrapping/autocomplete width calculations account for border mode;
- scroll indicators still render correctly or degrade to a compact inline indicator when borders are disabled;
- active/focused and idle appearance can differ without replacing the editor component;
- custom editor extensions remain supported;
- default path is byte/geometry equivalent to current behavior where feasible.

### 8.3 Working/thinking indicator

ICE already has a strong seam here: `ExtensionUIContext.setWorkingIndicator()` accepts custom frames and interval.

Native appearance should move the same capability into persisted built-in configuration rather than invent another loader implementation.

Add:

- frame list editor;
- interval editor;
- reverse-mirror option;
- built-in presets;
- custom color/reference;
- animated preview.

The runtime path should normalize effective frames once, then hand them to the existing loader/status-indicator machinery.

Do not start a second animation timer if the existing loader already owns cadence.

### 8.4 Thinking verbs and label formatting

Model a list of user-defined verbs separately from spinner frames.

Requirements:

- add/edit/delete/reorder verbs;
- reset to ICE default list;
- deterministic cycle mode and optional random mode;
- `{verb}` formatting;
- no mutation of model reasoning content;
- only the presentation label changes;
- interruption/retry/status suffixes remain semantically correct;
- tests inject deterministic selection rather than depending on wall-clock/randomness.

If current ICE has no rotating verb source, add the smallest presentation-owned selector; do not involve the model loop.

### 8.5 Thinking block

Current insertion point:

```text
packages/coding-agent/src/modes/interactive/components/assistant-message.ts
```

Current visible reasoning uses hard-coded italic presentation and a hidden-label path.

Add appearance-backed controls for:

- visible/hidden default;
- hidden label text;
- text styles;
- semantic/custom foreground.

Do not alter the underlying reasoning visibility safety/policy semantics. Appearance controls presentation only and must not cause hidden reasoning to leak through transports or logs.

### 8.6 Markdown tables

Current insertion point:

```text
packages/tui/src/components/markdown.ts
```

`renderTable()` currently owns one Unicode bordered strategy.

Refactor border generation into a small `TableRenderStyle` strategy or glyph set while preserving the existing width allocation/wrapping algorithm.

Target modes:

- `unicode`: today's bordered Unicode output;
- `ascii`: `+|-` style;
- `clean`: no outer box, compact row separators;
- `clean-top-bottom`: compact layout retaining top/bottom separators;
- `raw`: original Markdown fallback/rendering.

Do not fork the entire table width algorithm per style. One layout pass should feed style-specific border/row emitters.

### 8.7 Input pattern highlighters

This is the largest parity item and should not be implemented as arbitrary JavaScript `RegExp` execution in the editor render loop without a safety decision.

Target rule shape:

```ts
interface InputHighlighterRule {
  id: string;
  name: string;
  enabled: boolean;
  matcher: {
    kind: "literal" | "regex";
    pattern: string;
    flags?: string;
  };
  styles: AppearanceTextStyle[];
  foreground: AppearanceColor;
  background: AppearanceColor;
  priority: number;
}
```

Required semantics:

- rules are user-global, never repository-supplied by default;
- deterministic priority and overlap resolution;
- cursor location and editor state operate on unstyled source text;
- ANSI styling is applied only at render time;
- paste/history/undo/autocomplete operate on plain text;
- invalid patterns cannot crash the editor;
- a pathological rule cannot freeze every keystroke.

Before enabling arbitrary regex rules, choose a bounded RE2-compatible engine or another demonstrably non-backtracking approach. If no acceptable dependency/runtime exists, ship literal highlighters first and leave regex disabled rather than putting unbounded JS regex evaluation in the hot render path.

## 9. Native Customization UI

Add one first-class interactive customization surface. Preferred user entry points:

```text
/settings -> Appearance
/customize
```

`/theming` may remain as a compatibility/example command while the native surface is introduced, but the native product should not depend on the example extension being loaded.

### 9.1 Main appearance menu

Recommended sections:

```text
Appearance
  Theme
  User messages
  Input box
  Thinking indicator
  Thinking verbs
  Thinking block
  Tables
  Input highlighters
  Profiles
  Import / Export
```

Each section shows a concise current-value summary.

### 9.2 Persistent layout

Where terminal width permits, use a two-pane layout:

```text
settings / controls             live preview
settings / controls             live preview
settings / controls             live preview
```

At narrow widths, fall back to stacked controls followed by preview.

The preview must remain visible while manipulating the current option whenever possible.

### 9.3 Theme editor

Replace the fixed-palette-only editing experience with:

- semantic token list grouped by purpose;
- token description;
- resolved current swatch;
- direct HEX input;
- direct RGB input;
- direct HSL input;
- direct 0–255 terminal color index if the core parser supports it;
- theme-variable reference editing where supported;
- paste a valid color value directly;
- HSL/RGB picker with keyboard controls;
- reset token to inherited/base value;
- clone theme;
- rename custom theme;
- delete custom theme only after confirmation;
- import/export custom theme;
- full representative preview.

Do not reduce ICE's richer core theme value space to the UI's picker format. The editor must round-trip values it does not actively edit.

### 9.4 User-message editor

Controls:

- format string;
- bold/italic/underline/strikethrough/inverse toggles;
- foreground: theme/default/custom;
- background: theme/default/none/custom;
- border style;
- border color;
- padding X;
- padding Y;
- fit to content;
- reset section.

Preview must show short, long, and wrapped messages at least through a quick fixture toggle.

### 9.5 Thinking indicator editor

Controls:

- preset picker;
- frame list;
- add/edit/delete/reorder frame;
- interval;
- reverse-mirror;
- color;
- reset.

Preview must animate using the effective cadence without modifying the actual current agent state.

### 9.6 Thinking verbs editor

Controls:

- label format;
- verb list;
- add/edit/delete/reorder;
- cycle/random mode;
- reset.

Preview cycles only inside the preview fixture.

### 9.7 Input-highlighter editor

Controls:

- rule list;
- enabled toggle;
- name;
- literal/regex matcher type;
- pattern;
- flags if safe regex support exists;
- styles;
- foreground/background;
- priority/reorder;
- sample-input preview;
- explicit validation error before apply.

## 10. Appearance Profiles

Once the underlying domains are native, add optional named profiles.

A profile is a declarative bundle of references/settings, not a second configuration system.

Example:

```json
{
  "name": "Minimal Dark",
  "theme": "obscura-dark",
  "appearance": {
    "inputBox": {"borderStyle": "none"},
    "markdown": {"tableStyle": "clean"}
  }
}
```

Profile semantics:

- profile values overlay built-in defaults for presentation fields;
- active theme reference is optional;
- switching profiles is previewable before persistence;
- profile import never executes code;
- unknown future fields survive import/export when possible but do not become active without validation;
- deleting a profile does not delete the referenced theme;
- no repository can auto-activate a profile in v1.

Profiles provide the user-visible equivalent of "make ICE look and feel completely different" without overloading theme files.

## 11. Import and Export

Support native ICE appearance bundles after the core system is stable.

Suggested extension:

```text
.ice-appearance.json
```

Bundle contents may include:

- bundle schema/version;
- optional custom theme definition;
- appearance profile;
- optional highlighter rules;
- metadata such as display name/description/author.

Security rules:

- data only;
- no file paths outside the controlled theme/profile import destination;
- no executable hooks;
- bounded size/count/string lengths;
- validate everything before writing anything;
- collision UI offers rename/replace/cancel;
- replace uses explicit user confirmation;
- import writes atomically where practical.

Community-theme browsing can be a later feature. Do not make the first native implementation depend on a remote registry.

## 12. Extension API

Do not block the native implementation on a large extension API expansion.

After the core contract is stable, expose read-mostly typed seams so extensions can cooperate without replacing the whole TUI.

Possible additions:

```ts
ui.getAppearance(): Readonly<ResolvedAppearance>;
ui.onAppearanceChange(listener): Disposable;
ui.previewAppearance(partial): PreviewHandle;
```

Persistent mutation should remain explicit and user-driven. Avoid giving every extension an easy silent path to overwrite global appearance.

Existing extension APIs should remain valid:

- `setWorkingIndicator()` still works as an explicit runtime override;
- `setHiddenThinkingLabel()` still works as an explicit runtime override;
- `setEditorComponent()` still permits a full custom editor when necessary;
- native appearance remains the default editor/presentation path.

Define precedence explicitly:

```text
explicit temporary extension runtime override
    > active native appearance preview
        > persisted native appearance
            > built-in defaults/theme palette
```

A temporary extension override must disappear when the extension clears it or session ends; it must not silently persist into global appearance.

## 13. Work Packages

### W0 — Freeze the baseline and add characterization tests

Goal: prove current rendering before changing contracts.

Tasks:

- record current theme/appearance-related settings behavior;
- add tests for default user-message rendering;
- add tests for editor top/bottom border geometry;
- add tests for working-indicator custom frames/interval;
- add tests for hidden/visible thinking block default rendering;
- add tests for Markdown table default rendering;
- cover native non-persisting theme preview versus persisted theme selection;
- record existing example-extension problems from `sol-brief-theming-audit.md` as separate compatibility evidence.

Exit gate: the new tests pass against the current behavior and define the visual no-op default target.

### W1 — Typed appearance settings and validation

Goal: establish one native global data contract with no visual changes.

Tasks:

- add versioned appearance types/defaults/validator;
- integrate global appearance with `SettingsManager`;
- explicitly ignore/reject project appearance for v1;
- normalize bounds and color references;
- add invalid/malformed settings tests;
- preserve unknown top-level settings unrelated to appearance;
- ensure print/JSON/RPC startup is unchanged.

Exit gate: storing default appearance does not alter TUI output.

### W2 — Transactional appearance controller

Goal: make preview/apply/cancel safe before building the editor.

Tasks:

- add `InteractiveAppearanceController`;
- capture baseline snapshots;
- implement in-memory preview overlay;
- implement rollback;
- implement explicit commit;
- connect UI invalidation/rebuild callbacks;
- compose correctly with `InteractiveThemeController` preview;
- test theme + appearance preview together;
- test Esc/cancel leaves settings files byte-identical.

Exit gate: repeated preview navigation causes zero persistent writes until Apply.

### W3 — Native customization shell and full theme editor

Goal: replace the example extension as the primary user experience for palette customization.

Tasks:

- add `/settings -> Appearance` and `/customize`;
- add main section menu;
- add responsive controls/preview layout;
- implement theme selection using native non-persisting preview;
- implement full token editor;
- support HEX/RGB/HSL and native terminal-index/var formats where valid;
- add graphical keyboard color picker;
- add clone/rename/delete for custom themes;
- add import/export for a custom theme;
- build representative full preview fixture;
- keep built-in/imported theme files read-only unless explicitly cloned.

Exit gate: all existing themes can be previewed without settings writes, and a custom clone can be edited/applied without losing unsupported token syntax.

### W4 — User-message presentation

Goal: reach or exceed TweakCC's user-message styling class natively.

Tasks:

- add shared user-message presentation renderer;
- wire real component to appearance;
- add format/styles/colors/background/border/padding/fit controls;
- add live preview;
- test narrow terminal widths, multiline messages, image suffixes, zero padding, and no border;
- verify default snapshot matches W0.

Exit gate: every user-message control can be previewed, cancelled, and applied without restarting ICE.

### W5 — Input/editor presentation

Goal: make the main prompt box customizable without custom-editor replacement.

Tasks:

- add editor presentation type;
- parameterize border glyphs/off state;
- preserve scroll indicators and autocomplete geometry;
- add idle/focus border color support;
- add native UI controls;
- test border-off and each supported border style at narrow/wide widths;
- test cursor/IME marker placement and autocomplete after geometry changes.

Exit gate: border removal does not consume phantom rows or break cursor/autocomplete alignment.

### W6 — Thinking indicator and thinking labels

Goal: expose the presentation controls ICE already partly supports.

Tasks:

- persist frames/interval/reverse-mirror/color;
- reuse existing loader/status indicator path;
- add preset library;
- add frame list editor;
- add verb list + format editor;
- add deterministic cycle selection and optional random selection;
- add live animated preview;
- preserve interruption/retry behavior;
- avoid duplicate timers.

Exit gate: runtime applies changes live and all animation timers are disposed on view exit/session shutdown.

### W7 — Thinking-block presentation

Goal: remove hard-coded visible-thinking styling while preserving reasoning semantics.

Tasks:

- parameterize current italic/color presentation;
- persist show/default and hidden-label presentation settings;
- wire existing hide/show toggle correctly against defaults;
- add settings UI + preview;
- test that transport/reasoning visibility boundaries do not change.

Exit gate: appearance changes cannot expose reasoning where existing runtime policy says it is hidden.

### W8 — Markdown table strategies

Goal: expose multiple table formats without duplicating layout logic.

Tasks:

- extract shared table layout from border emission;
- implement unicode/ascii/clean/clean-top-bottom/raw emitters;
- add appearance setting + UI preview;
- preserve raw fallback when width is too narrow;
- test ANSI content, long cells, CJK/wide characters, single-column and narrow-terminal cases.

Exit gate: all formats share the same tested width calculation and do not overflow available terminal width.

### W9 — Safe input highlighters

Goal: provide TweakCC-class input highlighting without turning every keystroke into an unbounded regex risk.

Tasks:

- add plain-text decoration ranges to editor rendering;
- implement literal matcher first;
- select/review a safe regex approach before enabling regex mode;
- define overlap/priority semantics;
- ensure cursor positions use source-text columns, not ANSI-decorated width;
- add native rule editor + preview;
- add performance tests with long input and maximum rule count;
- test invalid patterns and wide/combining Unicode.

Exit gate: maximum supported rules on maximum tested editor text stay within the agreed render-latency budget and cannot hang the UI on a pathological accepted pattern.

### W10 — Profiles, bundle import/export, and migration UX

Goal: make the system portable and easy to switch.

Tasks:

- add named appearance profiles;
- support optional theme reference in a profile;
- implement native bundle export/import;
- detect legacy theming extension state and offer explicit import where useful;
- add collision handling;
- add reset-to-default section and reset-all operations;
- document legacy extension status;
- only after user approval, deprecate/remove duplicate example functionality.

Exit gate: a fresh ICE install can import a bundle, preview it, apply it, restart, and reproduce the same appearance.

## 14. Test Matrix

### Settings and validation

- missing `appearance` -> exact current default;
- partially specified/migrated object -> deterministic defaults;
- invalid version -> safe fallback + diagnostic;
- malformed color/border/padding/frame/interval -> no crash;
- global writes do not mutate project settings;
- project-provided appearance is ignored in v1;
- repeated save/load is stable.

### Preview transaction

- entering customization writes nothing;
- moving selection writes nothing;
- editing a draft writes nothing;
- Esc restores exact active theme and exact appearance;
- Apply writes once through settings abstraction;
- failed validation writes nothing;
- failed theme preview leaves persisted theme unchanged;
- closing the view disposes preview animation timers.

### User message

- default snapshot;
- all border families;
- no border;
- padding edges;
- long wrapped message;
- multiline input;
- custom fg/bg;
- no background;
- each text style and combinations;
- fit-to-content versus full-width;
- format placeholder validation.

### Editor

- default border snapshot;
- border off;
- alternate glyph sets;
- scroll indicators;
- focused/idle colors;
- autocomplete width/position;
- cursor hardware marker/IME behavior;
- padding with border on/off;
- terminal resize while customized.

### Thinking

- frame order;
- reverse mirror sequence;
- interval bounds;
- preset application;
- cycle selection;
- deterministic random injection in tests;
- empty/oversized verb/frame rejection;
- hidden-label rendering;
- live hide/show toggles.

### Tables

- all render modes;
- narrow fallback;
- wrapped cells;
- ANSI styled cell contents;
- wide Unicode;
- alignment markers;
- following-block spacing.

### Highlighters

- no rules;
- literal rules;
- overlap priority;
- style composition policy;
- disabled rules;
- invalid regex rejection if regex ships;
- cursor/source-column identity;
- undo/history/paste remains plain text;
- maximum-rule performance.

### Integration

Use the repository's controlled TUI path with `tmux` for manual/automated interaction checks after implementation:

- open `/customize`;
- preview theme;
- change user-message style;
- change input border;
- preview spinner;
- cancel and verify exact rollback;
- reopen, Apply, restart ICE, verify persistence;
- verify `/settings` reflects the same effective values;
- verify ordinary prompt/tool/assistant flow remains functional.

## 15. Verification Commands After Implementation

Follow repository rules rather than running the full e2e-sensitive suite blindly.

For each modified/created test file, run its explicit Vitest target from the owning package.

For broader non-e2e verification, use the repository `./test.sh` path where appropriate.

After source changes:

```text
corepack npm@12.0.2 run check
```

Record:

- command;
- exact exit status;
- modified test files and pass counts;
- interactive/tmux smoke evidence;
- any dependency changes required by safe regex support;
- unresolved platform-specific rendering differences.

Do not claim parity from screenshots alone.

## 16. Dependency Policy

The core appearance work should require no new runtime framework.

Prefer existing TUI primitives and ICE's own color/theme parser.

A new dependency is acceptable only if a specific missing capability justifies it. Safe regex support is the most likely candidate requiring a dependency decision. Review its:

- license;
- maintenance status;
- Node and Bun compatibility;
- native-build requirements;
- binary/release packaging impact;
- worst-case runtime behavior;
- package size;
- lifecycle scripts.

Do not pull in a native RE2 binding casually; ICE ships Node and Bun artifacts and should not create cross-platform installation fragility for a cosmetic feature.

## 17. Source/Ownership Boundaries

Likely coding-agent touch points:

```text
packages/coding-agent/src/core/settings-manager.ts
packages/coding-agent/src/modes/interactive/interactive-mode.ts
packages/coding-agent/src/modes/interactive/theme/theme-controller.ts
packages/coding-agent/src/modes/interactive/components/user-message.ts
packages/coding-agent/src/modes/interactive/components/assistant-message.ts
packages/coding-agent/src/modes/interactive/components/status-indicator.ts
packages/coding-agent/src/modes/interactive/components/settings-selector.ts   # confirm actual selector ownership before editing
packages/coding-agent/src/modes/interactive/appearance/*                      # proposed new bounded module
```

Likely TUI touch points:

```text
packages/tui/src/components/editor.ts
packages/tui/src/components/markdown.ts
```

Do not modify core model/provider/tool-loop behavior for this work.

If a presentation requirement appears to need a central agent-loop change, stop and re-evaluate the seam first.

## 18. Compatibility Rules

- Existing theme names and theme files continue to load.
- Existing theme selection setting continues to work.
- Auto light/dark theme behavior continues to work.
- Existing extensions using `ui.setTheme()` continue to work.
- Existing custom editor extensions continue to work.
- Existing runtime `setWorkingIndicator()` and `setHiddenThinkingLabel()` overrides continue to work.
- New appearance defaults reproduce current ICE presentation.
- Appearance does not affect print/JSONL/RPC semantic content.
- No automatic deletion/move/rewrite of user theme files.
- No repository-controlled appearance in v1.

## 19. Product Acceptance Criteria

The project is complete only when all of the following are true:

1. ICE has a native customization surface independent of the example theming extension.
2. The current theme palette/catalog remains intact and compatible.
3. Theme color editing supports ICE's actual color value model instead of only a fixed palette.
4. Theme preview is non-persistent until Apply.
5. User messages expose formatting, text styles, colors, border style/color, X/Y padding, and fit-to-content.
6. The editor/input border can be disabled or styled without replacing the full editor.
7. Thinking/working animation frames and speed are persisted and editable.
8. Thinking verbs/labels are persisted and editable.
9. Thinking-block presentation is configurable without changing reasoning visibility semantics.
10. Markdown tables expose multiple render styles through one shared layout algorithm.
11. Input pattern highlighting exists with bounded runtime behavior; unsafe arbitrary regex is not accepted into the render hot path.
12. Appearance changes are live-previewable, cancellable, and restart-persistent after Apply.
13. Opening or navigating customization creates no files and writes no settings.
14. Profiles can bundle an optional theme plus appearance settings.
15. Import/export is data-only, validated, bounded, and collision-safe.
16. Default appearance matches the W0 baseline closely enough that the feature is visually opt-in.
17. Targeted tests and the required repository check pass.
18. Interactive tmux smoke testing verifies preview, cancel, apply, restart, and ordinary chat flow.

## 20. Recommended Delivery Order

Do not start with highlighters or community theme download.

Best dependency order:

```text
W0 baseline
  -> W1 settings
  -> W2 preview transaction
  -> W3 native shell + theme editor
  -> W4 user messages
  -> W5 editor/input
  -> W6 thinking indicator/verbs
  -> W7 thinking block
  -> W8 tables
  -> W9 highlighters
  -> W10 profiles/import/export/migration UX
```

W1-W2 are the critical architecture. Once they are correct, the remaining presentation domains become bounded adapters/components instead of one giant theming rewrite.

## 21. Specific Treatment of `sol-brief-theming-audit.md`

Do not discard the audit. Reclassify it as a compatibility/legacy-extension repair note.

Its findings remain useful, especially:

- opening a group should not persist a theme switch;
- failed activation must not write base-theme state first;
- token alias resolution must match core semantics;
- the fixed editor palette does not represent the full theme value model;
- non-interactive invocation should not create surprising state;
- docs/schema drift around optional thinking tokens should be corrected;
- automatic system-theme logic must not overwrite user customization;
- preview selection should use the native non-persisting preview path.

However, fixing those findings is not the new product architecture. The native appearance project supersedes the example extension as the primary UX.

## 22. Final Architecture Decision

The target model is:

```text
                         +---------------------------+
                         | SettingsManager            |
                         | global theme + appearance  |
                         +-------------+-------------+
                                       |
                          validated persisted config
                                       |
                  +--------------------v--------------------+
                  | InteractiveAppearanceController         |
                  | effective + preview overlay + rollback  |
                  +---------+----------------+---------------+
                            |                |
                    palette/theme       presentation
                            |                |
                  +---------v----+   +-------v-----------------------------+
                  | ThemeController|   | User msg / editor / thinking /     |
                  | existing       |   | markdown table / highlighter styles|
                  +---------+----+   +-------+-----------------------------+
                            |                |
                            +--------+-------+
                                     |
                              actual TUI components
                                     |
                             representative preview
```

This is a better fit for ICE than cloning TweakCC's patch-oriented internals. It preserves ICE's existing theme machinery, uses the native settings/runtime seams already present, and gives the user the customization depth they were actually asking for.
