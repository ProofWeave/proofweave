# DATASET: FATF Travel Rule — Country Comparison (2026-04-25)

Curated comparison table. Source evidence: see linked raw bundle.

## Thresholds and identifiers

| Jurisdiction | Threshold | Originator/beneficiary identifiers |
|---|---|---|
| FATF | USD/EUR 1,000 | name, wallet, address or DoB or national id |
| South Korea | KRW 1,000,000 | name, wallet, RRN-derived id, DoB |
| Japan | JPY 100,000 | name, wallet, DoB, residential address |
| Singapore | SGD 1,500 | name, wallet, NRIC/FIN or passport |
| United States | USD 3,000 (NPRM USD 250) | name, wallet, physical address |
| EU TFR / MiCA II | EUR 1,000 | name, wallet, address, LEI if corporate |

## Self-hosted wallet rules

- EU TFR: any-amount disclosure; sender verification above EUR 1,000.
- Korea: satoshi test or signed-message above KRW 1,000,000.
- Japan: written self-hosted statement.
- Singapore: self-declaration plus risk score.
- US: no specific rule until NPRM 2025-22107 finalizes.

## Retention

- KR 5y, JP 7y, SG 5y, US 5y, EU 5y.

## Penalties

- KR up to KRW 100m, JP up to JPY 3m, SG up to SGD 1m, US up to USD 250k,
  EU up to 5% turnover.

## Gotchas

- Wallet address alone is never a sufficient identifier.
- US to EU: include originator address.
- Korea VASPs must support at least two Travel Rule protocols.
- Storing Travel Rule PII on a public chain violates Korean PIPA even
  if encrypted.
