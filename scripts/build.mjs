// BlockBenchAI FORGE — reproducible zero-dependency bundler.
//
// Reads src/*.ts (strict subset documented in docs/BUILD.md), strips type-level
// syntax with a small tokenizer (no regexes over raw source), concatenates the
// modules in dependency order inside one IIFE closure, and writes the
// standalone Blockbench-installable artifact (blockbench_ai.js + dist copy).
//
// No npm dependencies. Output is deterministic: same sources + same version
// always produce byte-identical output (header embeds version only).

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORDER = [
  'types.ts',
  'validate.ts',
  'geometry.ts',
  'texture.ts',
  'presets.ts',
  'agent.ts',
  'providers.ts',
  'ui.ts',
  'main.ts',
];

function gitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  } catch (_) {
    return 'nogit';
  }
}

// ---------------------------------------------------------------------------
// Tokenizer-based type stripper.
// Handles: imports/exports, interface/type/declare statements, function
// generics, parameter annotations (incl. arrow params), return annotations,
// variable annotations, `as` casts. Strings, template literals (with ${}),
// and comments pass through verbatim.
// Restrictions (enforced by review + docs/BUILD.md):
//   - return/param/variable types are single-line named or simple union/array
//     types (no object literals, no commas inside <> in those positions;
//     use named interfaces instead),
//   - no `as` casts except `as const`-free simple names (sources avoid them),
//   - no `enum`, no namespaces, no decorators, no generic call sites.
// ---------------------------------------------------------------------------

