import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import ChartBlock from "../ChartBlock";

afterEach(cleanup);

const bar = (labels: string[], values: number[]) =>
  JSON.stringify({ type: "bar", title: "IQ Score vs Cost", labels, values });

describe("ChartBlock", () => {
  it("renders full x-axis labels angled instead of truncating at 10 chars", () => {
    const { container } = render(
      <ChartBlock code={bar(["Claude Opus", "GPT-6 Astra", "DeepSeek R1"], [150, 148, 145])} />
    );
    // Full names present — old code rendered "Claude Op…", "GPT-6 Ast…".
    for (const name of ["Claude Opus", "GPT-6 Astra", "DeepSeek R1"]) {
      expect(container.textContent).toContain(name);
    }
    expect(container.textContent).not.toContain("…");
    // …each on an angled label.
    expect(container.querySelectorAll('text[transform*="rotate(-35"]').length).toBe(3);
  });

  it("scales bars from a zero baseline: similar values look similar (not a bug)", () => {
    const { container } = render(
      <ChartBlock code={bar(["A", "B", "C"], [150, 148, 145])} />
    );
    const heights: number[] = [...container.querySelectorAll("rect")].map((r) =>
      Number(r.getAttribute("height"))
    );
    expect(heights.length).toBe(3);
    // Heights proportional to values: 150 vs 145 differ by ~3%, so the bars
    // SHOULD look nearly identical. A truncated axis would exaggerate this.
    const [h0 = 0, , h2 = 0] = heights;
    expect(h0).toBeGreaterThan(h2);
    expect(h2 / h0).toBeCloseTo(145 / 150, 2);
  });

  it("caps pathological labels but keeps pie legends readable to 22 chars", () => {
    const { container } = render(
      <ChartBlock
        code={bar(
          ["A quite long model name that goes on", "Short"],
          [10, 20]
        )}
      />
    );
    expect(container.textContent).toContain("A quite long model name tha…");
    const { container: pie } = render(
      <ChartBlock
        code={JSON.stringify({
          type: "pie",
          labels: ["A moderately long legend entry here", "B"],
          values: [70, 30],
        })}
      />
    );
    expect(pie.textContent).toContain("A moderately long leg…");
  });

  it("falls back to a code block for invalid specs", () => {
    const { container } = render(<ChartBlock code="not json at all" />);
    expect(container.querySelector("pre")).toBeTruthy();
  });
});
