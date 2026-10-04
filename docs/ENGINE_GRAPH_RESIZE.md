# Responsive graph visual correction (client-owned acceptance consumer)

Source `b097eb49c608b2e52729f26b815ac6e67c04cfa9` passed all 32 engine checks in
run `37182875126`, job `111378788716`. Its artifact `11295777810` matched
SHA-256 `a118884473acac445627fc0f87d20212a4c90d92b0da43f9a1558dfcda3e253a`.
Visual review confirmed the repaired model capture now contains a settled,
nonzero 3D canvas, and the browser log records the actual HMR connection/update.

However, the 320px replay screenshot showed an empty custom graph area: its nodes
retained the desktop viewport transform outside the narrowed canvas. The old
assertion tested document overflow only, so a clipped graph could pass. This is
an observed client-owned composition/acceptance gap, not a new graph-engine need.

The synthetic graph now reuses `useElementSize` and the native React Flow
instance's non-animated `fitView` when its owned container changes size. Selection
and replay changes do not trigger refitting. Capture stays busy until the fit
settles; an unmounted consumer ignores late completion. The stronger browser check
requires both node bounds inside the graph, clicks a node at 320px, verifies the
same native replay selection/sample, and resizes wide/narrow again. The recipe
explains this explicit client viewport policy. No framework runtime is changed.

All eight generated compositions passed local strict typing and original-engine
contracts after the correction. Final exact-SHA browser qualification and pixel
review are still required; the preceding green report alone is not the delivery.
