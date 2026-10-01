// The pinned ConceptMotion renderer feature-detects the modern DOM moveBefore API.
// TS 5.9's DOM library predates its SVG declaration. This is type-only, not a polyfill.
interface SVGElement { moveBefore?: (movedNode: Node, referenceNode: Node | null) => void; }
