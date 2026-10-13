# FORGE build — reproducible zero-dependency bundler

`blockbench_ai.js` (the file Blockbench installs) is **generated**, never
hand-edited. Sources live in `src/*.ts`; `scripts/build.mjs` concatenates
them in dependency order inside one IIFE closure:

```
types -> validate -> geometry -> texture -> presets -> agent -> providers -> ui -> main
```

Run `npm run build` (Node 20+, no `npm install` needed). The output is
deterministic: identical sources always produce byte-identical output
(the header embeds only the package version, so rebuilding leaves the
working tree clean).

## Why a custom transpiler

The plugin must ship as a **single dependency-free file** that also loads in
the Blockbench sandbox. Instead of pulling the TypeScript compiler into the
project, `scripts/build.mjs` strips type-level syntax with a small tokenizer
(strings, template literals with `${}`, and comments pass through verbatim).

## Supported TypeScript subset

- `interface` / `type` declarations (statement level, skipped wholesale)
- `declare const X: any;` host declarations (skipped)
- Parameter annotations, incl. arrow params and optional `name?: Type`
- Return annotations (named/simple types only)
- Variable annotations (`const x: Type = ...`, incl. `for...of` targets
  which must stay unannotated)
- Function generics in declarations (`function f<T>(...)`)
- Simple `as Name` casts (no tuples, no object literals, no function types)
- `import ...;` lines, incl. multi-line (erased: see below)
- `export` prefixes (erased: see below)

## Hard rules (enforced by review + build-time guards)

1. **No object-literal types** in param/return/variable position.
   Use a named `interface` (e.g. `PanelPrefs`, `ForgeConfig`).
2. **No commas inside inline generics** in annotations
   (`Record<string, string>` is forbidden; use `StringMap`-style interfaces).
3. **No function-typed parameters** (`cb: (x: T) => R`). Type callbacks
   as `Function`.
4. **No generic call sites** (`f<string>(...)`).
5. **No `enum`, namespaces, decorators, parameter properties, or classes
   with typed fields** in shipped code (factories + closures instead).
6. **Regex literals must not contain quote characters.** A `"` or `'`
   inside `/.../ ` desynchronizes the scanner; use `new RegExp('...')`
   with a string pattern for those cases (see `safeError`).
7. **Imports/exports are erased.** Every module shares one closure, so a
   value import MUST name the exact top-level declaration of the defining
   module (no aliases for values; `import type` for annotations only).
8. **Sources should stay ASCII** outside string escapes. Non-ASCII inside
   string/template literals is fine when written as `\uXXXX` escapes;
   the build refuses files containing mojibake markers (U+00C2/U+00C3
   from double-encoded UTF-8) or C1 control characters.

Violations fail the build with a file/position message instead of
silently emitting broken JavaScript.

## Verifying

- `node scripts/build.mjs` — rebuilds `blockbench_ai.js` and `dist/`.
- `node --check blockbench_ai.js` — syntax check of the artifact.
- `npm run check` — build + syntax + full test suite (63 tests).
- `npm test` — runs `tests/*.test.cjs` against the current artifact.
