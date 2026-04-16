# Admin Whitelist Mini README

## What changed
- Added code-based whitelist access control for `/admin`.
- Only users in the whitelist can:
  - access `/admin` route
  - see `Admin Audit` menu in sidebar

## Files
- `web/src/config/adminWhitelist.ts`
  - central whitelist config and matching logic
  - supports email and wallet address candidates from Supabase `user_metadata`
- `web/src/App.tsx`
  - added `AdminRoute` wrapper for `/admin`
  - non-whitelisted users are redirected to `/`
- `web/src/components/AppLayout.tsx`
  - hides `Admin Audit` nav item for non-whitelisted users

## How to update whitelist
Edit arrays in `web/src/config/adminWhitelist.ts`:
- `ADMIN_EMAIL_ALLOWLIST`
- `ADMIN_ADDRESS_ALLOWLIST`

## Current policy
- Keep whitelist in code (no env dependency), per project request.
