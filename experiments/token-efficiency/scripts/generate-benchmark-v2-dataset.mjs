// Generates the larger benchmark v2 fixture and its source/artifact files.
// Korean note: 이 파일은 수작업 fixture JSON을 직접 고치는 대신, 재현 가능한
// 공개 출처 기반 테스트 데이터셋을 한 번에 다시 만들기 위한 생성기다.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const FIXTURES = join(ROOT, "fixtures");
const DATASET_ROOT = join(FIXTURES, "v2-full");
const SOURCE_ROOT = join(DATASET_ROOT, "source-bundles");
const ARTIFACT_ROOT = join(DATASET_ROOT, "artifacts");

const MODEL_CONFIG = [
  {
    modelId: "claude-opus-4.8",
    modelLabel: "claude-opus-4.8",
    provider: "anthropic",
    providerModelId: null,
    offlineContextBudgetTokens: 200000,
    offlineOutputBudgetTokens: 4096,
    usageSource: "offline_proxy_only",
  },
  {
    modelId: "gpt-5.5-fast-high",
    modelLabel: "gpt-5.5-fast-high",
    provider: "openai",
    providerModelId: null,
    offlineContextBudgetTokens: 200000,
    offlineOutputBudgetTokens: 4096,
    usageSource: "offline_proxy_only",
  },
  {
    modelId: "gemini-3.5-flash",
    modelLabel: "gemini-3.5-flash",
    provider: "google",
    providerModelId: null,
    offlineContextBudgetTokens: 1000000,
    offlineOutputBudgetTokens: 8192,
    usageSource: "offline_proxy_only",
  },
];

const sharedCautions = [
  "Record exact source URL, retrieval date, and source-owner wording before a live paid run.",
  "Keep raw source bundles longer than marketplace artifacts so token context compression is measurable.",
  "Treat this fixture as benchmark material, not legal, financial, security, or deployment advice.",
  "Do not report proxy token counts as provider billing tokens until the provider API usage field is captured.",
];

