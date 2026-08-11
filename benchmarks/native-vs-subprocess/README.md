# Native vs subprocess benchmark

This is the deterministic M12 boundary harness. Both adapters invoke the existing `NativeSubagentRunner` with the same fixture session, request normalization, profile/resource validation, event mapping, result parsing, cancellation signal, and cleanup contract. The subprocess adapter only isolates that runner in a child process; it is not a second Pi loop. M12 and M13 are COMPLETE / VERIFIED / FROZEN from the canonical full-budget evidence chain below.

## Commands

Run from the repository root:

```bash
npm run pi-void:m12:preflight
npm run pi-void:m12:self-test
npm run pi-void:m12:bench -- --mode cold --repetitions 30
npm run pi-void:m12:bench -- --mode warm --warmups 5 --repetitions 100
npm run pi-void:m12:safety -- --repetitions 50
npm run pi-void:m12:compat -- --repetitions 3
npm run pi-void:m12:report -- --run-id 99f421f8-228b-4137-a44e-092895359713
npm run pi-void:m13:verify -- --run-ids 99f421f8-228b-4137-a44e-092895359713,d6222038-23e7-4ca9-a8ce-1770dc96db37,67457e73-cd91-452b-b0a0-154ebf94a369,430338fe-ddb8-45f6-a0ee-fdaaee129df9
```

The commands write raw JSONL, manifests, aggregate metrics, decisions, and M13 policy evidence under `.artifacts/m12/` and `.artifacts/m13/`. Canonical runs are cold `99f421f8-228b-4137-a44e-092895359713`, warm `d6222038-23e7-4ca9-a8ce-1770dc96db37`, safety `67457e73-cd91-452b-b0a0-154ebf94a369`, and compatibility `430338fe-ddb8-45f6-a0ee-fdaaee129df9`; the canonical M13 artifact is `.artifacts/m13/m13-1786296433961/`. Reports include elapsed time, startup latency, end RSS when the child survives, explicit RSS-unavailable state for terminated children, paired deltas, compatibility gates, and a native-only maintenance rationale. M13 executes C1/C2/C3 and records observed pass/total counts, exit codes, Git SHA, and dirty-worktree qualification. The artifacts record the inherited root check diagnostic at `packages/ai/test/openai-completions-tool-choice.test.ts:1410`.

## Workloads

- `bootstrap-exit`, `single-result`, `tool-roundtrip`, `multi-event`: paired performance and event/result parity.
- `cancel-before-tool-settle`, `cancel-during-tool`: cancellation and cleanup.
- `execution-exception`: recoverable child execution failure.
- `process-fatal`: subprocess exit containment; native is classified as non-containable and is not used to claim process isolation.
- `resource-loader-matrix`: actual production child-loader checks for default stripping, explicit selected resources, sibling exclusion, project trust, and scope rejection.
- `cli-contract-matrix`: actual PIV/stock CLI help and invalid PIV backend-selection checks; stock `pi` remains free of PIV flags.

The harness uses no provider API, key, network call, or generated model catalog. It does not certify W5B. Performance evidence is synthetic boundary evidence and cannot replace live provider certification.
