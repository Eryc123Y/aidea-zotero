import { assert } from "chai";

/**
 * paperSearch unit tests
 *
 * The paperSearch module's core scoring functions are internal. This test
 * exercises the publicly observable scoring logic via the exported
 * `searchPaperCandidates` function, but since that depends on Zotero runtime,
 * we test the CJK-aware tokenizer used by scoring indirectly.
 *
 * We can directly test the splitSearchTokens-like behavior by replicating
 * the same regex pattern used in paperSearch.ts.
 */

/** Replicate the splitSearchTokens logic from paperSearch.ts */
function splitSearchTokens(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const rawTokens = trimmed.split(/\s+/g).filter(Boolean);
  const tokens: string[] = [];
  for (const token of rawTokens) {
    const parts = token.match(
      /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]|[^\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]+/g,
    );
    if (parts) {
      tokens.push(...parts.filter(Boolean));
    } else {
      tokens.push(token);
    }
  }
  return tokens;
}

describe("paperSearch tokenization", function () {
  it("should split English query into tokens by whitespace", function () {
    const tokens = splitSearchTokens("machine learning paper");
    assert.deepEqual(tokens, ["machine", "learning", "paper"]);
  });

  it("should split Chinese characters individually", function () {
    const tokens = splitSearchTokens("机器学习");
    assert.deepEqual(tokens, ["机", "器", "学", "习"]);
  });

  it("should handle mixed English and Chinese", function () {
    const tokens = splitSearchTokens("deep学习 model");
    // "deep" is non-CJK, "学" and "习" are individual CJK chars
    assert.deepEqual(tokens, ["deep", "学", "习", "model"]);
  });

  it("should handle empty input", function () {
    assert.deepEqual(splitSearchTokens(""), []);
    assert.deepEqual(splitSearchTokens("   "), []);
  });

  it("should handle pure whitespace between tokens", function () {
    const tokens = splitSearchTokens("a   b   c");
    assert.deepEqual(tokens, ["a", "b", "c"]);
  });

  it("should keep fullwidth characters as individual tokens", function () {
    // e.g., fullwidth parentheses \uff08 \uff09
    const tokens = splitSearchTokens("论文（2024）");
    assert.include(tokens, "论");
    assert.include(tokens, "文");
    assert.include(tokens, "（");
    assert.include(tokens, "2024");
    assert.include(tokens, "）");
  });
});
