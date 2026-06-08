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

// One transient retry with a short backoff. Absorbs single-blip network flakes
// before they reach the user as the "Sign-in is unavailable" error screen.
async function withRetry(fn, label, retries = 1, backoffMs = 500) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        console.warn(`${label} attempt ${attempt + 1} failed, retrying in ${backoffMs}ms:`, e && e.message);
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }
  }
  throw lastErr;
}
const AUTH_TIMEOUT_MS = 8000;

// Users whose corporate tenant runs link scanners (Microsoft Safe Links via
// Teams/Outlook) that consume single-use magic-link tokens before the human
// can click them. For these emails we keep the same signInWithOtp call but
// finish the flow by entering the 6-digit token from the email body into a
// verifyOtp form, so no URL fragment is ever touched by a bot.
// Currently empty — brenda.bravener@ removed 2026-06-02 when her access was
// revoked. Add an address here if a future allowlisted user hits the same
// corporate-scanner problem.
const OTP_CODE_USERS = new Set([]);

// Hold the loading paint briefly. Cached-session resolutions are usually
// <200ms; flashing "Checking sign-in status…" for one paint frame before the
// App mounts feels worse than showing nothing.
const LOADING_PAINT_DELAY_MS = 250;

function AuthGate({ children }) {
  const [phase, setPhase] = React.useState("loading"); // loading | signed-out | signed-in | error
  const [user, setUser]   = React.useState(null);
  const [preloadedState, setPreloadedState] = React.useState(null);
  const [email, setEmail] = React.useState("");
  const [busy, setBusy]   = React.useState(false);
  const [msg, setMsg]     = React.useState(null);
  const [errDetail, setErrDetail] = React.useState(null);
  const [showLoading, setShowLoading] = React.useState(false);
  // OTP-code path: once the email has been sent for an OTP_CODE_USERS address,
  // flip to a "paste the 6-digit code" form. Successful verifyOtp triggers
  // onAuthChange → phase becomes signed-in, so this view unmounts naturally.
  const [otpStage, setOtpStage] = React.useState("email"); // "email" | "code"
  const [code, setCode] = React.useState("");

  // Tracks whether we've already resolved into a live signed-in session. Read
  // inside the auth-change handler (whose closure captures `phase` stale), so a
  // routine background token refresh doesn't re-gate — and possibly error out —
  // an app the user is actively using.
  const signedInRef = React.useRef(false);

  // Defer the loading-card paint so fast resolutions never flash UI.
  React.useEffect(() => {
    const t = setTimeout(() => setShowLoading(true), LOADING_PAINT_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  // Supabase v2 fires INITIAL_SESSION on subscription, so onAuthChange covers
  // both the first-load case and subsequent sign-in/sign-out transitions.
  // Previously there was also an explicit getSession() + getMyUser() call here,
  // but that caused both paths to call getMyUser() concurrently on first load —
  // both raced on sb.auth.getUser()'s network call and one would time out.
  React.useEffect(() => {
    let cancelled = false;

    // Watchdog: if onAuthChange never fires its INITIAL_SESSION callback
    // (e.g. Supabase auth construction threw, the network is wedged, etc.),
    // surface an error instead of leaving the user on "Checking sign-in
    // status…" forever. Cleared as soon as we get any callback.
    const watchdog = setTimeout(() => {
      if (cancelled) return;
      console.error("auth init watchdog fired — onAuthChange never delivered a session");
      setErrDetail("auth init timed out — onAuthChange never fired");
      setPhase("error");
    }, AUTH_TIMEOUT_MS);

    const unsub = window.onAuthChange(async (evt, session) => {
      if (cancelled) return;
      clearTimeout(watchdog);

      // Routine background maintenance on an already-live session must NOT
      // re-gate the app. autoRefreshToken fires TOKEN_REFRESHED periodically
      // and whenever an idle/backgrounded tab refocuses; the refreshed JWT is
      // already applied to the client, so the running app needs nothing from
      // us. Re-running getMyUser here (raced against AUTH_TIMEOUT_MS) was
      // bouncing active users to the "Sign-in is unavailable" screen whenever
      // that refresh-time call hung — e.g. the navigator.locks wedge that's
      // most likely right after a tab wakes. Ignore it and keep the session.
      // SIGNED_OUT/USER_DELETED carry a null session and fall through below.
      if (signedInRef.current && session && (evt === "TOKEN_REFRESHED" || evt === "USER_UPDATED" || evt === "SIGNED_IN")) {
        return;
      }

      if (session) {
        try {
          // Parallel: the user-row query and the state queries both need
          // only the JWT (already attached to the client at this point).
          // Running them concurrently saves one full RTT on cold load.
          const userPromise = withTimeout(
            withRetry(() => window.getMyUser(session.user), "getMyUser"),
            AUTH_TIMEOUT_MS,
            "getMyUser"
          );
          // Preload is best-effort; if it fails App's own boot effect will
          // retry. Never let a preload error block sign-in.
          const statePromise = window.SUPABASE_CONFIGURED && window.loadStateFromSupabase
            ? window.loadStateFromSupabase().catch(e => {
                console.warn("state preload failed (App will retry):", e && e.message);
                return null;
              })
            : Promise.resolve(null);
          const [u, preloaded] = await Promise.all([userPromise, statePromise]);
          if (cancelled) return;
          setUser(u);
          setPreloadedState(preloaded);
          signedInRef.current = true;
          setPhase("signed-in");
        } catch (e) {
          console.error("auth change → getMyUser", e);
          if (cancelled) return;
          setErrDetail(e && e.message ? e.message : String(e));
          setPhase("error");
        }
      } else {
        signedInRef.current = false;
        setUser(null);
        setPreloadedState(null);
        setPhase("signed-out");
      }
    });
    return () => { cancelled = true; clearTimeout(watchdog); unsub && unsub(); };
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    setBusy(true);
    setMsg(null);
    const { ok, error } = await window.sendMagicLink(normalized);
    setBusy(false);
    if (!ok) {
      setMsg({ kind: "err", text: error || "Couldn't send link. Try again or check the email is on the allowlist." });
      return;
    }
    if (OTP_CODE_USERS.has(normalized)) {
      setOtpStage("code");
      setMsg({ kind: "ok", text: `Email sent to ${normalized}. Enter the 6-digit code from the email — don't click the link.` });
    } else {
      setMsg({ kind: "ok", text: `Magic link sent to ${email}. Check your inbox — click the link to sign in.` });
    }
  }

  async function onSubmitCode(e) {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    const cleaned = code.replace(/\D/g, "").slice(0, 6);
    if (!normalized || cleaned.length !== 6) return;
    setBusy(true);
    setMsg(null);
    const { ok, error } = await window.verifyEmailOtp(normalized, cleaned);
    setBusy(false);
    if (ok) {
      setMsg({ kind: "ok", text: "Signing you in…" });
      // onAuthChange will lift us into phase=signed-in on success.
    } else {
      setMsg({ kind: "err", text: error || "Code didn't verify. Double-check it or request a fresh one." });
    }
  }

  function resetToEmailStage() {
    setOtpStage("email");
    setCode("");
    setMsg(null);
  }

  if (phase === "loading") {
    // Hold blank for one short tick so cached-session resolutions don't flash
    // a loading card before the App mounts.
    if (!showLoading) return null;
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

          {otpStage === "email" ? (
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
              {/* OTP_CODE_USERS may have their address on Supabase's managed-email
                  suppression list (legacy bounces), in which case signInWithOtp
                  returns email_address_invalid and the code-stage flip in onSubmit
                  never fires. This escape hatch lets them reach the code form
                  with an admin-generated OTP relayed out-of-band. */}
              {OTP_CODE_USERS.has(email.trim().toLowerCase()) && (
                <button
                  type="button"
                  className="auth-card__alt"
                  onClick={() => { setOtpStage("code"); setMsg(null); }}
                  disabled={busy}
                >
                  I already have a code
                </button>
              )}
            </form>
          ) : (
            <form onSubmit={onSubmitCode} className="auth-form">
              <label className="auth-form__label" htmlFor="auth-code">6-digit code</label>
              <input
                id="auth-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                className="auth-form__input"
                disabled={busy}
                autoFocus
              />
              <button type="submit" className="auth-form__btn" disabled={busy || code.length !== 6}>
                {busy ? "Verifying…" : "Sign in"}
              </button>
              <button
                type="button"
                className="auth-card__alt"
                onClick={resetToEmailStage}
                disabled={busy}
              >
                Use a different email
              </button>
            </form>
          )}

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

  // Signed in but no matched rep row (allowlist mismatch). getMyUser always
  // returns the synthesized fallback { rep_id: null, role: "rep" } when no
  // users-table row exists for this auth_id, so `!user` is unreachable here —
  // the real signal is "no rep_id and not a manager."
  const unmatched = !user || (!user.rep_id && user.role !== "manager");
  if (unmatched) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1 className="auth-card__title">Hmm.</h1>
          <p className="auth-card__sub">You're signed in but we can't find your account. Try signing out and back in, or ask Jeff to add your email to the allowlist.</p>
          <button className="auth-form__btn" onClick={() => window.signOut()}>Sign out</button>
        </div>
      </div>
    );
  }

  return children({ user, preloadedState });
}

window.AuthGate = AuthGate;
