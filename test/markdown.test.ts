import { assert } from "chai";
import { renderMarkdown, renderMarkdownForNote } from "../src/utils/markdown";

describe("markdown renderer", function () {
  describe("renderMarkdown", function () {
    it("should return empty string for empty input", function () {
      assert.equal(renderMarkdown(""), "");
      assert.equal(renderMarkdown("   "), "");
    });

    it("should render a simple paragraph", function () {
      const html = renderMarkdown("Hello world");
      assert.include(html, "<p>");
      assert.include(html, "Hello world");
    });

    it("should render bold text", function () {
      const html = renderMarkdown("This is **bold** text.");
      assert.include(html, "<strong>bold</strong>");
    });

    it("should render inline code", function () {
      const html = renderMarkdown("Use `console.log()` for debugging.");
      assert.include(html, "<code>console.log()</code>");
    });

    it("should render fenced code blocks", function () {
      const html = renderMarkdown("```python\nprint('hi')\n```");
      assert.include(html, '<pre class="lang-python">');
      assert.include(html, "print(&#039;hi&#039;)");
    });

    it("should render headers", function () {
      const html = renderMarkdown("# Title\n\n## Subtitle\n\n### Section");
      assert.include(html, "<h2>");
      assert.include(html, "<h3>");
      assert.include(html, "<h4>");
    });

    it("should render unordered lists", function () {
      const html = renderMarkdown("- Item 1\n- Item 2\n- Item 3");
      assert.include(html, "<ul>");
      assert.include(html, "<li>");
      assert.include(html, "Item 1");
    });

    it("should render ordered lists", function () {
      const html = renderMarkdown("1. First\n2. Second\n3. Third");
      assert.include(html, "<ol>");
      assert.include(html, "<li>");
    });

    it("should render blockquotes", function () {
      const html = renderMarkdown("> This is a quote");
      assert.include(html, "<blockquote>");
    });

    it("should render horizontal rules", function () {
      const html = renderMarkdown("Above\n\n---\n\nBelow");
      assert.include(html, "<hr/>");
    });

    it("should render tables", function () {
      const md = "| Col A | Col B |\n| --- | --- |\n| 1 | 2 |";
      const html = renderMarkdown(md);
      assert.include(html, "<table>");
      assert.include(html, "<th>");
      assert.include(html, "<td>");
    });

    it("should render links", function () {
      const html = renderMarkdown("[Example](https://example.com)");
      assert.include(html, '<a href="https://example.com"');
      assert.include(html, "Example");
    });

    it("should escape HTML entities in text", function () {
      const html = renderMarkdown("Use <script> for evil & profit");
      assert.include(html, "&lt;script&gt;");
      assert.include(html, "&amp;");
    });

    it("should handle inline math with $...$", function () {
      const html = renderMarkdown("The formula is $x^2$.");
      // Should contain rendered math (KaTeX span) or a math-inline wrapper
      assert.include(html, "math-inline");
    });

    it("should handle display math with $$...$$", function () {
      const html = renderMarkdown("$$E = mc^2$$");
      assert.include(html, "math-display");
    });

    it("should handle unbalanced delimiters gracefully", function () {
      // Unbalanced backtick should not crash
      const html = renderMarkdown("This has an unmatched ` backtick");
      assert.isString(html);
      assert.include(html, "unmatched");
    });

    it("should handle multiple blocks", function () {
      const md = "# Title\n\nParagraph text.\n\n- List item";
      const html = renderMarkdown(md);
      assert.include(html, "<h2>");
      assert.include(html, "<p>");
      assert.include(html, "<ul>");
    });
  });

  describe("renderMarkdownForNote", function () {
    it("should render display math in note-editor format", function () {
      const html = renderMarkdownForNote("$$x^2 + y^2 = z^2$$");
      assert.include(html, '<pre class="math">$$');
    });

    it("should render inline math in note-editor format", function () {
      const html = renderMarkdownForNote("Inline $x^2$ math.");
      assert.include(html, '<span class="math">$');
    });
  });
});
