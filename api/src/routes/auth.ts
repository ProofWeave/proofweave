import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import {
  parseSignatureMessage,
  isTimestampValid,
  verifyWalletSignature,
  isSignatureConsumed,
  consumeSignature,
  hasActiveApiKey,
  createApiKey,
  rotateApiKey,
} from "../services/auth.js";

export const authRouter = Router();

/**
 * POST /auth/register
 * 지갑 서명으로 API Key 발급
 */
authRouter.post("/auth/register", async (req, res) => {
  const { address, message, signature } = req.body;

  // 1. 필수 필드 검증
  if (!address || !message || !signature) {
    res.status(400).json({ error: "address, message, signature are required" });
    return;
  }

  // 2. 메시지 형식 파싱
  const parsed = parseSignatureMessage(message);
  if (!parsed) {
    res.status(400).json({ error: "Invalid message format" });
    return;
  }

  // 3. Action 검증
  if (parsed.action !== "register") {
    res.status(400).json({ error: "Action must be 'register'" });
    return;
  }

  // 4. 주소 일치 검증
  if (parsed.address.toLowerCase() !== address.toLowerCase()) {
    res.status(400).json({ error: "Address in message does not match" });
    return;
  }

  // 5. 타임스탬프 유효성 (5분 이내)
  if (!isTimestampValid(parsed.timestamp)) {
    res.status(400).json({ error: "Timestamp expired (max 5 minutes)" });
    return;
  }

  // 6. 서명 리플레이 방지
  if (await isSignatureConsumed(signature)) {
    res.status(409).json({ error: "Signature already used" });
    return;
  }

  // 7. 서명 검증
  const validSig = await verifyWalletSignature(address, message, signature);
  if (!validSig) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  // 8. 중복 등록 방지 — 이미 활성 키가 있으면 rotate 유도
  if (await hasActiveApiKey(address)) {
    res.status(409).json({
      error: "Active API key already exists. Use POST /auth/rotate to replace it.",
    });
    return;
  }

  // 9. 서명 소비 + API Key 발급
  await consumeSignature(signature, address);
  const apiKey = await createApiKey(address);

  // 10. CDP 스마트 지갑 생성 (비동기, 실패해도 등록은 완료)
  let smartWalletAddress: string | null = null;
  try {
    const { createSmartWallet } = await import("../services/wallet.js");
    smartWalletAddress = await createSmartWallet(address);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn("[auth] Smart wallet creation failed (non-fatal):", errMsg);
  }

  res.status(201).json({
    apiKey,
    smartWalletAddress,
    message: smartWalletAddress
      ? "Store this key securely. Send USDC to your smart wallet for auto-payments."
      : "Store this key securely. Smart wallet unavailable (CDP not configured).",
  });
});

/**
 * POST /auth/rotate
 * 기존 키 무효화 + 새 API Key 발급 (원자적 트랜잭션)
 */
authRouter.post("/auth/rotate", async (req, res) => {
  const { address, message, signature } = req.body;

  // 1. 필수 필드 검증
  if (!address || !message || !signature) {
    res.status(400).json({ error: "address, message, signature are required" });
    return;
  }

  // 2. 메시지 형식 파싱
  const parsed = parseSignatureMessage(message);
  if (!parsed) {
    res.status(400).json({ error: "Invalid message format" });
    return;
  }

  // 3. Action 검증
  if (parsed.action !== "rotate") {
    res.status(400).json({ error: "Action must be 'rotate'" });
    return;
  }

  // 4. 주소 일치 검증
  if (parsed.address.toLowerCase() !== address.toLowerCase()) {
    res.status(400).json({ error: "Address in message does not match" });
    return;
  }

  // 5. 타임스탬프 유효성
  if (!isTimestampValid(parsed.timestamp)) {
    res.status(400).json({ error: "Timestamp expired (max 5 minutes)" });
    return;
  }

  // 6. 서명 리플레이 방지
  if (await isSignatureConsumed(signature)) {
    res.status(409).json({ error: "Signature already used" });
    return;
  }

  // 7. 서명 검증
  const validSig = await verifyWalletSignature(address, message, signature);
  if (!validSig) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  // 8. 원자적 rotate (서명 소비 + 키 폐기 + 새 키 발급)
  const { apiKey, revokedCount } = await rotateApiKey(address, signature);

  res.status(200).json({
    apiKey,
    revokedCount,
    message: "Previous keys have been revoked. Store this new key securely.",
  });
});

/**
 * POST /auth/register-web
 * Supabase JWT → API Key 발급 (웹 프론트 전용)
 * Authorization: Bearer <supabase-access-token>
 */
authRouter.post("/auth/register-web", async (req, res) => {
  // 1. Supabase 설정 확인
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(503).json({ error: "Supabase Auth not configured" });
    return;
  }

  // 2. Bearer token 추출
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authorization header required (Bearer token)" });
    return;
  }
  const token = authHeader.slice(7);

  // 3. Supabase JWT 검증
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    res.status(401).json({ error: "Invalid or expired Supabase token" });
    return;
  }

  // 4. 이메일을 wallet_address 자리에 사용 (web: 접두사로 구분)
  const identifier = `web:${user.email || user.id}`;

  // 5. 기존 키가 있으면 반환 대신 기존 키 폐기 + 새 발급
  if (await hasActiveApiKey(identifier)) {
    // 기존 키 rotate
    const { apiKey, revokedCount } = await rotateApiKey(identifier, `supabase:${user.id}`);
    res.status(200).json({
      apiKey,
      userId: user.id,
      email: user.email,
      revokedCount,
      message: "Existing key rotated. Store this new key securely.",
    });
    return;
  }

  // 6. 새 API Key 발급
  const apiKey = await createApiKey(identifier);

  // 7. CDP Smart Wallet 생성 시도
  let smartWalletAddress: string | null = null;
  try {
    const { createSmartWallet } = await import("../services/wallet.js");
    smartWalletAddress = await createSmartWallet(identifier);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn("[auth/register-web] Smart wallet creation failed (non-fatal):", errMsg);
  }

  res.status(201).json({
    apiKey,
    userId: user.id,
    email: user.email,
    smartWalletAddress,
    message: "API key issued. Store securely.",
  });
});
