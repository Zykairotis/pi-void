# ICE Native Customization — Detailed Follow-Up Plan

Date: 2026-09-12

Status: Follow-up implementation plan based on the current `theme-tuner` worktree audit. This document describes remaining work. It is not a claim that the listed capabilities are shipped.

Target worktree: `/home/mewtwo/Zks/ice/.worktrees/theme-tuner`

Branch: `theme-tuner`

Current audited completion: approximately 47% of the intended TweakCC-grade native customization scope.

## 1. Objective

Finish the native ICE appearance/customization system so it is a real user-facing product rather than a collection of partially connected appearance primitives.

The completed system must preserve ICE's current theme catalog and TUI architecture while providing native customization of:

- theme palette values;
- user-message presentation;
- input/editor presentation;
- thinking/working indicators;
- thinking verbs and labels;
- thinking block presentation;
- Markdown table presentation;
- bounded input highlighting;
- appearance profiles;
- validated import/export.

The implementation must keep the existing Ice interaction/runtime loop authoritative. This is a presentation/settings project, not a reason to introduce a second application shell, renderer, session store, model loop, or plugin runtime.

## 2. Current audited state

### 2.1 Implemented and useful foundation

The current worktree already contains meaningful implementation that should be retained and completed rather than replaced:

- versioned `AppearanceSettingsV1`;
- global appearance persistence through `SettingsManager`;
- bounded appearance validation;
- `InteractiveAppearanceController` with in-memory preview, rollback, and commit;
- basic preview integration in `/settings`;
- user-message format, text style, foreground/background, padding, borders, and fit-to-content code paths;
- editor border styles including `none`;
- Markdown table render modes using one shared layout pass;
- thinking indicator frame/interval plumbing;
- thinking verb selection and formatting;
- reverse-mirror frame generation;
- thinking-block presentation hooks;
- targeted appearance tests;
- TUI editor/Markdown tests.

The previous constructor-order startup crash has been fixed: `appearanceController` is now constructed before `applyAppearanceToRuntime()`.

The previous table-style disconnection has also been partially fixed through `setDefaultTableStyle()`.

### 2.2 Current verified checks

At the time this plan was written:

- 5 appearance test files passed;
- 19/19 appearance tests passed;
- modified TUI editor/Markdown test files passed;
- `tsgo --noEmit` passed;
- `git diff --check` passed.

Those results validate the current foundation but do not certify the complete product.

### 2.3 Remaining material defects

The current worktree still has correctness and product-level gaps that must be resolved before more feature breadth is added.

#### P1 — user-message borders exceed the requested terminal width

A direct runtime probe at requested width 30 produced visible line widths of 32 for a normal single border.

Current root cause:

- inner content is rendered at the full available width;
- left and right border glyphs are then added outside that budget.

Required invariant:

```text
for every line returned by render(width):
visibleWidth(line) <= width
```

This must hold for all user-message border styles, padding values, ANSI styling, narrow terminals, Unicode content, and fit-to-content mode.

#### P1 — `fitToContent` is not actually fitting to content

The current implementation derives fit width from already-rendered Box rows. Background/padding rows expand to the full terminal width, so they defeat content measurement.

Fit width must be based on message content/layout requirements before full-width Box expansion.

#### P1 — raw JavaScript string slicing is unsafe for terminal layout

Current fit-to-content rendering uses raw `.slice()` against styled strings.

That can split:

- ANSI escape sequences;
- wide CJK characters;
- emoji;
- grapheme clusters;
- combining sequences.

Terminal-column-aware truncation must be used.

#### P1 — semantic theme-token appearance colors do not resolve their requested token

`AppearanceColor` supports:

```ts
{ kind: "theme", token: string }
```

but current presentation paths often hardcode component defaults such as:

```text
userMessageText
userMessageBg
thinkingText
```

A runtime probe setting user-message foreground to theme token `accent` still rendered through `userMessageText`.

The data model therefore promises semantic token references that the renderer does not currently honor.

#### P1 — `/customize` is not a customization surface

`/customize` currently aliases the generic settings selector.

The intended product requires a dedicated customization shell with appearance sections, live preview, draft state, apply/cancel semantics, theme editing, and representative previews.

#### P1 — several modeled fields are still dead or only partially consumed

Examples include:

- `inputBox.activeBorderColor`;
- arbitrary semantic theme-token references for input colors;
- `thinking.indicator.color`;
- `thinking.block.showByDefault`;
- arbitrary semantic token references for thinking block foreground;
- profile/bundle interfaces without implementation;
- `inputHighlighters`, which validation explicitly disables.

## 3. Architecture decisions to preserve

### 3.1 Theme and appearance remain separate concepts

Keep the existing split:

```text
Theme
  semantic palette / color values

Appearance
  component layout / decoration / animation / formatting

Appearance Profile
  optional theme selection + appearance configuration bundle
```

Do not collapse all presentation state into theme JSON.

### 3.2 Existing theme catalog remains intact

The current built-in theme catalog and theme loader remain the palette authority.

