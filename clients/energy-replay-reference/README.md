# Synthetic engineering replay

A framework acceptance client, not the final Foil'o site. Three generic oscillating plate rigs replace the conventional turbine assumption. Both the geometry and all signals are invented fixtures. No physical validity is claimed.

`recording.ts` owns timestamps, units, missing values and events. `scene.ts` owns geometry. The framework owns replay controls, the shared sample clock, the plan, chart and inspection UI. No backend, remote data source, GLTF loader or new rendering engine is required.

Start with 2D; the optional Three.js chunk is requested only after choosing 3D. Seeking/restoring stops playback. The supplied timestamp gap stays a gap and missing values stay null.
