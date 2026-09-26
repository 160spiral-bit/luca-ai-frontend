import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import Markdown, { bindCitations } from "../Markdown";

const SRC = [{ id: 1, url: "https://a.com", domain: "a.com", title: "A" }];

describe("markdown sanitisation", () => {
  it("neutralises attribute-break payloads", () => {
    const { container } = render(
      <Markdown text={'![x](https://a.com"onerror="alert(1))'} />
    );
    expect(container.querySelector("[onerror]")).toBeNull();
  });

  it("strips javascript: links and script tags", () => {
    const { container } = render(
      <Markdown text={'[x](javascript:alert(1))\n\n<script>alert(2)</script>'} />
    );
    expect(container.querySelector("script")).toBeNull();
    const a = container.querySelector("a");
    if (a) expect(a.getAttribute("href") ?? "").not.toMatch(/^javascript:/);
  });

  it("keeps literal bracketed numbers", () => {
    const { container } = render(<Markdown text="arr[10] and [1]" sources={SRC} />);
    expect(container.textContent).toContain("arr[10]");
  });

  it("renders data: images directly but gates remote ones behind a click", () => {
    const { container } = render(
      <Markdown text={'![a](data:image/png;base64,AAA)\n\n![b](https://evil.example/x.png)'} />
    );
    const imgs = container.querySelectorAll("img");
    expect(imgs.length).toBe(1);
    expect(imgs[0]?.getAttribute("src") ?? "").toMatch(/^data:image\//);
    const gate = container.querySelector(".img-gate");
    expect(gate?.textContent ?? "").toContain("evil.example");
  });

  it("strips scriptable SVG constructs", () => {
    const { container } = render(
      <Markdown text={'```viz:svg\n<svg><foreignObject><div>hi</div></foreignObject><circle r="5"/></svg>\n```'} />
    );
    expect(container.querySelector("foreignObject")).toBeNull();
  });
});

describe("bindCitations", () => {
  it("preserves unknown ids and links known ones", () => {
    expect(bindCitations("Use arr[10] and cfg[42] then cite [1].", SRC)).toContain("arr[10]");
    expect(bindCitations("cite [1].", SRC)).toContain("https://a.com");
  });
});