The appearance project must not remove or silently rewrite the existing theme catalog.

### 3.3 Appearance is global user preference data in v1

Do not allow a repository to silently activate appearance settings.

Project files must not be able to change user-message styling, spinner behavior, or similar personal presentation preferences without an explicit future trust/design decision.

### 3.4 Customization remains data-only

No executable JavaScript, shell commands, arbitrary callbacks, or extension code may be embedded in appearance files/profiles/bundles.

### 3.5 Preview is transactional

The customization UX must follow this contract:

```text
persisted baseline
      |
      +--> open customizer
              |
              +--> in-memory draft
                      |
                      +--> live preview
                      |
                      +--> Apply  -> validate -> persist exactly once
                      |
                      +--> Cancel -> restore exact baseline, no persistence
```

Opening, browsing, previewing, and cancelling must not write settings.

### 3.6 Default appearance remains visually opt-in

With no user customization, normal rendering should remain visually equivalent to the existing ICE baseline.

## 4. Required implementation order

Do not proceed directly to profiles/highlighters.

Use this dependency order:

```text
F0 correctness repair
  -> F1 shared color resolution
  -> F2 real /customize shell
  -> F3 user-message completion
  -> F4 input/editor completion
  -> F5 thinking indicator + verbs completion
  -> F6 thinking-block completion
  -> F7 Markdown table hardening
  -> F8 full theme editor
  -> F9 input highlighters
  -> F10 profiles + import/export
  -> F11 final integration / tmux / restart verification
```

F0-F2 are blocking foundations. Do not call the project feature-complete without them.

---

# F0 — Correctness Repair Before Additional Features

## F0.1 Fix user-message width budgeting

Primary files:

- `packages/coding-agent/src/modes/interactive/components/user-message.ts`
- `packages/coding-agent/src/modes/interactive/appearance/user-message-presentation.ts`
- `packages/coding-agent/test/appearance-user-message.test.ts`

Required behavior:

1. Determine border side width before rendering inner content.
2. Determine horizontal content padding before rendering Markdown.
3. Compute a content viewport such that:

```text
outer width = left border + box/content width + right border
outer width <= requested width
```

4. Top/bottom border lengths must match the final outer visible width exactly.
5. Top/bottom-only border families must not reserve nonexistent side borders.
6. `none` must preserve baseline geometry.
7. Widths 1, 2, 3, and other very narrow cases must fail gracefully without negative budgets or exceptions.

Tests must assert `visibleWidth(line) <= width` across every border family.

Test matrix:

- width 1;
- width 2;
- width 3;
- width 10;
- width 30;
- width 80;
- padding X 0-4;
- no border;
- single;
- double;
- round;
- bold;
- classic;
- single-double;
- double-single;
- all top/bottom-only styles.

## F0.2 Replace raw slicing with visible-column slicing

Do not use ordinary `.slice()` to truncate rendered/styled terminal text.

Use an existing TUI helper if one already exists for ANSI-aware/terminal-column-aware truncation. If none exists, add one at the TUI utility layer rather than embedding another one-off parser in the coding-agent component.

Required tests:

- ANSI-colored text;
- emoji;
- CJK double-width characters;
- combining marks;
- a line ending exactly on the width boundary;
- a line exceeding the width by one terminal cell.

## F0.3 Fix fit-to-content measurement

Fit-to-content should derive target width from the content model before full-width Box rendering.

Expected calculation conceptually:

```text
natural message content width
+ horizontal padding * 2
+ side border cells where applicable
= natural outer width

render width = min(available width, natural outer width)
```

Do not calculate fit width from full-width padding/background rows.

For multiline Markdown, use the maximum natural visible width after formatting transformation while still respecting terminal wrapping constraints.

Acceptance criteria:

- short message in 80-column terminal produces a compact box;
- long message still clamps to terminal width;
- multiline message fits the widest line;
- padding and side borders are included exactly once;
- resulting rows never exceed available width.

## F0.4 Add startup/full-runtime construction regression coverage

The previous constructor-order crash was fixed but currently has no strong full-mode regression test.

Add a provider-free construction path or focused test that creates enough of `InteractiveMode` to ensure appearance initialization order cannot regress.

The test should fail if `applyAppearanceToRuntime()` can run before required appearance dependencies are initialized.

Do not require a live provider.

---

# F1 — One Shared Appearance Color Resolver

## F1.1 Problem

The current appearance model allows arbitrary theme-token references, but presentation components often ignore the requested token and route to a fixed default token.

This creates configuration that validates but does not do what it says.

## F1.2 Required resolver contract

Create one shared presentation-level resolver for `AppearanceColor`.

It must support:

```text
kind: theme
  -> resolve the exact validated semantic theme token dynamically

kind: custom
  -> validated HEX/RGB/HSL -> ANSI foreground/background function

kind: terminal-default
  -> terminal default foreground/background semantics

kind: none
  -> no styling / transparent presentation where valid
```

Foreground/background usage must remain distinct.

Do not resolve a semantic token into copied RGB at settings-load time. The reference should remain live so switching themes immediately updates appearance.