const topics = [
  {
    slug: "openai-responses-migration",
    attestationId: "att_api_openai_responses_migration",
    domain: "api_spec_migration",
    kind: "skill",
    problemType: "migration",
    title: "OpenAI Responses API Migration Skill",
    createdAt: "2026-05-11T00:00:00Z",
    priceUsdMicros: 260000,
    freshnessWindowDays: 21,
    sourceUrls: [
      "https://platform.openai.com/docs/api-reference/responses/create",
      "https://platform.openai.com/docs/advanced-usage",
      "https://platform.openai.com/docs/pricing",
    ],
    tags: ["openai", "responses-api", "migration", "tools", "streaming"],
    keywords: ["responses api", "/v1/responses", "response.output_text.delta", "function_call_output", "max_output_tokens"],
    rawSignals: [
      "Responses API request bodies use a structured input array rather than a single legacy chat messages envelope.",
      "Migration requires mapping chat role/content records, tool definitions, tool call outputs, and streaming event handlers.",
      "The output text helper is convenient, but production clients should still persist raw response ids and item ids.",
      "Reasoning-capable models may bill invisible reasoning tokens as output tokens, so usage must be read from the response.",
      "Count-only estimates can be generated before a paid response when the provider exposes an input-token endpoint.",
    ],
    artifactBullets: [
      "Map legacy `/v1/chat/completions` calls to `/v1/responses` with an `input` array.",
      "Replace `max_tokens` or chat-only caps with `max_output_tokens` in the Responses request.",
      "Stream text by handling `response.output_text.delta` and final response completion events.",
      "Return tool results through `function_call_output` items tied to the original tool call id.",
      "Persist `response.id` and use follow-up inputs or `previous_response_id` only when state carryover is intended.",
    ],
    queries: [
      {
        text: "OpenAI chat completions 코드를 Responses API로 옮길 때 input 배열, max_output_tokens, streaming event를 어떤 순서로 바꿔야 하나?",
        mustInclude: ["/v1/responses", "input", "max_output_tokens", "response.output_text.delta"],
        mustNotHallucinate: ["/v2/responses", "max_completion_tokens only", "GPT-6"],
      },
      {
        text: "Responses API에서 function tool 결과를 다시 넣는 방식과 기존 tool_calls 마이그레이션 주의점을 요약해줘.",
        mustInclude: ["function_call_output", "tool call id", "response.id", "previous_response_id"],
        mustNotHallucinate: ["function_call_result", "messages-only API", "tool result is free"],
      },
    ],
  },
  {
    slug: "openapi-petstore-contract",
    attestationId: "att_api_openapi_petstore_contract",
    domain: "api_spec_migration",
    kind: "curated_dataset",
    problemType: "openapi_contract",
    title: "OpenAPI Petstore Contract Normalization Dataset",
    createdAt: "2026-05-10T00:00:00Z",
    priceUsdMicros: 180000,
    freshnessWindowDays: 180,
    sourceUrls: [
      "https://github.com/OAI/OpenAPI-Specification/tree/main/examples",
      "https://spec.openapis.org/oas/latest.html",
    ],
    tags: ["openapi", "petstore", "schema", "operationid", "contract"],
    keywords: ["openapi", "operationId", "components.schemas", "securitySchemes", "examples"],
    rawSignals: [
      "OpenAPI examples are useful for contract extraction because they contain paths, operations, schemas, examples, and security declarations.",
      "Migration tasks should preserve operationId stability so generated clients do not break unnecessarily.",
      "Schema normalization should keep enum values, nullable semantics, examples, and response status codes.",
      "Security requirements belong in components.securitySchemes and per-operation security arrays when behavior differs.",
      "Do not convert an example contract into implementation behavior that was not present in the source specification.",
    ],
    artifactBullets: [
      "Use the OpenAPI example as a fixture for `paths`, `operationId`, response status codes, and `components.schemas`.",
      "Normalize examples without dropping enum values, nullable fields, or request/response examples.",
      "Preserve `securitySchemes` separately from operation-level security overrides.",
      "Snapshot generated client diffs after migration so changed operation names are reviewed explicitly.",
      "Mark absent behavior as unknown instead of inventing endpoint side effects.",
    ],
    queries: [
      {
        text: "OpenAPI 예제 스펙을 마이그레이션 fixture로 쓸 때 operationId와 components.schemas를 어떻게 보존해야 해?",
        mustInclude: ["operationId", "components.schemas", "enum", "response status codes"],
        mustNotHallucinate: ["GraphQL schema", "implementation database table", "OAuth token endpoint invented"],
      },
      {
        text: "Petstore류 OpenAPI contract에서 securitySchemes와 operation-level security를 분리해서 테스트하는 기준을 줘.",
        mustInclude: ["securitySchemes", "operation-level security", "examples", "unknown"],
        mustNotHallucinate: ["all endpoints require OAuth", "delete security arrays", "mock server only"],
      },
    ],
  },
  {
    slug: "stripe-webhook-idempotency",
    attestationId: "att_api_stripe_webhook_idempotency",
    domain: "api_spec_migration",
    kind: "workflow_recipe",
    problemType: "webhook_migration",
    title: "Webhook Idempotency Migration Recipe",
    createdAt: "2026-05-09T00:00:00Z",
    priceUsdMicros: 220000,
    freshnessWindowDays: 90,
    sourceUrls: [
      "https://docs.stripe.com/api/idempotent_requests",
      "https://docs.stripe.com/webhooks",
    ],
    tags: ["stripe", "webhook", "idempotency", "signature", "retry"],
    keywords: ["idempotency key", "webhook signature", "event id", "retry", "dedupe"],
    rawSignals: [
      "Payment APIs often require idempotency for client-created resources and separate replay protection for webhook delivery.",
      "Webhook handlers must verify signatures before mutating local state.",
      "Event id deduplication should happen after signature verification and before side effects.",
      "Retries can deliver events out of order, so workflows should store event timestamps and resource state versions.",
      "A migration artifact should distinguish request idempotency from webhook event dedupe.",
    ],
    artifactBullets: [
      "Use an `Idempotency-Key` for client-created payment requests and store the request fingerprint.",
      "Verify the webhook signature before accepting an event into the local queue.",
      "Deduplicate webhook work by `event.id` and keep a processed-event table with timestamps.",
      "Design handlers to tolerate retry and out-of-order delivery.",
      "Do not treat webhook signature verification as a replacement for idempotent mutation logic.",
    ],
    queries: [
      {
        text: "결제 API 마이그레이션에서 Idempotency-Key와 webhook event.id dedupe를 분리해서 검증하려면 어떤 fixture가 필요해?",
        mustInclude: ["Idempotency-Key", "event.id", "signature", "out-of-order"],
        mustNotHallucinate: ["idempotency key verifies signatures", "no retry", "same as OAuth"],
      },
      {
        text: "Webhook handler가 재시도와 중복 이벤트를 받을 때 안전하게 처리하는 migration recipe를 줘.",
        mustInclude: ["webhook signature", "processed-event table", "retry", "request fingerprint"],
        mustNotHallucinate: ["process before verification", "delete event id", "exactly once delivery"],
      },
    ],
  },
  {
    slug: "solana-priority-fee",
    attestationId: "att_fee_solana_priority_fee",
    domain: "onchain_fee_measurement",
    kind: "skill",
    problemType: "fee_estimation",
    title: "Solana Priority Fee Measurement Skill",
    createdAt: "2026-05-08T00:00:00Z",
    priceUsdMicros: 250000,
    freshnessWindowDays: 30,
    sourceUrls: [
      "https://solana.com/docs/core/fees",
      "https://solana.com/docs/rpc/http/getrecentprioritizationfees",
    ],
    tags: ["solana", "priority-fee", "compute-budget", "rpc", "jito"],
    keywords: ["getRecentPrioritizationFees", "SetComputeUnitPrice", "SetComputeUnitLimit", "micro-lamports", "prioritization fee"],
    rawSignals: [
      "Solana fee calculation separates the base signature fee from optional prioritization fees.",
      "The prioritization fee is based on compute unit price and compute unit limit, expressed in micro-lamports.",
      "Recent prioritization fees are RPC observations and should be treated as recent local market evidence, not a guarantee.",
      "Compute budget instructions should be inserted before transaction execution so the scheduler sees the intended price and limit.",
      "Jito tips are separate from the native prioritization fee and should not be double counted.",
    ],
    artifactBullets: [
      "Query `getRecentPrioritizationFees` for recent local fee evidence.",
      "Set the compute unit limit with `SetComputeUnitLimit` based on simulation plus margin.",
      "Set the compute unit price with `SetComputeUnitPrice` in micro-lamports.",
      "Estimate prioritization fee as compute unit price times compute unit limit divided by 1,000,000.",
      "Track Jito tips separately from native prioritization fee fields.",
    ],
    queries: [
      {
        text: "Solana에서 getRecentPrioritizationFees로 priority fee를 산정하고 ComputeBudget instruction을 넣는 절차를 알려줘.",
        mustInclude: ["getRecentPrioritizationFees", "SetComputeUnitLimit", "SetComputeUnitPrice", "micro-lamports"],
        mustNotHallucinate: ["EIP-1559 exact copy", "priority fee in SOL only", "base fee burn"],
      },
      {
        text: "Solana priority fee와 Jito tip을 같은 비용으로 합치지 말아야 하는 이유를 벤치마크 rubric으로 잡고 싶어.",
        mustInclude: ["Jito tips", "native prioritization fee", "compute unit", "1,000,000"],
        mustNotHallucinate: ["Jito is mandatory", "tips replace compute budget", "gasPrice"],
      },
    ],
  },
  {
    slug: "ethereum-fee-history",
    attestationId: "att_fee_ethereum_fee_history",
    domain: "onchain_fee_measurement",
    kind: "curated_dataset",
    problemType: "fee_history",
    title: "Ethereum EIP-1559 Fee History Dataset",
    createdAt: "2026-05-07T00:00:00Z",
    priceUsdMicros: 280000,
    freshnessWindowDays: 14,
    sourceUrls: [
      "https://ethereum.org/en/developers/docs/gas/",
      "https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_feehistory",
    ],
    tags: ["ethereum", "eip-1559", "fee-history", "base-fee", "priority-fee"],
    keywords: ["eth_feeHistory", "baseFeePerGas", "reward percentiles", "maxPriorityFeePerGas", "maxFeePerGas"],
    rawSignals: [
      "EIP-1559 transaction pricing separates base fee, max priority fee, and max fee.",
      "The base fee changes per block and is burned, while priority fee compensates validators.",
      "The eth_feeHistory method returns block base fee values and optional reward percentile arrays.",
      "A fee estimator should record block range, percentile choices, and fallback behavior when rewards are sparse.",
      "Do not mix wei, gwei, and ETH units without explicit conversion metadata.",
    ],
    artifactBullets: [
      "Collect `eth_feeHistory` over a fixed block window and store the block range.",
      "Use `baseFeePerGas` for the base fee path and reward percentiles for priority-fee evidence.",
      "Report `maxPriorityFeePerGas` and `maxFeePerGas` separately.",
      "Normalize units to wei and display gwei only as a derived view.",
      "Flag sparse reward arrays instead of forward-filling missing priority fee evidence.",
    ],
    queries: [
      {
        text: "Ethereum EIP-1559 수수료 추정을 eth_feeHistory 기반으로 만들 때 baseFeePerGas와 reward percentiles를 어떻게 써?",
        mustInclude: ["eth_feeHistory", "baseFeePerGas", "reward percentiles", "maxPriorityFeePerGas"],
        mustNotHallucinate: ["Solana compute units", "base fee paid to validators", "gasless by default"],
      },
      {
        text: "maxFeePerGas와 maxPriorityFeePerGas를 분리해서 저장하는 fee dataset 기준을 만들어줘.",
        mustInclude: ["maxFeePerGas", "maxPriorityFeePerGas", "wei", "block range"],
        mustNotHallucinate: ["single gasPrice only", "forward-fill missing rewards", "priority fee burned"],
      },
    ],
  },
  {
    slug: "base-l2-fee-breakdown",
    attestationId: "att_fee_base_l2_breakdown",
    domain: "onchain_fee_measurement",
    kind: "workflow_recipe",
    problemType: "l2_fee_breakdown",
    title: "Base L2 Fee Breakdown Recipe",
    createdAt: "2026-05-06T00:00:00Z",
    priceUsdMicros: 240000,
    freshnessWindowDays: 30,
    sourceUrls: [
      "https://docs.base.org/",
      "https://docs.optimism.io/stack/transactions/fees",
    ],
    tags: ["base", "optimism", "l2-fee", "calldata", "receipt"],
    keywords: ["L1 data fee", "L2 execution fee", "receipt", "calldata", "OP Stack"],
    rawSignals: [
      "OP Stack chains expose transaction costs that include L2 execution and an L1 data component.",
      "Receipt-only measurement should preserve gas used, effective gas price, and any L1 fee fields exposed by the RPC.",
      "A benchmark fixture should include a receipt snapshot, calldata size note, and a chain id.",
      "Comparisons across chains must not assume the same base fee mechanics as Ethereum L1.",
      "The artifact should say which fields are measured and which are inferred.",
    ],
    artifactBullets: [
      "Break Base transaction cost into L2 execution fee and L1 data fee when fields are available.",
      "Store transaction receipt, chain id, gas used, effective gas price, and calldata size.",
      "Mark OP Stack fee fields as measured evidence rather than generic Ethereum L1 estimates.",
      "Compare fee samples only over the same chain and time window.",
      "Do not merge L1 data fee into priority fee without naming the transformation.",
    ],
    queries: [
      {
        text: "Base L2 수수료를 L2 execution fee와 L1 data fee로 나눠서 측정하는 recipe가 필요해.",
        mustInclude: ["L2 execution fee", "L1 data fee", "receipt", "calldata size"],
        mustNotHallucinate: ["same as Ethereum L1 only", "Solana lamports", "validator tip"],
      },
      {
        text: "OP Stack 체인 수수료 비교에서 chain id와 time window를 왜 고정해야 하는지 정리해줘.",
        mustInclude: ["OP Stack", "chain id", "time window", "effective gas price"],
        mustNotHallucinate: ["all L2 fees identical", "ignore receipt", "no calldata cost"],
      },
    ],
  },
  {
    slug: "kraken-ohlc-trades",
    attestationId: "att_market_kraken_ohlc_trades",
    domain: "market_timeseries",
    kind: "curated_dataset",
    problemType: "ohlc_reconciliation",
    title: "Kraken OHLC and Trades Reconciliation Dataset",
    createdAt: "2026-05-05T00:00:00Z",
    priceUsdMicros: 350000,
    freshnessWindowDays: 7,
    sourceUrls: [
      "https://docs.kraken.com/api/docs/rest-api/get-ohlc-data/",
      "https://docs.kraken.com/api/docs/rest-api/get-recent-trades/",
    ],
    tags: ["kraken", "ohlc", "trades", "timeseries", "reconciliation"],
    keywords: ["OHLC", "trades", "interval", "last cursor", "volume weighted average"],
    rawSignals: [
      "OHLC candles summarize trades over a fixed interval, but trade endpoints expose individual events and pagination cursors.",
      "A reconciliation dataset should store pair, interval, start timestamp, end timestamp, and the last cursor.",
      "Open, high, low, close, volume, and trade count should be recomputed from trades where possible.",
      "Missing intervals should be reported as gaps rather than silently forward-filled.",
      "Clock alignment matters because exchange candles may use exchange-side bucket boundaries.",
    ],
    artifactBullets: [
      "Use Kraken OHLC rows with pair, interval, timestamp, open, high, low, close, volume, and count.",
      "Join recent trades by pair and timestamp window, keeping the `last` cursor for reproducibility.",
      "Recompute candle fields from trades and report differences.",
      "Emit a gap list for missing intervals instead of forward-filling.",
      "Keep exchange bucket boundaries explicit.",
    ],
    queries: [
      {
        text: "Kraken OHLC와 trades를 비교해서 candle 품질을 검증하려면 어떤 컬럼과 gap policy가 필요해?",
        mustInclude: ["OHLC", "trades", "last cursor", "gap list"],
        mustNotHallucinate: ["forward-fill by default", "Binance only", "daily only"],
      },
      {
        text: "거래소 candle을 trades에서 재계산할 때 open/high/low/close/volume/count 기준을 정리해줘.",
        mustInclude: ["open", "high", "low", "close", "volume", "count"],
        mustNotHallucinate: ["ignore bucket boundaries", "VWAP is close", "no timestamp"],
      },
    ],
  },
  {
    slug: "coingecko-market-chart",
    attestationId: "att_market_coingecko_chart",
    domain: "market_timeseries",
    kind: "workflow_recipe",
    problemType: "market_chart",
    title: "CoinGecko Market Chart Normalization Recipe",
    createdAt: "2026-05-04T00:00:00Z",
    priceUsdMicros: 240000,
    freshnessWindowDays: 7,
    sourceUrls: [
      "https://docs.coingecko.com/reference/coins-id-market-chart",
      "https://docs.coingecko.com/reference/coins-id-market-chart-range",
    ],
    tags: ["coingecko", "market-chart", "price", "market-cap", "volume"],
    keywords: ["market_chart", "prices", "market_caps", "total_volumes", "range"],
    rawSignals: [
      "Market chart endpoints commonly return arrays of timestamp-value pairs for prices, market caps, and total volumes.",
      "Normalization must keep the asset id, quote currency, timestamp unit, and range parameters.",
      "The chart range endpoint is a better fixture for reproducible windows than a moving days parameter.",
      "Missing values should be marked and excluded from return calculations unless a fill policy is declared.",
      "Rate-limit metadata and cache time should be stored outside the time series rows.",
    ],
    artifactBullets: [
      "Normalize `prices`, `market_caps`, and `total_volumes` as timestamp-value series.",
      "Prefer `market_chart/range` for fixed benchmark windows.",
      "Store asset id, quote currency, timestamp unit, and requested range.",
      "Do not compute returns across missing values unless a fill policy is declared.",
      "Keep API cache or rate-limit notes outside the data rows.",
    ],
    queries: [
      {
        text: "CoinGecko market_chart 데이터를 prices, market_caps, total_volumes로 정규화하는 기준을 알려줘.",
        mustInclude: ["prices", "market_caps", "total_volumes", "timestamp"],
        mustNotHallucinate: ["order book depth", "OHLC count column", "guaranteed real-time"],
      },
      {
        text: "moving days 파라미터 대신 range endpoint를 fixture에 쓰는 이유와 누락값 처리 기준을 정리해줘.",
        mustInclude: ["market_chart/range", "fixed benchmark windows", "missing values", "fill policy"],
        mustNotHallucinate: ["always forward-fill", "ignore quote currency", "seconds only"],
      },
    ],
  },
  {
    slug: "uniswap-v3-liquidity-timeseries",
    attestationId: "att_market_uniswap_v3_liquidity",
    domain: "market_timeseries",
    kind: "curated_dataset",
    problemType: "defi_timeseries",
    title: "Uniswap v3 Liquidity Time Series Dataset",
    createdAt: "2026-05-03T00:00:00Z",
    priceUsdMicros: 320000,
    freshnessWindowDays: 14,
    sourceUrls: [
      "https://docs.uniswap.org/",
      "https://thegraph.com/docs/",
    ],
    tags: ["uniswap", "v3", "liquidity", "tvl", "subgraph"],
    keywords: ["poolDayData", "liquidity", "sqrtPrice", "tick", "TVL"],
    rawSignals: [
      "DeFi pool time series should include pool address, chain id, token decimals, timestamp, liquidity, price, and volume fields.",
      "Uniswap v3 liquidity interpretation depends on ticks and token decimals.",
      "Subgraph snapshots can lag chain state, so block number and indexed timestamp should be stored.",
      "TVL calculations should name the quote asset and pricing source.",
      "Cross-pool comparisons must normalize decimals and chain id before aggregation.",
    ],
    artifactBullets: [
      "Use `poolDayData` style rows with pool address, chain id, timestamp, liquidity, volume, and TVL.",
      "Normalize token decimals before comparing liquidity or volume.",
      "Store block number or indexed timestamp to identify subgraph lag.",
      "Include `sqrtPrice` or tick context when price interpretation matters.",
      "Name the quote asset and pricing source for TVL.",
    ],
    queries: [
      {
        text: "Uniswap v3 poolDayData 기반 liquidity timeseries를 만들 때 decimals와 block number를 어떻게 보존해야 해?",
        mustInclude: ["poolDayData", "token decimals", "block number", "liquidity"],
        mustNotHallucinate: ["constant product v2 only", "no tick", "centralized exchange"],
      },
      {
        text: "DeFi TVL 시계열에서 quote asset과 pricing source를 artifact에 남겨야 하는 이유를 정리해줘.",
        mustInclude: ["TVL", "quote asset", "pricing source", "chain id"],
        mustNotHallucinate: ["TVL equals volume", "ignore decimals", "single global price"],
      },
    ],
  },
  {
    slug: "fatf-travel-rule",
    attestationId: "att_reg_fatf_travel_rule",
    domain: "regulatory_comparison",
    kind: "curated_dataset",
    problemType: "travel_rule",
    title: "FATF Travel Rule Baseline Comparison",
    createdAt: "2026-05-02T00:00:00Z",
    priceUsdMicros: 420000,
    freshnessWindowDays: 60,
    sourceUrls: [
      "https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Guidance-rba-virtual-assets-2021.html",
      "https://www.fatf-gafi.org/content/dam/fatf-gafi/guidance/Updated-Guidance-VA-VASP.pdf.coredownload.inline.pdf",
    ],
    tags: ["fatf", "travel-rule", "vasp", "originator", "beneficiary"],
    keywords: ["Recommendation 16", "originator information", "beneficiary information", "VASP", "virtual assets"],
    rawSignals: [
      "FATF Recommendation 16 is the baseline source for originator and beneficiary information transfer expectations.",
      "Virtual asset service providers should obtain, hold, and transmit required information where applicable.",
      "Jurisdictional implementation differs, so country-specific thresholds must not be inferred solely from FATF text.",
      "The artifact should separate FATF baseline from local legal implementation.",
      "Self-hosted wallet obligations require local-law confirmation before operational use.",
    ],
    artifactBullets: [
      "Use FATF Recommendation 16 as the baseline, not as a substitute for local law.",
      "Track required originator information and beneficiary information separately.",
      "Identify whether the counterparty is a VASP, other obliged entity, or self-hosted wallet.",
      "Mark jurisdiction-specific thresholds as local implementation fields.",
      "Flag self-hosted wallet treatment as requiring local-law verification.",
    ],
    queries: [
      {
        text: "FATF Travel Rule baseline에서 originator information과 beneficiary information을 분리해서 비교표로 만들고 싶어.",
        mustInclude: ["Recommendation 16", "originator information", "beneficiary information", "VASP"],
        mustNotHallucinate: ["single global threshold", "no local law needed", "privacy exemption for all"],
      },
      {
        text: "self-hosted wallet 처리 기준을 FATF baseline과 local implementation으로 나눠서 설명해줘.",
        mustInclude: ["self-hosted wallet", "local implementation", "thresholds", "verification"],
        mustNotHallucinate: ["always exempt", "FATF is directly binding law", "no VASP"],
      },
    ],
  },
  {
    slug: "fincen-funds-travel-rule",
    attestationId: "att_reg_fincen_funds_travel_rule",
    domain: "regulatory_comparison",
    kind: "curated_dataset",
    problemType: "us_travel_rule",
    title: "FinCEN Funds Travel Rule Q&A Extract",
    createdAt: "2026-05-01T00:00:00Z",
    priceUsdMicros: 410000,
    freshnessWindowDays: 90,
    sourceUrls: [
      "https://www.fincen.gov/resources/statutes-regulations/guidance/funds-travel-regulations-questions-answers",
    ],
    tags: ["fincen", "travel-rule", "bsa", "threshold", "funds-transfer"],
    keywords: ["FinCEN", "Funds Travel Rule", "$3,000", "transmittal", "recordkeeping"],
    rawSignals: [
      "FinCEN Q&A material describes funds travel regulations for covered financial institutions.",
      "The classic US funds travel rule threshold is equal to or greater than 3,000 USD or foreign equivalent.",
      "The Q&A is not a complete crypto-specific operating manual and must be paired with virtual currency guidance where relevant.",
      "A benchmark artifact should preserve threshold, scope, and recordkeeping/transmittal distinction.",
      "Do not turn the Q&A into a blanket statement about all wallets or all crypto transfers.",
    ],
    artifactBullets: [
      "Record the FinCEN Funds Travel Rule threshold as equal to or greater than `$3,000` or foreign equivalent.",
      "Preserve the distinction between recordkeeping and transmittal obligations.",
      "Label the source as FinCEN Q&A guidance for funds transfers.",
      "Add a caveat that crypto-specific applicability needs additional virtual currency guidance.",
      "Avoid claiming a blanket exemption for self-hosted wallets from this source alone.",
    ],
    queries: [
      {
        text: "US FinCEN Funds Travel Rule Q&A에서 $3,000 threshold와 recordkeeping/transmittal 구분을 뽑아줘.",
        mustInclude: ["FinCEN", "$3,000", "recordkeeping", "transmittal"],
        mustNotHallucinate: ["$10,000 only", "EU TFR", "universal exemption"],
      },
      {
        text: "FinCEN Q&A를 crypto travel rule 비교표에 넣을 때 어떤 caveat를 붙여야 해?",
        mustInclude: ["funds transfers", "virtual currency guidance", "scope", "foreign equivalent"],
        mustNotHallucinate: ["complete crypto manual", "zero threshold", "no BSA"],
      },
    ],
  },
  {
    slug: "eu-tfr-eba-guidelines",
    attestationId: "att_reg_eu_tfr_eba_guidelines",
    domain: "regulatory_comparison",
    kind: "workflow_recipe",
    problemType: "eu_crypto_transfer",
    title: "EU TFR and EBA Travel Rule Guidelines Recipe",
    createdAt: "2026-04-30T00:00:00Z",
    priceUsdMicros: 430000,
    freshnessWindowDays: 60,
    sourceUrls: [
      "https://www.eba.europa.eu/regulation-and-policy/single-rulebook/interactive-single-rulebook/13084",
      "https://www.eba.europa.eu/activities/single-rulebook/regulatory-activities/anti-money-laundering-and-countering-financing-terrorism/guidelines-information-requirements-relation-transfers-funds-and-certain-crypto-assets-transfers",
    ],
    tags: ["eu", "eba", "tfr", "travel-rule", "casp"],
    keywords: ["Regulation (EU) 2023/1113", "CASP", "Article 14", "missing information", "self-hosted address"],
    rawSignals: [
      "EU Regulation 2023/1113 extends transfer-information requirements to certain crypto-asset transfers.",
      "EBA guidelines describe steps for PSPs, CASPs, and intermediaries to detect missing or incomplete information.",
      "The benchmark fixture should label Article 14 and CASP obligations separately from FATF baseline language.",
      "Self-hosted address verification questions are implementation-sensitive and should cite the EU source used.",
      "Do not reuse the US 3,000 USD threshold as an EU crypto transfer default.",
    ],
    artifactBullets: [
      "Label the EU source as `Regulation (EU) 2023/1113` plus EBA Travel Rule Guidelines.",
      "Track CASP and intermediary CASP duties separately from PSP duties.",
      "Use `Article 14` for information accompanying transfers of crypto-assets.",
      "Record checks for missing or incomplete information.",
      "Do not import the US `$3,000` threshold into EU crypto-transfer analysis.",
    ],
    queries: [
      {
        text: "EU TFR에서 CASP가 crypto-asset transfer information을 처리할 때 Article 14와 EBA guideline 기준을 연결해줘.",
        mustInclude: ["Regulation (EU) 2023/1113", "CASP", "Article 14", "missing or incomplete information"],
        mustNotHallucinate: ["US $3,000 threshold", "FinCEN only", "no intermediary duties"],
      },
      {
        text: "EU crypto travel rule을 FATF baseline과 비교할 때 PSP/CASP/intermediary 구분을 어떻게 잡아야 해?",
        mustInclude: ["PSP", "CASP", "intermediary CASP", "EBA"],
        mustNotHallucinate: ["same as US BSA", "no crypto scope", "only banks"],
      },
    ],
  },
  {
    slug: "openzeppelin-uups-deploy",
    attestationId: "att_sec_openzeppelin_uups_deploy",
    domain: "security_deployment",
    kind: "workflow_recipe",
    problemType: "deployment_checklist",
    title: "OpenZeppelin UUPS Deployment Checklist",
    createdAt: "2026-04-29T00:00:00Z",
    priceUsdMicros: 500000,
    freshnessWindowDays: 90,
    sourceUrls: [
      "https://docs.openzeppelin.com/upgrades-plugins",
      "https://docs.openzeppelin.com/upgrades-plugins/api-hardhat-upgrades",
      "https://docs.openzeppelin.com/contracts/5.x/api/proxy",
    ],
    tags: ["openzeppelin", "uups", "proxy", "storage-layout", "verification"],
    keywords: ["UUPS", "ERC1967Proxy", "_disableInitializers", "storage layout", "upgrade authorization"],
    rawSignals: [
      "Upgradeable contracts must lock implementation initializers to prevent direct takeover.",
      "UUPS upgrades rely on implementation-side authorization and ERC-1967 proxy storage slots.",
      "Storage layout compatibility checks must run before upgrade transactions are proposed.",
      "Deployment evidence should include implementation address, proxy address, initializer calldata, and verification artifacts.",
      "Admin role ownership and upgrade authority should be recorded separately from deployer EOA.",
    ],
    artifactBullets: [
      "Call `_disableInitializers` in the implementation constructor or equivalent initializer-lock pattern.",
      "Deploy through `ERC1967Proxy` or an upgrades plugin configured for `kind: \"uups\"`.",
      "Run a storage layout compatibility check before upgrades.",
      "Record implementation address, proxy address, initializer calldata, and verification transaction.",
      "Verify upgrade authorization and owner/admin role separation.",
    ],
    queries: [
      {
        text: "Base 메인넷 UUPS 프록시 배포 전에 _disableInitializers, ERC1967Proxy, storage layout 검증을 체크리스트로 줘.",
        mustInclude: ["_disableInitializers", "ERC1967Proxy", "storage layout", "upgrade authorization"],
        mustNotHallucinate: ["beacon proxy only", "constructor initializes proxy state", "skip storage check"],
      },
      {
        text: "UUPS deployment artifact에 implementation/proxy address와 initializer calldata를 남기는 이유가 뭐야?",
        mustInclude: ["implementation address", "proxy address", "initializer calldata", "verification"],
        mustNotHallucinate: ["single address only", "no owner role", "unstructured storage required"],
      },
    ],
  },
  {
    slug: "foundry-security-smoke",
    attestationId: "att_sec_foundry_security_smoke",
    domain: "security_deployment",
    kind: "skill",
    problemType: "predeploy_security",
    title: "Foundry Security Smoke Test Skill",
    createdAt: "2026-04-28T00:00:00Z",
    priceUsdMicros: 230000,
    freshnessWindowDays: 60,
    sourceUrls: [
      "https://book.getfoundry.sh/forge/tests",
      "https://book.getfoundry.sh/forge/fuzz-testing",
      "https://book.getfoundry.sh/forge/invariant-testing",
    ],
    tags: ["foundry", "forge", "fuzz", "invariant", "predeploy"],
    keywords: ["forge test", "fuzz", "invariant", "fork", "gas snapshot"],
    rawSignals: [
      "Foundry predeploy checks can combine deterministic unit tests, fuzz tests, invariant tests, fork tests, and gas snapshots.",
      "The smoke phase should be fast enough for every deploy candidate but broad enough to catch auth and accounting regressions.",
      "Fork tests should pin chain id, block number, RPC source, and external addresses.",
      "A gas snapshot is useful for unexpected cost changes but is not a security proof.",
      "The artifact should include command lines and evidence files instead of vague assurances.",
    ],
    artifactBullets: [
      "Run `forge test` for deterministic unit coverage.",
      "Run targeted fuzz tests for boundary inputs and accounting transitions.",
      "Run invariant tests for balances, roles, and supply constraints.",
      "Pin fork tests by chain id and block number.",
      "Record `forge snapshot` separately from security pass/fail.",
    ],
    queries: [
      {
        text: "Foundry로 predeploy security smoke test를 구성할 때 forge test, fuzz, invariant, fork pinning을 어떻게 묶어?",
        mustInclude: ["forge test", "fuzz", "invariant", "block number"],
        mustNotHallucinate: ["gas snapshot proves security", "no fork pin", "only lint"],
      },
      {
        text: "배포 전 체크에서 gas snapshot과 보안 pass/fail을 분리해야 하는 이유를 알려줘.",
        mustInclude: ["forge snapshot", "security pass/fail", "accounting", "roles"],
        mustNotHallucinate: ["gas equals exploit risk", "skip tests", "unbounded fork"],
      },
    ],
  },
  {
    slug: "slither-static-analysis",
    attestationId: "att_sec_slither_static_analysis",
    domain: "security_deployment",
    kind: "workflow_recipe",
    problemType: "static_analysis",
    title: "Slither Static Analysis Triage Recipe",
    createdAt: "2026-04-27T00:00:00Z",
    priceUsdMicros: 210000,
    freshnessWindowDays: 90,
    sourceUrls: [
      "https://github.com/crytic/slither",
      "https://github.com/crytic/slither/wiki",
    ],
    tags: ["slither", "static-analysis", "solidity", "triage", "false-positive"],
    keywords: ["slither", "detectors", "triage", "false positive", "SARIF"],
    rawSignals: [
      "Static analysis should be recorded as detector output plus a human triage decision.",
      "False positives are common; the benchmark should reward artifacts that preserve detector id, severity, file, and rationale.",
      "CI integration can export JSON or SARIF for repeatability.",
      "Security deployment readiness should not depend on passing every informational detector.",
      "The artifact should name the detectors that are blockers for the project's threat model.",
    ],
    artifactBullets: [
      "Run Slither and preserve detector id, severity, file, and line evidence.",
      "Export JSON or SARIF so CI can diff findings.",
      "Triage false positives with an explicit rationale.",
      "Define deployment blockers by detector severity and the project's threat model.",
      "Do not treat informational findings as automatic deploy blockers.",
    ],
    queries: [
      {
        text: "Slither 결과를 배포 전 triage artifact로 만들 때 detector id, severity, false positive 근거를 어떻게 남겨?",
        mustInclude: ["detector id", "severity", "false positives", "SARIF"],
        mustNotHallucinate: ["all findings are critical", "no human triage", "bytecode only"],
      },
      {
        text: "Static analysis를 CI에 넣되 deployment blocker를 threat model 기준으로 나누는 방법을 알려줘.",
        mustInclude: ["CI", "JSON", "deployment blockers", "threat model"],
        mustNotHallucinate: ["ignore severity", "manual only", "guaranteed exploit proof"],
      },
    ],
  },
  {
    slug: "claude-code-skills",
    attestationId: "att_agent_claude_code_skills",
    domain: "agent_workflow",
    kind: "workflow_recipe",
    problemType: "skill_authoring",
    title: "Claude Code Skill Authoring Recipe",
    createdAt: "2026-04-26T00:00:00Z",
    priceUsdMicros: 160000,
    freshnessWindowDays: 120,
    sourceUrls: [
      "https://docs.anthropic.com/",
      "https://docs.anthropic.com/en/docs/claude-code",
    ],
    tags: ["claude-code", "skill", "progressive-disclosure", "description", "workflow"],
    keywords: ["SKILL.md", "description", "progressive disclosure", "trigger", "examples"],
    rawSignals: [
      "Agent skills should have a concise description that tells the model when the skill applies.",
      "Progressive disclosure keeps the entrypoint small and points to scripts, references, or examples only as needed.",
      "A good skill includes workflow steps, safety constraints, and verification expectations.",
      "Benchmark queries should reward artifacts that name files, commands, and handoff boundaries.",
      "Do not conflate a skill with a plugin manifest or provider API configuration.",
    ],
    artifactBullets: [
      "Write a `SKILL.md` with a clear `description` trigger.",
      "Use progressive disclosure by linking scripts, references, and examples only when needed.",
      "Include workflow steps, safety constraints, and verification expectations.",
      "Keep generated artifacts separate from skill instructions.",
      "Do not describe a skill as a provider API key or plugin manifest.",
    ],
    queries: [
      {
        text: "Claude Code Skill을 만들 때 SKILL.md description과 progressive disclosure를 어떻게 설계해야 해?",
        mustInclude: ["SKILL.md", "description", "progressive disclosure", "workflow steps"],
        mustNotHallucinate: ["plugin manifest required", "API key required", "always load all references"],
      },
      {
        text: "에이전트용 skill 문서에 safety constraints와 verification expectations를 넣는 기준을 줘.",
        mustInclude: ["safety constraints", "verification expectations", "scripts", "examples"],
        mustNotHallucinate: ["no trigger needed", "provider billing", "single prompt only"],
      },
    ],
  },
  {
    slug: "openai-evals-quality",
    attestationId: "att_agent_openai_evals_quality",
    domain: "agent_workflow",
    kind: "curated_dataset",
    problemType: "eval_design",
    title: "OpenAI Evals Quality Rubric Dataset",
    createdAt: "2026-04-25T00:00:00Z",
    priceUsdMicros: 190000,
    freshnessWindowDays: 90,
    sourceUrls: [
      "https://platform.openai.com/docs/guides/evals",
      "https://platform.openai.com/docs/guides/evals-design",
    ],
    tags: ["openai", "evals", "rubric", "quality", "judge"],
    keywords: ["evals", "rubric", "grader", "dataset", "quality score"],
    rawSignals: [
      "Quality evaluation should define the task, input data, expected behavior, and scoring rubric before model runs.",
      "LLM-as-judge can help but should be paired with deterministic checks for required facts.",
      "A benchmark output should preserve per-query rubric coverage and aggregate pass rates by domain.",
      "Human review samples are needed for high-stakes claims or ambiguous rubric failures.",
      "Do not let token savings hide a drop in quality pass rate.",
    ],
    artifactBullets: [
      "Define eval input, expected behavior, and scoring rubric before running models.",
      "Use deterministic `mustInclude` checks alongside any LLM judge.",
      "Report per-query quality score and domain-level pass rate.",
      "Sample failures for human review when rubric interpretation is ambiguous.",
      "Keep quality-adjusted saving separate from raw token reduction.",
    ],
    queries: [
      {
        text: "토큰 절감 벤치마크에 OpenAI Evals식 quality rubric을 붙일 때 per-query score와 domain pass rate를 어떻게 내?",
        mustInclude: ["scoring rubric", "mustInclude", "quality score", "domain-level pass rate"],
        mustNotHallucinate: ["token saving equals quality", "judge only", "no dataset"],
      },
      {
        text: "LLM-as-judge와 deterministic check를 같이 쓰는 eval design을 ProofWeave benchmark에 맞게 정리해줘.",
        mustInclude: ["LLM judge", "deterministic", "human review", "quality-adjusted saving"],
        mustNotHallucinate: ["fully automatic truth", "ignore failures", "single global score"],
      },
    ],
  },
  {
    slug: "browser-to-api-agent-workflow",
    attestationId: "att_agent_browser_to_api_workflow",
    domain: "agent_workflow",
    kind: "skill",
    problemType: "api_discovery",
    title: "Browser-to-API Agent Workflow Skill",
    createdAt: "2026-04-24T00:00:00Z",
    priceUsdMicros: 180000,
    freshnessWindowDays: 120,
    sourceUrls: [
      "https://playwright.dev/docs/network",
      "https://spec.openapis.org/oas/latest.html",
    ],
    tags: ["browser", "api-discovery", "openapi", "network-trace", "agent"],
    keywords: ["browser trace", "network requests", "OpenAPI", "redaction", "coverage report"],
    rawSignals: [
      "Browser-observed API reconstruction should capture method, URL pattern, status code, request body schema, and response body shape.",
      "Sensitive values must be redacted before generating an OpenAPI document.",
      "Coverage reports should list observed endpoints and unobserved assumptions.",
      "The workflow is useful for agent handoff because it turns UI traffic into a concrete API artifact.",
      "Do not claim full API coverage from one browser journey.",
    ],
    artifactBullets: [
      "Capture browser network requests with method, URL pattern, status code, request body, and response shape.",
      "Redact tokens, cookies, emails, and personal identifiers before writing artifacts.",
      "Generate a best-effort OpenAPI document plus a coverage report.",
      "Mark unobserved endpoints and inferred schemas explicitly.",
      "Do not claim complete API coverage from a single trace.",
    ],
    queries: [
      {
        text: "브라우저 네트워크 trace에서 OpenAPI 스펙을 만드는 agent workflow에 redaction과 coverage report 기준을 넣어줘.",
        mustInclude: ["browser network requests", "OpenAPI", "redact", "coverage report"],
        mustNotHallucinate: ["cookies in output", "complete coverage", "no schemas"],
      },
      {
        text: "UI journey 하나만 보고 API 전체를 안다고 주장하지 않도록 benchmark rubric을 어떻게 잡아야 해?",
        mustInclude: ["unobserved endpoints", "inferred schemas", "single trace", "method"],
        mustNotHallucinate: ["full API proof", "no status code", "raw secrets"],
      },
    ],
  },
];

