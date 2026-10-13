# FORGE benchmarks — eight deterministic models

Every benchmark is a pure function of (style/kind, palette): no network, no
randomness, no clock. The same arguments always produce the same parts, so
benchmarks double as regression tests (see `tests/forge.test.cjs`).

Run them without any API key: open the plugin panel, press **Demos**, and use
the benchmark picker — or run a single one / all eight. Each result reports
part count, group count, atlas pixels and milliseconds; undo with Ctrl+Z.

| # | id | label | tool | min parts |
|---|----|-------|------|-----------|
| 1 | `android_villager` | Android villager | `generate_character` | 75 |
| 2 | `robot` | Robot | `generate_character` | 75 |
| 3 | `knight` | Knight (FORGE) | `generate_character` | 80 |
| 4 | `energy_sword` | Energy sword | `generate_prop` | 30 |
| 5 | `sci_fi_drone` | Sci-fi drone | `generate_prop` | 55 |
| 6 | `treasure_chest` | Treasure chest | `generate_prop` | 35 |
| 7 | `crystal_golem` | Crystal golem (FORGE) | `generate_prop` | 28 |
| 8 | `mech_walker` | Mech walker (FORGE) | `generate_prop` | 30 |

What each benchmark verifies:

- Editable native cubes under one root group with organized subgroups
  (hierarchy built from `Section | Part` name prefixes).
- Exactly one real PNG atlas (`data:image/png;base64,...`) with a unique
  16x16 tile per cube face and per-face UVs (no shared/bleeding tiles).
- A single Blockbench Undo transaction per model (Ctrl+Z removes the whole
  model including its texture).
- Part-count floor per model (table above); failures report the count.

## Manual visual QA (Blockbench Desktop 5.x, Generic Model)

For each benchmark, in a fresh project:

1. Run it from the picker; confirm the chat reports parts/groups/PNG size.
2. Orbit the viewport: silhouette reads clearly from front (-Z), side, top.
3. Open the outliner: root group named `FORGE <label>` with subgroups.
4. Open the texture: one `AI_*.png` atlas, crisp 16x16 tiles, no blank faces.
5. Select a cube: UV tab shows a tile inside the atlas bounds.
6. Export OBJ (with textures) and confirm no console errors.
7. Ctrl+Z once: model AND texture disappear; Ctrl+Y restores both.
8. Close/reopen the project with the PNG saved: geometry and UVs persist.

Desktop screenshot comparison across versions is intentionally out of scope
for automation (needs a display server + Blockbench harness); the checklist
above is the supported visual regression path. Known pending work is tracked
in the release notes/CHANGELOG entry for 0.6.0.
