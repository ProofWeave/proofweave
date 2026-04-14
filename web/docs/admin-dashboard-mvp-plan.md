# Admin Audit Dashboard MVP Plan

## Scope
- Goal: capstone demo-only admin audit dashboard.
- Location: add to existing `web/` React app as `/admin`.
- Data source: real backend API and Supabase-authenticated session.

## Feature Requirements

### 1) KPI cards
- Total attestations
- Last 24h attestations
- Verified ratio (batch verification result in current view)
- Verification run count (today/session)

### 2) Audit history table
- Data source: `GET /search`
- Filters: keyword, creator, model, date range
- Pagination: server-driven `page`, `limit`
- Table actions: BaseScan link, IPFS link, detail modal, row selection

### 3) Batch audit
- Select rows and verify each by `GET /verify/:contentHash`
- Show progress and summary (`verified`, `mismatch`, `error`)
- Keep run logs for demo narration

### 4) Detail modal
- Data source: `GET /attestations/:id`
- Fields: attestationId, contentHash, txHash, offchainRef(CID), creator, aiModel, createdAt

### 5) Demo charts
- Time-series (attestations by day/hour from current dataset)
- Model distribution (pie)

## File Checklist

### New files
- `web/src/types/admin.ts`
- `web/src/services/adminApi.ts`
- `web/src/components/admin/KpiCards.tsx`
- `web/src/components/admin/AttestationFilters.tsx`
- `web/src/components/admin/AttestationTable.tsx`
- `web/src/components/admin/BatchAuditPanel.tsx`
- `web/src/components/admin/AttestationDetailModal.tsx`
- `web/src/components/admin/ChartsSection.tsx`
- `web/src/pages/AdminDashboard.tsx`

### Files to update
- `web/src/App.tsx` (route `/admin`)
- `web/src/components/AppLayout.tsx` (sidebar nav item)
- `web/src/index.css` (admin page and modal styles)

## Data/State Contract

### Query keys
- `['admin', 'search', filters, page, limit]`
- `['admin', 'detail', attestationId]`
- `['admin', 'kpi', filters]` (derived from search result for MVP)

### Page state
- `filters`: `{ q, creator, aiModel, from, to }`
- `page`, `limit`
- `selectedIds`: `Set<string>`
- `selectedRows`: `AttestationRow[]`
- `batchResult`: summary + per-item rows
- `detailModal`: `{ open, id }`

## Wireframe

```text
Admin Audit Dashboard                                   [Refresh]
Time range: [24h][7d][30d][Custom]

[Total] [24h New] [Verified Ratio] [Verifications]

Filters: q | creator | model | from/to | [Search] [Reset]

[ ] Table of attestations (id/hash/creator/model/date/status/actions)
pagination

Batch Audit: selected N | [Run verification]
summary: verified X / mismatch Y / error Z
run logs...

[Attestation trend chart] [Model distribution chart]
```

## MVP Build Order
1. Route + skeleton page
2. Search table + filters + pagination
3. Row selection + batch verify
4. KPI cards from current dataset
5. Detail modal
6. Charts
7. UX polish (loading, error, empty states)

## Demo Script (3-4 min)
1. Open `/admin`, show KPI and live data.
2. Filter by model/date, explain provenance search.
3. Select multiple rows, run batch audit.
4. Open detail modal and click BaseScan/IPFS links.
5. Show charts and conclude with audit scalability point.
