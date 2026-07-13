// ============================================================
//  Stuart Chadwick — Induction content  ·  src/stuart-induction-content.js
//
//  HAND-AUTHORED (2026-07-12) by adapting Don Hazelwood's NA induction to
//  Stuart's EMEA New-Business Account Director role, start date Mon 2026-07-13.
//  Unlike don-induction-content.js (auto-derived from a OneDrive master),
//  there is NO Stuart master yet — this is a first draft. Once a
//  "EMEA Sales/Team/Stuart/Induction" master exists, switch this file to the
//  same strip-and-derive flow and stop hand-editing.
//
//  Items marked with a "> ⚠ TBC" note are gaps that need Jeff's input:
//    • EMEA line manager + onboarding buddy (Don's were Jeff + Cammy — NA)
//    • EMEA enablement pack location (Don's was "NA Sales/Enablement/…")
//    • EMEA CRM / prospecting tooling (Don's was Salesforce + ZoomInfo — NA)
//
//  FORMAT IS PARSER-STRICT (see parseInduction in stuart-onboarding.jsx):
//    • Section headers: "## Day N — <Weekday> M/DD · <Title>"  (em-dash + " · ")
//    • Checkboxes:      "- [ ] id :: label"   /  "- [x] id :: label"
//    • Free text:       "- [text] id :: placeholder"
//    • Subheads:        "**Bold on its own line**"
//    • Notes:           "> note"   or   "_note_"
//    • Access notes are collected for the manager summary from checks whose
//      nearest **subhead** starts with "Access".
// ============================================================
window.STUART_INDUCTION_MD = `# Stuart Chadwick — Induction

**Role:** Account Director, New Business EMEA | MindTools | Kineo
**Manager:** Jeff Hamons   ·   **Peer buddy:** TBC
**Induction Day 1:** Monday, 2026-07-13
**Cadence:** 1:1 with Jeff twice a week through month one, then weekly

> How this works: each day has a short, checkable list. Do them in order where you can. Anything with a REF link points to a file in your pack. If something's blocked (access not live, a file won't open), flag Jeff in your next 1:1 or by Teams — don't sit on it. Anything marked "⚠ TBC" is still being confirmed on our side; flag it and move on.

---

## Before Day 1 — pre-start setup

Anything already sorted before Monday. Check what's actually done so we both know where the gaps are.

- [ ] d0-comp :: Contract / offer signed and returned
- [ ] d0-laptop :: Laptop provisioned and logged in
- [ ] d0-accounts :: IT has created your MindTools | Kineo accounts (email, SSO)
- [ ] d0-pack :: Induction pack received and saved — the full set of product, competitor, and Totara materials (REF: EMEA Sales/Enablement/Onboarding/)

> ⚠ TBC: confirm the EMEA enablement pack location. This draft points REF links at "EMEA Sales/Enablement/Onboarding/"; until that folder + a share link exist, every REF opens the shared pack folder.

---

## Day 1 — Monday 7/13 · Get oriented and operational

The point of today: confirm every system actually works and get the lay of the product land. If access is broken, that's the first thing we fix.

**Access — confirm each one actually opens (not just "should work")**
- [ ] d1-sso :: Microsoft 365 SSO — Outlook, Teams, SharePoint, OneDrive all open
- [ ] d1-crm :: CRM — log in AND confirm you can see the accounts assigned to you (flag immediately if your territory is empty)
- [ ] d1-prospecting :: Prospecting / data tool — seat is live and you can run a search
- [ ] d1-esign :: E-signature tool — you can access it
- [ ] d1-demo :: Product demo access — Totara / Mindtools / Content Hub / Kineo Courses
- [ ] d1-teams-channels :: Added to the EMEA Sales Teams channel, standup invite, and the Jeff 1:1 series

> ⚠ TBC: EMEA CRM + prospecting tooling. Don's NA induction used Salesforce + ZoomInfo; confirm the EMEA equivalents (or that it's the same instances) and I'll name them here.

> Access notes — anything broken, slow, or half-working? Log it here so Jeff can clear it before your next 1:1. Note which system, what you tried, and what happened.
- [text] d1-access-notes :: e.g. "CRM logs in but my territory is empty" / "prospecting seat not active yet"

**Orient**
- [ ] d1-coreproducts :: Read the Core Product Lines doc — what we sell, in one pass (REF: EMEA Sales/Enablement/Onboarding/1-Start-Here/)
- [ ] d1-offering :: Skim the Product Offering Overview for the shape of the portfolio (REF: EMEA Sales/Enablement/Onboarding/1-Start-Here/)
- [ ] d1-newlogo :: Read the new-logo mandate — this is the job, net-new is the focus
- [ ] d1-team :: Say hi to the EMEA team in the channel — meet your buddy and the other Account Directors (Rory, Stephen, Simon, Matthew, Paul, Mike)
- [ ] d1-nextoneonone :: Confirm your next 1:1 with Jeff is on the calendar

---

## Day 2 — Tuesday 7/14 · Product depth

Today is about knowing the product well enough to talk about it. Work through the collateral; you don't have to memorize it, you have to know what exists and where to find it.

- [ ] d2-msuite :: M Suite tiered offering — read the long version (REF: EMEA Sales/Enablement/Onboarding/2-Product-Collateral/)
- [ ] d2-learnservices :: Learning Services overview (REF: EMEA Sales/Enablement/Onboarding/2-Product-Collateral/)
- [ ] d2-custom :: Custom Learning Design (REF: EMEA Sales/Enablement/Onboarding/2-Product-Collateral/)
- [ ] d2-managers :: Building Better Managers + Manager Skills Workshop (REF: EMEA Sales/Enablement/Onboarding/2-Product-Collateral/)
- [ ] d2-mcoach :: Ask M Coach + What's new in V20 (REF: EMEA Sales/Enablement/Onboarding/2-Product-Collateral/)
- [ ] d2-totara-deck :: Totara Suite sales preview deck — the platform side of what we sell (REF: EMEA Sales/Enablement/Onboarding/4-Totara-Sales-Decks/)
- [ ] d2-totara-webinar :: Watch one Totara roadmap webinar (REF: EMEA Sales/Enablement/Onboarding/4-Totara-Sales-Decks/Roadmap-Webinars/)
- [ ] d2-icp :: Get the ICP + "who we don't sell to" from Jeff (covered in 1:1)

---

## Day 3 — Wednesday 7/15 · Competition and tooling

Know who we're up against and how the day-to-day machine runs.

- [ ] d3-cornerstone :: Cornerstone battlecard FIRST — they're actively poaching MindTools clients claiming parity; know the counter (REF: EMEA Sales/Enablement/Onboarding/3-Competitor-Battlecards/)
- [ ] d3-bigfour :: Docebo, Workday, SAP SuccessFactors, Microsoft Viva battlecards — the ones you'll hit most (REF: EMEA Sales/Enablement/Onboarding/3-Competitor-Battlecards/)
- [ ] d3-battlecards-rest :: Skim the remaining battlecards so you know the full set is there (19 total)
- [ ] d3-crm-hygiene :: CRM hygiene, SLA, and lead-handling expectations (from Jeff)
- [ ] d3-sequences :: Prospecting + sequences walkthrough — how prospecting runs here
- [ ] d3-shadow :: Shadow a call from your buddy or another AD if one's on the books

---

## Day 4 — Thursday 7/16 · Build your book

This is where it gets real. You and Jeff walk your territory and you start building.

- [ ] d4-territory :: Walk your account list / territory with Jeff (1:1)
- [ ] d4-newlogo :: New-logo targets made explicit — what's greenfield vs warm
- [ ] d4-targetlist :: Build your first target account list (raw list, we'll refine)
- [ ] d4-crm-activity :: First CRM activity logged
- [ ] d4-targets :: Targets + pro-ration for the rest of 2026 confirmed with Jeff

---

## Day 5 — Friday 7/17 · First motion + week-1 gate

- [ ] d5-sequences-out :: First sequences out the door
- [ ] d5-discovery :: Discovery framework — how we run a first call
- [ ] d5-pricing :: Pricing introduced (Jeff brings this in at the planned point)
- [ ] d5-gate :: End-of-week-1 gate with Jeff — what's clear, what's still fuzzy, what you need

---

## Weeks 2–4 · Cadence and ramp

- [ ] w2-rhythm :: Settled into the rhythm — twice-weekly 1:1s, standup, pipeline reviews
- [ ] w2-wins :: Wins report starts for you (Jeff sets the week)
- [ ] w2-opps :: First real opportunities created in the CRM
- [ ] w3-discovery :: Running your own discovery calls
- [ ] w3-aiskills :: First live AI Skills Practice opportunity identified (the company-wide mandate — Jeff will set your timeline; ramped, not day-one)
- [ ] w4-coverage :: Pipeline building toward coverage; process discipline visible

---

## 30 / 60 / 90 — milestones you own (build these WITH Jeff in your book 1:1)

_Clock starts Day 1, 7/13._

**Day 30 (~8/12) — Absorbed and active**
- [ ] m30-product :: Fluent on product, market, and tools
- [ ] m30-shadow :: Shadowed a colleague, learned the motion
- [ ] m30-list :: Target account list built
- [ ] m30-activity :: First activity logged, first sequences out

**Day 60 (~9/11) — Producing**
- [ ] m60-opps :: Real opportunities created
- [ ] m60-discovery :: Running your own discovery
- [ ] m60-pipeline :: Pipeline building, process discipline visible

**Day 90 (~10/11) — Self-sufficient**
- [ ] m90-independent :: Self-sufficient, owns the book
- [ ] m90-coverage :: Pipeline at coverage
- [ ] m90-deals :: First deals advancing

---

## Your resource pack — what's in it and where

Everything below lives in OneDrive \`EMEA Sales/Enablement/Onboarding/\` (⚠ TBC — confirm the EMEA pack location; the product and competitor materials are shared with NA and can be reused).

- **1-Start-Here** — Core Product Lines (with new-logo mandate appendix) · Product Offering Overview
- **2-Product-Collateral** — M Suite tiers (long) · Learning Services · Custom Learning Design · Building Better Managers · Manager Skills Workshop · Ask M Coach · What's New in V20 · Consultancy & Insights
- **3-Competitor-Battlecards** — 19 battlecards: Cornerstone, Docebo, Workday, SAP SuccessFactors, Microsoft Viva, Adobe Learning Manager, Absorb, LearnUpon, Talent LMS, 360Learning, Learning Pool, Cypher, Disprz, Sana, Thrive, Kallidus, eFront, Safety Culture, Avendoo
- **4-Totara-Sales-Decks** — Totara Suite intro · Learn · Perform · Mobile · POV deck · Design Examples · 2 product roadmap resources · 2 roadmap webinars (video)

---
`;
