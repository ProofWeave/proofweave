# benchmark-smoke-2026-06-01 — 디렉토리 안내

ProofWeave 토큰효율 벤치마크 증거 모음. **읽는 순서: `FINAL-benchmark-report.md` 하나로 충분.** 나머지는 근거/과정/원자료.

## 최종 산출물 (루트)
| 파일 | 내용 |
|---|---|
| **`FINAL-benchmark-report.md`** | **메인 보고서** — 최상단 수치 요약 + 실험 방법 + deck 대조 + 시각화 방안 (한글) |
| `live-results-summary.json` | 3모델 live 실측 집계(절감률만, 금액 없음). 시각화 입력 |
| `retrieval-summary.json` | retrieval 벤치마크(Hit@K/MRR/no-match) offline 결과 |

## 하위 디렉토리
| 디렉토리 | 내용 |
|---|---|
| `live-raw/` | live 실측 원자료 jsonl (gpt-5.4-mini / gemini-3.5-flash / claude-sonnet-4-6). provider usage 원본 보존, 재현·검증용 |
| `quality/` | 답변 품질 평가 결과 (Codex=GPT, Antigravity=Gemini, Claude 세션). raw vs artifact 품질 동등 확인 |
| `prompts/` | 품질 평가 위임 프롬프트 (Codex·Antigravity에 그대로 전달한 것) |
| `process/` | 과정·계획 문서 (OpenCode 진단, 비용최소 재설계 v2, offline 예측, 품질 방법론) |
| `archive-opencode/` | **무효 1차 시도(OpenCode)** — harness 오염으로 폐기. 참고용 보관, 인용 금지 |

## 핵심 주의
- `archive-opencode/`의 수치(chart-data 등)는 **agent harness 오염으로 무효**. 인용 금지.
- live 수치는 저가 티어(gpt-5.4-mini/gemini-3.5-flash/claude-sonnet-4-6)로 측정 — 발표 비교 라벨(GPT5.5/Gemini3.5/Opus4.8)과 분리.
- 실제 API 청구 금액은 어느 문서에도 기재하지 않음(절감률 %만).
