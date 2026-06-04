# 답변 품질 비교 — raw vs ProofWeave artifact (구독 세션, 품질 전용)

작성일: 2026-06-01
측정 주체: Claude Code 구독 세션(이 어시스턴트)이 각 컨텍스트로 직접 답변 생성 후 루브릭 채점.
**이 문서는 품질만 다룬다. 토큰/비용 수치는 측정하지도 주장하지도 않는다** (구독은 per-token 단가·usage 메타데이터가 없어 비용 측정 부적합 — `predicted-cost-token-estimate.md` 참고).

## 방법

- 쿼리: canonical 5 중 매칭 4개 (no-match인 `bq_full_037`은 "검색 안 함" 품질이라 제외).
- 각 쿼리에 대해 **raw 컨텍스트만** 보고 답변 / **artifact 컨텍스트만** 보고 답변을 따로 생성.
- 채점 루브릭(fixture 제공): `score = mustInclude_coverage × (mustNotHallucinate 위반 시 0)`, passThreshold 0.75.
- 동일 질문·동일 루브릭, 컨텍스트만 교체(paired).

## 결과

| queryId | 도메인 | mustInclude | raw 점수 | artifact 점수 | raw pass | artifact pass |
|---|---|---|---:|---:|:--:|:--:|
| bq_full_013 | market_timeseries | OHLC/trades/last cursor/gap list | 1.00 | 1.00 | ✅ | ✅ |
| bq_full_019 | regulatory_comparison | Rec 16/originator/beneficiary/VASP | 1.00 | 1.00 | ✅ | ✅ |
| bq_full_025 | security_deployment | _disableInitializers/ERC1967Proxy/storage layout/upgrade auth | 1.00 | 1.00 | ✅ | ✅ |
| bq_full_031 | agent_workflow | SKILL.md/description/progressive disclosure/workflow steps | 1.00 | 1.00 | ✅ | ✅ |

- mustNotHallucinate 위반: 4개 쿼리 × 양쪽 컨텍스트 모두 **0건**.
- artifact가 raw 대비 **품질 손실 없음** (4/4 동등 pass). 일부 쿼리(031)는 artifact가 "plugin manifest/API key 아님"을 명시해 환각 방지 측면에서 오히려 더 방어적.

## 정직한 한계 (중요)

1. **이 fixture는 품질 동등에 유리하게 설계됨.** artifact 주석에 "Required terms for benchmark queries are intentionally present"라고 명시돼 있다. 즉 압축 산출물이 루브릭 필수 용어를 일부러 보존하도록 만들어졌으므로, 이 결과는 "**압축이 필수 정보를 떨어뜨리지 않는다(설계대로)**"를 확인하는 것이지, 적대적 품질 스트레스 테스트가 아니다.
2. **채점이 용어 커버리지 프록시다.** 깊은 추론 정확도·서술 품질이 아니라 핵심 용어 포함/환각 회피를 본다. run-benchmark-v2의 deterministic 루브릭과 동일 기준.
3. **단일 평가자(이 세션) 기준.** 모델 간 품질 차이(GPT/Gemini/Claude)는 보지 않았다 — 그건 모델을 각각 돌려야 하며 (2) metered API 영역이다.
4. **구독 세션이므로 토큰/비용은 기록하지 않음.** 품질 신호만 유효하다.

## 결론

raw → ProofWeave artifact 압축은 이 4개 매칭 쿼리에서 **루브릭 품질을 100% 유지**했다(환각 0). 단, fixture가 필수 용어 보존을 전제로 설계됐다는 점을 함께 명시해야 한다. 따라서 주장 가능한 문장은:

> "이 벤치마크 데이터셋에서, ProofWeave artifact 컨텍스트는 raw source 대비 루브릭 기반 답변 품질을 손실 없이 유지했다(매칭 4쿼리, 필수 용어 커버리지·환각 회피 기준)."

품질이 유지되면서 입력 컨텍스트가 ~61–67% 작다는 것(offline 실측)이 결합될 때 ProofWeave의 컨텍스트 효율 주장이 성립한다. 비용/총토큰 절감은 여전히 (2) metered 실측 영역으로 남는다.