function transpile(source, filename) {
  const fail = (msg) => {
    throw new Error(
      'transpile ' + filename + ': ' + msg + '\n--- context ---\n' + source.slice(Math.max(0, i - 160), i + 60)
    );
  };
  let out = '';
  let i = 0;
  const n = source.length;
  const isIdChar = (c) => /[A-Za-z0-9_$]/.test(c || '');
  const isIdStart = (c) => /[A-Za-z_$]/.test(c || '');

  function lineStart(pos) {
    let j = pos - 1;
    while (j >= 0 && source[j] !== '\n') j--;
    return source.slice(j + 1, pos);
  }
  function readWord() {
    const m = /^[A-Za-z_$][\w$]*/.exec(source.slice(i));
    return m ? m[0] : '';
  }
  function skipWsComments() {
    for (;;) {
      while (i < n && /\s/.test(source[i])) {
        out += source[i];
        i++;
      }
      if (source.startsWith('//', i)) {
        while (i < n && source[i] !== '\n') {
          out += source[i];
          i++;
        }
      } else if (source.startsWith('/*', i)) {
        while (i < n && !source.startsWith('*/', i)) {
          out += source[i];
          i++;
        }
        out += '*/';
        i += 2;
      } else break;
    }
  }
  // Copy a string literal starting at quote character q. Returns when closed.
  function copyString(q) {
    out += source[i];
    i++;
    while (i < n) {
      const c = source[i];
      out += c;
      i++;
      if (c === '\\') {
        if (i < n) {
          out += source[i];
          i++;
        }
      } else if (c === q) return;
      else if (q !== '`' && c === '\n') fail('unterminated string');
    }
    fail('unterminated string');
  }
  // Copy template literal body (called after opening backtick already copied).
  function copyTemplateRest() {
    let depth = 0;
    while (i < n) {
      const c = source[i];
      if (c === '\\') {
        out += c;
        i++;
        if (i < n) {
          out += source[i];
          i++;
        }
      } else if (c === '`' && depth === 0) {
        out += c;
        i++;
        return;
      } else if (c === '$' && source[i + 1] === '{') {
        out += '${';
        i += 2;
        copyBalancedToCloseBrace();
      } else if (c === '{') {
        depth++;
        out += c;
        i++;
      } else if (c === '}') {
        if (depth === 0) return; // closing the outer ${...}; caller consumes
        depth--;
        out += c;
        i++;
      } else {
        out += c;
        i++;
      }
    }
    fail('unterminated template');
  }
  function copyBalancedToCloseBrace() {
    // We are right after '${'; copy code (with type stripping) until matching '}'.
    let depth = 1;
    while (i < n && depth > 0) {
      const c = source[i];
      if (c === '"' || c === "'") copyString(c);
      else if (c === '`') {
        out += c;
        i++;
        copyTemplateRest();
      } else if (source.startsWith('//', i)) {
        while (i < n && source[i] !== '\n') {
          out += source[i];
          i++;
        }
      } else if (source.startsWith('/*', i)) {
        while (i < n && !source.startsWith('*/', i)) {
          out += source[i];
          i++;
        }
        out += '*/';
        i += 2;
      } else if (c === '{') {
        depth++;
        out += c;
        i++;
      } else if (c === '}') {
        depth--;
        out += c;
        i++;
      } else if (c === '(' || c === '[') {
        copyBalancedPair(c, c === '(' ? ')' : ']');
      } else {
        // Type stripping still applies inside ${...}: reuse word rules via copyCodeWord.
        if (isIdStart(c) && !isIdChar(source[i - 1])) {
          if (!copyCodeWord()) {
            out += c;
            i++;
          }
        } else {
          out += c;
          i++;
        }
      }
    }
  }
  function copyBalancedPair(open, close) {
    out += open;
    i++;
    let depth = 1;
    while (i < n && depth > 0) {
      const c = source[i];
      if (c === '"' || c === "'") copyString(c);
      else if (c === '`') {
        out += c;
        i++;
        copyTemplateRest();
      } else if (source.startsWith('//', i)) {
        while (i < n && source[i] !== '\n') {
          out += source[i];
          i++;
        }
      } else if (source.startsWith('/*', i)) {
        while (i < n && !source.startsWith('*/', i)) {
          out += source[i];
          i++;
        }
        out += '*/';
        i += 2;
      } else if (c === open) {
        depth++;
        out += c;
        i++;
      } else if (c === close) {
        depth--;
        out += c;
        i++;
      } else {
        out += c;
        i++;
      }
    }
  }
  // Skip balanced <...> (generics). Assumes current char is '<'.
  function skipGeneric() {
    let depth = 0;
    while (i < n) {
      const c = source[i];
      if (c === '"' || c === "'") {
        // strings cannot appear in our generic positions; copy defensively
        const q = c;
        i++;
        while (i < n && source[i] !== q) {
          if (source[i] === '\\') i++;
          i++;
        }
        i++;
      } else if (c === '<') {
        depth++;
        i++;
      } else if (c === '>') {
        // handle '>>' conservatively: consume one at a time
        depth--;
        i++;
        if (depth === 0) return;
      } else {
        i++;
      }
    }
    fail('unterminated generic <...>');
  }
  // Skip a single-line type expression, stopping at one of the stop chars
  // at nesting depth 0. Returns the stop character found (or '' at EOF/EOL
  // when allowEOL).
  function skipType(stops, allowEOL) {
    let pDepth = 0;
    let bDepth = 0;
    let cDepth = 0;
    let gDepth = 0;
    let sawQuestion = false;
    while (i < n) {
      const c = source[i];
      if (c === '"' || c === "'") {
        const q = c;
        i++;
        while (i < n && source[i] !== q) {
          if (source[i] === '\\') i++;
          i++;
        }
        i++;
        continue;
      }
      if (c === '`' || c === '\n') {
        if (allowEOL && c === '\n') return '\n';
        fail('multiline type expressions are not supported (use a named interface)');
      }
      if (c === '(') pDepth++;
      else if (c === ')') {
        if (pDepth === 0 && bDepth === 0 && cDepth === 0 && gDepth === 0 && stops.includes(')')) return ')';
        pDepth--;
      } else if (c === '[') bDepth++;
      else if (c === ']') bDepth--;
      else if (c === '{') {
        if (pDepth === 0 && bDepth === 0 && cDepth === 0 && gDepth === 0) {
          if (stops.includes('{')) return '{';
          fail('object-literal types must use a named interface');
        }
        cDepth++;
      } else if (c === '}') cDepth--;
      else if (c === '<') gDepth++;
      else if (c === '>') gDepth--;
      else if (c === '?' && source[i + 1] !== '?' && source[i + 1] !== '.') {
        if (pDepth === 0 && bDepth === 0 && cDepth === 0 && gDepth === 0) sawQuestion = true;
      } else if (c === ':' && pDepth === 0 && bDepth === 0 && cDepth === 0 && gDepth === 0) {
        if (!sawQuestion && stops.includes(':')) return ':';
      } else if (c === ',' && pDepth === 0 && bDepth === 0 && cDepth === 0 && gDepth === 0) {
        if (stops.includes(',')) return ',';
        fail('commas are not allowed inside inline types (use a named interface)');
      } else if (c === '=' && source[i + 1] !== '=' && source[i - 1] !== '=' && source[i - 1] !== '!' &&
        pDepth === 0 && bDepth === 0 && cDepth === 0 && gDepth === 0) {
        if (stops.includes('=')) return '=';
      } else if (c === ';' && pDepth === 0 && bDepth === 0 && cDepth === 0 && gDepth === 0) {
        if (stops.includes(';')) return ';';
      }
      // stop words 'of' / 'in' for for-loops: checked at word level below
      i++;
      // check stop words after advancing past a word char run
      if ((c === 'f' || c === 'n') && pDepth === 0 && bDepth === 0 && cDepth === 0 && gDepth === 0) {
        const tail = source.slice(Math.max(0, i - 8), i);
        if (/\s+of\s$/.test(tail) && stops.includes('=')) {
          i -= 4; // rewind ' of ' (stop word handled by caller)
          return 'of';
        }
        if (/\s+in\s$/.test(tail) && stops.includes('=')) {
          i -= 4;
          return 'in';
        }
      }
    }
    return '';
  }
  // Strip ": Type" annotations from a parameter-list span (content between
  // parens, without the parens). Returns the stripped text.
  function stripParams(span) {
    let r = '';
    let j = 0;
    const m = span.length;
    let pD = 0;
    let bD = 0;
    let cD = 0;
    let cur = '';
    const parts = [];
    const flush = () => {
      parts.push(cur);
      cur = '';
    };
    let inS = null;
    while (j < m) {
      const c = span[j];
      if (inS) {
        cur += c;
        if (c === '\\') {
          cur += span[j + 1] || '';
          j += 2;
          continue;
        }
        if (c === inS) inS = null;
        j++;
        continue;
      }
      if (c === '"' || c === "'") {
        inS = c;
        cur += c;
        j++;
        continue;
      }
      if (c === '(') pD++;
      else if (c === ')') pD--;
      else if (c === '[') bD++;
      else if (c === ']') bD--;
      else if (c === '{') cD++;
      else if (c === '}') cD--;
      if (c === ',' && pD === 0 && bD === 0 && cD === 0) {
        flush();
        r += '';
        j++;
        continue;
      }
      cur += c;
      j++;
    }
    flush();
    return parts.map((part) => {
      // Remove trailing ": Type" or "?: Type" at depth 0, keeping default value.
      // A '?' directly before ':' is an optional-marker (dropped); any other
      // '?' starts a ternary guard so its ':' is preserved.
      let skipQ = -1;
      let sd = 0;
      let sb = 0;
      let sc = 0;
      for (let s = 0; s < part.length; s++) {
        const ch = part[s];
        if (ch === '(') sd++;
        else if (ch === ')') sd--;
        else if (ch === '[') sb++;
        else if (ch === ']') sb--;
        else if (ch === '{') sc++;
        else if (ch === '}') sc--;
        else if (ch === '?' && sd === 0 && sb === 0 && sc === 0) {
          let t = s + 1;
          while (t < part.length && /\s/.test(part[t])) t++;
          if (part[t] === ':') {
            skipQ = s;
            break;
          }
        }
      }
      let dd = 0;
      let bd = 0;
      let cd = 0;
      let q = false;
      for (let k = 0; k < part.length; k++) {
        if (k === skipQ) continue;
        const ch = part[k];
        if (ch === '(') dd++;
        else if (ch === ')') dd--;
        else if (ch === '[') bd++;
        else if (ch === ']') bd--;
        else if (ch === '{') cd++;
        else if (ch === '}') cd--;
        else if (ch === '?' && part[k + 1] !== '?' && part[k + 1] !== '.' && dd === 0 && bd === 0 && cd === 0) q = true;
        else if (ch === ':' && dd === 0 && bd === 0 && cd === 0 && !q) {
          let end = part.length;
          // keep default value: find '=' at depth 0 after colon
          let d2 = 0;
          let e2 = 0;
          let f2 = 0;
          for (let t = k + 1; t < part.length; t++) {
            const c2 = part[t];
            if (c2 === '(') d2++;
            else if (c2 === ')') d2--;
            else if (c2 === '[') e2++;
            else if (c2 === ']') e2--;
            else if (c2 === '{') f2++;
            else if (c2 === '}') f2--;
            else if (c2 === '=' && d2 === 0 && e2 === 0 && f2 === 0) {
              end = t;
              break;
            }
          }
          const def = end < part.length ? part.slice(end) : '';
          return part.slice(0, k).replace(/\?\s*$/, '') + def;
        } else if (ch === '=' && dd === 0 && bd === 0 && cd === 0) {
          return part; // default before any annotation colon: nothing to strip
        }
      }
      return part;
    }).join(',');
  }
  // Find matching close paren for '(' at position pos. Returns index or -1.
  function matchParen(pos) {
    let d = 0;
    let k = pos;
    let s = null;
    while (k < n) {
      const c = source[k];
      if (s) {
        if (c === '\\') k++;
        else if (c === s) s = null;
      } else if (c === '"' || c === "'") s = c;
      else if (c === '`') {
        // skip template
        k++;
        while (k < n && source[k] !== '`') {
          if (source[k] === '\\') k++;
          else if (source[k] === '$' && source[k + 1] === '{') {
            let dd = 1;
            k += 2;
            while (k < n && dd > 0) {
              if (source[k] === '{') dd++;
              else if (source[k] === '}') dd--;
              k++;
            }
            continue;
          }
          k++;
        }
      } else if (source.startsWith('//', k)) {
        while (k < n && source[k] !== '\n') k++;
        continue;
      } else if (source.startsWith('/*', k)) {
        const e = source.indexOf('*/', k + 2);
        k = e === -1 ? n : e + 2;
        continue;
      } else if (c === '(') d++;
      else if (c === ')') {
        d--;
        if (d === 0) return k;
      }
      k++;
    }
    return -1;
  }
  function afterParenHasArrow(closeIdx) {
    let k = closeIdx + 1;
    while (k < n && /\s/.test(source[k])) k++;
    if (source[k] === ':') {
      // return type before =>; skip it (single line, no object literals)
      k++;
      let pD = 0;
      while (k < n) {
        const c = source[k];
        if (c === '(') pD++;
        else if (c === ')') pD--;
        else if ((c === '{' || c === ';' || c === '\n') && pD === 0) break;
        else if (c === '=' && source[k + 1] === '>' && pD === 0) break;
        k++;
      }
    }
    return source.startsWith('=>', k);
  }
  // Attempt to handle a word token in code position. Returns true if handled
  // (possibly by skipping), false to emit normally by caller.
  function copyCodeWord() {
    const w = readWord();
    if (!w) return false;
    const prev = out.length ? out[out.length - 1] : '';
    const idPrev = isIdChar(prev) || prev === '.';
    const before = lineStart(i);
    // import statement: skip everything through the terminating ';'
    // (imports are single-purpose lines; the bundler shares one closure).
    if (w === 'import' && !idPrev && /^\s*$/.test(before)) {
      while (i < n && source[i] !== ';') {
        if (source[i] === '"' || source[i] === "'") {
          const q = source[i];
          i++;
          while (i < n && source[i] !== q) {
            if (source[i] === '\\') i++;
            i++;
          }
          i++;
        } else if (source[i] === '`') {
          i++;
          while (i < n && source[i] !== '`') {
            if (source[i] === '\\') i++;
            i++;
          }
          i++;
        } else i++;
      }
      if (source[i] === ';') i++;
      return true;
    }
    if (w === 'export' && !idPrev && /^\s*$/.test(before)) {
      i += 6;
      let k = i;
      while (k < n && /\s/.test(source[k])) k++;
      if (source.startsWith('{', k)) {
        // export { a, b }; -> drop entirely
        const semi = source.indexOf(';', k);
        i = semi === -1 ? n : semi + 1;
        while (i < n && source[i] !== '\n') i++;
        return true;
      }
      // `export default` is not used in our sources
      return true; // dropped the keyword, rest is emitted normally
    }
    if (w === 'interface' && !idPrev) {
      const mark = out.length;
      i += 9;
      // skip name + extends clause up to first '{'
      while (i < n && source[i] !== '{') i++;
      if (source[i] !== '{') fail('malformed interface');
      copyBalancedPair('{', '}');
      out = out.slice(0, mark); // interfaces are type-level: drop the body
      return true;
    }
    // `type Alias = ...;` — but NOT an object key like `{type: 'array'}`.
    // Lookahead required: `type` + Identifier + `=`.
    if (w === 'type' && !idPrev) {
      let k = i + 4;
      while (k < n && /\s/.test(source[k])) k++;
      const m = /^[A-Za-z_$][\w$]*/.exec(source.slice(k));
      if (m) {
        let j = k + m[0].length;
        while (j < n && /\s/.test(source[j])) j++;
        if (source[j] === '=') {
          i = j + 1;
      // skip until ';' at depth 0
      let pD = 0;
      let bD = 0;
      let cD = 0;
      while (i < n) {
        const c = source[i];
        if (c === '"' || c === "'") {
          const q = c;
          i++;
          while (i < n && source[i] !== q) {
            if (source[i] === '\\') i++;
            i++;
          }
          i++;
        } else if (c === ';' && pD === 0 && bD === 0 && cD === 0) {
          i++;
          break;
        } else {
          if (c === '(') pD++;
          else if (c === ')') pD--;
          else if (c === '[') bD++;
          else if (c === ']') bD--;
          else if (c === '{') cD++;
          else if (c === '}') cD--;
          i++;
        }
      }
      return true;
      }
      }
    }
    if (w === 'declare' && !idPrev && /^\s*$/.test(before)) {
      i += 7;
      while (i < n && source[i] !== '\n' && source[i] !== ';') i++;
      if (source[i] === ';') i++;
      return true;
    }
    // `function` declaration/expression — but NOT an object key like
    // `{function: {...}}` (tool schemas). A ':' next means "plain word".
    if ((w === 'function') && !idPrev) {
      let fk = i + 8;
      while (fk < n && /\s/.test(source[fk])) fk++;
      const fc = source[fk];
      if (fc === ':') return false;
      out += w;
      i += 8;
      // copy until '(' , dropping generics
      while (i < n && source[i] !== '(') {
        if (source[i] === '<') skipGeneric();
        else {
          out += source[i];
          i++;
        }
      }
      // param list
      const close = matchParen(i);
      if (close === -1) fail('unbalanced function params');
      const span = source.slice(i + 1, close);
      out += '(' + stripParams(span) + ')';
      i = close + 1;
      // optional return type
      let k = i;
      while (k < n && /\s/.test(source[k])) k++;
      if (source[k] === ':') {
        i = k + 1;
        const stop = skipType(['{', '=', ';'], false);
        if (stop === '=') {
          // '=>' arrow: leave '=' for main loop
        } else if (stop === ';') {
          out += ';';
          i++;
        }
        // '{' stays for main loop
      }
      return true;
    }
    if ((w === 'const' || w === 'let' || w === 'var') && !idPrev) {
      out += w;
      i += w.length;
      // copy whitespace + name
      while (i < n && /[\s]/.test(source[i])) {
        out += source[i];
        i++;
      }
      const nm = readWord();
      out += nm;
      i += nm.length;
      if (source[i] === '?') {
        i++; // definite-assignment style `x?: T` at top level is not used; drop '?'
      }
      while (i < n && /[\s]/.test(source[i])) {
        out += source[i];
        i++;
      }
      if (source[i] === ':') {
        i++;
        const stop = skipType(['=', ';', ',', 'of', 'in'], false);
        if (stop === '=') {
          out += ' =';
          i++;
        } else if (stop === ';') {
          out += ';';
          i++;
        } else if (stop === ',') {
          out += ',';
          i++;
        } else if (stop === 'of' || stop === 'in') {
          out += ' ' + stop + ' ';
          i += 4;
        }
      }
      return true;
    }
    if (w === 'as') {
      let prev = '';
      for (let p = out.length - 1; p >= 0; p--) {
        const ch = out[p];
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') continue;
        prev = ch;
        break;
      }
      if (isIdChar(prev) || prev === ')' || prev === ']' || prev === '}' || prev === '"' || prev === "'") {
      // drop `as Type` (simple type names only)
      i += 2;
      while (i < n && /\s/.test(source[i])) i++;
      const t = readWord();
      if (!t) fail('malformed `as` cast');
      i += t.length;
      while (i < n && (source[i] === '[' || source[i] === ']' || source[i] === '.' )) {
        // qualified names / arrays: copy nothing, just skip
        if (source[i] === '.') {
          i++;
          const q = readWord();
          i += q.length;
        } else i++;
      }
      if (source[i] === '<') skipGeneric();
      return true;
      }
    }
    return false;
  }

  // Main single-pass scan.
  while (i < n) {
    const c = source[i];
    if (c === '"' || c === "'") copyString(c);
    else if (c === '`') {
      out += c;
      i++;
      copyTemplateRest();
    } else if (source.startsWith('//', i)) {
      while (i < n && source[i] !== '\n') {
        out += source[i];
        i++;
      }
    } else if (source.startsWith('/*', i)) {
      while (i < n && !source.startsWith('*/', i)) {
        out += source[i];
        i++;
      }
      out += '*/';
      i += 2;
    } else if (c === '(') {
      const close = matchParen(i);
      if (close !== -1 && afterParenHasArrow(close)) {
        const span = source.slice(i + 1, close);
        out += '(' + stripParams(span) + ')';
        i = close + 1;
        let k = i;
        while (k < n && /\s/.test(source[k])) k++;
        if (source[k] === ':') {
          i = k + 1;
          skipType(['='], false); // must be '=>' next
        }
      } else {
        out += c;
        i++;
      }
    } else if (isIdStart(c) && !isIdChar(source[i - 1])) {
      if (!copyCodeWord()) {
        out += c;
        i++;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function build() {
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  const hash = gitHash();
  const parts = ORDER.map((name) => {
    const src = readFileSync(join(ROOT, 'src', name), 'utf8');
    if (/[\u00c2\u00c3]/.test(src)) {
      throw new Error('refusing to build ' + name + ': mojibake markers (use \\u escapes)');
    }
    if (/[\u0080-\u009F]/.test(src)) {
      throw new Error('refusing to build ' + name + ': control characters (probable mojibake)');
    }
    const js = transpile(src, name);
    if (process.env.FORGE_DEBUG) console.log(name + ': srcLen=' + src.length + ' jsLen=' + js.length + ' tail=' + JSON.stringify(js.slice(-80)));
    return { name, js };
  });
  // Balance check: every module's braces/parens must survive stripping.
  const banner =
    '/* Blockbench AI ' + version + ' FORGE — MIT License, github.com/jonathanthxd/BlockBenchAI */\n' +
    '/* Built from src/*.ts (' + hash + '). Do not edit by hand; edit src/ and run `npm run build`. */\n';
  const body = parts
    .map((p) => '\n// ---- src/' + p.name + ' ----\n' + p.js.trim() + '\n')
    .join('');
  const output = banner + '(function () {\n  \'use strict\';\n' + body + '\n})();\n';
  writeFileSync(join(ROOT, 'blockbench_ai.js'), output);
  writeFileSync(join(ROOT, 'dist', 'blockbench_ai.js'), output);
  console.log('FORGE build ok: ' + ORDER.length + ' modules -> blockbench_ai.js (' + output.length + ' bytes)');
}

build();