## F1.3 Strongly type semantic tokens

Do not leave `token: string` effectively unbounded at runtime.

Prefer one of:

1. derive an exported semantic token type from the existing theme schema/theme implementation; or
2. validate token strings against the actual loaded theme token registry/schema.

Invalid tokens must be rejected during appearance validation or normalized to a documented safe default.

Do not silently map every theme token reference to a component-specific hardcoded token.

## F1.4 Apply resolver everywhere

Migrate these paths to the same resolver:

- user-message foreground;
- user-message background;
- user-message border;
- input idle border;
- input active border;
- thinking indicator color;
- thinking block foreground;
- highlighter foreground/background when F9 lands.

## F1.5 Tests

Add direct tests proving that:

```text
theme token accent != userMessageText
```

actually renders through `accent` when requested.

Test at least two distinct themes to prove references remain dynamic after theme changes.

Test:

- `theme` color;
- custom HEX;
- custom RGB;
- custom HSL;
- terminal-default;
- none;
- invalid token;
- invalid custom syntax.

---

# F2 — Build the Real `/customize` Surface

## F2.1 Replace the current alias

Current behavior:

```text
/customize -> showSettingsSelector()
```

Target behavior:

```text
/customize -> dedicated appearance/customization UI
```

Keep the small appearance shortcuts in `/settings` if they remain useful, but `/customize` must no longer just open generic settings.

## F2.2 Recommended component structure

Use native TUI components and existing interactive-mode overlay patterns.

Suggested files:

```text
packages/coding-agent/src/modes/interactive/components/appearance-customizer.ts
packages/coding-agent/src/modes/interactive/components/appearance-preview.ts
packages/coding-agent/src/modes/interactive/components/appearance-color-editor.ts
```

Do not add a new UI framework.

The exact file split may be adjusted if existing component conventions suggest a smaller design.

## F2.3 Root navigation

The customizer should expose sections roughly equivalent to:

```text
Appearance
  Theme
  User messages
  Input box
  Thinking indicator
  Thinking verbs
  Thinking block
  Markdown tables
  Input highlighters
  Profiles
  Import / Export
  Reset
```

Disabled/not-yet-implemented sections should not be advertised as complete during intermediate implementation.

## F2.4 Draft ownership

Opening `/customize` should:

1. capture the current persisted appearance baseline;
2. create one in-memory draft;
3. begin an `InteractiveAppearanceController` preview transaction;
4. render controls from the draft;
5. update preview only through the controller.

Every nested section edits the same draft object.

Do not persist on individual field changes.

## F2.5 Apply/cancel semantics

Apply:

```text
validate complete draft
-> persist appearance exactly once
-> commit selected theme only if theme draft changed and validated
-> close or remain open with new baseline
```

Cancel/Escape:

```text
rollback appearance preview
-> restore pre-open theme preview if necessary
-> write nothing
-> close customizer
```

Navigating between sections must not create additional persistence writes.

## F2.6 Responsive layout

Where terminal width permits:

```text
+---------------------+------------------------------+
| section / controls  | representative live preview  |
+---------------------+------------------------------+
```

For narrow terminals, fall back to stacked navigation/editor/preview rather than overflowing.

Do not require mouse support.

## F2.7 Representative preview

The preview must render actual ICE components or the same presentation functions used by them.

It should include representative examples of:

- user message;
- input box;
- working/thinking spinner;
- thinking label;
- thinking block;
- Markdown paragraph/table.

Avoid a fake four-color swatch preview as the primary preview.

## F2.8 Keyboard behavior

Follow existing TUI navigation/keybinding conventions.

At minimum:

- arrows/j/k if existing selector supports them;
- Enter to edit/select;
- Escape backs out one level and ultimately cancels the transaction;
- explicit Apply action;
- explicit Reset section/default actions.

Do not hardcode new global key checks outside the normal keybinding framework.

## F2.9 Tests

Add component/controller tests for:

- open causes zero writes;
- preview causes zero writes;
- section navigation causes zero writes;
- Apply causes one appearance write;
- Cancel causes zero writes and restores baseline;
- repeated previews still cause zero writes;
- invalid draft cannot be applied;
- Escape from nested editor returns safely;
- Escape from root rolls back.

---

# F3 — Complete User-Message Customization

## F3.1 Fields that must be editable

Expose all current `userMessage` model fields:

```text
format
styles
foreground
background
borderStyle
borderColor
paddingX
paddingY
fitToContent
```

## F3.2 Format editor

Requirements:

- format must contain `{message}`;
- validation remains bounded;
- preview updates immediately;
- literal braces/invalid placeholders have deterministic behavior;
- no executable interpolation.

## F3.3 Style editor

Allow independent toggles for:

- bold;
- italic;
- underline;
- strikethrough;
- inverse.

Test combinations, not only one style at a time.

## F3.4 Color editor

Reuse F1 resolver and the shared color editor UI.

Allow:

- theme semantic token;
- custom HEX;
- custom RGB;
- custom HSL;
- terminal default where meaningful;
- none where meaningful.

