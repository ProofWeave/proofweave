import { PinataSDK } from "pinata";
import { env } from "../config/env.js";

export const pinata = new PinataSDK({
  pinataJwt: env.PINATA_JWT,
  pinataGateway: env.PINATA_GATEWAY,
});

/** Pinata 연결 테스트 */
export async function testPinataConnection(): Promise<boolean> {
  try {
    await pinata.testAuthentication();
    return true;
  } catch {
    return false;
  }
}
