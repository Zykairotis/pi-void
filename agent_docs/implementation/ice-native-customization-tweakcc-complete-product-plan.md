# ICE Native Customization — Complete TweakCC-Grade Presentation Product Plan

**Status:** new gap-closure master plan after source-level re-audit  
**Date:** 2026-09-12  
**Target repository:** `/home/mewtwo/Zks/ice`  
**Target worktree:** `/home/mewtwo/Zks/ice/.worktrees/theme-tuner`  
**Branch:** `theme-tuner`  
**Supersedes as completion authority:** the remaining unchecked/ambiguous presentation work in:

- `agent_docs/implementation/ice-native-customization-tweakcc-parity-plan.md`
- `agent_docs/implementation/ice-native-customization-tweakcc-follow-up-plan.md`

Those plans remain useful historical design records. This plan is the completion authority for the actual product surface because the earlier plans measured parity mostly against the appearance domains that had already been modeled, not against the full interactive ICE renderer graph.

---

## 0. Executive verdict

The current implementation has a strong native foundation, but it is **not yet a complete TweakCC-grade customization product**.

A more accurate completion estimate after the deeper audit is:

| Area | Current estimate | Why |
|---|---:|---|
| Persistence / validation / core draft mechanics | 88–90% | Appearance preview controller, theme draft session, validation, restart persistence, bounded import/export foundations exist. |
| Existing v1 fields exposed somehow | ~90% | Most v1 fields have a row in `/customize`. |
| Transaction correctness across the whole customizer | ~70% | Appearance/theme are mostly transactional, but profile CRUD writes immediately and automatic theme mode is not represented correctly. |
| Customizer navigation / editor UX | ~55% | Submenus close after each edit; no real split-pane; no breadcrumbs/dirty state; large token lists are linear. |
| Preview fidelity | ~45% | User message and Markdown table are real; input is mostly a summary; tool/bash/footer/chrome/highlighters/assistant presentation are absent; animation is not fully wired. |
| Theme-editor usability | ~60% | Native token editing works, but there is no proper picker, grouped editor navigation, variable CRUD, automatic light/dark integration, or collision-resolution UI. |
| Breadth of customizable ICE UI surfaces | ~50–55% | v1 only models user message, input, thinking, table style, highlighters. Major runtime surfaces are unmodeled. |
| Profiles / bundles as a polished product | ~55% | CRUD exists, but semantics, metadata, transaction behavior, collision UX, and auto-theme representation are incomplete. |
| Test / acceptance coverage for the finished product | ~40% | Good targeted v1 tests exist, but full renderer coverage, lifecycle/leak checks, v2 migration, auto-theme, wide layout, and install-level acceptance are incomplete. |
| **Overall intended finished product** | **~60–65%** | The backend is ahead of the product experience and renderer coverage. |

This lower percentage is deliberate. The previous ~65% estimate was already closer to reality than earlier optimistic numbers, but this audit found additional architectural gaps that should be counted before calling the feature complete.

---

# 1. What the previous plans missed or underweighted

## 1.1 The appearance schema was treated as the product boundary

The largest planning error was effectively assuming:

> if every field in `AppearanceSettingsV1` is configurable, the customization product is nearly complete.

That is false.

`packages/coding-agent/src/modes/interactive/appearance/appearance-types.ts:49-90` currently models only:

- user message presentation,
- input box border/padding/colors,
- thinking indicator,
- thinking verbs/label,
- thinking block,
- Markdown table style,
- input highlighters.

ICE renders considerably more presentation surfaces than this.

Unmodeled first-party surfaces include:

- assistant response container/padding/presentation,
- Markdown element presentation beyond color tokens + table border family,
- tool execution cards,
- Bash execution blocks,
- diff presentation,
- extension/custom/system message cards,
- retry/compaction/branch-summary status indicators,
- footer/statusline,
- selector/settings/autocomplete chrome,
- scrollbars,
- agent/subagent switcher UI,
- startup/status notifications and other interactive chrome.

Therefore v1 field coverage is not equivalent to product parity.

---

## 1.2 Profile CRUD violates the apparent root Apply/Cancel transaction

The root customizer advertises a single draft with Apply/Cancel semantics, but profile library operations currently have direct filesystem side effects:

- `interactive-mode.ts:5167-5183` -> `saveProfile(...)`
- `interactive-mode.ts:5185-5192` -> `renameProfile(...)`
- `interactive-mode.ts:5194-5201` -> `duplicateProfile(...)`
- `interactive-mode.ts:5203-5209` -> `deleteProfile(...)`

`appearance-profiles.ts:82-145` confirms these functions write/rename/unlink files immediately.

Result:

1. Open `/customize`.
2. Save/rename/delete a profile.
3. Press Esc/Cancel at the root.
4. Appearance/theme preview rolls back, but the profile filesystem mutation remains.

That contradicts the mental model of one transactional customization session.

**This is P0.**

---

## 1.3 Automatic light/dark theme settings are not represented by the theme draft

`/settings -> Theme` already supports an automatic mode encoded as a pair such as:

```text
light-theme/dark-theme
```

But `ThemeDraftSession` takes one concrete theme name:

- `theme-draft-session.ts:49-52`

If the initial string is not literally in `getAvailableThemes()`, it silently chooses the first available theme.

Consequences:

- entering `/customize` while automatic theme mode is active can preview/edit the wrong concrete theme,
- root Apply can collapse an automatic pair into one fixed theme,
- profiles cannot faithfully round-trip automatic theme mode because `AppearanceProfileV1.theme` is only `string`, with no typed fixed-vs-automatic representation,
- `/settings -> Theme` and `/customize -> Theme` behave like separate theme products.

**This is P0.**

---

## 1.4 Runtime propagation is intentionally narrow today

`interactive-mode.ts:4564-4586` currently applies appearance to:

- input border style/padding,
- input highlighters,
- default Markdown table style,
- existing user message components,
- existing assistant thinking-block appearance.

This means adding fields to the schema is not enough. Every new first-party renderer needs a deliberate runtime integration point and live-preview invalidation path.

---

## 1.5 The preview component is not yet a true representative ICE scene

`appearance-preview.ts` currently covers:

- a real `UserMessageComponent`,
- a text summary for the input box,
- working/thinking text,
- a Markdown table.

It does **not** represent:

- an actual editable `CustomEditor`,
- assistant Markdown response presentation,
- a tool card in pending/success/error states,
- Bash execution,
- diff output,
- custom/system cards,
- input highlighter rendering,
- footer/statusline,
- selector/autocomplete chrome,
- subagent switcher/status UI.

Additionally, `AppearanceCustomizerComponent` currently constructs the preview as:

```ts
new AppearancePreviewComponent(this.draft)
```

rather than passing the live `TUI`, so the Loader-based animation path is not fully connected to the actual customizer lifecycle.

---

## 1.6 Nested editors are technically functional but product-hostile

Both `editorShell()` and `themeEditorShell()` call the parent `done(...)` after a single field change.

That means a user editing one section repeatedly performs:

```text
enter section -> edit one field -> kicked back -> re-enter section -> edit one field -> ...
```

This becomes particularly bad for custom themes where tens of tokens exist.

A TweakCC-grade editor needs persistent section sessions, not one-shot SettingsList rows.

---

## 1.7 Settings ownership is split across three entry points

Today there are overlapping controls across:

1. `/settings` low-level appearance rows,
2. `/settings -> Appearance`,
3. `/settings -> Theme`,
4. `/customize`.

The low-level `/settings` rows still include:

- Table style,
- Input border,
- Thinking interval,
- Apply appearance,
- Cancel appearance preview.

Those use the older mini-preview flow (`interactive-mode.ts:4589-4646`, `5360-5368`) while the full customizer has its own transaction.

This creates two preview mental models and makes ownership unclear.

Do **not** remove intentional existing settings silently. The plan below migrates/aliases them first; actual removal requires explicit approval under repo rules.

---

## 1.8 Import collision handling is validation, not UX

Current theme/bundle import mostly does:

> name already exists; manually rename it in JSON.

A finished editor needs a collision resolution step:

- rename incoming,
- explicitly replace existing custom item,
- cancel.

The user should not have to hand-edit serialized JSON just to import a theme/profile.

---

## 1.9 Theme variables are editable, but not manageable

`ThemeDraftSession.setVariable()` can create/update a variable programmatically, but the current theme UI only renders rows for variables that already exist.

Missing UI operations:

- create variable,
- rename variable safely while updating references or refusing when referenced,
- delete variable with reference checks,
- reset variable,
- inspect where a variable is used.

---

## 1.10 Profiles have schema metadata that the UI does not expose

`AppearanceProfileV1` already contains optional `description`, but the editor does not expose it.

`AppearanceBundleV1` contains:

- name,
- description,
- author,
- themeName,
- theme,
- appearance.

Current export hardcodes a generic name and does not provide a proper metadata/editor workflow.

---

## 1.11 The previous plan did not define version migration for the wider schema