const noMatchQueries = [
  {
    domain: "api_spec_migration",
    text: "Twitter Ads API v99에서 promoted-only campaign objective를 GraphQL subscription으로 바꾸는 공식 migration artifact가 있나?",
    mustNotHallucinate: ["invented Twitter Ads v99", "fake GraphQL subscription", "official artifact exists"],
  },
  {
    domain: "onchain_fee_measurement",
    text: "Sui Move object storage rebate와 Aptos gas schedule을 같은 RPC로 비교한 ProofWeave fee artifact가 있나?",
    mustNotHallucinate: ["same RPC", "Solana answer", "Ethereum EIP-1559 answer"],
  },
  {
    domain: "market_timeseries",
    text: "NYSE options full-depth order book millisecond feed를 무료 public API로 재현한 dataset이 있나?",
    mustNotHallucinate: ["free official full-depth feed", "Kraken OHLC answer", "CoinGecko has options book"],
  },
  {
    domain: "regulatory_comparison",
    text: "Brazil crypto tax invoice와 South Korea VASP Travel Rule을 같은 2026 statute table로 합친 artifact가 있나?",
    mustNotHallucinate: ["single statute table exists", "EU TFR answer", "FinCEN only"],
  },
  {
    domain: "security_deployment",
    text: "Sui Move package upgrade 전 object version 충돌을 피하는 보안 배포 체크리스트가 이 fixture에 있나?",
    mustNotHallucinate: ["OpenZeppelin UUPS as Sui Move", "Foundry solves Move", "Slither supports Move package upgrades"],
  },
  {
    domain: "agent_workflow",
    text: "Figma-to-CAD mechanical part generation agent skill과 STEP file validator dataset이 있나?",
    mustNotHallucinate: ["browser-to-api answer", "OpenAI evals answer", "Claude skill covers CAD"],
  },
];

