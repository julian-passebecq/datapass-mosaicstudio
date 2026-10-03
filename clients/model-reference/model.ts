import type {ModelSpec} from '../../src/framework/model-assets/model.ts';
export const model:ModelSpec={
  "format": "datapass.model3d",
  "version": 1,
  "title": "Static model / reference app",
  "note": "Synthetic plate assembly for viewer acceptance. This is not the actual Foil'o device, a conventional turbine, a CAD measurement or a physical simulation.",
  "provenance": "synthetic",
  "credit": "Original DataPass acceptance geometry / CC0",
  "asset": {
    "path": "models/model-reference/assembly.glb",
    "byteLength": 3112,
    "sha256": "90dc1817d33c76fec5d58047a5cafe754ab845fc41bc22ebc4883c3c9480720a"
  },
  "parts": [
    {
      "id": "frame",
      "node": 1,
      "label": "Support frame",
      "description": "Fixed reference structure containing four child meshes.",
      "explode": [
        -2,
        0,
        -1.5
      ],
      "evidence": []
    },
    {
      "id": "carriage",
      "node": 6,
      "label": "Carriage",
      "description": "A two-mesh assembly controlled as one semantic part.",
      "explode": [
        0,
        0,
        2
      ],
      "evidence": []
    },
    {
      "id": "plate",
      "node": 9,
      "label": "Oscillating plate",
      "description": "Illustrative plate, not a validated engineering profile.",
      "explode": [
        0,
        1.5,
        0.7
      ],
      "evidence": [
        {
          "artifact": "design-note",
          "start": 2,
          "end": 3,
          "label": "Read the geometry boundary"
        }
      ]
    },
    {
      "id": "module",
      "node": 10,
      "label": "Conversion module",
      "description": "Placeholder module without a scientific conversion model.",
      "explode": [
        2,
        0,
        1
      ],
      "evidence": []
    },
    {
      "id": "linkage",
      "node": 11,
      "label": "Linkage",
      "description": "Illustrative link between subsystems; no mechanics is calculated.",
      "explode": [
        -1.5,
        0,
        2
      ],
      "evidence": []
    }
  ],
  "annotations": [
    {
      "part": "plate",
      "label": "Plate",
      "position": [
        0,
        0.6,
        0
      ]
    },
    {
      "part": "module",
      "label": "Module",
      "position": [
        0,
        0.65,
        0
      ]
    },
    {
      "part": "frame",
      "label": "Frame",
      "position": [
        -2.4,
        3.9,
        0
      ]
    }
  ],
  "cameras": [
    {
      "id": "overview",
      "label": "Overview",
      "position": [
        10,
        7.5,
        12
      ],
      "target": [
        0,
        2.5,
        0
      ]
    },
    {
      "id": "plate",
      "label": "Plate focus",
      "position": [
        3,
        5.5,
        8
      ],
      "target": [
        0,
        4,
        0.25
      ]
    },
    {
      "id": "side",
      "label": "Side",
      "position": [
        11,
        4,
        1
      ],
      "target": [
        0,
        2.5,
        0
      ]
    }
  ],
  "sources": [
    {
      "id": "design-note",
      "path": "assembly-notes.md",
      "language": "markdown",
      "title": "Geometry and semantics",
      "text": "# Viewer acceptance\nThe plate is synthetic test geometry.\nIts appearance does not establish energy performance.\nOffsets are authored in the parent coordinate frame.",
      "provenance": "synthetic"
    }
  ]
};
