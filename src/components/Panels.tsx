import { useEffect, useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Loader2, RefreshCw, Trash2, X, Cpu, XCircle, CheckCircle2 } from "lucide-react";
import { adminStats, adminUsers, clearPending, getModels, testModel, updateAdminUser } from "../lib/api";
import { downscaleImage } from "../lib/store";
import type { AuthUser, Profile, Settings } from "../lib/store";

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const descId = useId();
  // Radix Dialog: focus trap, Escape, aria-modal, and focus restoration.
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content className="panel" aria-describedby={descId}>
          <div className="panel-head"><Dialog.Title asChild><h2>{title}</h2></Dialog.Title>
            <Dialog.Close className="icon-btn" aria-label="Close"><X size={17} /></Dialog.Close></div>
          <Dialog.Description className="sr-only" id={descId}>
            {title} dialog. Press Escape to close.
          </Dialog.Description>
          <div className="panel-body">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const STYLE_PRESETS = [
  { id: "balanced", name: "Balanced", desc: "Straightforward and easygoing", traits: { creativity: 50, formality: 50, verbosity: 50 } },
  { id: "precise", name: "Precise", desc: "Keep it short and to the point", traits: { creativity: 15, formality: 70, verbosity: 20 } },
  { id: "creative", name: "Creative", desc: "Get imaginative with ideas", traits: { creativity: 85, formality: 30, verbosity: 70 } },
  { id: "friendly", name: "Friendly", desc: "Talk like a good friend", traits: { creativity: 60, formality: 15, verbosity: 65 } },
] as const;