Expanding from the narrow v1 model to complete presentation coverage should not be done by silently stuffing many new required keys into `AppearanceSettingsV1`.

We need an explicit v1 -> v2 migration and compatibility contract.

---

## 1.12 Extension precedence was not specified deeply enough

ICE supports extension-supplied renderers/components. Native appearance must not unexpectedly restyle or corrupt extension components that intentionally own their rendering.

We need explicit precedence:

```text
extension-owned renderer override
> runtime state override
> appearance presentation rule
> semantic theme token
> built-in default
```

Default shells around extension content may use appearance, but extension-owned content remains extension-owned unless the extension opts in.

---

# 2. TweakCC reference: what ICE should and should not copy

The public TweakCC reference was rechecked during this audit. Its current public schema includes a broad theme color map, configurable thinking phases/speed/mirroring, user-message border/padding/fit configuration, input-box configuration, and pattern-highlighter configuration. Its UI/README also advertises a graphical HSL/RGB color picker and custom spinner/verb editing.

Useful presentation ideas to retain:

- rich theme editing,
- HSL/RGB/HEX authoring,
- live color preview,
- custom thinking phases and speed,
- user-message presentation,
- input presentation,
- pattern highlighters,
- discoverable categories rather than raw config editing.

ICE must **not** reproduce TweakCC's patching architecture.

We also intentionally do **not** make the following part of this presentation plan:

- system prompt editing,
- tool permission/toolset semantics,
- provider/model routing,
- context-limit modification,
- arbitrary JS/shell customization hooks,
- binary/source patching,
- repo-controlled appearance auto-activation,
- remote marketplace execution,
- subagent behavior/model-routing changes.

The target is **TweakCC-grade presentation depth with ICE-native contracts**, not feature-for-feature cloning of unrelated behavior.

### Highlighter safety divergence

TweakCC supports regex pattern highlighters. ICE v1 intentionally uses bounded literal matching to avoid an arbitrary-regex hot path in the editor.

For this plan:

- literal matching remains the default and P0/P1 implementation,
- add safe quality-of-life fields such as case sensitivity and bounded `{match}` formatting,
- raw JavaScript regex on every keystroke remains out of scope,
- a future regex mode is only acceptable with an explicit bounded/safe engine and performance tests.

---

# 3. Product definition

## 3.1 Theme

A **Theme** is the semantic color palette.

Examples:

- accent,
- text,
- muted/dim,
- borders,
- message colors,
- tool states,
- Markdown colors,
- syntax colors,
- diff colors,
- thinking-level colors.

Theme answers:

> What semantic color should this role use?

---

## 3.2 Appearance

**Appearance** defines structural and presentation behavior.

Examples:

- border families,
- padding,
- fit-to-content,
- visible chrome,
- text styles,
- spinner frames/speed,
- Markdown component presentation,
- tool/Bash card presentation,
- footer layout,
- highlighter rules.

Appearance answers:

> How should this component be presented?

---

## 3.3 Theme selection

Theme selection is a separate typed concept:

```ts
type AppearanceThemeSetting =
  | { mode: "fixed"; theme: string }
  | { mode: "automatic"; light: string; dark: string };
```

The legacy SettingsManager slash encoding can remain an internal persistence adapter for backward compatibility, but the customizer must never reason about automatic mode as an opaque slash-delimited string.

---

## 3.4 Appearance Profile

An **Appearance Profile** is a named, user-owned preset that may contain:

- appearance values,
- optional theme setting,
- optional description,
- future-safe metadata.

A profile is data only.

---

## 3.5 Customization Session

The customizer owns one **Customization Draft Session** spanning:

- appearance draft,
- theme selection draft,
- staged custom-theme file operations,
- staged profile-library operations,
- import collision resolutions.

Root Apply commits the staged transaction.

Root Cancel/Esc produces **zero persistent changes** from anything staged inside the session.

This is the simplest mental model and should be enforced consistently.

---

# 4. Non-negotiable invariants

1. **No patching.** All behavior is first-party ICE code/data.
2. **No executable appearance data.** No JS, shell, template evaluation, or arbitrary functions.
3. **No project-controlled appearance activation in v2.** Appearance remains global user preference unless explicitly reconsidered later.
4. **Default appearance is pixel/terminal-cell compatible with current ICE behavior.** Installing the feature must not visually redesign ICE by default.
5. **Semantic output is unchanged.** Print mode, JSONL, RPC, SDK, transcript semantics, and model/tool payloads must not change because appearance changed.
6. **Preview is write-free.** No settings/theme/profile disk writes before explicit root Apply.
7. **Cancel is exact.** Cancel restores the captured baseline theme setting + appearance + runtime globals.
8. **Extension-owned renderers retain precedence.** Native appearance styles default ICE shells, not arbitrary extension internals.
9. **All user strings are bounded.** Formats, names, frames, verbs, patterns, metadata, imported JSON.
10. **ANSI/Unicode width correctness is mandatory.** Emoji/CJK/combining characters must not break box widths or cursor position.
11. **Timers/listeners must be disposable.** No Loader or preview timer leak after closing `/customize`.
12. **No silent destructive overwrite.** Theme/profile name collisions always require an explicit replace decision.
13. **No silent migration data loss.** Unknown/legacy persisted data must be migrated intentionally and tested.
14. **Do not remove existing intentional settings without approval.** Migrate/alias first, then obtain explicit approval before deleting public controls.

---

# 5. Full renderer-surface gap matrix

| Surface | Current state | Missing target | Priority |
|---|---|---|---|
| Customizer shell | Stacked SettingsList + preview | persistent section editor, breadcrumbs, dirty state, wide split-pane, section reset, validation state | P0 |
| Transaction | appearance + themes mostly staged | profiles staged too; automatic theme typed; one atomic session | P0 |
| Theme selection | fixed customizer, automatic legacy Settings menu | unified fixed/automatic mode | P0 |
| Theme editor | token/var text rows, clone/rename/delete | grouped navigation, picker, search, var CRUD, named clone/create, collision UI, dirty indicators | P1 |
| User messages | strong v1 coverage | persistent editor, presets, per-section reset, better live preview/accessibility | P1 |
| Input editor | border/padding/idle-active color | real editor preview, runtime-state precedence visualization, cursor/chevron/chrome options | P1 |
| Thinking spinner | frames/speed/mirror/color | richer preset browser, list editor, actual animation lifecycle, per-state reuse | P1 |
| Thinking verbs | pipe text + presets | item editor, add/delete/reorder, live cycling, validation | P1 |
| Thinking block | visibility/label/styles/color | section reset, richer container presentation if desired | P1 |
| Assistant message | not modeled | padding/container presentation + Markdown-driven text presentation | P1 |
| Markdown | table style + theme colors | headings, emphasis, inline code, code blocks, quotes, lists, links, HR, table presentation | P1 |
| Tool execution | theme colors only | card padding/shell, title/output styles, pending/success/error presentation | P1 |
| Bash execution | hardcoded presentation + theme role | border family/color, header/output/status presentation, padding, spinner/status | P1 |
| Diffs | 3 theme colors | richer added/removed/context presentation; optional word-level roles | P1/P2 |
| Custom/system cards | theme colors, fixed Box | border/padding/label/text presentation; shared card styles | P1 |
| Retry/compaction/summary status | hardcoded status renderer | shared status indicator appearance with per-kind overrides | P1 |
| Footer/statusline | hardcoded composition | visibility/order/separator/styles/colors; width-safe composition | P2 |
| Selector/settings chrome | global baked themes | border/selected-row/hint/description appearance | P2 |
| Autocomplete | selectedBg + existing max-visible setting | chrome appearance + ownership consolidation | P2 |
| Scrollbars | theme token + existing behavior setting | optional track/thumb presentation; keep behavior semantic | P2 |
| Agent/subagent switcher | theme roles only | selected/status/attention appearance | P2 |
| Startup/banner/status notices | mostly hardcoded | optional small presentation surface; preserve quietStartup semantics | P2 optional |
| Input highlighters | literal rules, strong backend | dedicated rule editor, live test text, case sensitivity, bounded format, clearer reorder/delete | P1 |
| Profiles | CRUD works, immediate writes | staged transaction, description/theme-setting support, reset/default behavior, collision UX | P0/P1 |
| Import/export | JSON text inputs | metadata, collision resolver, validation preview, copy/save/import ergonomics | P1 |
| Preview scene | partial | actual representative components and scene selector | P0/P1 |
| Migration | v1 only | v1->v2 deterministic migration, profile/bundle versioning | P0 |
| Acceptance | targeted v1 tests | lifecycle, migration, auto-theme, full runtime surfaces, installed-build smoke | P0/P1 |

---

# 6. Target data model: Appearance v2

Do not mutate v1 in place into a giant implicit schema. Introduce an explicit v2 with deterministic migration.

The following is a design target, not a mandate to use these exact TypeScript names if implementation constraints suggest a cleaner shape.