## F3.5 Border editor

Expose all supported user-message border styles:

- none;
- single;
- double;
- round;
- bold;
- single-double;
- double-single;
- classic;
- top-bottom-single;
- top-bottom-double;
- top-bottom-bold.

Do not implement a style in the model that produces structurally incorrect geometry.

## F3.6 Fit-to-content requirements

After F0 repair:

- fit-to-content must render compact width;
- non-fit mode must fill available width without overflow;
- terminal resize must recalculate geometry;
- ANSI styling must not affect visible width math.

## F3.7 Regression suite

Expand `appearance-user-message.test.ts` or split layout tests if it becomes too broad.

Required assertions:

- exact baseline equivalence for defaults;
- exact semantic-token color use;
- custom color ANSI;
- width invariant;
- fit behavior;
- narrow terminals;
- multiline Markdown;
- ordered lists/backslash preservation;
- emoji/CJK;
- every border family.

---

# F4 — Complete Input/Editor Customization

## F4.1 Required editable fields

Expose:

```text
inputBox.borderStyle
inputBox.idleBorderColor
inputBox.activeBorderColor
inputBox.paddingX
```

## F4.2 Define active state precisely

Do not keep `activeBorderColor` as dead configuration.

Document and implement one stable definition of active, for example editor focus/interaction state.

The chosen definition must not conflict with existing runtime signal colors.

Recommended precedence:

```text
explicit extension/runtime override
  > bash-mode signal
  > non-off thinking-level signal
  > active appearance border color when editor active
  > idle appearance border color
```

If another ordering better preserves existing behavior, document it and test it.

## F4.3 Border style correctness

Existing `none`, `single`, `double`, `round`, `bold` support should remain.

Verify:

- border-off removes only border rows, not editor content;
- cursor coordinates remain correct;
- autocomplete placement remains correct;
- hardware cursor positioning remains correct;
- scroll indicator and multiline editor geometry remain correct;
- resize remains stable.

## F4.4 Padding ownership

Appearance input padding must only affect the input editor.

It must not alter transcript/user/assistant output padding.

## F4.5 Tests

Extend editor tests for:

- each border style;
- no-border height;
- padding 0-4;
- active/idle color transition;
- theme-token custom color;
- custom color;
- multiline editor;
- autocomplete open;
- narrow width;
- resize.

---

# F5 — Complete Thinking Indicator and Verb Customization

## F5.1 Indicator editor

Expose:

```text
frames
intervalMs
reverseMirror
color
```

## F5.2 Frames editor

Requirements:

- add frame;
- edit frame;
- delete frame;
- reorder frames;
- reset to default;
- bounded frame count;
- bounded UTF-8 size per frame;
- reject empty final frame list.

## F5.3 Presets

Add a small built-in preset list only if it can be represented as static data with no new runtime dependency.

If using preset data inspired by public spinner catalogs, recreate simple frame data independently or comply with repository provenance rules.

Do not add a package solely for a few spinner arrays unless justified.

## F5.4 Reverse mirror

Current helper mirrors the full array including duplicated endpoints:

```text
[a, b] -> [a, b, b, a]
```

Decide whether endpoint duplication is intentional.

If the UX target expects ping-pong animation without duplicated edge frames, use:

```text
[a, b, c] -> [a, b, c, b]
```

Document and test whichever contract is selected.

## F5.5 Indicator color

Wire `thinking.indicator.color` through F1 to the real `WorkingStatusIndicator` rendering path.

Extension `setWorkingIndicator()` override must continue to take precedence where currently intended.

## F5.6 Thinking verb editor

Expose:

```text
thinking.label.format
thinking.label.verbs
thinking.label.selection
```

User operations:

- add verb;
- edit verb;
- delete verb;
- reorder verbs;
- choose cycle/random;
- edit `{verb}` format;
- reset defaults.

Keep bounds on list size and UTF-8 length.

## F5.7 Preview

The customizer should show a live animated working indicator using the draft frames/interval/color and a preview label using draft verbs/format.

The preview timer must be disposed when leaving the section/customizer.

Do not create accumulating timers on every preview update.

## F5.8 Tests

Cover:

- frames persist;
- interval persists;
- reverse mirror behavior;
- color reaches rendering;
- extension override precedence;
- verb cycle;
- random selection remains bounded/nonempty;
- format substitution;
- add/delete/reorder validation;
- preview timer disposal.

---

# F6 — Complete Thinking-Block Presentation

## F6.1 Fields

Expose:

```text
thinking.block.showByDefault
thinking.block.hiddenLabel
thinking.block.styles
thinking.block.foreground
```

## F6.2 Preserve reasoning visibility semantics

Appearance must not override model/runtime safety semantics.

`showByDefault` should affect presentation default only where the existing hide-thinking setting has not explicitly overridden it.

Define precedence explicitly.

Suggested model:

```text
explicit session/user hide-thinking override
  > appearance thinking.block.showByDefault
  > built-in baseline
```

Do not conflate "thinking block appearance" with whether provider reasoning is requested from the model.