function relSource(slug) {
  return `v2-full/source-bundles/${slug}.md`;
}

function relArtifact(slug) {
  return `v2-full/artifacts/${slug}.md`;
}

function sourceMarkdown(topic) {
  const sourceLines = topic.sourceUrls.map((url) => `- ${url}`).join("\n");
  const signals = topic.rawSignals.map((line, index) => `${index + 1}. ${line}`).join("\n");
  const cautionLines = sharedCautions.map((line) => `- ${line}`).join("\n");
  const extractionTable = topic.rawSignals
    .map((line, index) => `| S${index + 1} | ${topic.domain} | ${line.replaceAll("|", "/")} | keep |`)
    .join("\n");

  return `# Raw Source Bundle: ${topic.title}

Acquisition status: curated public-source notes for repeatable benchmark use.
Domain: ${topic.domain}
Problem type: ${topic.problemType}
Listing id: ${topic.attestationId}
Last refreshed for fixture: ${topic.createdAt}

## Source URLs

${sourceLines}

## Extraction Notes

${signals}

## Benchmark Cautions

${cautionLines}

## Raw Evidence Matrix

| id | domain | evidence signal | fixture treatment |
|---|---|---|---|
${extractionTable}

## Long Context Block

This raw bundle intentionally keeps explanatory context, source provenance, negative
controls, and operational caveats together. The corresponding ProofWeave artifact
is shorter and should preserve only the reusable decision material. A paired token
benchmark should compare this full bundle against the compressed artifact while
keeping quality checks independent.

The correct answer for this listing should mention: ${topic.keywords.join(", ")}.
It should also preserve domain-specific caveats and avoid converting source notes
into unsupported claims. The raw bundle includes repeated context so the benchmark
has enough input size to expose whether source-bundle workflows become expensive
relative to curated artifacts.

Operational checklist:
- Confirm source URL still resolves before paid live runs.
- Confirm exact provider model id before paid live runs.
- Confirm raw context and artifact context are both fed through the same prompt wrapper.
- Confirm no-match queries are excluded from token-saving success calculations.
- Confirm quality score is reported next to token reduction, not hidden in notes.

Negative control reminders:
- Do not answer with a different domain just because a keyword overlaps.
- Do not treat source-note summaries as legal, financial, or security advice.
- Do not invent source fields that are absent from the source bundle.
- Do not claim provider billing savings from local tokenizer counts alone.

## Artifact Compression Target

The artifact should keep the following reusable facts:
${topic.artifactBullets.map((line) => `- ${line}`).join("\n")}
`;
}