```ts
interface AppearanceSettingsV2 {
  version: 2;

  userMessage: UserMessageAppearance;
  assistantMessage: AssistantMessageAppearance;
  inputBox: InputBoxAppearance;

  thinking: {
    indicator: IndicatorAppearance;
    label: ThinkingLabelAppearance;
    block: ThinkingBlockAppearance;
  };

  statusIndicators: {
    working: StatusIndicatorAppearance;
    retry: StatusIndicatorAppearance;
    compaction: StatusIndicatorAppearance;
    branchSummary: StatusIndicatorAppearance;
  };

  markdown: MarkdownAppearance;
  tools: ToolAppearance;
  bash: BashAppearance;
  diff: DiffAppearance;
  systemCards: SystemCardAppearance;
  footer: FooterAppearance;
  chrome: ChromeAppearance;
  subagentChrome: SubagentChromeAppearance;

  inputHighlighters: InputHighlighterRuleV2[];
}
```

## 6.1 Shared primitive types

Create reusable primitives instead of multiplying near-identical component-specific ad hoc unions.

```ts
type AppearanceTextStyle =
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "inverse";

type AppearanceColor =
  | { kind: "theme"; token: string }
  | { kind: "custom"; value: string }
  | { kind: "terminal-default" }
  | { kind: "none" };

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

interface TextPresentation {
  foreground: AppearanceColor;
  background?: AppearanceColor;
  styles: AppearanceTextStyle[];
}
```

Where a component only supports a subset, validation narrows the allowed border families.

## 6.2 Assistant message appearance

Recommended minimum:

```ts
assistantMessage: {
  paddingX: number;
  paddingY: number;
  background: AppearanceColor;
  borderStyle: AppearanceBorderStyle;
  borderColor: AppearanceColor;
}
```

Do **not** add a content-rewriting `{message}` format for assistant output. Model content must remain semantically untouched. Styling belongs in the container and Markdown renderer.

## 6.3 Markdown appearance

At minimum model:

```ts
markdown: {
  body: TextPresentation;
  headings: {
    h1: TextPresentation;
    h2: TextPresentation;
    h3: TextPresentation;
    h4: TextPresentation;
    h5: TextPresentation;
    h6: TextPresentation;
  };
  strong: TextPresentation;
  emphasis: TextPresentation;
  strikethrough: TextPresentation;
  link: TextPresentation;
  linkUrl: TextPresentation;
  inlineCode: TextPresentation & { paddingX?: 0 | 1 };
  codeBlock: {
    text: TextPresentation;
    background: AppearanceColor;
    borderStyle: AppearanceBorderStyle;
    borderColor: AppearanceColor;
    paddingX: number;
    paddingY: number;
    languageLabel: TextPresentation;
  };
  quote: {
    text: TextPresentation;
    borderStyle: AppearanceBorderStyle;
    borderColor: AppearanceColor;
    paddingX: number;
  };
  listBullet: TextPresentation;
  horizontalRule: TextPresentation;
  tableStyle: AppearanceTableStyle;
}
```

Do not change Markdown meaning. Only presentation is customizable.

## 6.4 Tool appearance

Recommended minimum:

```ts
tools: {
  paddingX: number;
  paddingY: number;
  title: TextPresentation;
  output: TextPresentation;
  states: {
    pending: { background: AppearanceColor };
    success: { background: AppearanceColor };
    error: { background: AppearanceColor };
  };
}
```

Optional P2:

- border family/color,
- compact-vs-roomy spacing preset,
- collapsed preview line count if and only if treated purely as display behavior.

Do not let appearance alter tool input/output data.

## 6.5 Bash appearance

Recommended:

```ts
bash: {
  borderStyle: AppearanceBorderStyle;
  borderColor: AppearanceColor;
  paddingX: number;
  command: TextPresentation;
  output: TextPresentation;
  status: TextPresentation;
  indicator?: IndicatorAppearance;
}
```

The current `bashMode` semantic color can remain the default theme reference.

## 6.6 Diff appearance

Minimum:

```ts
diff: {
  added: TextPresentation;
  removed: TextPresentation;
  context: TextPresentation;
  addedWord?: TextPresentation;
  removedWord?: TextPresentation;
}
```

Word-level roles are optional until the renderer actually emits word-level segments.

## 6.7 System/custom cards

Create a shared card appearance used by:

- extension custom messages when they do not provide a custom renderer,
- branch summary cards,
- compaction summary cards,
- other first-party labeled cards.

Recommended:

```ts
systemCards: {
  borderStyle: AppearanceBorderStyle;
  borderColor: AppearanceColor;
  background: AppearanceColor;
  paddingX: number;
  paddingY: number;
  label: TextPresentation;
  body: TextPresentation;
}
```

Allow named subtype overrides later only if there is a real user need.

## 6.8 Status indicators

Generalize the good thinking-indicator work into a reusable status-indicator presentation:

```ts
interface IndicatorAppearance {
  frames: string[];
  intervalMs: number;
  reverseMirror: boolean;
  color: AppearanceColor;
}

interface StatusIndicatorAppearance {
  indicator: IndicatorAppearance;
  label: TextPresentation;
}
```

Then working/retry/compaction/branch-summary can share machinery while retaining different defaults.

## 6.9 Footer appearance

Separate information semantics from presentation.

Safe presentation fields:

- field visibility,
- field order,
- separator string with strict length bound,
- primary/secondary/muted colors,
- styles,
- compact/normal density.

Suggested display fields:

```text
cwd
branch
session-name
usage/tokens
cache-hit
cost
context-percent
provider
model
thinking-level
extension-statuses
agent-view
```

Do **not** move functional thresholds (e.g. actual compaction behavior) into appearance.

Every footer combination must remain width bounded and degrade by deterministic priority at narrow widths.

## 6.10 Chrome appearance

Avoid individual styling schemas for every selector. Define shared application chrome:

```ts
chrome: {
  borderStyle: AppearanceBorderStyle;
  borderColor: AppearanceColor;
  selectedForeground: AppearanceColor;
  selectedBackground: AppearanceColor;
  selectedStyles: AppearanceTextStyle[];
  description: TextPresentation;
  hint: TextPresentation;
  scrollbarThumb: AppearanceColor;
}
```

Autocomplete, SettingsList, SelectList, and common selectors can consume this through shared adapters.

Do not force extension-owned components to consume it unless they opt in.

## 6.11 Subagent chrome

P2 presentation-only fields:

- active selected row,
- running/completed/failed/attention colors,
- compact status labels,
- view-switcher border/selected presentation.

Do not change subagent orchestration or model routing in this plan.

---

# 7. Appearance v1 -> v2 migration

## 7.1 Migration rules

Implement one pure migration function:

```ts
migrateAppearanceV1ToV2(v1): AppearanceSettingsV2
```

Rules:

- every v1 value maps exactly to the corresponding v2 field,
- every new v2 field gets a default that reproduces current ICE behavior,
- opening settings does not rewrite disk merely because a migration was read,
- the next explicit appearance save may persist v2,
- v1 profiles/bundles remain importable,
- v2 profiles/bundles export as version 2,
- unsupported future versions fail explicitly rather than being normalized silently.

## 7.2 Preserve unknown data where appropriate

If SettingsManager currently owns an object with unrelated keys, do not replace the enclosing object wholesale and drop unknown values.

Add round-trip tests for unrelated settings before/after appearance persistence.

## 7.3 Compatibility tests

Fixtures:

- no appearance key,
- minimal v1,
- fully populated v1,
- malformed v1,
- v2,
- future version,
- v1 profile,
- v1 bundle,
- v2 profile/bundle.

---

# 8. P0 — Fix transaction semantics before adding more fields

## P0.1 Introduce `CustomizationDraftSession`

Create an orchestrating draft object that owns:

- baseline appearance,
- draft appearance,
- baseline typed theme setting,
- draft typed theme setting,
- `ThemeDraftSession`,
- staged profile operations,
- dirty metadata per section.

Suggested path:

```text
packages/coding-agent/src/modes/interactive/appearance/customization-draft-session.ts
```

Root customizer should depend on this instead of separately owning raw appearance + ThemeDraftSession.

## P0.2 Stage profile CRUD

Replace immediate customizer profile filesystem writes with `ProfileDraftSession` or equivalent operation log.

Stage operations:

```text
create
replace
rename
duplicate
delete
```

On Apply:

1. validate appearance,
2. validate typed theme setting,
3. validate all theme entries,
4. validate all profile entries/operation collisions,
5. write new/changed theme destinations,
6. write new/changed profile destinations,
7. persist current theme setting,
8. persist appearance,
9. delete old theme/profile sources last,
10. refresh runtime.

On failure, prefer preserving original files over perfect filesystem atomicity.

On Cancel, perform zero writes.

## P0.3 Typed automatic theme selection

Add parser/serializer adapters around the current SettingsManager representation.

The customizer operates only on:

```ts
{ mode: "fixed", theme }
```

or:

```ts
{ mode: "automatic", light, dark }
```

When automatic mode is active:

- Preview should use the terminal's currently detected light/dark state.
- Theme editor can switch between editing the light member and dark member.
- Apply preserves the pair.
- Profiles can carry the pair.
- Imported bundles can carry the pair.

