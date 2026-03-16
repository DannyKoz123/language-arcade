Original prompt: Improve the existing `language-arcade` repo in place by inspecting the current implementation first, then making a coherent quality pass focused on real product/code issues, gameplay UX/reliability, backend correctness/trust boundaries, maintainability/dev experience, and focused high-value features. Preserve the monorepo architecture and keep the backend server-authoritative.

## 2026-03-15

- Initial findings:
  - Run creation is not idempotent and does not resume active runs after refresh.
  - Round answer and hint mutations are multi-query but not transactional, which risks duplicate next-round creation and stale-state conflicts.
  - API error handling is based on string matching, and route params are only loosely validated.
  - The client does not restore active runs, does not surface family/region hint clues after refresh, and has limited stale-state recovery.
- Planned pass:
  - Add typed API errors and stronger route validation.
  - Add active-run lookup/resume behavior and safer run state transitions.
  - Improve the play client for resume-on-refresh, clearer feedback, and better accessibility.

- Backend pass in progress:
  - Added typed API errors and Zod-aware error responses.
  - Made run creation resume-aware and added `GET /v1/runs/active`.
  - Reworked run answer/hint flows to operate inside transactions with row locking and stale-state conflicts.
  - Added recovery for broken active runs by marking them abandoned instead of leaving the player stuck.
- Frontend pass in progress:
  - Added active-run restoration on load and conflict-driven resync.
  - Surfaced hint clue state, run progress, and score breakdown feedback in the play UI.