## F6.3 Foreground resolution

Use F1. Do not hardcode `thinkingText` whenever an appearance token was explicitly selected.

## F6.4 Hidden label

Hidden label must use configured styles/foreground consistently.

Avoid double-applying `thinkingText` around already-custom-styled output.

## F6.5 Tests

Cover:

- showByDefault false;
- explicit hide setting precedence;
- hiddenLabel;
- style combinations;
- semantic token foreground;
- custom foreground;
- default baseline rendering;
- streaming and completed assistant messages.

---

# F7 — Harden Markdown Table Appearance

## F7.1 Preserve one layout algorithm

Keep the current design in which column measurement/wrapping is shared and only border emission changes by style.

Do not fork five independent table layout implementations.

## F7.2 Styles

Maintain:

- unicode;
- ascii;
- clean;
- clean-top-bottom;
- raw.

## F7.3 Remove avoidable process-global rendering state

Current integration uses a module-level default table style through `setDefaultTableStyle()`.

That is useful as an intermediate implementation, but it creates process-global mutable presentation state and can make tests/parallel consumers interfere with each other.

Preferred final design:

- propagate current appearance Markdown options from interactive runtime into each `Markdown` construction path; or
- use a scoped Markdown factory/helper owned by interactive mode.

Do not require every unrelated `@zykairotis/ice-tui` consumer in the process to inherit the current interactive session's table style.

If explicit propagation proves excessively invasive, document why the global default remains safe in the current single-interactive-runtime architecture and add isolation/reset tests.

## F7.4 Coverage

Test all table styles with:

- normal table;
- narrow width;
- wrapped cells;
- wide Unicode;
- inline ANSI/style content;
- empty cells;
- multiple body rows;
- Markdown immediately before/after the table.

---

# F8 — Full Native Theme Editor

This is part of the product requirement and must not be substituted by the existing `/theme` picker alone.

## F8.1 Theme section capabilities

The `/customize -> Theme` section should provide:

- current theme selection;
- live non-persisting theme preview;
- clone built-in/custom theme into a new custom theme;
- rename custom theme;
- delete custom theme with confirmation;
- semantic token editing;
- variable editing if supported by native theme format;
- reset token;
- reset custom theme from source/base;
- import/export theme data;
- validation before activation.

Do not allow editing bundled theme files in place.

## F8.2 Color value support

The editor must represent ICE's real native theme value model rather than a fixed swatch list.

Support whichever forms the existing theme schema truly accepts, including as applicable:

- hex;
- RGB/HSL if normalized by native tooling;
- terminal indexed/name values;
- theme variable references;
- semantic aliases.

Do not lossy-convert an existing value to RGB just because the editor preview can display RGB.

## F8.3 Theme token descriptions/groups

Group semantic tokens by purpose to make editing usable, for example:

```text
Core
Messages
Editor / Borders
Tools / Status
Markdown
Diff
Thinking
```

Use actual token names from the schema. Do not invent unsupported tokens.

## F8.4 Color editor UX

Provide keyboard-editable text input as the authoritative value editor.

A simple terminal color picker/swatches may be added as an aid, but users must still be able to paste exact supported values.

## F8.5 Invalid theme behavior

An invalid draft theme must never crash interactive mode.

Preview failure must:

- leave the current valid theme active;
- show a bounded validation error in the customizer;
- avoid persisting the invalid theme selection;
- avoid corrupting the original custom theme.

## F8.6 Preview/cancel contract

Theme preview must integrate with the appearance transaction so that cancelling `/customize` restores both:

- original persisted theme selection;
- original appearance settings.

Apply should persist the selected/custom theme only after validation succeeds.

## F8.7 Tests

Add tests for:

- preview does not persist;
- invalid theme cannot replace active valid theme;
- clone creates a new custom file only on explicit action;
- browsing creates no files;
- rename collision;
- delete confirmation;
- cancellation restores original theme;
- restart loads applied custom theme;
- unsupported/lossless values round-trip.

---

# F9 — Bounded Input Pattern Highlighters

Do this only after F0-F8 are stable.

## F9.1 Initial scope stays literal-only

The current type wisely models:

```text
matcher.kind = literal
```

Keep the first implementation literal-only.

Do not put arbitrary JavaScript regex execution into the per-keystroke render hot path.

## F9.2 Rendering design

Highlighters must decorate rendered editor text without mutating the underlying source text.

Source text remains plain and cursor/index semantics remain based on source content.

Highlighter evaluation should produce bounded decoration spans.

## F9.3 Bounds

Define explicit limits for:

- maximum rule count;
- pattern byte length;
- maximum matches per rule/render;
- total decorated ranges per render;
- priority range.

## F9.4 Overlap semantics

Define deterministic overlap behavior before implementation.

Recommended:

```text
higher priority wins
then earlier rule order
then earlier source position
```

Do not let rendering order produce nondeterministic styling.

## F9.5 UI

Allow:

- add rule;
- enable/disable;
- name;
- literal pattern;
- styles;
- foreground/background;
- priority;
- reorder;
- delete.