## P0.4 Root Reset must reset the full draft

Current Reset Draft resets appearance only.

Target Reset Draft restores:

- appearance to captured persisted baseline,
- theme selection to captured baseline,
- all staged theme edits/creates/deletes/renames,
- all staged profile operations,
- live preview.

It does not close the editor and performs no writes.

## P0.5 Commit ordering and failure behavior

Document and test exact persistence ordering.

Do not create a state where an old custom theme/profile is deleted before the replacement destination exists.

If appearance persistence fails after a new custom theme is written, report the partial state clearly and leave the previous source intact whenever possible.

Consider small journal/rollback metadata only if normal write-ordering cannot make failures safe enough; do not overengineer before tests prove it necessary.

---

# 9. P0/P1 — Redesign the customizer shell

## 9.1 Persistent nested editor

Replace the one-change-then-`done()` pattern.

The section editor remains open after changes.

Expected interaction:

```text
/customize
  -> User messages
       Format
       Border
       Padding X
       Padding Y
       Foreground
       Background
       ...
       Reset section
       Back
```

Changing Border updates the draft and preview but **does not leave User messages**.

Esc returns one level.

Esc at root cancels the full draft.

## 9.2 Explicit navigation state

Do not build increasingly nested anonymous `Container`s whose lifetime is difficult to reason about.

Prefer a small navigation state machine:

```ts
root
section(user-message)
section(markdown)
theme-root
theme-group(Core)
color-editor(path)
profile-list
profile-editor(name)
highlighter-list
highlighter-editor(id)
```

Store focus and scroll position per screen where practical.

## 9.3 Breadcrumbs

At the top:

```text
Appearance > Theme > Markdown > mdCodeBlockBorder
```

or:

```text
Appearance > Input highlighters > TODO
```

This matters once the editor has real depth.

## 9.4 Dirty markers

Show whether a section differs from the persisted baseline.

Examples:

```text
Theme                    dark-custom  *
User messages            modified     *
Input box                 default
Markdown                  modified     *
```

Dirty state should be derived from draft vs baseline, not maintained by fragile manual booleans where possible.

## 9.5 Per-section reset

Every major section gets:

- Reset to persisted,
- Reset to built-in defaults where those differ.

Theme token editor gets:

- reset one token,
- reset group,
- reset whole custom theme to clone base.

## 9.6 Wide split-pane

At a chosen threshold (recommend >= 104 columns after tmux testing):

```text
controls / navigation    |    live preview
```

Below threshold:

```text
controls

live preview
```

Requirements:

- ANSI-aware clipping,
- CJK/emoji-aware width,
- no line exceeds terminal width,
- separator does not inherit stray SGR styles,
- focus behavior identical in both layouts.

Test at:

```text
40
60
80
100
104
120
160
```

## 9.7 Search

Search should operate at two levels:

- root section/filter search,
- theme-token search within large semantic groups.

Do not force a single search box to flatten every nested field into one giant list.

---

# 10. P1 — Build a real color editor

The current preset + exact-text rows are a safe backend but not a TweakCC-grade authoring experience.

## 10.1 Color modes

The editor should support:

```text
Semantic theme token
HEX
RGB
HSL
Terminal index
Terminal default
None (when role permits)
```

`None` must be role-validated. For example a foreground role should not accidentally accept a semantic absence if the renderer requires text.

## 10.2 Keyboard-first HSL/RGB picker

Do not depend on mouse input.

A terminal-friendly picker can show:

```text
Preview      ████████
Mode         HSL
H            274
S            61%
L            55%
HEX          #8f62c9
RGB          143, 98, 201
```

Controls:

- arrows: small step,
- modified arrows / explicit +/- rows: larger step,
- direct numeric text edit,
- semantic-token browser,
- Enter accepts into draft,
- Esc discards the local color edit and returns.

## 10.3 Text remains authoritative

Every picker value must have a lossless text form.

The picker is a convenience layer, not a second serialization model.

## 10.4 Effective terminal preview

If terminal capabilities are limited:

- preserve the user's truecolor value in config,
- optionally show a warning/effective approximation,
- do not destructively rewrite the stored color just because the current terminal is 256-color.

## 10.5 Contrast warnings

Optional but useful:

- warn when foreground/background contrast is likely unreadable,
- do not block the user unless text becomes literally invisible by a deterministic terminal rule,
- warnings are informational because terminal palettes vary.

---

# 11. P1 — Theme editor completion

## 11.1 Consolidate fixed and automatic mode

Theme screen starts with:

```text
Mode              Fixed / Automatic
Fixed theme       ...
```

or automatic:

```text
Light theme       ...
Dark theme        ...
Preview side      Current terminal / Light / Dark
```

Editing a custom light theme or dark theme must remain staged.

## 11.2 Create/clone naming flow

Do not auto-create `dark-custom`, `dark-custom2`, etc without giving the user control.

Provide:

- Clone selected...
- Create from dark...
- Create from light...
- optionally Create blank only if a complete valid default can be generated safely.

Ask for the destination name before staging.

## 11.3 Group semantic tokens

Keep groups such as:

```text
Core
Messages
Tools
Markdown
Diff
Syntax
Thinking levels
Chrome / new v2 roles if added
```

Entering a group shows only that group's tokens.

Do not render each token as three adjacent rows in one 100+ row flat list.

## 11.4 Token row UX

Each token row should show:

- token name,
- effective swatch,
- current native value,
- dirty marker.

Enter opens the color/native value editor.

Secondary action opens Reset.

## 11.5 Variable CRUD

Support:

- add variable,
- edit variable,
- rename variable,
- delete variable,
- show references,
- reset if cloned from a base with the same var.

When renaming:

- either update all references transactionally,
- or refuse with a clear list of references.

Do not create dangling references.

## 11.6 Theme import collision resolver

When imported name exists:

```text
Theme "foo" already exists
  Rename incoming
  Replace existing custom theme
  Cancel
```

Built-in themes are never replaced.

## 11.7 Theme validation feedback

Show validation errors in the current editor screen, not only as a root status message.

Examples:

- unknown variable,
- cyclic reference,
- invalid terminal index,
- malformed color.

Keep the previous valid draft value until the replacement validates.

---

# 12. P1 — User-message editor completion

Current backend coverage is already strong. Focus on product quality.

## Required controls

- format containing bounded `{message}` placeholder,
- text styles,
- foreground,
- background including none/default where valid,
- border family,
- border color,
- padding X/Y,
- fit-to-content,
- Reset section.

## Add presets

Useful non-authoritative presets:

```text
ICE default
Minimal
Outlined
Compact bubble
Full-width panel
```

Applying a preset only modifies the draft fields; all fields remain editable afterward.

## Preview cases

Preview at least:

- short ASCII,
- wrapping long text,
- emoji,
- CJK,
- combining characters,
- explicit newline,
- width 1/2 edge cases where border/padding consume most space.

---

# 13. P1 — Input editor completion

## 13.1 Use the actual editor presentation in preview

The current preview's text summary is insufficient.

Preview should instantiate the same border/padding/color presentation path as `CustomEditor` without accepting real user commands.

## 13.2 Expose state preview

ICE editor border has runtime precedence:

```text
extension/runtime override
> bash mode
> thinking level signal
> focused appearance active color
> idle appearance color
```

Provide preview state selector:

```text
Idle
Focused
Thinking low/medium/high/xhigh/...
Bash
```

This tells users why their active color might not be visible during a thinking-level state.

## 13.3 Consolidate existing editor padding setting

`editorPaddingX` already exists in SettingsManager while appearance also has `inputBox.paddingX`.

Choose one source of truth.

Recommended migration:

- appearance becomes presentation owner,
- legacy settings getter maps/migrates to appearance,
- `/settings` legacy row becomes an alias during transition,
- do not remove until explicit approval.

## 13.4 Chevron/prompt marker

TweakCC exposes an idle chevron color concept. ICE should only add a corresponding option if ICE's editor actually renders a stable prompt/chevron role.

Do not introduce a fake decorative concept solely to imitate another product.

---

# 14. P1 — Thinking + status indicator editor completion

## 14.1 Spinner list editor

Replace pipe-separated text as the primary UX with an item editor:

```text
Frames
  1  ⠋
  2  ⠙
  3  ⠹
  ...
Add frame
Delete
Move up/down
```

Keep exact pipe text import as an advanced shortcut if useful.

Bounds:

- max frame count,
- max grapheme/byte length per frame,
- no control-sequence injection.

## 14.2 Preset browser

Include curated built-in presets.

A 70+ `cli-spinners`-style catalog is useful but not required for the first correctness gate. If importing a third-party dataset:

- verify license,
- avoid adding a runtime dependency if a small data-only vendored subset is cleaner,
- ensure every frame renders safely in expected terminals.

## 14.3 Animated preview lifecycle

Pass the live TUI into preview.

`AppearancePreviewComponent.dispose()` must be called whenever:

- root customizer closes,
- selector is replaced,
- interactive mode stops.

