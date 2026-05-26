# FATF Travel Rule Country Comparison (raw snapshot 2026-04-25)

> Raw evidence pack. Aggregates FATF Recommendation 16 guidance issued
> 2025-10, the implementation matrices published by Korea (FIU), Japan
> (JFSA), Singapore (MAS), the United States (FinCEN), and the European
> Union (TFR / MiCA II) as of 2026-04-25.

## 1. Threshold values

| Jurisdiction | VASP-to-VASP threshold | Cross-border threshold | Originator/beneficiary identifiers |
|---|---|---|---|
| FATF guidance | USD/EUR 1,000 | USD/EUR 1,000 | Name + account/wallet + address or DoB or national id |
| South Korea (FIU) | KRW 1,000,000 (~ USD 700) | KRW 1,000,000 | Name + wallet + RRN-derived ID + DoB |
| Japan (JFSA) | JPY 100,000 (~ USD 650) | JPY 100,000 | Name + wallet + DoB + residential address |
| Singapore (MAS) | SGD 1,500 | SGD 1,500 | Name + wallet + NRIC/FIN or passport |
| United States (FinCEN) | USD 3,000 (proposed USD 250) | USD 3,000 (proposed USD 250) | Name + wallet + physical address |
| EU TFR / MiCA II | EUR 1,000 (any amount for self-hosted wallets) | EUR 1,000 | Name + wallet + address + LEI when corporate |

The FinCEN USD 250 threshold proposal is in NPRM 2025-22107 and is not yet
final. Until finalization, USD 3,000 still applies.

## 2. Self-hosted wallet rules

- EU TFR: any-amount disclosure when counterparty is a self-hosted wallet,
  with sender verification by the VASP for transfers above EUR 1,000.
- South Korea: VASP must verify the beneficiary self-hosted wallet via
  satoshi test or signed-message proof when the transfer is above
  KRW 1,000,000.
- Japan: VASP must collect a written statement of self-hosted ownership;
  no on-chain proof required.
- Singapore: VASP must collect a self-declaration plus risk score; on-chain
  proof recommended but not mandatory.
- United States: no specific self-hosted requirement under the current
  threshold; the NPRM would add one.

## 3. Sunrise problem and interoperability

- Travel Rule data must be exchanged regardless of whether the counterparty
  VASP supports the same protocol. Korea and Japan have explicitly stated
  that protocol asymmetry is not an excuse to skip the transfer notice.
- Protocols in use:
  - TRP (TRP Alliance) — REST-based, used by Coinbase, Kraken.
  - OpenVASP — message-bus, used by some EU VASPs.
  - Sygna Bridge — proprietary, common in Asia.
  - Notabene — SaaS, popular among newer VASPs.
- Korea-licensed VASPs are required to support at least two of the above
  protocols to avoid sunrise gaps. Source: FIU guidance Annex 3.

## 4. Privacy and PII handling

- Originator and beneficiary PII must be transmitted encrypted in transit.
- EU GDPR overlays Travel Rule data with a strict purpose-limitation rule:
  data may not be used for marketing or analytics.
- South Korea requires the VASP to retain Travel Rule records for 5 years,
  Japan 7 years, Singapore 5 years, United States 5 years, EU 5 years
  (TFR explicit).
- The FIU has issued a binding interpretation that storing Travel Rule
  records on a public blockchain violates the PIPA personal data act, even
  if the data is encrypted.

## 5. Penalties

- South Korea: up to KRW 100 million administrative fine per violation,
  plus license suspension after 3 violations in a calendar year.
- Japan: up to JPY 3 million per violation plus public censure.
- Singapore: up to SGD 1 million per violation.
- United States: civil money penalty up to USD 250,000 per violation.
- EU TFR: up to 5% of annual turnover, set by national authorities.

## 6. Cross-border interactions

- A Korean VASP sending to a Japanese VASP must include the full Korean
  identifier set plus DoB even though Japan does not require RRN-derived
  IDs, because the originating jurisdiction's stricter rule applies.
- A US VASP sending to an EU VASP must collect the originator address.
- Singapore VASPs are required to apply the most restrictive of the two
  jurisdictions' rules ("higher of" doctrine, MAS PSP-VASP guideline 8.4).

## 7. Common compliance gaps

- Treating wallet addresses as the sole beneficiary identifier — invalid
  in every jurisdiction listed above.
- Skipping the originator address on US-to-EU transfers.
- Using a single Travel Rule protocol when local rules require at least
  two (Korea).
- Storing PII on public chains, including ciphertext, in Korea.
