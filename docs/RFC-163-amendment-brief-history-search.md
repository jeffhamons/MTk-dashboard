# RFC-163 Amendment: Rep Brief History and Search

## Status: Approved for MVP follow-up
## Author: Jeff Hamons / Codex
## Date: 2026-07-24
## Consumer: MTk Dashboard implementer
## Priority: Phase 1.1
## Related RFC: RFC-163 Team Briefs

## Problem

The Home page should show only briefs that still need a rep's attention, but reps
also need a durable way to find messages that have expired, been acknowledged
and cleared, or been archived. Without a history view, a brief disappears from
the rep experience even though its frozen audience record still proves that the
rep originally received it.

## Decision

Keep one `team-briefs` route. Do not add another navigation destination.

For reps, the Team Briefs page gains two tabs:

- **Current** — the same active briefs shown by the existing visibility rules.
- **History** — briefs originally published to that rep that are no longer
  current, including expired, cleared/acknowledged, and archived briefs.

The Home `Today · Morning Brief` panel remains current-only.

## History experience

- Show a **Search past briefs** field at the top of History.
- Search is case-insensitive and matches title and body.
- Group results by publish month/date and sort newest first.
- Each result shows the original title, body, type, audience, author, publish
  date, due date when present, acknowledgement state, and visible comments.
- History is read-only: no acknowledgement, new-comment, edit, delete, or
  archive actions.
- Empty states distinguish “No brief history yet” from “No results found.”

## Data and security contract

- A rep may see only briefs for which they have a frozen
  `team_brief_audience_members` row. Existing RLS remains the authorization
  boundary.
- History membership is computed from the same frozen audience and visibility
  rules as Current. A still-visible overdue `action_required` brief remains in
  Current until it is archived; acknowledgement alone does not move it.
- Reuse the separate Team Briefs loader/realtime cycle with
  `loadTeamBriefs({ includeArchived: true })`. Do not fold this into
  `loadStateFromSupabase`.
- Search and date grouping are client-side for this phase. No migration or
  server-side search index is required.

## Implementation target

- `src/team-briefs.jsx` — rep tabs, history classification, search, grouping,
  and read-only card mode.
- `tests/team-briefs-integration.test.mjs` — route/tab/search/read-only
  integration coverage.
- `README.md` — document the rep history lifecycle.

## Acceptance criteria

1. A rep can open Team Briefs and switch between Current and History.
2. A brief no longer shown in Current appears in History if the rep was in its
   frozen audience.
3. A rep never sees another audience's historical briefs.
4. Search finds matching titles or body text and clears back to the full list.
5. Historical cards expose no mutation controls.
6. Existing manager Active/Archived behavior, Home behavior, RLS tests, bundle
   checks, and Team Brief tests continue to pass.

## Out of scope

Server-side full-text search, advanced filters, retention policies, exports,
drafts, scheduled publishing, and a separate archive route are deferred until
usage proves they are needed.