Fake-timer test must prove no requests occur after dispose.

## 14.4 Verb list editor

Primary UX:

- add,
- edit,
- delete,
- reorder,
- cycle/random selection,
- format with `{verb}`,
- live rotating sample.

Keep exact pipe text as advanced import only.

## 14.5 General status indicator system

Reuse the same safe indicator presentation for:

- retry,
- compaction,
- branch summary,
- working.

Do not duplicate animation engines.

---

# 15. P1 — Assistant response and Markdown customization

This is one of the largest currently missing product areas.

## 15.1 Assistant container

Expose:

- horizontal/vertical padding,
- optional background,
- optional border family/color.

Default is identical to current plain assistant output.

## 15.2 Markdown element editor

Sections:

```text
Body
Headings
Bold / Strong
Italic / Emphasis
Strikethrough
Links
Link URLs
Inline code
Code blocks
Quotes
Lists
Horizontal rules
Tables
```

Each uses shared TextPresentation/color editor where applicable.

## 15.3 Heading levels

Allow either:

- one shared heading style with optional per-level overrides,
- or explicit H1-H6 rows inheriting from shared heading defaults.

Avoid requiring six duplicated configs when user wants one style.

## 15.4 Code blocks

High-value options:

- foreground/background,
- border family/color,
- padding,
- language label presentation.

Syntax token colors remain Theme responsibilities.

## 15.5 Quotes

Expose:

- text style/color,
- quote border/marker color,
- padding,
- safe border family where supported.

## 15.6 Markdown renderer API

Avoid new process-global mutable style state beyond strictly scoped compatibility shims.

Preferred design:

```ts
new Markdown(text, theme, options)
```

or an equivalent instance-scoped presentation object.

The current process-global table default should become a compatibility fallback, not the long-term v2 architecture.

---

# 16. P1 — Tool execution customization

`ToolExecutionComponent` currently has a fixed layout with semantic theme colors.

## Add appearance adapter for the default shell

Expose:

- padding X/Y,
- title style/color,
- output style/color,
- pending/success/error backgrounds,
- optional border style/color if supported cleanly by the TUI Box path.

## Extension precedence

If an extension provides `renderCall` / `renderResult` or its own component presentation:

- preserve the extension content,
- apply only the default outer shell if that is already ICE-owned,
- never rewrite extension ANSI/content data.

## Preview

Show three representative tool states:

```text
Pending
Success
Error
```

Use real default tool shell rendering with bounded fake data.

---

# 17. P1 — Bash execution customization

Current Bash presentation has distinct visual behavior and deserves a dedicated section.

Expose:

- border family,
- border color,
- padding,
- command/header style,
- output style,
- status style,
- running indicator appearance or a link to shared Status Indicators.

Preview states:

```text
Running command
Successful command
Failed command
Truncated output
```

Do not change command execution semantics or shell contents.

---

# 18. P1/P2 — Diff presentation

Theme already has basic diff semantic colors.

First pass:

- added color/style,
- removed color/style,
- context color/style.

Second pass only if renderer supports it naturally:

- word-added role,
- word-removed role,
- dimmed variants.

Do not clone TweakCC token names just for nominal parity if ICE's renderer does not have those semantic segments.

---

# 19. P1 — Custom/system card presentation

Unify first-party labeled cards around a shared presentation contract.

Targets include:

- custom extension messages using the default renderer,
- compaction summary,
- branch summary,
- other internal labeled notices.

Expose:

- background,
- label/body colors/styles,
- border,
- padding.

Extension custom renderers remain untouched unless opted in.

---

# 20. P2 — Footer/statusline customization

This was absent from the earlier parity plan but is a large, persistent part of ICE's UI.

## 20.1 Field visibility

Allow user-controlled display for stable footer fields:

- cwd,
- branch,
- session,
- tokens/usage,
- cache,
- cost,
- context percent,
- provider,
- model,
- thinking level,
- extension statuses,
- current agent view if applicable.

## 20.2 Ordering

Use a bounded list of known field IDs.

No arbitrary executable expression language.

## 20.3 Separator and styles

Allow:

- separator string with strict grapheme/byte bounds,
- primary/secondary/muted color roles,
- compact/normal density.

## 20.4 Narrow width degradation

Define priority tiers so a custom layout never causes uncontrolled overflow.

Example:

1. model / agent state,
2. context,
3. cwd/branch,
4. secondary usage metrics.

The user's custom order influences normal rendering, while hard width safety still wins.

---

# 21. P2 — Selector, SettingsList, autocomplete, and scrollbar chrome

The interactive UI uses repeated shared chrome; customize it through one coherent schema instead of per-screen hacks.

Expose:

- border family/color,
- selected row foreground/background/styles,
- hint/description style,
- scrollbar thumb color,
- optional visible-row density where an existing behavioral setting already exists.

## Ownership migration

Existing settings such as autocomplete max visible and fullscreen scrollbar behavior are currently SettingsManager settings.

Keep behavior settings where they are unless there is a strong reason to move them. Appearance can own only their visual styling.

Avoid turning Appearance into a dumping ground for unrelated behavior.

---

# 22. P2 — Agent/subagent UI presentation

Customize only the presentation layer:

- selected agent row,
- running/completed/failed/attention colors,
- view-switcher border/selection,
- compact status label styles.

Explicitly out of scope:

- agent model selection,
- delegation policy,
- token budgets,
- concurrency,
- orchestration behavior.

---

# 23. P2 optional — Startup and transient notices

Keep this deliberately small.

Possible fields:

- banner/accent color,
- compact/full visual banner style,
- transient status/error notice style.

`quietStartup` remains the functional control for verbosity.

Do not add arbitrary executable ASCII generators or figlet dependencies solely for TweakCC imitation unless separately approved.

---

# 24. P1 — Input highlighters v2

The current literal engine is a good safe base, but the editor UX and schema can improve.

## 24.1 Rule fields

Recommended v2:

```ts
interface InputHighlighterRuleV2 {
  id: string;
  name: string;
  enabled: boolean;
  matcher: {
    kind: "literal";
    pattern: string;
    caseSensitive: boolean;
  };
  format: string; // bounded, {match} only
  styles: AppearanceTextStyle[];
  foreground: AppearanceColor;
  background: AppearanceColor;
  priority: number;
}
```

`format` must only support a bounded literal placeholder such as `{match}`. No template evaluation.

## 24.2 Dedicated list/editor

Root screen:

```text
Input highlighters
  TODO        enabled
  FIXME       enabled
  ticket-id   disabled
  + Add
```

Enter a rule -> persistent rule editor.

## 24.3 Live test input

Provide a bounded editable sample line and render the exact source-coordinate decoration pipeline used by the real editor.

Test text is preview data only and should not become a command.

## 24.4 Deterministic overlaps

Document priority and tie-breaking exactly.

Recommended:

```text
lower priority number wins
then earlier rule order
then earlier source start
```

Keep total match/span budgets.

## 24.5 Regex remains deferred

If added later:

- use a safe/bounded engine or prevalidated subset,
- compile once per rule update, never on every render,
- enforce time/input limits,
- preserve cursor-source mapping.

---

# 25. P1 — Profiles as a real preset system

## 25.1 Typed schema v2

Recommended:

```ts
interface AppearanceProfileV2 {
  version: 2;
  name: string;
  description?: string;
  themeSetting?: AppearanceThemeSetting;
  appearance: DeepPartial<AppearanceSettingsV2> & { version: 2 };
}
```

Use a recursive typed partial strategy deliberately; do not rely on shallow merge behavior.

## 25.2 Profile editor

Expose:

- name,
- description,
- include theme? yes/no,
- include appearance sections selector,
- save as new,
- explicit replace,
- duplicate,
- rename,
- delete,
- reset current draft from profile,
- preview/apply into active draft.

## 25.3 Staged CRUD

As specified in P0, profile library operations remain in-memory until root Apply.

If product later needs a standalone Profile Manager with immediate commits, make it a separate explicitly immediate workflow rather than violating `/customize` transaction semantics.

## 25.4 Partial profiles

Allow profiles that only change:

- theme,
- Markdown,
- user messages,
- spinner,
- etc.

Loading a partial profile merges into current draft through a documented deep merge.

## 25.5 Collision UI

Same explicit choices:

```text
Rename incoming
Replace existing
Cancel
```

---

# 26. P1 — Bundle import/export completion

## 26.1 Bundle v2

Recommended:

```ts
interface AppearanceBundleV2 {
  version: 2;
  name?: string;
  description?: string;
  author?: string;
  themeSetting?: AppearanceThemeSetting;
  themes?: ThemeJson[];
  appearance?: DeepPartial<AppearanceSettingsV2> & { version: 2 };
  profiles?: AppearanceProfileV2[];
}
```

Multiple themes matter for automatic light/dark mode.

## 26.2 Metadata UI

Expose name/description/author as plain bounded data.

## 26.3 Import preview

Before staging imported data, show:

- appearance sections included,
- themes included,
- profiles included,
- collisions,
- validation warnings.

