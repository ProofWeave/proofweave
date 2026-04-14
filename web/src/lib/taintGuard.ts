import { api } from "./api";

export interface EvaluatePromptGuardRequest {
  conversationId: string;
  history: string[];
  currentPrompt: string;
}

export interface EvaluatePromptGuardResponse {
  blockchain_upload_allowed: boolean;
}

export async function evaluatePromptGuard(
  payload: EvaluatePromptGuardRequest,
): Promise<EvaluatePromptGuardResponse> {
  return api.post<EvaluatePromptGuardResponse>("/taint/evaluate", payload);
}
