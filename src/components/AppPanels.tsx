import { Suspense, lazy } from "react";
import { AdminPanel, ProfilePanel, SettingsPanel } from "./Panels";
const ArtifactPanel = lazy(() => import("./ArtifactPanel"));
import type { Artifact, AuthUser, Profile, Settings } from "../lib/store";

// Settings/profile/admin/artifact overlays extracted from App.tsx.
export default function AppPanels(p: {
  panel: "settings" | "profile" | "admin" | null;
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  onReset: () => void;
  onClosePanel: () => void;
  profile: Profile | null;
  authUser: AuthUser | null;
  onSaveProfile: (patch: Partial<Profile>) => void;
  onLogout: () => void;
  onToast: (m: string) => void;
  token: string;
  onRefreshSelf: () => void;
  activeArtifactId: string | null;
  artifacts: Record<string, Artifact>;
  onCloseArtifact: () => void;
}) {
  return (
    <>
      {p.panel === "settings" && (
        <SettingsPanel settings={p.settings} onChange={p.onSettings} onClose={p.onClosePanel} onReset={p.onReset} />
      )}
      {p.panel === "profile" && (
        <ProfilePanel profile={p.profile} authUser={p.authUser}
          onSave={p.onSaveProfile}
          onClose={p.onClosePanel} onLogout={p.onLogout} onToast={p.onToast} />
      )}
      {p.panel === "admin" && p.authUser?.isAdmin && (
        <AdminPanel token={p.token} authUserId={p.authUser.id} onRefreshSelf={p.onRefreshSelf} onClose={p.onClosePanel} onToast={p.onToast} />
      )}
      {(() => {
        const artifact = p.activeArtifactId ? p.artifacts[p.activeArtifactId] : undefined;
        return artifact ? (
          <Suspense fallback={<div className="center-page"><div className="spinner" /></div>}>
            <ArtifactPanel key={artifact.id} artifact={artifact} onClose={p.onCloseArtifact} />
          </Suspense>
        ) : null;
      })()}
    </>
  );
}