## F9.6 Performance tests

Add long-line/editor stress tests proving highlighters remain bounded.

Test rapid typing with many rules without provider/runtime involvement.

Only consider regex in a later version after selecting a non-backtracking/safe matching strategy and reviewing packaging impact.

---

# F10 — Profiles and Import/Export

## F10.1 Appearance profiles

Implement the existing profile concept rather than leaving interfaces unused.

A profile should contain:

```text
name
description optional
theme optional
appearance settings
```

## F10.2 Profile operations

Support:

- create from current;
- apply;
- rename;
- duplicate;
- delete;
- reset to built-in/default state.

Profiles are global user preferences in v1.

No automatic per-repository activation.

## F10.3 Data-only bundle format

Use a versioned bounded JSON format, for example the existing `AppearanceBundleV1` direction.

Bundle may include:

- metadata;
- optional theme name/theme data;
- optional appearance data.

No executable content.

## F10.4 Import rules

Before writing anything:

1. parse bounded input size;
2. validate schema/version;
3. validate appearance;
4. validate theme data if present;
5. detect name collisions;
6. present resolution choice;
7. only then create/persist.

Never partially import a bundle where one half failed validation.

## F10.5 Export rules

Export the normalized, currently persisted representation.

Do not export secrets, file paths, repository state, or extension configuration.

## F10.6 Collision safety

Never overwrite an existing profile/theme silently.

Use explicit replace/rename/cancel behavior.

## F10.7 Tests

Cover:

- profile create/apply;
- optional theme profile;
- appearance-only profile;
- delete;
- duplicate;
- restart persistence;
- import valid;
- reject invalid version;
- reject invalid appearance;
- reject invalid theme;
- collision handling;
- no partial write on failure;
- export/import round-trip.

---

# F11 — Integration, Restart, and Tmux Certification

## F11.1 Automated verification

After implementation, run targeted modified tests first.

For new/modified coding-agent test files, follow repository rules and run each directly from package scope.

Then run the allowed non-e2e suite if appropriate:

```text
./test.sh
```

After code changes run the repository check using the declared npm version:

```text
corepack npm@12.0.2 run check
```

Do not hide warnings or truncate the authoritative result.

## F11.2 Tmux interactive smoke test

Use the repository's documented tmux flow.

Minimum scenarios:

### Scenario A — open/cancel

1. start ICE;
2. open `/customize`;
3. change user-message style;
4. visually verify preview;
5. cancel;
6. verify transcript returns to original style;
7. exit/restart;
8. verify cancelled style was not persisted.

### Scenario B — apply/restart

1. open `/customize`;
2. change user-message border;
3. change editor border;
4. change table style;
5. change thinking interval/frame configuration;
6. Apply;
7. exit;
8. restart;
9. verify all applied settings persist.

### Scenario C — theme + appearance transaction

1. start with theme A;
2. open customizer;
3. preview theme B;
4. preview appearance changes;
5. cancel;
6. verify exact theme A + old appearance restored;
7. repeat and Apply;
8. restart and verify theme B + appearance persisted.

### Scenario D — width stress

Run terminal widths around:

- 40;
- 60;
- 80;
- 120.

Verify:

- no user-message row overflows;
- customizer layout responds correctly;
- editor cursor remains aligned;
- table rendering remains bounded.

### Scenario E — invalid values

Try invalid:

- custom color;
- theme token;
- theme draft;
- empty spinner frame list;
- malformed import bundle.

ICE must remain running and keep the last valid state.

## F11.3 Persistence write audit

Instrument/test persistence behavior so these actions create zero appearance writes:

- opening `/customize`;
- moving selection;
- entering/leaving sections;
- changing preview values;
- cancelling.

Apply should create one normalized appearance persistence write for the final draft.

Theme-file creation/deletion is separate and must occur only on explicit theme management actions.

---

# 5. Detailed test plan

## 5.1 Existing files to extend

Likely existing targets:

```text
packages/coding-agent/test/appearance-baseline.test.ts
packages/coding-agent/test/appearance-controller.test.ts
packages/coding-agent/test/appearance-presentation.test.ts
packages/coding-agent/test/appearance-user-message.test.ts
packages/coding-agent/test/appearance-validate.test.ts
packages/tui/test/editor.test.ts
packages/tui/test/markdown.test.ts
```

## 5.2 Suggested new focused test files

Create only where separation improves clarity:

```text
packages/coding-agent/test/appearance-color-resolution.test.ts
packages/coding-agent/test/appearance-user-message-layout.test.ts
packages/coding-agent/test/appearance-customizer.test.ts
packages/coding-agent/test/appearance-input-box.test.ts
packages/coding-agent/test/appearance-thinking.test.ts
packages/coding-agent/test/appearance-profiles.test.ts
packages/coding-agent/test/appearance-import-export.test.ts
packages/coding-agent/test/appearance-input-highlighters.test.ts
```

Do not create files merely to mirror work-package names if existing files remain manageable.

## 5.3 High-value invariants

