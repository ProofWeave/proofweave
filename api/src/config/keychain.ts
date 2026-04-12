import { execSync } from "child_process";

const KEYCHAIN_ACCOUNT = "proofweave";

/**
 * macOS Keychain에서 비밀값을 읽어오는 유틸리티
 *
 * security find-generic-password -s <service> -a proofweave -w
 *
 * .env에 값이 이미 있으면 그걸 우선 사용 (CI/Docker 환경 대응)
 * .env에 없으면 Keychain에서 읽음 (로컬 개발 환경)
 */
export function loadFromKeychain(serviceName: string): string | undefined {
  // 1. process.env에 이미 있으면 그대로 사용 (CI, Docker, 프로덕션)
  const envValue = process.env[serviceName];
  if (envValue && envValue.length > 0) {
    return envValue;
  }

  // 2. macOS Keychain에서 로드 (로컬 개발)
  try {
    const result = execSync(
      `security find-generic-password -s "${serviceName}" -a "${KEYCHAIN_ACCOUNT}" -w`,
      { encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }
    ).trim();

    if (result.length > 0) {
      // process.env에 주입 (다른 라이브러리가 참조할 수 있도록)
      process.env[serviceName] = result;
      return result;
    }
  } catch {
    // Keychain 접근 실패 (Linux, CI 등) → undefined 반환
  }

  return undefined;
}

/**
 * 여러 비밀값을 한번에 Keychain에서 로드
 */
export function loadSecretsFromKeychain(serviceNames: string[]): void {
  for (const name of serviceNames) {
    loadFromKeychain(name);
  }
}
