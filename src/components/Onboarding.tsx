import { downscaleImage } from "../lib/store";

export function UsernameGate({
  email,
  draft,
  onDraft,
  onSubmit,
}: {
  email: string;
  draft: string;
  onDraft: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="center-page">
      <div className="auth-card">
        <h1>Pick a username</h1>
        <p className="sub">Signed in as {email}. Usernames stick around, so pick one you like.</p>
        <div className="field">
          <label htmlFor="un">Username</label>
          <input
            id="un"
            type="text"
            value={draft}
            onChange={(e) => onDraft(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            placeholder="yourname"
            maxLength={20}
          />
        </div>
        <button className="btn-primary" disabled={draft.trim().length < 3} onClick={onSubmit}>
          Continue
        </button>
      </div>
    </div>
  );
}

export function ProfileGate({
  nameDraft,
  avatarDraft,
  onNameDraft,
  onAvatarDraft,
  onSubmit,
}: {
  nameDraft: string;
  avatarDraft: string | null;
  onNameDraft: (v: string) => void;
  onAvatarDraft: (v: string | null) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="center-page">
      <div className="auth-card">
        <h1>What should I call you?</h1>
        <p className="sub">This helps me answer in a way that suits you. You can change it anytime in your profile.</p>
        <div className="field">
          <span className="flabel" id="avatar-label">
            Profile picture <span className="opt">(optional)</span>
          </span>
          <label
            className="avatar avatar-picker"
            title="Upload a profile picture"
            aria-labelledby="avatar-label"
          >
            {avatarDraft ? (
              <img src={avatarDraft} alt="" />
            ) : (
              nameDraft.trim() ? nameDraft.trim().charAt(0).toUpperCase() : "?"
            )}
            <input
              type="file"
              accept="image/*"
              hidden
              aria-label="Upload a profile picture"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f || !f.type.startsWith("image/")) return;
                const r = new FileReader();
                r.onload = () => {
                  void downscaleImage(String(r.result), 256).then((v) => onAvatarDraft(v));
                };
                r.readAsDataURL(f);
              }}
            />
          </label>
        </div>
        <div className="field">
          <label htmlFor="nm">Name</label>
          <input
            id="nm"
            type="text"
            value={nameDraft}
            onChange={(e) => onNameDraft(e.target.value)}
            placeholder="Harper"
            maxLength={40}
          />
        </div>
        <button className="btn-primary" onClick={onSubmit}>
          Start chatting
        </button>
      </div>
    </div>
  );
}
