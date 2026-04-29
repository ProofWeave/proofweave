import type { User } from '@supabase/supabase-js';

// Demo/admin allowlist kept in code by request (no env dependency).
// Add or remove accounts here when admin access policy changes.
const ADMIN_EMAIL_ALLOWLIST: string[] = [
  'previouslyon25@gmail.com',
];

const ADMIN_ADDRESS_ALLOWLIST: string[] = [
  // '0x1234...abcd',
];

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function getUserAddressCandidates(user: User) {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  return [
    metadata.wallet_address,
    metadata.address,
    metadata.public_address,
    metadata.eth_address,
  ].map(normalize).filter(Boolean);
}

export function isAdminWhitelisted(user: User | null) {
  if (!user) return false;

  const email = normalize(user.email);
  if (email && ADMIN_EMAIL_ALLOWLIST.map(normalize).includes(email)) {
    return true;
  }

  const addresses = getUserAddressCandidates(user);
  if (addresses.length === 0) return false;

  const normalizedAllowlist = ADMIN_ADDRESS_ALLOWLIST.map(normalize);
  return addresses.some((address) => normalizedAllowlist.includes(address));
}
