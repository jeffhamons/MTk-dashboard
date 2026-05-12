// AuthGate — magic-link login wall.
// Wraps the app: shows login form when signed out; resolves user + renders children when signed in.

// Race a promise against a timeout. If it doesn't settle in `ms`, reject. Used to
// guarantee the auth-init effect always transitions out of "loading" — if any
// awaited call hangs (e.g. the Supabase navigator.locks deadlock we hit in prod),
// the timeout fires and we fall through to a visible error state instead of
// leaving the user staring at "Loading…" forever.
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(
      () => rej(new Error(`${label} timed out after ${ms}ms`)),
      ms
    )),
  ]);
}
const AUTH_TIMEOUT_MS = 8000;

function AuthGate({ children }) {
  const [phase, setPhase] = React.useState("loading"); // loading | signed-out | signed-in | error
  const [user, setUser]   = React.useState(null);
  const [email, setEmail] = React.useState("");
  const [busy, setBusy]   = React.useState(false);
  const [msg, setMsg]     = React.useState(null);
  const [errDetail, setErrDetail] = React.useState(null);

  // Supabase v2 fires INITIAL_SESSION on subscription, so onAuthChange covers
  // both the first-load case and subsequent sign-in/sign-out transitions.
  // Previously there was also an explicit getSession() + getMyUser() call here,
  // but that caused both paths to call getMyUser() concurrently on first load —
  // both raced on sb.auth.getUser()'s network call and one would time out.
  React.useEffect(() => {
    let cancelled = false;

    const unsub = window.onAuthChange(async (session) => {
      if (cancelled) return;
      if (session) {
        try {
          const u = await withTimeout(window.getMyUser(session.user), AUTH_TIMEOUT_MS, "getMyUser");
          if (cancelled) return;
          setUser(u);
          setPhase("signed-in");
        } catch (e) {
          console.error("auth change → getMyUser", e);
          if (cancelled) return;
          setErrDetail(e && e.message ? e.message : String(e));
          setPhase("error");
        }
      } else {
        setUser(null);
        setPhase("signed-out");
      }
    });
    return () => { cancelled = true; unsub && unsub(); };
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setMsg(null);
    const { ok, error } = await window.sendMagicLink(email.trim().toLowerCase());
    setBusy(false);
    if (ok) {
      setMsg({ kind: "ok", text: `Magic link sent to ${email}. Check your inbox — click the link to sign in.` });
    } else {
      setMsg({ kind: "err", text: error || "Couldn't send link. Try again or check the email is on the allowlist." });
    }
  }

  if (phase === "loading") {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-loading">Checking sign-in status…</div>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-card__brand">
            <img src={document.getElementById("__logo_src").src} alt="" className="auth-card__mark" />
            <span>Mindtools Kineo</span>
          </div>
          <h1 className="auth-card__title">Sign-in is unavailable.</h1>
          <p className="auth-card__sub">
            We couldn't reach the auth service. This is usually a transient
            issue — try a fresh tab, or close all tabs to this site and reopen.
          </p>
          {errDetail && (
            <pre className="auth-msg auth-msg--err" style={{whiteSpace:"pre-wrap",fontFamily:"ui-monospace,monospace",fontSize:12}}>{errDetail}</pre>
          )}
          <button
            type="button"
            className="auth-form__btn"
            onClick={() => location.reload()}
          >
            Reload
          </button>
          <p className="auth-foot">
            If reloading doesn't help, ping Jeff. The console may have more detail.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "signed-out") {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-card__brand">
            <img src={document.getElementById("__logo_src").src} alt="" className="auth-card__mark" />
            <span>Mindtools Kineo</span>
          </div>
          <h1 className="auth-card__title">Weekly Review</h1>
          <p className="auth-card__sub">Sign in with your work email — we'll send you a magic link.</p>

          <form onSubmit={onSubmit} className="auth-form">
            <label className="auth-form__label" htmlFor="auth-email">Work email</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@mindtools-kineo.com"
              className="auth-form__input"
              disabled={busy}
            />
            <button type="submit" className="auth-form__btn" disabled={busy || !email.trim()}>
              {busy ? "Sending…" : "Send magic link"}
            </button>
          </form>

          {msg && (
            <div className={`auth-msg auth-msg--${msg.kind}`}>{msg.text}</div>
          )}

          <p className="auth-foot">
            Only emails on the allowlist can sign in. If yours isn't working,
            ask Jeff to add it.
          </p>
        </div>
      </div>
    );
  }

  // Signed in but allowlist mismatch (shouldn't happen — trigger blocks it — but defensive)
  if (!user) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1 className="auth-card__title">Hmm.</h1>
          <p className="auth-card__sub">You're signed in but we can't find your account. Try signing out and back in.</p>
          <button className="auth-form__btn" onClick={() => window.signOut()}>Sign out</button>
        </div>
      </div>
    );
  }

  return children({ user });
}

window.AuthGate = AuthGate;
