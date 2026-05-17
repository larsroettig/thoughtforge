import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { parseActions } from "@/hooks/useLlm";
import DOMPurify from "dompurify";

// ---------------------------------------------------------------------------
// parseActions — structural invariants
// ---------------------------------------------------------------------------

describe("parseActions — property-based", () => {
  it("cleanText never contains [[ACTION: markers for any input", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const { cleanText } = parseActions(text);
        return !cleanText.includes("[[ACTION:");
      })
    );
  });

  it("always returns an array for actions", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const { actions } = parseActions(text);
        return Array.isArray(actions);
      })
    );
  });

  it("text with no action blocks always produces zero actions", () => {
    const noActionText = fc.string().filter((s) => !s.includes("[[ACTION:"));
    fc.assert(
      fc.property(noActionText, (text) => {
        const { actions } = parseActions(text);
        return actions.length === 0;
      })
    );
  });

  it("cleanText is never longer than the original input", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const { cleanText } = parseActions(text);
        return cleanText.length <= text.length;
      })
    );
  });

  it("every extracted action has a non-empty titleMatch string", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const { actions } = parseActions(text);
        return actions.every((a) => typeof a.titleMatch === "string");
      })
    );
  });
});

// ---------------------------------------------------------------------------
// DOMPurify.sanitize — XSS prevention invariants
// ---------------------------------------------------------------------------

describe("DOMPurify.sanitize — XSS prevention", () => {
  it("output never contains <script tags", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        return !DOMPurify.sanitize(s).includes("<script");
      })
    );
  });

  it("output never contains inline event handlers (onX=)", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        return !/\son\w+\s*=/i.test(DOMPurify.sanitize(s));
      })
    );
  });

  it("output never contains javascript: URIs", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        return !DOMPurify.sanitize(s).toLowerCase().includes("javascript:");
      })
    );
  });

  it("always returns a string", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        return typeof DOMPurify.sanitize(s) === "string";
      })
    );
  });

  it("strips known XSS payloads", () => {
    const payloads = [
      "<script>alert(1)</script>",
      '<img src=x onerror="alert(1)">',
      '<a href="javascript:alert(1)">click</a>',
      "<iframe src=\"javascript:alert('xss')\">",
      '<svg><animate onbegin="alert(1)" attributeName="x">',
      "<<SCRIPT>alert('XSS');//<</SCRIPT>",
    ];
    for (const payload of payloads) {
      const sanitized = DOMPurify.sanitize(payload);
      expect(sanitized).not.toMatch(/<script/i);
      expect(sanitized).not.toMatch(/\son\w+\s*=/i);
      expect(sanitized.toLowerCase()).not.toContain("javascript:");
    }
  });
});
