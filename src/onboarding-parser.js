// ============================================================
//  Shared induction markdown parser · src/onboarding-parser.js
//
//  window.parseInduction(md, packRoot) — was duplicated byte-for-byte in
//  don-onboarding.jsx and stuart-onboarding.jsx (stuart-induction-content.js
//  even carried a TODO acknowledging the copy). The only thing that ever
//  differed between the two copies was the per-rep PACK_ROOT string used to
//  compute a REF path's display-relative form, so this file parameterizes
//  that one difference instead of cloning the parser a third time — see
//  README.md's "Add a view" note: don-onboarding.jsx and stuart-onboarding.jsx
//  now both call window.parseInduction(md, PACK_ROOT) with their own
//  file-local PACK_ROOT constant.
//
//  FORMAT IS PARSER-STRICT (unchanged from the prior per-file copies):
//    • Section headers: "## Day N — <Weekday> M/DD · <Title>"  (em-dash + " · ")
//    • Checkboxes:      "- [ ] id :: label"   /  "- [x] id :: label"
//    • Free text:       "- [text] id :: placeholder"
//    • Subheads:        "**Bold on its own line**"
//    • Notes:           "> note"   or   "_note_"
//    • Access notes are collected for the manager summary from checks whose
//      nearest **subhead** starts with "Access".
// ============================================================
function parseInduction(md, packRoot) {
  function parseRef(label) {
    const m = label.match(/\(REF:\s*([^)]+)\)/);
    if (!m) return { label: label.trim(), ref: null };
    const cleanLabel = label.replace(/\s*\(REF:\s*[^)]+\)\s*$/, "").trim();
    let path = m[1].trim();
    const rel = path.startsWith(packRoot) ? path.slice(packRoot.length) : path;
    return { label: cleanLabel, ref: { full: path, rel } };
  }

  const lines = md.split("\n");
  const meta = [];
  let intro = "";
  const sections = [];
  let cur = null;
  let curSub = "";          // most recent **subhead** within the section
  let inPreamble = true;

  // Parse the last MM/DD in a header into a 2026 Date (range end for spans).
  const sectionDate = (h) => {
    const all = [...h.matchAll(/(\d{1,2})\/(\d{1,2})/g)];
    if (!all.length) return null;
    const m = all[all.length - 1];
    const d = new Date(2026, parseInt(m[1], 10) - 1, parseInt(m[2], 10));
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const pushSection = (headerText) => {
    let day = headerText, title = "";
    if (headerText.includes(" — ")) {
      const i = headerText.indexOf(" — ");
      day = headerText.slice(0, i).trim();
      title = headerText.slice(i + 3).trim();
    } else if (headerText.includes(" · ")) {
      const i = headerText.indexOf(" · ");
      day = headerText.slice(0, i).trim();
      title = headerText.slice(i + 3).trim();
    }
    const dayNumMatch = day.match(/^Day (\d+)$/);
    const dayNum = dayNumMatch ? parseInt(dayNumMatch[1], 10) : null;
    const isResource = /resource pack/i.test(headerText);
    if (isResource) { day = ""; title = "Your resource pack"; }
    cur = {
      day, title, dayNum,
      date: sectionDate(headerText),
      isToday: false,
      isFocus: false,
      isResource,
      items: [],
    };
    curSub = "";
    sections.push(cur);
  };

  for (let raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;
    if (line === "---") continue;

    if (line.startsWith("# ") && inPreamble) continue; // page title — own header

    if (line.startsWith("## ")) {
      inPreamble = false;
      pushSection(line.slice(3).trim());
      continue;
    }

    if (inPreamble) {
      // meta: one or more **Key:** value pairs (· separated)
      if (line.startsWith("**")) {
        const re = /\*\*([^:*]+):\*\*\s*([^*]+?)(?=\s*\*\*|$)/g;
        let mm;
        while ((mm = re.exec(line)) !== null) {
          meta.push({ k: mm[1].trim(), v: mm[2].replace(/[·\s]+$/, "").trim() });
        }
      } else if (line.startsWith("> ")) {
        intro += (intro ? " " : "") + line.slice(2).trim();
      }
      continue;
    }

    // ---- section body ----
    if (!cur) continue;

    // resource bullet: - **Label** — desc
    let mRes = line.match(/^- \*\*(.+?)\*\*\s*[—-]\s*(.+)$/);
    if (cur.isResource && mRes) {
      cur.items.push({ type: "res", label: mRes[1].trim(), desc: mRes[2].trim() });
      continue;
    }

    // checkbox: - [ ] id :: label   /  - [x] id :: label
    let mChk = line.match(/^- \[([ xX])\]\s+(\S+)\s+::\s+(.+)$/);
    if (mChk) {
      const parsed = parseRef(mChk[3]);
      cur.items.push({
        type: "check",
        id: mChk[2],
        defaultChecked: mChk[1].toLowerCase() === "x",
        label: parsed.label,
        ref: parsed.ref,
        subgroup: curSub,
      });
      continue;
    }

    // free-text field: - [text] id :: placeholder
    let mTxt = line.match(/^- \[text\]\s+(\S+)\s+::\s+(.+)$/);
    if (mTxt) {
      cur.items.push({ type: "text", id: mTxt[1], placeholder: mTxt[2].trim() });
      continue;
    }

    // subhead: **bold** on its own line
    let mSub = line.match(/^\*\*(.+?)\*\*$/);
    if (mSub) { curSub = mSub[1].trim(); cur.items.push({ type: "subhead", text: curSub }); continue; }

    // blockquote helper / italic note
    if (line.startsWith("> ")) { cur.items.push({ type: "note", text: line.slice(2).trim() }); continue; }
    let mIt = line.match(/^_(.+)_$/);
    if (mIt) { cur.items.push({ type: "note", text: mIt[1].trim() }); continue; }

    // plain paragraph (section intro / resource lead-in) — strip md emphasis + backticks
    const para = line.replace(/`/g, "").replace(/\*\*/g, "");
    cur.items.push({ type: "para", text: para.trim() });
  }

  // Date-aware focus: highlight + expand the day section that IS today, else
  // the next upcoming day. Only "Day N" sections are candidates (not the
  // already-behind "Before Day 1" block or the far-out 30/60/90 milestones).
  const today = (typeof TODAY !== "undefined" && TODAY instanceof Date) ? new Date(TODAY) : new Date();
  today.setHours(0, 0, 0, 0);
  const dayS = sections.filter((s) => s.dayNum != null && s.date);
  const focus = dayS.find((s) => +s.date === +today)
    || dayS.filter((s) => +s.date >= +today).sort((a, b) => +a.date - +b.date)[0]
    || null;
  if (focus) { focus.isFocus = true; if (+focus.date === +today) focus.isToday = true; }

  return { meta, intro, sections };
}

window.parseInduction = parseInduction;