function artifactMarkdown(topic) {
  return `# ${topic.title}

Listing id: ${topic.attestationId}
Domain: ${topic.domain}
Kind: ${topic.kind}

## Use When

Use this artifact when the query asks for ${topic.problemType} in the ${topic.domain}
domain and the expected answer needs concrete reusable checklist items rather than
the full raw source bundle.

## Compressed Guidance

${topic.artifactBullets.map((line) => `- ${line}`).join("\n")}

## Quality Guardrails

- Required terms for benchmark queries are intentionally present in this artifact.
- If a query asks for a different chain, regulator, exchange, API family, or agent
  workflow, return no match rather than stretching this artifact.
- Treat source URLs as provenance; verify live source status before paid API runs.
`;
}

function ensureDirs() {
  mkdirSync(SOURCE_ROOT, { recursive: true });
  mkdirSync(ARTIFACT_ROOT, { recursive: true });
}

function listingRecord(topic) {
  return {
    attestationId: topic.attestationId,
    kind: topic.kind,
    title: topic.title,
    domain: topic.domain,
    problemType: topic.problemType,
    sourceBundle: [relSource(topic.slug)],
    artifactPath: relArtifact(topic.slug),
    createdAt: topic.createdAt,
    priceUsdMicros: topic.priceUsdMicros,
    freshnessWindowDays: topic.freshnessWindowDays,
    sourceUrls: topic.sourceUrls,
    licenseNote: "Curated benchmark notes derived from public documentation URLs; not a verbatim mirror.",
    tags: topic.tags,
    keywords: topic.keywords,
    synopsis: topic.artifactBullets.slice(0, 2).join(" "),
  };
}

