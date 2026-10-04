# Engine acceptance: HMR diagnostic checkpoint

Source `034fdffeca6ee9bd131c2ebf99684517988caf84` reached the first HMR edit in
engine run `37182659501`, job `111378176171`, then the unchanged 15-second
visible-heading assertion failed. The host emitted a valid `ready` event after
the save, while the browser still displayed the original component heading.
The same HMR path had passed the earlier recovered/repair runs. This does not
establish a regression caused by the independent model-capture change.

The original failed artifact `11296175478` was downloaded and its bytes matched
SHA-256 `cb4fada6a2d253ef5561992f8b9e3543eebbc679f6ed74d8b31a7ed680a8dd6c`.
It records four passing checks and one failed check; the subsequent dev and
production browser scopes were NOT_EXECUTED in that attempt.

**Observed test synchronization/diagnostic gap:** the test waited for first
content visibility, not the Vite WebSocket connection, before its immediate file
edit. Server readiness, initial content rendering and browser HMR readiness are
not the same observation. The historical artifact did not record socket frames,
so delayed connection is a hypothesis, not a demonstrated packet-loss root cause.

The test now waits for Vite's actual `connected` protocol message before editing,
and preserves browser console, connection/frame and failed-request diagnostics
in `dev-browser-events.json`. The original 15-second visible HMR assertion remains
unchanged; no retry or reload is substituted for a real update. The protocol was
checked against the installed, pinned Vite client implementation.

Dev-scope failure now joins the existing independent-scope failure report rather
than preventing model/replay/capture checks from running. The full gate still
fails if any scope fails. This preserves more diagnostic evidence without
weakening acceptance or calling an unexecuted check passed.

This checkpoint changes only tests and this diagnostic note. No production host,
Vite configuration, dependency, model renderer or StoryPlayer is modified here.
Qualify the resulting exact source in both complete workflows, inspect captures,
and read any recorded failures before drawing a completion conclusion.