Then user resolves collisions and confirms staging.

## 26.4 Export UX

At minimum:

- Copy/show JSON in a non-destructive text view,
- Save bundle to a deterministic user-chosen or config-directory path if a safe file-flow is implemented,
- export current draft, not only persisted baseline.

Do not make editing a massive single-line input the primary export UX.

## 26.5 Bounds

Keep 256 KiB or revise only with explicit rationale.

Add separate limits for:

- number of themes,
- number of profiles,
- string lengths,
- highlighter count,
- frames/verbs.

---

# 27. P0/P1 — Representative live preview redesign

The preview should be a small deterministic scene renderer, not an approximate prose summary.

## 27.1 Scene tabs

Suggested scenes:

```text
Conversation
Markdown
Tools
Input
Chrome
Footer
```

On narrow terminals, select a scene rather than rendering everything vertically.

## 27.2 Conversation scene

Use real presentation code for:

- UserMessageComponent,
- AssistantMessageComponent,
- thinking block,
- custom/system card.

Use static fake content only.

## 27.3 Markdown scene

Render real Markdown containing:

- headings,
- bold/italic/strike,
- link,
- inline code,
- fenced code,
- quote,
- list,
- table,
- horizontal rule.

## 27.4 Tool scene

Render representative default ToolExecution/Bash shells without executing tools.

If the production components cannot safely be instantiated without runtime dependencies, factor their presentation layer into pure reusable render helpers consumed by both production and preview.

Do not create a second fake renderer that drifts from production.

## 27.5 Input scene

Use actual editor border/padding/decorations and a harmless local text buffer.

Never route preview keystrokes into command submission.

## 27.6 Chrome/footer scene

Render the same shared adapters used by SettingsList/SelectList/footer where practical.

## 27.7 Lifecycle

Every scene with timers/listeners exposes `dispose()`.

Customizer disposal cascades to all active preview children.

---

# 28. Settings consolidation plan

## Desired final entry points

```text
/settings -> Appearance
/customize
/theme   (fast theme picker may remain if already public/useful)
```

`/customize` and `/settings -> Appearance` open the same full customizer.

`/theme` or `/settings -> Theme` may remain a fast selection UI, but it must use the same typed fixed/automatic theme setting and same library.

## Legacy low-level rows

Current rows such as:

- Table style,
- Input border,
- Thinking interval,
- Apply appearance,
- Cancel appearance preview

should enter a migration period.

Phase A:

- make them delegate to the same appearance draft/persistence APIs,
- label them as quick controls if they remain useful.

Phase B:

- decide with explicit user approval whether to remove redundant rows.

Do not silently delete them in this implementation because repo policy requires approval before removing intentional functionality.

---

# 29. Runtime integration architecture

Avoid one giant `applyAppearanceToRuntime()` method that manually checks every child class forever.

## 29.1 Presentation adapters

Create focused adapters/helpers:

```text
appearance/render-user-message.ts
appearance/render-markdown.ts
appearance/render-tool.ts
appearance/render-bash.ts
appearance/render-footer.ts
appearance/render-chrome.ts
```

or equivalent component-owned setters.

## 29.2 Component setters

First-party components that live across preview changes should expose narrow setters such as:

```ts
setAppearance(...)
```

and invalidate themselves.

Do not rebuild the entire transcript for every color change if a component can update in place.

## 29.3 New components inherit current effective appearance

Every construction path for:

- new user message,
- assistant message,
- tool execution,
- Bash execution,
- custom/system card

must stamp current effective appearance at construction time.

Tests should cover both:

- existing component changes during live preview,
- newly created component while preview is active.

## 29.4 Process globals

Reduce mutable process-global presentation state.

For any unavoidable compatibility global:

- capture previous value,
- scope to interactive runtime,
- restore on stop,
- test two sequential InteractiveMode instances do not leak appearance.

---

# 30. Extension compatibility and precedence

## 30.1 Default rule

```text
extension custom renderer
> extension explicit style override
> runtime state override
> appearance
> theme
> built-in default
```

## 30.2 Custom tool renderers

Appearance may style the ICE-owned outer shell only if that shell already exists outside extension content.

Never inject ANSI inside arbitrary extension strings based on assumptions about source positions.

## 30.3 Custom footer providers/statuses

Footer appearance styles the placement/common chrome; extension-provided status text remains data.

## 30.4 Document opt-in hooks later

If extensions eventually need appearance-aware custom rendering, expose a read-only semantic appearance context rather than letting extensions mutate global appearance state.

---

# 31. Security and robustness requirements

## 31.1 String bounds

Define constants for:

- theme/profile names,
- descriptions/authors,
- format strings,
- spinner frame count/size,
- verbs count/size,
- highlighter patterns/format,
- footer separator,
- import JSON.

## 31.2 Control characters

Reject or sanitize dangerous terminal control characters in user-editable literals that are rendered directly.

Do not permit user config to inject arbitrary CSI/OSC escapes through spinner frames, labels, separators, or formats.

## 31.3 Color validation

Validate before preview mutation.

Malformed color input should not replace the last valid draft value.

## 31.4 Import

- JSON only,
- no executable config,
- bounded size,
- schema validation before staging,
- collision resolution before writes.

## 31.5 Highlighter hot path

Maintain hard budgets on:

- rules,
- pattern length,
- matches per rule,
- total spans.

Measure representative long-line rendering.

---

# 32. Accessibility / terminal capability requirements

Not every terminal supports the same color behavior.

Requirements:

- truecolor values remain lossless in config,
- terminal-index colors round-trip exactly,
- semantic references remain live across theme switching,
- terminal-default remains distinct from explicit black/white,
- `none` remains distinct from default background,
- keyboard-only customizer is fully usable,
- selected/focused state cannot rely on color alone; cursor/glyph/position must still identify focus,
- narrow terminal mode remains usable at 40 columns.

Optional P2:

- contrast warnings,
- color-blind-friendly built-in presets.

---

# 33. Performance requirements

## 33.1 Preview updates

A text/color edit should not rebuild every heavy component if only one section changed.

Use section-level invalidation where possible.

## 33.2 No render-loop timers

Loader timers request renders at configured interval only while visible.

Dispose immediately on close/screen replacement.

## 33.3 Large theme editor

Theme token search/grouping avoids rendering hundreds of SettingsList rows at once.

## 33.4 Highlighters

Benchmark a maximum-size input line with maximum allowed rules and ensure no perceptible typing lag.

## 33.5 Footer/chrome

Appearance must not introduce per-frame filesystem reads or JSON parsing.

All persisted config is parsed/validated at load/edit boundaries.

---

# 34. Implementation work packages

## G0 — Freeze baseline and add missing regression fixtures

**Goal:** capture current behavior before v2 changes.

Tasks:

- snapshots/render tests for current default user/assistant/tool/bash/custom-message/footer/selector output,
- fixture current appearance v1,
- fixture automatic theme setting,
- fixture current profiles/themes,
- prove noninteractive outputs unaffected.

Exit gate:

- current defaults have test evidence that v2 migration must reproduce.

---

## G1 — Unified typed theme setting + CustomizationDraftSession

Files likely touched:

```text
appearance/customization-draft-session.ts            new
appearance/theme-draft-session.ts
appearance/appearance-controller.ts
appearance/appearance-profiles.ts
interactive-mode.ts
settings-manager.ts
```

Tasks:

- typed fixed/automatic setting,
- parse/serialize legacy setting,
- stage profile CRUD,
- unified reset/apply/cancel,
- commit ordering,
- tests for zero writes before Apply.

Exit gate:

- Cancel after theme edits + profile create/delete/rename produces exact filesystem/settings baseline.

---

## G2 — Appearance v2 schema/migration/validation

Files likely:

```text
appearance/appearance-types.ts
appearance/appearance-defaults.ts
appearance/appearance-validate.ts
appearance/appearance-migrate.ts                     new
settings-manager.ts
appearance-profiles.ts
```

Tasks:

- v2 primitives,
- new presentation domains,
- v1->v2 migration,
- v1 profile/bundle import,
- future version rejection,
- default fidelity.

Exit gate:

- v1 persisted settings restart into identical visual defaults and save safely as v2 only on explicit write.

---

## G3 — Customizer navigation shell

Files:

```text
components/appearance-customizer.ts
components/appearance-preview.ts
possibly new appearance-editor/* components
```

Tasks:

- persistent nested screens,
- breadcrumbs,
- dirty state,
- per-section reset,
- root Reset All,
- split-pane,
- disposal,
- width-safe ANSI rendering.

Exit gate:

- edit 10 fields in one section without being kicked to root,
- 40/60/80/104/120/160 width tests green.

---

## G4 — Color editor + theme editor overhaul

Tasks:

- semantic/HEX/RGB/HSL/index/default/none modes,
- swatch/picker,
- grouped tokens,
- search,
- clone/create naming,
- variable CRUD,
- auto light/dark UI,
- import collision resolver,
- inline validation.

Exit gate:

