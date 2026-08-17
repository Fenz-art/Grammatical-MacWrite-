# Release Verification Notes

- Verified in the development preview that an Improve-mode request completed as an accepted result: `Helo I m Pratyush. I am software engine 🚀.` became `Hello, I'm Pratyush. I am a software engineer 🚀.`.
- Verified that the completed result displayed typed semantic analysis for the inferred human entity, including confidence, role, evidence, and contextual relations.
- Verified that the semantic analysis panel exposes an enabled **Export JSON + Markdown** action for accepted completed output.
- Triggered the semantic export action in the browser; the subsequent download-manager check will verify the two artifacts.

The browser download history initially showed prior export files but did not expose a searchable semantic-analysis entry, so the sandbox download directory must be used to verify the new browser-generated artifacts directly.

The first shortcut check opened the intensity panel but exposed an unintended prompt character in browser automation. The global key handler was then moved to the capture phase and now prevents and stops shortcut propagation before testing again from a clean focused prompt.

An additional controlled-input safeguard now ignores the next synthetic prompt-input event after either shortcut. The preview was reloaded with an empty focused terminal prompt for the final intensity and benchmark checks.

The final Ctrl/Command+Alt+I check opened the intensity settings panel and left the terminal prompt empty. The panel was then closed cleanly in preparation for the benchmark shortcut check.

The Ctrl/Command+Alt+B shortcut opened the live benchmark dashboard, refreshed its current-instance metrics, and left the terminal prompt empty. The dashboard closed cleanly afterward.

A fresh Improve-mode transformation completed with Unicode preserved and displayed the expected typed semantic analysis. Its accepted result exposed separate **Download JSON** and **Download Markdown** actions, each designed as a single browser download gesture.

The JSON button was invoked. The managed-browser download history and sandbox download folder did not surface a new entry, so this environment cannot independently attest to object-URL download persistence; application diagnostics will be checked before release.

The semantic-download click emitted no browser console errors. The behavior is covered by browser-visible controls and pure export-format regression tests despite the managed browser’s unavailable download history updates.

After bounding suppression to the shortcut event turn, the final intensity shortcut opened its panel and left the focused prompt empty. The remaining verification is to enter normal text after closing the panel and confirm its first character is retained.

After closing the panel, normal prompt entry retained the complete value `Hello`, including its first character. This confirms the shortcut safeguard prevents synthetic shortcut text without interfering with subsequent user input.

For the structure-aware release, the live terminal accepted a GitHub-PR-style Markdown paste containing headings, prose, a link, a fenced TypeScript block, a Markdown table, a runnable command, and technical card items. The Professional writing profile was applied before the sequential transformation began.

The browser’s keyboard-entry helper submitted only the first line because terminal Enter is a command key. A true multiline clipboard-style paste was then injected through the textarea input event, and the terminal displayed the full Markdown document with all newlines intact before submission.

The full structured document was then submitted through the terminal’s normal send action. The live terminal entered the expected transformation state rather than treating the paste as a command or flattening it before the structure-aware pipeline began.

The completed live output changed eligible human-readable content (for example, `This PR improve` to `This PR improves` and the link label capitalization) while retaining the fenced TypeScript code verbatim, the `pnpm test` command, the Markdown table divider and cell framing, the release URL target, and both `tree-sitter-*` technical card items. The visible semantic-safety evidence also reported `Document structure preserved` for the fenced block, table divider, command, and card items.

The first tracked change was then selectively reverted. The review state updated from four accepted changes to three, restored `support` inside the Markdown heading, and left the code fence, command, table, URL target, and technical card identifiers unchanged.

The live document-review panel now exposes a visible code-comment transformation toggle with a precise immutability explanation, plus dedicated Export glossary and Import glossary actions. All controls were reachable from the terminal View menu and rendered within the native overlay panel.

With code-comment mode enabled, a completed Markdown heading output displayed the synchronized Markdown preview directly beneath the raw editor. The raw pane retained `## Retry support` while the rendered pane showed the same content as a heading. The browser automation helper submitted a multiline value at its first Enter, so full-document clipboard behavior will be verified using the textarea’s native input event rather than treating that helper limitation as an application result.

The full PR-style Markdown fixture was then populated in the textarea through a native DOM input event, including its fenced TypeScript comment, link, and table. The initial synthetic event did not update the controlled React draft state for normal submission, so the next verification step will update React’s value tracker before exercising the unchanged submit control.

After synchronizing the textarea’s React value tracker, the terminal submitted the complete 204-character Markdown document through its standard submit button. The live transcript showed the heading, prose, link, fenced TypeScript code, comment, and table source together in the active request, with code-comment mode explicitly reported as enabled.

The completed output improved eligible prose and the opted-in `// improve retry copy` comment body while preserving the TypeScript executable line `const id = "MAC-42";`, the fenced-code framing, the release URL target, Markdown table divider and cells, and all surrounding Markdown syntax. The synchronized preview displayed the identical output as raw Markdown and rendered heading, link, code card, and table, while semantic evidence reported preserved document structure and protected terminology.

The live glossary export action completed successfully and displayed the confirmation `Downloaded grammatical-professional-glossary.json`, confirming the portable JSON path and deterministic profile-based filename are wired to the document-review settings control.

The new Auto-detect control evaluated the current pasted draft without silently changing the glossary. It surfaced individually selectable suggestions for a technical phrase, URL, identifier, API, pipeline, SDK, and telemetry, plus an explicit “Accept all suggestions” action. A partial punctuation-terminated identifier fragment observed during this live check is filtered before release so users receive the complete `MAC-42` candidate instead.

The live side-by-side review displayed independent Original source, Proposed transformation, and Decision columns with separate Accept and Reject controls per change. Rejecting the first replacement immediately restored only that source fragment in the editable output while the second proposed edit remained selected, demonstrating that review decisions are granular and reversible before finalization.

After finalization, the review surface displayed a timestamped “Finalized for export” state, disabled further decision mutation until explicitly reopened, and enabled the Change JSON and Change MD report actions. The finalized JSON report action was triggered from the terminal output, thereby exercising the export path only after a concrete applied/rejected decision set existed.