function buildTopK(topic, queryNumber, listings) {
  const sameDomain = listings
    .filter((listing) => listing.domain === topic.domain && listing.attestationId !== topic.attestationId)
    .map((listing) => listing.attestationId);
  const crossDomain = listings
    .filter((listing) => listing.domain !== topic.domain)
    .map((listing) => listing.attestationId);
  const decoys = [...sameDomain, ...crossDomain];

  if (queryNumber % 13 === 0) {
    return decoys.slice(0, 5);
  }
  if (queryNumber % 11 === 0) {
    return [decoys[0], decoys[1], topic.attestationId, decoys[2], decoys[3]].filter(Boolean).slice(0, 5);
  }
  if (queryNumber % 7 === 0) {
    return [decoys[0], topic.attestationId, decoys[1], decoys[2], decoys[3]].filter(Boolean).slice(0, 5);
  }
  return [topic.attestationId, ...decoys].filter(Boolean).slice(0, 5);
}

function buildFixture() {
  const listings = topics.map(listingRecord);
  const queries = [];
  const retrievalJudgments = [];
  const retrievedTopK = [];
  let queryNumber = 0;

  for (const topic of topics) {
    for (const query of topic.queries) {
      queryNumber += 1;
      const queryId = `bq_full_${String(queryNumber).padStart(3, "0")}`;
      queries.push({
        queryId,
        domain: topic.domain,
        userQuery: query.text,
        expectedListingIds: [topic.attestationId],
        expectedListingKinds: [topic.kind],
        qualityRubric: {
          mustInclude: query.mustInclude,
          mustNotHallucinate: query.mustNotHallucinate,
          passThreshold: 0.75,
        },
      });
      retrievalJudgments.push({
        queryId,
        relevantListingIds: [topic.attestationId],
        noMatchExpected: false,
      });
      retrievedTopK.push({
        queryId,
        source: "fixture",
        listingIds: buildTopK(topic, queryNumber, listings),
      });
    }
  }

  for (const noMatch of noMatchQueries) {
    queryNumber += 1;
    const queryId = `bq_full_${String(queryNumber).padStart(3, "0")}`;
    queries.push({
      queryId,
      domain: noMatch.domain,
      userQuery: noMatch.text,
      expectedListingIds: [],
      expectedListingKinds: [],
      noMatchExpected: true,
      qualityRubric: {
        mustInclude: [],
        mustNotHallucinate: noMatch.mustNotHallucinate,
        passThreshold: 1,
      },
    });
    retrievalJudgments.push({
      queryId,
      relevantListingIds: [],
      noMatchExpected: true,
    });
    retrievedTopK.push({
      queryId,
      source: "fixture",
      listingIds: [],
    });
  }

  return {
    schemaVersion: "proofweave.token-efficiency.benchmark.v2.full",
    description:
      "Larger offline fixture with 6 domains, 18 listings, 42 queries, quality rubrics, retrieval judgments, and curated public-source provenance.",
    scenarioConfig: {
      defaultTopK: 5,
      offlineOnly: true,
      providerUsageMode: "future_live_mode_extension_only",
    },
    modelConfig: MODEL_CONFIG,
    datasetConfig: {
      domains: [...new Set(topics.map((topic) => topic.domain))],
      matchedQueries: topics.length * 2,
      noMatchQueries: noMatchQueries.length,
      listings: topics.length,
      sourcePolicy:
        "Curated notes from public official documentation and dataset-platform candidates; source URLs are stored per listing.",
      generatedAt: "2026-05-29T00:00:00+09:00",
    },
    queries,
    listings,
    retrievalJudgments,
    retrievedTopK,
  };
}

function main() {
  ensureDirs();
  for (const topic of topics) {
    writeFileSync(join(SOURCE_ROOT, `${topic.slug}.md`), sourceMarkdown(topic), "utf8");
    writeFileSync(join(ARTIFACT_ROOT, `${topic.slug}.md`), artifactMarkdown(topic), "utf8");
  }

  const fixture = buildFixture();
  writeFileSync(
    join(FIXTURES, "benchmark-v2.full.json"),
    `${JSON.stringify(fixture, null, 2)}\n`,
    "utf8",
  );

  console.log(
    `generated benchmark-v2.full.json with ${fixture.queries.length} queries and ${fixture.listings.length} listings`,
  );
}

main();