function PersonalityField({ settings, onChange }: {
  settings: Settings; onChange: (p: Partial<Settings>) => void;
}) {
  const [custom, setCustom] = useState(false);
  const active = STYLE_PRESETS.find((p) =>
    p.traits.creativity === settings.personality.creativity &&
    p.traits.formality === settings.personality.formality &&
    p.traits.verbosity === settings.personality.verbosity)?.id;
  return (
    <div className="field personality">
      <p className="title">Personality</p>
      <p className="subtitle">How should I talk to you?</p>
      <div className="grid">
        {STYLE_PRESETS.map((p) => (
          <button key={p.id} className={`card ${active === p.id ? "selected" : ""}`} data-style={p.id}
            onClick={() => onChange({ personality: { ...p.traits } })} aria-pressed={active === p.id}>
            <span className="name">{p.name}</span>
            <span className="desc">{p.desc}</span>
          </button>
        ))}
      </div>
      <button className="customize-link" onClick={() => setCustom((v) => !v)}>
        {custom ? "Hide traits" : "Customize traits"}
      </button>
      {custom && (
        <div className="mt-12">
          {(["creativity", "formality", "verbosity"] as const).map((k) => (
            <div key={k} className="trait-row">
              <div className="trait-row-head">
                <span className="trait-name">{k}</span><span className="trait-value">{settings.personality[k]}</span>
              </div>
              <input type="range" min={0} max={100} value={settings.personality[k]}
                onChange={(e) => onChange({ personality: { ...settings.personality, [k]: Number(e.target.value) } })} aria-label={k} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SettingsPanel({ settings, onChange, onClose, onReset }: {
  settings: Settings; onChange: (p: Partial<Settings>) => void; onClose: () => void; onReset: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <Shell title="Settings" onClose={onClose}>
      <div className="field"><span className="flabel" id="theme-label">Theme</span>
        <div className="seg">
          {(["dark", "light"] as const).map((t) => (
            <button key={t} className={settings.theme === t ? "on" : ""} onClick={() => onChange({ theme: t })}>{t === "dark" ? "Dark" : "Light"}</button>
          ))}
        </div>
      </div>
      <div className="field"><span className="flabel" id="behavior-label">Behavior</span>
        <div className="switch-row">
          <div><div className="t">Enter to send</div><div className="d">Turn off to use Enter for new lines</div></div>
          <button role="switch" aria-checked={settings.enterToSend} className={`switch ${settings.enterToSend ? "on" : ""}`} onClick={() => onChange({ enterToSend: !settings.enterToSend })} aria-label="Enter to send" />
        </div>
        <div className="switch-row">
          <div><div className="t">Auto-scroll</div><div className="d">Stay pinned to the latest reply</div></div>
          <button role="switch" aria-checked={settings.autoScroll} className={`switch ${settings.autoScroll ? "on" : ""}`} onClick={() => onChange({ autoScroll: !settings.autoScroll })} aria-label="Auto-scroll" />
        </div>
        <div className="switch-row">
          <div><div className="t">Show timestamps</div><div className="d">Display time under each message</div></div>
          <button role="switch" aria-checked={settings.showTimestamps} className={`switch ${settings.showTimestamps ? "on" : ""}`} onClick={() => onChange({ showTimestamps: !settings.showTimestamps })} aria-label="Show timestamps" />
        </div>
      </div>
      <PersonalityField settings={settings} onChange={onChange} />
      <div className="field"><label htmlFor="cp">Custom instructions</label>
        <textarea id="cp" rows={3} value={settings.customPrompt} onChange={(e) => onChange({ customPrompt: e.target.value })} placeholder="e.g. keep answers short…" /></div>
      {!confirm ? (
        <button className="btn-ghost btn-danger" onClick={() => setConfirm(true)}>Reset everything</button>
      ) : (
        <div className="confirm-box">
          <div className="confirm-title">Start fresh?</div>
          <p className="confirm-text">This wipes your chats, profile and settings. No undo.</p>
          <div className="confirm-actions">
            <button className="btn-primary btn-danger-solid" onClick={onReset}>Yes, reset</button>
            <button className="btn-ghost" onClick={() => setConfirm(false)}>Cancel</button>
          </div>
        </div>
      )}
    </Shell>
  );
}

export function ProfilePanel({ profile, authUser, onSave, onClose, onLogout, onToast }: {
  // Nullable: after a failed/slow cloud load the app renders with local state
  // and profile may still be null. The panel is then how the user sets it.
  profile: Profile | null; authUser: AuthUser | null;
  onSave: (p: Partial<Profile>) => void; onClose: () => void; onLogout?: () => void; onToast?: (m: string) => void;
}) {
  const [name, setName] = useState(profile?.name || "");
  const [avatar, setAvatar] = useState<string | null>(profile?.avatar ?? null);
  // Sync local draft when a different account's profile arrives.
  useEffect(() => {
    setName(profile?.name || "");
    setAvatar(profile?.avatar ?? null);
  }, [profile]);
  const pickFile = (f: File | undefined) => {
    if (!f || !f.type.startsWith("image/")) return;
    const r = new FileReader();
    // Avatars downscale to 256px like composer images — full-res photos in
    // localStorage compound the quota problem (audit P0-2).
    r.onload = () => { void downscaleImage(String(r.result), 256).then((v) => { setAvatar(v); onSave({ avatar: v }); }); };
    r.readAsDataURL(f);
  };
  const commitName = () => {
    const v = name.trim();
  if (v && v !== (profile?.name || "")) { onSave({ name: v }); onToast?.("Name saved"); }
  else setName(profile?.name || "");
  };
  const badges = (authUser?.badge || "").split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <Shell title="Your profile" onClose={onClose}>
      <div className="modal-section avatar-row">
        <label className="avatar avatar-lg" title="Upload photo">
          {avatar ? <img src={avatar} alt="" /> : (name.trim() ? name.trim().charAt(0).toUpperCase() : "?")}
          <input type="file" accept="image/*" hidden onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <div className="profile-meta">
          <div className="username">
            @{authUser?.username || "—"}
            {badges.includes("gold") && <span className="badge gold" title="Gold verified">✓</span>}
            {badges.includes("og") && <span className="badge og" title="OG verified">✓</span>}
          </div>
          <p className="hint">Username can't be changed</p>
        </div>
      </div>
      <div className="modal-section field"><label htmlFor="pf-name">Name</label>
        <input id="pf-name" type="text" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={commitName}          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} placeholder="What should I call you?" /></div>
      {onLogout && <div className="modal-section"><button className="btn-ghost" onClick={onLogout}>Log out</button></div>}
    </Shell>
  );
}

interface AdminUser { id: string; email: string; name: string; username: string; provider: string; verified: boolean; isAdmin: boolean; badge: string | null; modelOverride?: string | null; createdAt: number; }

export function AdminPanel({ token, authUserId, onRefreshSelf, onClose, onToast }: {
  token: string; authUserId?: string; onRefreshSelf?: () => void; onClose: () => void; onToast?: (m: string) => void;
}) {
  const [stats, setStats] = useState<{ totalUsers: number; totalChats: number; pendingSignups: number } | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [pending, setPending] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [models, setModels] = useState<{ key: string; tiers: string[] }[]>([]);
  const [routing, setRouting] = useState("flash");
  const [test, setTest] = useState<{ state: "idle" | "testing" | "ok" | "fail"; msg: string }>({ state: "idle", msg: "" });
  const busy = useRef(false);

  const fetchData = async () => {
    try {
      const [s, u] = await Promise.all([adminStats(token), adminUsers(token)]);
      if (s.ok) setStats(await s.json());
      if (u.ok) {
        const j = await u.json();
        setUsers(j.users || []);
        setPending((j.pending || []).map((p: AdminUser) => ({ ...p, id: `pending:${p.email}` })));
        setTotal(typeof j.total === "number" ? j.total : (j.users || []).length + (j.pending || []).length);
        setLoadError(false);
      } else {
        setLoadError(true);
      }
    } catch { setLoadError(true); }
  };
  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Poll while open so new signups appear without reopening the panel.
  useEffect(() => {
    const id = window.setInterval(fetchData, 15000);
    return () => window.clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void getModels().then((models) => {
      if (!models) return;
      const seen = new Map<string, { key: string; tiers: string[] }>();
      for (const m of models) {
        const key = `${m.provider}/${m.model}`;
        const ex = seen.get(key);
        if (ex) { if (!ex.tiers.includes(m.tier)) ex.tiers.push(m.tier); }
        else seen.set(key, { key, tiers: [m.tier] });
      }
      setModels([...seen.values()]);
    });
  }, []);
  useEffect(() => {
    if (busy.current) return;
    const me = (users || []).find((x) => x.id === authUserId);
    if (me) setRouting(me.modelOverride || "flash");
  }, [users, authUserId]);

  const updateUser = async (id: string, patch: Record<string, unknown>, label?: string): Promise<boolean> => {
    try {
      const r = await updateAdminUser(token, id, patch);
      if (!r.ok) { onToast?.("Couldn't save that — try again"); return false; }
      fetchData();
      if (id === authUserId) onRefreshSelf?.();
      if (label) onToast?.(label);
      return true;
    } catch { onToast?.("Couldn't save that — try again"); return false; }
  };
  const badgeList = (b: string | null) => (b || "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => s === "gold" || s === "og");
  const toggleBadge = (u: AdminUser, which: "gold" | "og") => {
    const next = new Set(badgeList(u.badge));
    if (next.has(which)) next.delete(which); else next.add(which);
    updateUser(u.id, { badge: [...next].join(",") || null, verified: next.size > 0 },
      next.has(which) ? `${which === "gold" ? "Gold" : "OG"} badge on for @${u.username}` : `Badge off for @${u.username}`);
  };
  const changeRouting = async (value: string) => {
    setRouting(value);
    if (!authUserId) return;
    busy.current = true;
    try {
      if (value === "flash" || value === "pro") {
        setTest({ state: "idle", msg: "" });
        if (!(await updateUser(authUserId, { modelOverride: value }))) setTest({ state: "fail", msg: "Save failed — backend may be redeploying." });
        return;
      }
      setTest({ state: "testing", msg: "Saving + testing model…" });
      if (!(await updateUser(authUserId, { modelOverride: value }))) {
        setTest({ state: "fail", msg: "Save failed — backend may be redeploying." });
        return;
      }
      try {
        const r = await testModel(token, value);
        const j = await r.json();
        const first = j?.results?.[0];
        if (String(first?.status || "").startsWith("WORKS")) setTest({ state: "ok", msg: `Pinned + works${String(first.status).includes("via") ? ` (${first.status})` : ""}` });
        else setTest({ state: "fail", msg: first?.error ? `Saved, but test failed: ${String(first.error).slice(0, 90)}` : "Saved, but the model failed the test" });
      } catch { setTest({ state: "fail", msg: "Couldn't reach the test endpoint" }); }
    } finally { busy.current = false; }
  };

  return (
    <Shell title="Admin Panel" onClose={onClose}>
      <div className="stat-grid">
        <div className="stat"><b>{stats?.totalUsers ?? "—"}</b><span>Users</span></div>
        <div className="stat"><b>{stats?.totalChats ?? "—"}</b><span>Chats</span></div>
        <div className="stat"><b>{stats?.pendingSignups ?? "—"}</b><span>Pending</span></div>
      </div>
      <div className="field">
        <label htmlFor="model-routing" className="admin-label"><Cpu size={13} /> Model routing <span className="admin-tag admin-tag--push">Admin only</span></label>
        <select id="model-routing" value={routing} onChange={(e) => changeRouting(e.target.value)} aria-label="Model routing"
          className="admin-select">
          <option value="flash">Luca Flash — default quick routing</option>
          <option value="pro">Luca Pro — default deep routing</option>
          {models.map((m) => <option key={m.key} value={m.key}>{m.key} [{m.tiers.join("/")}]</option>)}
        </select>
        {test.state !== "idle" && (
          <div className={`admin-status admin-status--${test.state}`}>
            {test.state === "testing" ? <Loader2 size={12} className="spinner admin-status-icon" /> : test.state === "ok" ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            {test.msg}
          </div>
        )}
      </div>
      <div className="field"><label>Users {total !== null && users !== null && <span className="user-count">· Showing {users.length + pending.length} of {total} members</span>}</label>
        {users === null && !loadError && <div className="empty-state">Loading members…</div>}
        {users === null && loadError && <div className="empty-state empty-state--error">Couldn't load members. <button className="luca-link" onClick={fetchData}>Try again</button></div>}
        {users !== null && users.length === 0 && pending.length === 0 && <div className="empty-state">Nobody here yet</div>}
        {pending.length > 0 && (
            <div className="pending-head">Pending verification ({pending.length})</div>
        )}
        {pending.map((u) => (
          <div key={u.id} className="user-row">
            <div className="top"><span>@{u.username}</span><span className="admin-tag">Pending</span></div>
            <div className="sub2">{u.name} · {u.email} · {u.provider}</div>
          </div>
        ))}
        {(users || []).map((u) => {
          const b = badgeList(u.badge);
          return (
            <div key={u.id} className="user-row">
              <div className="top">
                <span>@{u.username}</span>
                {b.includes("gold") && <span className="badge gold" title="Gold verified">✓</span>}
                {b.includes("og") && <span className="badge og" title="OG verified">✓</span>}
                {u.isAdmin && <span className="admin-tag">Admin</span>}
              </div>
              <div className="sub2">{u.name} · {u.email} · {u.provider}</div>
              <div className="ops">
                <button className={`mini-btn ${u.isAdmin ? "on-accent" : ""}`} onClick={() => updateUser(u.id, { isAdmin: !u.isAdmin }, u.isAdmin ? `Admin off for @${u.username}` : `@${u.username} is now admin`)}>
                  {u.isAdmin ? "Remove admin" : "Make admin"}
                </button>
                <button className={`mini-btn ${b.includes("gold") ? "on-gold" : ""}`} onClick={() => toggleBadge(u, "gold")}>Gold</button>
                <button className={`mini-btn ${b.includes("og") ? "on-blue" : ""}`} onClick={() => toggleBadge(u, "og")}>OG Blue</button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="admin-actions">
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} />Refresh</button>
        <button className="btn-ghost btn-danger" onClick={async () => {
          await clearPending(token);
          fetchData();
        }}><Trash2 size={13} />Clear pending ({stats?.pendingSignups ?? 0})</button>
      </div>
      <p className="admin-foot"><Check size={13} className="admin-foot-icon" /> All chats are stored per-account and sync across devices.</p>
    </Shell>
  );
}