- custom theme can be created entirely in TUI without editing raw JSON.

---

## G5 — Existing v1 domains UX completion

Tasks:

- user-message persistent editor/presets/reset,
- input actual preview/state preview,
- spinner item editor/presets/timer disposal,
- verb item editor,
- thinking block reset/polish,
- highlighter dedicated editor/test text.

Exit gate:

- all original F3-F6/F9 requirements satisfied through polished persistent UX.

---

## G6 — Assistant + Markdown presentation

Tasks:

- assistant container appearance,
- Markdown v2 adapter,
- headings/emphasis/code/quotes/lists/links/hr/tables,
- instance-scoped presentation,
- real preview scene.

Exit gate:

- representative Markdown document visibly reacts to draft without affecting source text.

---

## G7 — Tools + Bash + diff + system cards

Tasks:

- default tool shell appearance,
- Bash appearance,
- diff roles,
- shared card presentation,
- runtime live update and construction-time stamping,
- preview scenes.

Exit gate:

- pending/success/error tools and running/success/fail Bash states react live and restart persistently.

---

## G8 — Status indicators

Tasks:

- shared indicator abstraction,
- working/retry/compaction/branch-summary appearance,
- per-kind preview,
- timer ownership tests.

Exit gate:

- no duplicate animation implementation and no leaked timers.

---

## G9 — Footer + shared chrome + subagent chrome

Tasks:

- footer layout schema and width priority,
- SettingsList/SelectList/autocomplete visual adapter,
- scrollbar visual roles,
- subagent switcher/status presentation,
- extension precedence tests.

Exit gate:

- narrow/wide footer and selectors remain usable with extreme valid settings.

---

## G10 — Profiles and bundles v2

Tasks:

- descriptions,
- typed theme setting,
- partial section selection,
- staged CRUD,
- collision resolver,
- v1 import,
- v2 multi-theme bundle for auto mode,
- metadata UI.

Exit gate:

- create/export/import/apply/cancel/restart matrix passes without manual JSON surgery.

---

## G11 — Settings ownership consolidation

Tasks:

- make `/settings -> Appearance` and `/customize` identical entry point,
- make fast Theme UI use typed theme setting,
- delegate legacy low-level appearance quick controls to same APIs,
- prepare deprecation notes.

Do not delete public rows without explicit approval.

Exit gate:

- no two independent preview transactions can exist simultaneously.

---

## G12 — Full acceptance / installed-build smoke

Tasks:

- targeted unit suites,
- renderer tests,
- restart persistence,
- tmux interactive smoke,
- package build/pack/install smoke,
- installed payload verification.

Exit gate:

- no P0/P1 open issues.

---

# 35. Detailed test plan

## 35.1 Transaction tests

1. appearance edit -> Cancel -> settings hash unchanged.
2. custom theme clone -> Cancel -> no file.
3. custom theme token edit -> Cancel -> original file unchanged.
4. theme rename -> Cancel -> original remains, destination absent.
5. profile create -> Cancel -> no profile file.
6. profile delete -> Cancel -> file remains.
7. profile rename -> Cancel -> original remains, destination absent.
8. mixed theme + profile + appearance edits -> Cancel -> exact baseline.
9. mixed edits -> Apply -> expected writes only.
10. validation failure before Apply -> zero writes.
11. write failure simulation -> old originals preserved.

## 35.2 Automatic theme tests

1. fixed theme round-trip.
2. automatic light/dark pair round-trip.
3. custom light + built-in dark.
4. built-in light + custom dark.
5. edit only currently previewed light member -> dark untouched.
6. terminal appearance switch while customizer open selects correct preview member without persisting.
7. profile containing auto pair applies into draft.
8. bundle containing both custom themes imports safely.

## 35.3 Migration tests

1. no appearance -> v2 defaults.
2. v1 full -> v2 exact mapped fields.
3. v1 malformed -> bounded validation/fallback with issues.
4. v1 profile -> v2 active draft.
5. v1 bundle -> v2 staging.
6. v2 -> v2 no-op migration.
7. future version -> explicit unsupported error.
8. no rewrite on read/open.

## 35.4 Customizer layout tests

Widths:

```text
40 60 80 100 104 120 160
```

For every width:

- no visible line exceeds width,
- no SGR leak into next row,
- breadcrumb clips safely,
- controls remain reachable,
- preview either stacked or split as specified.

Content:

- ASCII,
- emoji,
- CJK,
- combining marks,
- long token/theme/profile names at max valid size.

## 35.5 Navigation tests

- change field stays in section,
- Esc from color editor -> section,
- Esc section -> root,
- Esc root -> cancel,
- search does not lose draft,
- reset section does not close,
- focus restored after nested input.

## 35.6 Timer/lifecycle tests

Fake timers:

- spinner requests render while preview visible,
- changing spinner interval replaces timer,
- changing scenes disposes old timer,
- closing customizer stops timer,
- stopping InteractiveMode stops timer,
- no render request after dispose.

## 35.7 Renderer integration tests

For every new appearance domain:

- component created before preview updates,
- component created during preview inherits effective draft,
- Cancel restores previous presentation,
- Apply + restart retains presentation.

Targets:

- user,
- assistant,
- tool,
- Bash,
- custom/system card,
- footer,
- chrome.

## 35.8 Highlighter tests

- cursor before/inside/after match,
- multiple rules,
- overlaps,
- case-sensitive/insensitive literal,
- `{match}` format,
- emoji/CJK patterns,
- maximum rules/matches/line length,
- invalid control sequence rejection,
- no mutation of editor source.

## 35.9 Theme editor tests

- create/clone/rename/delete/reset,
- group reset,
- token reset,
- add/edit/rename/delete variable,
- referenced-variable safety,
- cyclic variable rejection,
- terminal index 0/255 boundaries,
- HEX/RGB/HSL accepted through color editor,
- invalid input leaves last valid draft intact,
- collision replace requires explicit choice.

## 35.10 Extension compatibility tests

- default extension tool renderer receives unchanged data,
- custom extension renderer output is not restyled internally,
- outer default ICE shell can still adopt appearance,
- extension footer/status data remains intact,
- extension working-indicator explicit override still wins.

## 35.11 Semantic-output regression tests

Appearance changes must not alter:

- print mode text semantics,
- JSONL records,
- RPC response payloads,
- SDK events,
- tool invocation/result objects,
- persisted conversation message content.

---

# 36. Manual tmux acceptance matrix

Run with isolated `ICE_CODING_AGENT_DIR` so real user config is never touched.

## Session A — root semantics

- start ICE,
- `/customize`,
- modify user message + input + spinner + theme,
- verify live preview,
- Esc root,
- compare settings/theme/profile directory hashes -> identical.

## Session B — persistent nested UX

- User messages,
- change 5+ fields without leaving section,
- verify breadcrumb and dirty marker,
- Reset section,
- verify still in section.

## Session C — auto theme

- configure automatic light/dark,
- edit custom light theme,
- Apply,
- restart,
- verify pair remains automatic and correct theme selected for detected terminal mode.

## Session D — profile transaction

- create profile,
- rename it,
- delete another profile,
- Cancel,
- verify no filesystem change.
- repeat and Apply,
- verify expected staged changes only.

## Session E — broad live scene

Check scenes:

- Conversation,
- Markdown,
- Tools,
- Input,
- Chrome,
- Footer.

Change representative field in each and verify live update.

## Session F — widths

Resize to:

```text
40
60
80
104
120
160
```

No overflow/corruption.

## Session G — restart

Apply a non-default value in every P1 section, restart, open `/customize`, verify all summaries and actual runtime presentation match.

---

# 37. Build / verification commands

Follow repository instructions rather than inventing a new test policy.

Required after implementation batches:

```bash
corepack npm@12.0.2 run check
```

If the known local nested-npm wrapper bug still causes the monolithic command to misidentify npm 11.19.0, run and record every underlying check stage individually under Corepack 12.0.2. Do not weaken `devEngines` or package metadata to hide the environment issue.

Also run focused tests from the appropriate package roots rather than full unrestricted Vitest.

Minimum final evidence:

- Biome clean,
- TypeScript clean,
- targeted coding-agent appearance tests green,
- targeted TUI tests green,
- `git diff --check` green,
- tmux acceptance matrix green,
- packed/installed local build verified when user asks for installation,
- no unrelated semantic changes.

---

# 38. Implementation sequencing and dependency graph

Recommended order:

```text
G0 baseline
   |
   v
G1 unified transaction/theme setting
   |
   +------> G2 v2 schema/migration
   |              |
   |              v
   +-----------> G3 customizer shell
                  |
                  +--> G4 color/theme
                  +--> G5 existing domains
                  +--> G6 assistant/markdown
                  +--> G7 tools/bash/diff/cards
                  +--> G8 status indicators
                  +--> G9 footer/chrome/subagent
                  +--> G10 profiles/bundles
                              |
                              v
                         G11 settings consolidation
                              |
                              v
                         G12 final acceptance
```

Do not start with footer/chrome cosmetics while the root transaction and data version are still wrong.

