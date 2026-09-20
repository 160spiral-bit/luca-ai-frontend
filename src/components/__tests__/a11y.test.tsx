import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { run } from "axe-core";
import Auth from "../Auth";
import { Landing } from "../../pages";

describe("accessibility", () => {
  it("landing page has no axe violations", async () => {
    const { container } = render(<Landing onEnter={() => {}} />);
    const results = await run(container);
    expect(results.violations).toEqual([]);
  });

  it("auth page has no axe violations", async () => {
    const { container } = render(<Auth onAuth={() => {}} onGuest={() => {}} />);
    const results = await run(container);
    expect(results.violations).toEqual([]);
  });
});
