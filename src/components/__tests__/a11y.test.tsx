import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { run } from "axe-core";
import Auth from "../Auth";
import Sidebar from "../Sidebar";
import type { Session } from "../../lib/store";

const demoSessions: Session[] = [
  { id: "s1", title: "First chat", createdAt: 1, updatedAt: 2, messages: [] },
  { id: "s2", title: "Second chat", createdAt: 3, updatedAt: 4, pinned: true, messages: [] },
];

describe("accessibility", () => {
  it("auth page has no axe violations", async () => {
    const { container } = render(<Auth onAuth={() => {}} onGuest={() => {}} />);
    const results = await run(container);
    expect(results.violations).toEqual([]);
  });

  it("sidebar has no axe violations", async () => {
    const noop = () => {};
    const { container } = render(
      <Sidebar
        sessions={demoSessions} activeId="s1" search="" onSearch={noop}
        onSelect={noop} onNew={noop} onRename={noop} onTogglePin={noop}
        onDelete={noop} onOpenSettings={noop} onOpenProfile={noop}
        onClearAll={noop} onLogout={noop} authUser={null} profile={null}
        mobileOpen={false} onCloseMobile={noop} collapsed={false}
        onToggleSidebar={noop}
      />
    );
    const results = await run(container);
    expect(results.violations).toEqual([]);
  });
});