The tests should emphasize invariants instead of snapshots alone.

### Rendering width

```text
visibleWidth(line) <= requestedWidth
```

for all relevant components.

### Preview persistence

```text
writes(open) = 0
writes(preview N times) = 0
writes(cancel) = 0
writes(apply) = 1
```

### Default compatibility

```text
default appearance rendered geometry == baseline geometry
```

where practical.

### Semantic theme references

Changing active theme must change a theme-token-based appearance reference without rewriting appearance settings.

### Invalid data

Invalid data never replaces the last valid effective/persisted state.

---

# 6. Files likely to change

This is a planning map, not a requirement to touch every file.

### Appearance model/controller

```text
packages/coding-agent/src/modes/interactive/appearance/appearance-types.ts
packages/coding-agent/src/modes/interactive/appearance/appearance-defaults.ts
packages/coding-agent/src/modes/interactive/appearance/appearance-validate.ts
packages/coding-agent/src/modes/interactive/appearance/appearance-controller.ts
packages/coding-agent/src/modes/interactive/appearance/appearance-colors.ts
packages/coding-agent/src/modes/interactive/appearance/user-message-presentation.ts
packages/coding-agent/src/modes/interactive/appearance/thinking-presentation.ts
```

Potential new modules:

```text
appearance-profile-store.ts
appearance-bundle.ts
appearance-highlighter.ts
```

Only split these when responsibilities justify it.

### Interactive components

```text
packages/coding-agent/src/modes/interactive/interactive-mode.ts
packages/coding-agent/src/modes/interactive/components/user-message.ts
packages/coding-agent/src/modes/interactive/components/assistant-message.ts
packages/coding-agent/src/modes/interactive/components/settings-selector.ts
```

Potential new native customization components:

```text
appearance-customizer.ts
appearance-preview.ts
appearance-color-editor.ts
```

### Theme integration

Existing theme modules under:

```text
packages/coding-agent/src/modes/interactive/theme/
```

Reuse native theme loading/validation/controller behavior rather than duplicating it.

### TUI

```text
packages/tui/src/components/editor.ts
packages/tui/src/components/markdown.ts
packages/tui/src/index.ts
```

Add shared width/truncation helpers only if an equivalent utility does not already exist.

### Settings

```text
packages/coding-agent/src/core/settings-manager.ts
```

Keep one persisted `appearance` object and avoid scattering appearance fields across unrelated settings keys.

---

# 7. Explicit non-goals for this follow-up

Do not expand this project into unrelated TweakCC features.

Not part of this plan:

- system prompt editing;
- toolset policy editing;
- model routing configuration;
- provider configuration redesign;
- subagent configuration redesign;
- patching built distributions;
- runtime monkey-patching;
- arbitrary JavaScript appearance hooks;
- arbitrary shell hooks;
- repository-controlled automatic appearance activation;
- web/community marketplace/download service;
- external telemetry.

The target is TweakCC-grade presentation customization depth, implemented natively in ICE.

---

# 8. Migration and compatibility rules

## 8.1 Existing users

If no `appearance` settings exist, return defaults without writing a settings file solely because the feature was opened.

## 8.2 Existing appearance v1 drafts

Do not invalidate already-created appearance v1 settings unnecessarily.

If a validation bug is corrected, normalize safely and document the behavior.

## 8.3 Existing theme selection

Keep current theme selection semantics compatible.

`/theme` may remain as the fast picker even after `/customize -> Theme` exists.

## 8.4 Example theming extension

Do not remove existing example/legacy theming functionality without explicit user approval.

The native customizer should become the primary product path, but intentional existing examples should not be deleted as cleanup during this implementation.

---

# 9. Completion gates by milestone

## Gate A — correctness foundation

Required before UI breadth:

- user-message width invariant passes;
- fit-to-content is real;
- ANSI/Unicode truncation safe;
- shared color resolver exists;
- arbitrary semantic theme tokens work;
- constructor initialization regression covered.

Expected project completion after Gate A: roughly 55-58%.

## Gate B — real customization shell

Required:

- `/customize` is dedicated;
- draft preview works;
- Apply persists once;
- Cancel writes nothing;
- representative live preview exists;
- responsive layout works.

Expected project completion after Gate B: roughly 65-70%.

## Gate C — primary appearance domains complete

Required:

- user messages complete;
- input/editor complete;
- thinking indicator/verbs complete;
- thinking block complete;
- tables hardened.

Expected project completion after Gate C: roughly 82-87%.

## Gate D — theme editor complete

Required:

- native theme editor;
- clone/rename/delete custom themes;
- live theme preview;
- lossless value editing;
- invalid theme safety.

Expected project completion after Gate D: roughly 90-92%.

## Gate E — advanced customization complete

Required:

- bounded input highlighters;
- profiles;
- import/export;
- reset behavior;
- migration handling.

Expected project completion after Gate E: roughly 97%.

## Gate F — production certification

Required:

- all targeted tests green;
- repository check green;
- tmux scenarios pass;
- restart persistence verified;
- no known P0/P1 appearance regressions;
- `idea.md` updated to distinguish shipped native customization from roadmap once implementation is actually complete.

