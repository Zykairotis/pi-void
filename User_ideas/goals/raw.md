# This goal will utlize all the things from the harness and the skills which are mentioned bellow 

## skills that it should use 
- $chatgpt-desktop
- $parallel-web-extract
- $parallel-web-searc
- $context7
- $piv-simple-tests
- $piv-tui-intractive




/goal Complete plans/{Users-plan}.md and bring the given implementation
to production-ready parity with every requirement in that plan must communicate with the $chatgpt-desktop at every phase end for its review and do not mark a phase complete untill the $chatgpt-desktop agrees on that 

SOURCE OF TRUTH:
- plans/{Users-plan}.md
- todo/{Users-plan}/{Users-plan}-task-list.md
- current repository implementation 
- existing tests and documented contracts
- ask $chatgpt-desktop for the completed phase review and write / ask it for a complete review and give follow ups in followup folder in follow-ups/{Users-plan}/phase{number}/{followup}.md


DONE WHEN:
- every non-deferred requirement and phases in the plan is implemented and reviewd by the $chatgpt-desktop
- no known requirement is silently skipped
- relevant unit/integration/regression tests pass
- the project builds and typechecks successfully
- the feature is exercised through its actual runtime path
- existing supported behavior remains functional
- no known implementation gap remains that can be resolved from this repository

VERIFY WITH:
Use the repository's authoritative test, typecheck, lint, build, and runtime
validation commands. Add targeted regression tests where existing coverage
cannot prove a requirement.

CONSTRAINTS:
Preserve existing public contracts unless the plan explicitly changes them.
Do not bypass failures by weakening tests, removing validation, suppressing
errors, or replacing real behavior with mocks/stubs solely to obtain a pass.

WORKING RULE:
Inspect the implementation against the plan, identify remaining gaps,
implement them, validate them, and repeat. Treat validation failures as
feedback and fix their root causes. Reinspect the complete plan after major
checkpoints so requirements are not lost during implementation.

STOP ONLY WHEN:
Every DONE WHEN condition is verified, or an unavoidable external blocker
makes further progress impossible. Ordinary bugs, failing tests, compilation
errors, or incomplete implementation are not blockers.

FINAL EVIDENCE:
Provide the requirements completed, files changed, validation commands and
results, unresolved issues if any, and an explicit final assessment of whether
the goal is fully satisfied.
you