---

# 39. Suggested priority / effort weighting

Use this weighting for progress reporting so a few easy rows do not make the project look 95% complete prematurely.

| Work package | Weight |
|---|---:|
| G0 baseline fixtures | 4% |
| G1 unified transaction + auto theme | 12% |
| G2 v2 schema/migration | 10% |
| G3 customizer shell/navigation | 12% |
| G4 color + theme editor | 12% |
| G5 existing v1 domain UX | 8% |
| G6 assistant + Markdown | 10% |
| G7 tools + Bash + diff + cards | 10% |
| G8 status indicators | 4% |
| G9 footer/chrome/subagent presentation | 6% |
| G10 profiles/bundles v2 | 6% |
| G11 Settings consolidation | 2% |
| G12 acceptance/install smoke | 4% |
| **Total** | **100%** |

Do not mark a package complete from source presence alone. Completion requires its acceptance gate.

---

# 40. Concrete acceptance criteria for 100%

The feature is not “done” until all of the following are true.

## Transaction / persistence

- [ ] Root Cancel after any appearance edit performs zero writes.
- [ ] Root Cancel after staged theme create/edit/rename/delete performs zero writes.
- [ ] Root Cancel after staged profile create/edit/rename/delete performs zero writes.
- [ ] Root Reset restores appearance, theme setting, staged themes, and staged profiles without writing.
- [ ] Root Apply validates all staged state before destructive operations.
- [ ] Replacement writes happen before source deletion.
- [ ] Apply persists once per owned config/file target and restart reloads correctly.

## Theme setting / editor

- [ ] Fixed theme mode works.
- [ ] Automatic light/dark mode works and round-trips.
- [ ] Automatic mode supports custom themes on either/both sides.
- [ ] Theme clone/create asks for a name.
- [ ] Theme groups are navigable/searchable.
- [ ] Every native token can be edited losslessly.
- [ ] Variables can be created/edited/renamed/deleted safely.
- [ ] Token/group/theme reset works.
- [ ] HSL/RGB/HEX/index/token authoring works.
- [ ] Import collision has Rename/Replace/Cancel choices.
- [ ] Built-in theme cannot be destructively overwritten.

## Customizer UX

- [ ] Editing a field does not eject the user from the section.
- [ ] Breadcrumbs show current nested location.
- [ ] Dirty markers are accurate.
- [ ] Per-section reset exists.
- [ ] Root Reset All exists.
- [ ] Wide split-pane works.
- [ ] Narrow stacked mode works.
- [ ] Search works without discarding draft.
- [ ] Esc hierarchy is predictable.

## Preview

- [ ] Actual user message preview.
- [ ] Actual assistant/Markdown preview.
- [ ] Actual input presentation preview.
- [ ] Animated spinner preview.
- [ ] Highlighter preview using real source-coordinate pipeline.
- [ ] Tool pending/success/error preview.
- [ ] Bash running/success/failure preview.
- [ ] System/custom card preview.
- [ ] Footer/chrome preview for implemented P2 domains.
- [ ] Preview timers/listeners dispose cleanly.

## Existing domains

- [ ] User message format/styles/colors/border/padding/fit.
- [ ] Input border/padding/idle-active colors and state precedence preview.
- [ ] Thinking frames/speed/mirror/color.
- [ ] Thinking verbs/format/cycle-random.
- [ ] Thinking block default visibility/hidden label/styles/color.
- [ ] Five Markdown table styles remain supported.
- [ ] Input highlighters full CRUD/reorder/priority/style/color/test preview.

## New presentation domains

- [ ] Assistant container appearance.
- [ ] Markdown headings/emphasis/links/inline code/code blocks/quotes/lists/HR/tables.
- [ ] Tool shell/title/output/state presentation.
- [ ] Bash border/header/output/status presentation.
- [ ] Diff presentation at least added/removed/context.
- [ ] Default system/custom card appearance.
- [ ] Shared status indicator appearance.
- [ ] Footer presentation if retained in v2 P2 scope.
- [ ] Shared selector/autocomplete chrome if retained in v2 P2 scope.
- [ ] Subagent UI presentation if retained in v2 P2 scope.

## Profiles / bundles

- [ ] Profiles support name + optional description.
- [ ] Profiles can be appearance-only.
- [ ] Profiles can carry fixed theme setting.
- [ ] Profiles can carry automatic light/dark theme setting.
- [ ] Partial profile merge is deterministic and tested.
- [ ] Profile CRUD is staged inside `/customize`.
- [ ] Bundles support v1 import and v2 export.
- [ ] Bundles can include both themes needed by automatic mode.
- [ ] Bundle metadata is editable.
- [ ] Collision resolution does not require hand-editing JSON.
- [ ] Import remains bounded/data-only.

## Migration / compatibility

- [ ] Existing v1 settings load with identical default presentation.
- [ ] Existing v1 profiles/bundles remain usable.
- [ ] No unrelated settings are dropped.
- [ ] Existing custom themes remain valid.
- [ ] Noninteractive semantic output is unchanged.
- [ ] Extension custom renderers retain precedence.
- [ ] `/settings -> Appearance` and `/customize` open the same editor.
- [ ] Fast theme UI uses the same typed fixed/automatic theme contract.
- [ ] Legacy quick appearance rows are either safely delegated or retained until explicit removal approval.

## Robustness

- [ ] 40/60/80/104/120/160 widths pass.
- [ ] Emoji/CJK/combining mark cases pass.
- [ ] ANSI style leak tests pass.
- [ ] Invalid color/theme/profile/bundle input is non-destructive.
- [ ] Highlighter worst-case performance remains bounded.
- [ ] No preview timer/listener leaks.
- [ ] No P0/P1 findings remain after final audit.

---

# 41. Definition of “TweakCC-grade” for ICE

For this project, “TweakCC-grade” means:

1. A normal user can discover and edit presentation through a first-party interactive UI.
2. Common visual components have meaningful controls, not only raw theme tokens.
3. Colors can be authored visually and exactly.
4. Spinner/verb/user-message/highlighter customization is at least as usable as the reference concept.
5. ICE goes beyond the narrow reference where its own UI has important persistent surfaces such as tools, Bash, Markdown, and footer chrome.
6. Everything is native, typed, previewable, validated, and restart-persistent.
7. No source/binary patching is involved.
8. Cancel is trustworthy.
9. Defaults preserve stock ICE behavior.
10. Customization never changes model/tool semantics.

It does **not** mean copying unrelated TweakCC prompt/toolset/model-routing features.

---

# 42. Final implementation recommendation

Do **not** keep incrementally adding rows to the current `AppearanceCustomizerComponent` until it becomes a 3,000-line menu.

The next implementation pass should first establish:

1. **`CustomizationDraftSession`** with true all-surface transaction semantics.
2. **typed fixed/automatic theme settings**.
3. **Appearance v2 + migration**.
4. **persistent customizer navigation shell**.
5. **shared color editor**.

After those foundations, add presentation domains as independent adapters/screens.

This avoids another cycle where backend fields exist but the product still feels incomplete because the architecture only exposed the subset that was easiest to bolt onto SettingsList.

The final customizer should feel like a coherent **ICE Appearance Studio**, not a collection of advanced settings rows.

---

# 43. Source audit anchors used for this plan

Local source anchors checked during the 2026-09-12 re-audit:

```text
packages/coding-agent/src/modes/interactive/appearance/appearance-types.ts:49-109
packages/coding-agent/src/modes/interactive/appearance/appearance-controller.ts:5-71
packages/coding-agent/src/modes/interactive/appearance/theme-draft-session.ts:37-268
packages/coding-agent/src/modes/interactive/appearance/appearance-profiles.ts:33-207
packages/coding-agent/src/modes/interactive/components/appearance-customizer.ts:71-1424
packages/coding-agent/src/modes/interactive/components/appearance-preview.ts
packages/coding-agent/src/modes/interactive/components/assistant-message.ts
packages/coding-agent/src/modes/interactive/components/tool-execution.ts
packages/coding-agent/src/modes/interactive/components/bash-execution.ts
packages/coding-agent/src/modes/interactive/components/custom-message.ts
packages/coding-agent/src/modes/interactive/components/status-indicator.ts
packages/coding-agent/src/modes/interactive/components/footer.ts
packages/coding-agent/src/modes/interactive/components/settings-selector.ts:518-982
packages/coding-agent/src/modes/interactive/interactive-mode.ts:4564-4718
packages/coding-agent/src/modes/interactive/interactive-mode.ts:5111-5228
packages/coding-agent/src/modes/interactive/interactive-mode.ts:5272-5479
packages/coding-agent/src/modes/interactive/theme/theme.ts
agent_docs/implementation/ice-native-customization-tweakcc-follow-up-plan.md
```

Public reference rechecked:

```text
Piebald-AI/tweakcc main
package version observed: 4.3.3
src/types.ts public presentation configuration
README/public feature descriptions
```

Treat public TweakCC as a product-reference source only. ICE's implementation remains native and governed by this repository's contracts.
