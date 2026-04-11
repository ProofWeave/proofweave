import { Router } from "express";
import {
  parseSignatureMessage,
  isTimestampValid,
  verifyWalletSignature,
  createApiKey,
  revokeApiKeys,
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

  // 6. 서명 검증
  const validSig = await verifyWalletSignature(address, message, signature);
  if (!validSig) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  // 7. API Key 발급
  const apiKey = await createApiKey(address);

  res.status(201).json({
    apiKey,
    message: "Store this key securely. It will not be shown again.",
  });
});

/**
 * POST /auth/rotate
 * 기존 키 무효화 + 새 API Key 발급
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

  // 6. 서명 검증
  const validSig = await verifyWalletSignature(address, message, signature);
  if (!validSig) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  // 7. 기존 키 무효화
  const revokedCount = await revokeApiKeys(address);

  // 8. 새 키 발급
  const apiKey = await createApiKey(address);

  res.status(200).json({
    apiKey,
    revokedCount,
    message: "Previous keys have been revoked. Store this new key securely.",
  });
});
