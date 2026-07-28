# Asset provenance

The current prototype does not ship third-party visual or audio files.

- The SVG artwork in `apps/client/public/assets/` was authored specifically for
  UNDER CONTROL-ish as part of this repository implementation.
- Sound effects and the ambient layer are synthesized at runtime with the Web
  Audio API and do not embed sampled recordings.
- The project uses the open-source software dependencies declared in the npm
  lockfile under their respective licenses.

Future imported assets must record the author, source URL, license, retrieval
date, and any modifications in this file before they are committed.
