import { describe, it } from "vitest";
import * as fc from "fast-check";
import { parseTimeInput, formatHours } from "@/lib/time";

describe("parseTimeInput — property-based", () => {
  it("never throws on arbitrary string input", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        parseTimeInput(s);
      })
    );
  });

  it("always returns null or a non-negative number", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const result = parseTimeInput(s);
        return result === null || result >= 0;
      })
    );
  });

  it("plain non-negative integers are always parsed as hours", () => {
    fc.assert(
      fc.property(fc.nat({ max: 9999 }), (n) => {
        const result = parseTimeInput(String(n));
        return result === n;
      })
    );
  });

  it("minutes-only format always yields value in [0, Inf)", () => {
    fc.assert(
      fc.property(fc.nat({ max: 9999 }), (m) => {
        const result = parseTimeInput(`${m}m`);
        return result !== null && Math.abs(result - m / 60) < 0.001;
      })
    );
  });
});

describe("formatHours — property-based", () => {
  it("never throws and always returns a non-empty string", () => {
    fc.assert(
      fc.property(
        fc.float({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (hours) => {
          const result = formatHours(hours);
          return typeof result === "string" && result.length > 0;
        }
      )
    );
  });

  it("non-positive input always returns '0m'", () => {
    fc.assert(
      fc.property(
        fc.float({ min: -1000, max: 0, noNaN: true, noDefaultInfinity: true }),
        (hours) => formatHours(hours) === "0m"
      )
    );
  });

  it("round-trips through parseTimeInput within 1-minute precision", () => {
    // formatHours rounds to whole minutes, so re-parsing should be within 1/60 h
    fc.assert(
      fc.property(fc.nat({ max: 500 }), (wholeMinutes) => {
        const hours = wholeMinutes / 60;
        const formatted = formatHours(hours);
        const reparsed = parseTimeInput(formatted);
        return reparsed !== null && Math.abs(reparsed - hours) < 0.017; // < 1 min
      })
    );
  });
});