Only then call the project 100% complete.

---

# 10. Final product acceptance criteria

The follow-up is complete only when all of the following are true:

1. `/customize` opens a dedicated native customization UI rather than generic `/settings`.
2. Opening/browsing/cancelling customization does not persist settings.
3. Apply persists the final validated appearance exactly once.
4. Default appearance preserves existing ICE presentation closely enough to remain visually opt-in.
5. User messages support format, text styles, semantic/custom colors, border style/color, X/Y padding, and actual fit-to-content.
6. No user-message rendered row exceeds the requested terminal width.
7. Styled/Unicode content is never truncated with raw byte/code-unit slicing that corrupts terminal rendering.
8. Appearance semantic theme-token references resolve the requested token dynamically.
9. Switching theme updates theme-token-based appearance without rewriting appearance config.
10. Editor/input supports border none/single/double/round/bold, X padding, and working idle/active colors.
11. Existing bash/thinking signal colors retain documented precedence over normal appearance state.
12. Thinking indicator supports editable frames, interval, reverse behavior, and color.
13. Thinking verbs support add/edit/delete/reorder, cycle/random, and format.
14. Thinking-block visibility default, hidden label, styles, and foreground all work without altering provider reasoning semantics.
15. Markdown tables support all five styles through one shared layout algorithm.
16. Table appearance does not cause unsafe cross-session/global leakage, or the retained global mechanism has explicit isolation guarantees/tests.
17. Theme customization edits ICE's real value model and does not reduce everything to a fixed palette.
18. Invalid theme drafts never crash ICE or replace the last valid theme.
19. Custom themes can be cloned/renamed/deleted explicitly and safely.
20. Input highlighters are literal-first, bounded, deterministic, and do not execute arbitrary regex in the render hot path.
21. Profiles can bundle optional theme + appearance settings.
22. Import/export is versioned, data-only, bounded, validated, and collision-safe.
23. No repository can silently activate global appearance in v1.
24. `/theme` remains a valid fast-selection path.
25. Existing theme catalog remains intact.
26. Existing extension/runtime appearance overrides preserve documented precedence.
27. Targeted appearance/TUI tests pass.
28. `corepack npm@12.0.2 run check` passes after final code changes.
29. Tmux smoke tests verify preview, cancel, apply, ordinary chat, resize, and restart persistence.
30. `idea.md` is updated only when the implementation is actually shipped, clearly separating implemented behavior from remaining roadmap.

---

# 11. Recommended execution slices

Keep each implementation slice independently reviewable.

## Slice 1 — layout and color correctness

Implement F0 + F1 only.

Do not modify customizer UI beyond what is needed for tests.

Exit criteria:

- width invariant;
- fit-to-content correct;
- ANSI/Unicode safe;
- semantic token resolution correct;
- targeted tests green.

## Slice 2 — `/customize` shell

Implement F2 with existing fields only.

Exit criteria:

- dedicated customizer;
- draft transaction;
- live representative preview;
- Apply/Cancel semantics;
- no new persistence bugs.

## Slice 3 — core presentation editors

Implement F3-F7.

Exit criteria:

- every already-modeled appearance field has a working UI and runtime consumer;
- no dead v1 fields remain except intentionally deferred highlighters/profiles.

## Slice 4 — full theme editor

Implement F8 independently from advanced highlighters/profiles.

Exit criteria:

- theme editing is native, validated, reversible, and lossless for supported value forms.

## Slice 5 — advanced customization

Implement F9-F10.

Exit criteria:

- bounded highlighters;
- profiles;
- import/export.

## Slice 6 — production verification

Implement no new features unless required by failures.

Run F11 and repair only observed defects.

---

# 12. Implementation discipline

- Preserve unrelated dirty changes in the worktree.
- Do not reset, stash, clean, or discard other sessions' work.
- Do not commit/push/publish unless explicitly requested.
- Read files fully before wide changes.
- Prefer existing TUI primitives and theme/runtime seams.
- Do not introduce another UI framework.
- Do not introduce a new persistence store.
- Do not add new dependencies for trivial helpers/presets.
- If a new dependency becomes necessary, review packaging/security impact first.
- Keep all rendering behavior deterministic and bounded.
- Treat tests and observed terminal behavior as authority over implementation comments.

## Final execution order

```text
1. F0 user-message geometry + safe truncation
2. F1 shared semantic/custom color resolver
3. F2 dedicated /customize transaction shell
4. F3 user-message editor/completion
5. F4 input/editor completion
6. F5 thinking indicator + verb editor
7. F6 thinking-block completion
8. F7 table-style isolation/hardening
9. F8 full native theme editor
10. F9 literal bounded input highlighters
11. F10 profiles + import/export
12. F11 full targeted/check/tmux/restart certification
13. update idea.md with only behavior proven to be shipped
```

This sequence closes known correctness defects before adding more UI breadth and prevents the current pattern of adding configuration fields faster than the runtime/customization surface can actually honor them.
