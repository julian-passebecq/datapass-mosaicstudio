# Content family

Use `--family content`. Read only START and the generated client context initially.

Ordinary pages use `text`, `metric`, `input`, `code` and client-owned React components. Sections define a grid; page navigation and reviewed session state come from the host.

Add charts only for real analytical content. Add a knowledge explorer only for useful hierarchies or documents. Add 3D only when spatial relationships matter, not as a mandatory hero decoration.

Custom UI:

```tsx
import {useSiteState} from '../../src/framework/ui';
export function ClientNote() {
  const state = useSiteState();
  return <p>Revision {state.revision}</p>;
}
```

Register the function in `components`, add a `custom` block, and declare `customCapabilities: {clientNote: []}` when no optional renderer is used. No raw HTML or executable function belongs in an imported JSON document.

A public website, an internal project overview and an explanatory microsite can all start here. The family is not a compulsory appearance or information architecture.
