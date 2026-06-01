export const EVM_TX_HASH_REGEX_SOURCE = "^0x[0-9a-fA-F]{64}$";

export function isEvmTransactionHash(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}
