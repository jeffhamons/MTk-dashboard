const { useState, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "purple",
  "density": "cozy",
  "layout": "compact",
  "showWhy": true
}/*EDITMODE-END*/;

function App({ authedUser }) {
  // Supabase-backed when configured; falls back to localStorage otherwise.
  const useCloud = !!window.SUPABASE_CONFIGURED;
  const isManager = authedUser && authedUser.role === "manager";
  const myRepId = authedUser ? (authedUser.rep_id || "") : "";

  const [state, setState] = useState(() => loadState());
  // Manager defaults to rollup; reps default to their own week
  const [view, setView] = useState(() => (myRepId && !isManager) ? myRepId : "rollup");
  const [weekIdx, setWeekIdx] = useState(currentWeekIndex());
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [cloudReady, setCloudReady] = useState(!useCloud);

  // Read-only when viewing someone else's week (not your own, not manager)
  const isReadOnly = authedUser && view !== "rollup" && view !== myRepId && !isManager;

  // Boot: if cloud, migrate-once → load → subscribe to realtime
  useEffect(() => {
    if (!useCloud) return;
    let unsubscribe = () => {};
    let cancelled = false;
    (async () => {
      try {
        await window.migrateLocalToSupabase();
        const fresh = await window.loadStateFromSupabase();
        if (cancelled) return;
        setState(fresh);
        setCloudReady(true);
        unsubscribe = window.subscribeRealtime(async () => {
          const next = await window.loadStateFromSupabase();
          setState(next);
        });
      } catch (e) {
        console.error("supabase boot failed, falling back to local:", e);
        setCloudReady(true);
      }
    })();
    return () => unsubscribe();
  }, [useCloud]);

  // Persist locally whenever state changes (offline cache + non-cloud mode)
  useEffect(() => { saveState(state); }, [state]);

  // Apply tweaks to root
  useEffect(() => {
    document.documentElement.dataset.accent  = tweaks.accent;
    document.documentElement.dataset.density = tweaks.density;
    document.documentElement.dataset.layout  = tweaks.layout;
    document.documentElement.style.setProperty("--deliv-count", DELIVERABLES.length);
  }, [tweaks]);

  const onCheck = (repId, weekId, delId) => {
    if (authedUser && !isManager && repId !== myRepId) return; // peer view = read-only
    const k = checkKey(repId, weekId, delId);
    const wasChecked = !!state.checks[k];
    const now = new Date().toISOString();
    // Build markedBy attribution from current auth
    let markedBy = undefined;
    if (authedUser) {
      const meRep = REPS.find(r => r.id === myRepId);
      markedBy = {
        email: authedUser.authEmail,
        name: isManager ? (authedUser.authEmail.split("@")[0]) : (meRep ? meRep.name : authedUser.authEmail),
        role: isManager ? "manager" : "rep",
      };
    }
    // Optimistic local update
    setState(s => {
      const checks = { ...s.checks };
      if (checks[k]) delete checks[k];
      else checks[k] = wasChecked ? null : { at: now, markedBy: markedBy ? { ...markedBy, at: now } : undefined };
      return { ...s, checks };
    });
    // Write through to Supabase
    if (useCloud) {
      window.toggleCheckSupabase(repId, weekId, delId, wasChecked, markedBy).catch(console.error);
    }
  };

  const onSaveNote = (repId, weekId, delId, note) => {
    if (!isManager) return; // RLS will block anyway, but bail early
    const k = `${repId}|${weekId}|${delId}`;
    setState(s => {
      const managerNotes = { ...(s.managerNotes || {}) };
      if (!note || !note.trim()) delete managerNotes[k];
      else managerNotes[k] = { note: note.trim(), updated_by: authedUser.authEmail, updated_at: new Date().toISOString() };
      return { ...s, managerNotes };
    });
    if (useCloud) {
      window.setManagerNoteSupabase(repId, weekId, delId, note, authedUser.authEmail).catch(console.error);
    }
  };

  const onAsk = (repId, weekId, delId, text) => {
    if (authedUser && !isManager && repId !== myRepId) return; // peer view = read-only
    const k = `${repId}|${weekId}|${delId}`;
    setState(s => {
      const asks = { ...(s.asks || {}) };
      if (!text) delete asks[k];
      else asks[k] = { text, at: new Date().toISOString() };
      return { ...s, asks };
    });
    if (useCloud) {
      window.setAskSupabase(repId, weekId, delId, text).catch(console.error);
    }
  };

  const todayStr = `${DAYS[TODAY.getDay()]} · ${fmtLong(TODAY)}`;

  const activeRep = view !== "rollup" ? REPS.find(r => r.id === view) : null;

  return (
    <div className="app">
      <nav className="shell-nav">
        <div className="shell-nav__brand">
          <span className="shell-nav__brand-mark">
            <img src={document.getElementById("__logo_src").src} alt="Mindtools Kineo" />
          </span>
          <span>Mindtools Kineo</span>
          <small>Weekly Review · NA BD</small>
        </div>
        <div className="shell-nav__right">
          {authedUser ? (
            <div className="me-badge">
              {isManager ? (
                <><span className="me-badge__role">Manager</span><strong>{authedUser.authEmail}</strong></>
              ) : (
                (() => {
                  const meRep = REPS.find(r => r.id === myRepId);
                  return meRep ? <><Avatar rep={meRep} size={22} /><strong>{meRep.name}</strong></> : <strong>{authedUser.authEmail}</strong>;
                })()
              )}
              <span className={"me-badge__dot " + (cloudReady ? "is-live" : "is-loading")}
                    title={cloudReady ? "Live · synced" : "Connecting…"} />
              <button className="me-badge__signout" onClick={() => window.signOut()}>Sign out</button>
            </div>
          ) : (
            <span>Lead: <strong>You</strong></span>
          )}
          <span className="shell-nav__date">{todayStr}</span>
        </div>
      </nav>

      <div className="tabs" data-screen-label="00 Tabs">
        {/* Static pages from registry, filtered by role */}
        {APP_PAGES
          .filter(p => p.requires === "any" || (p.requires === "manager" && isManager))
          .map(page => {
            const isActive = view === page.id;
            // Compute optional badge (e.g. open flag count)
            let badge = null;
            if (page.id === "manager:flags" && state.asks) {
              const openCount = Object.entries(state.asks).filter(([k, a]) => a && a.text && !state.checks[k]).length;
              if (openCount > 0) badge = <span className="tabs__badge">{openCount}</span>;
            }
            return (
              <button
                key={page.id}
                className="tabs__tab"
                data-active={isActive ? "1" : "0"}
                onClick={() => setView(page.id)}
              >
                <span className="tabs__icon"><Icon name={page.icon} size={14} /></span>
                {page.label}
                {badge}
              </button>
            );
          })
        }
        {/* Divider before rep tabs */}
        <span className="tabs__divider" aria-hidden="true" />
        {REPS.map(rep => (
          <button
            key={rep.id}
            className="tabs__tab"
            data-active={view === rep.id ? "1" : "0"}
            onClick={() => setView(rep.id)}
          >
            <Avatar rep={rep} size={22} />
            {rep.name.split(" ")[0]}
          </button>
        ))}
      </div>

      <main className="app__main">
        <div className="app__inner">
          {view === "rollup" ? (
            <div data-screen-label="01 Team Rollup">
              <TeamRollup
                state={state}
                weekIdx={weekIdx}
                setWeekIdx={setWeekIdx}
                onPickRep={(id) => setView(id)}
              />
            </div>
          ) : view === "manager:flags" ? (
            <FlagQueue
              state={state}
              onPickRep={(repId, weekId) => {
                if (weekId) {
                  const idx = WEEKS.findIndex(w => w.id === weekId);
                  if (idx >= 0) setWeekIdx(idx);
                }
                setView(repId);
              }}
            />
          ) : (
            <div data-screen-label={`02 Rep · ${activeRep.name}`}>
              {isReadOnly && (
                <div className="peer-banner">
                  <span className="peer-banner__dot" aria-hidden="true" />
                  <span>Viewing <strong>{activeRep.name}'s</strong> week — read only.</span>
                  <button className="peer-banner__back" onClick={() => setView(myRepId || "rollup")}>Back to mine</button>
                </div>
              )}
              <RepView
                rep={activeRep}
                state={state}
                weekIdx={weekIdx}
                setWeekIdx={setWeekIdx}
                onCheck={onCheck}
                onAsk={onAsk}
                onSaveNote={onSaveNote}
                onBack={() => setView("rollup")}
                readOnly={isReadOnly}
                isManager={isManager}
              />
            </div>
          )}
        </div>
      </main>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Accent color">
          <TweakRadio
            value={tweaks.accent}
            options={[
              { value: "purple", label: "Purple" },
              { value: "orange", label: "Orange" },
              { value: "teal",   label: "Teal" },
              { value: "black",  label: "Black" },
            ]}
            onChange={v => setTweak("accent", v)}
          />
        </TweakSection>
        <TweakSection title="Density">
          <TweakRadio
            value={tweaks.density}
            options={[
              { value: "cozy",  label: "Cozy" },
              { value: "comfy", label: "Comfy" },
              { value: "airy",  label: "Airy" },
            ]}
            onChange={v => setTweak("density", v)}
          />
        </TweakSection>
        <TweakSection title="Layout style">
          <TweakRadio
            value={tweaks.layout}
            options={[
              { value: "editorial", label: "Editorial" },
              { value: "compact",   label: "Compact" },
            ]}
            onChange={v => setTweak("layout", v)}
          />
        </TweakSection>
        <TweakSection title="Reset">
          <TweakButton onClick={() => {
            if (confirm("Reset all check states? This affects your local view only.")) {
              localStorage.removeItem(STORAGE_KEY);
              location.reload();
            }
          }}>Clear all checks</TweakButton>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
if (window.SUPABASE_CONFIGURED && window.AuthGate) {
  root.render(<AuthGate>{({ user }) => <App authedUser={user} />}</AuthGate>);
} else {
  root.render(<App />);
}
