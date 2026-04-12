import { CdpClient } from "@coinbase/cdp-sdk";
import { env } from "./env.js";

/**
 * Coinbase Developer Platform 클라이언트 초기화
 *
 * CDP Server Wallet은 TEE(Trusted Execution Environment)에서 키를 관리합니다.
 * - 키가 서버에도 에이전트에도 노출되지 않음
 * - API 호출로 서명 요청 → TEE 안에서 서명 → 결과만 반환
 */
let _cdpClient: CdpClient | null = null;

export function getCdpClient(): CdpClient {
  if (!_cdpClient) {
    _cdpClient = new CdpClient({
      apiKeyId: env.CDP_API_KEY_ID,
      apiKeySecret: env.CDP_API_KEY_SECRET,
      walletSecret: env.CDP_WALLET_SECRET,
    });
  }
  return _cdpClient;
}
