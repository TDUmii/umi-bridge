import { createRequire } from 'node:module';
import { Tiktoken } from 'js-tiktoken/lite';
import o200k from 'js-tiktoken/ranks/o200k_base';

const require = createRequire(import.meta.url);
const pattern = new RegExp(o200k.pat_str, 'ug');
const mode = process.env.RUST_ANYTHING_MODE;
let nativeCount;
if (mode !== 'old') {
  try {
    const { countTokenPieces } = require('./native/umi_tokenizer.node');
    if (countTokenPieces([]) === 0) nativeCount = countTokenPieces;
  } catch { /* The source checkout and unsupported platforms use JavaScript. */ }
}
let tokenizer = nativeCount ? null : new Tiktoken(o200k);
function countWithJavaScript(text) {
  tokenizer ??= new Tiktoken(o200k);
  return tokenizer.encode(text, [], []).length;
}

export function countOrdinaryTokens(text) {
  if (nativeCount) {
    try {
      // Preserve the original ECMAScript split, including Unicode whitespace.
      const pieces = text.match(pattern) ?? [];
      // TextEncoder replaces lone surrogates after the original split.
      const count = nativeCount(text.isWellFormed() ? pieces : pieces.map(piece => piece.toWellFormed()));
      if (mode !== 'shadow') return count;
      const original = countWithJavaScript(text);
      if (count !== original) {
        nativeCount = undefined;
        process.emitWarning('UmiBridge tokenizer results differed. Using JavaScript.');
      }
      return original;
    } catch { /* Fall back when a native call fails. */ }
  }
  return countWithJavaScript(text);
}
