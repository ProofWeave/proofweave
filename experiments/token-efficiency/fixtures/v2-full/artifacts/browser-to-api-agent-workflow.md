# Browser-to-API Agent Workflow Skill

Listing id: att_agent_browser_to_api_workflow
Domain: agent_workflow
Kind: skill

## Use When

Use this artifact when the query asks for api_discovery in the agent_workflow
domain and the expected answer needs concrete reusable checklist items rather than
the full raw source bundle.

## Compressed Guidance

- Capture browser network requests with method, URL pattern, status code, request body, and response shape.
- Redact tokens, cookies, emails, and personal identifiers before writing artifacts.
- Generate a best-effort OpenAPI document plus a coverage report.
- Mark unobserved endpoints and inferred schemas explicitly.
- Do not claim complete API coverage from a single trace.

## Quality Guardrails

- Required terms for benchmark queries are intentionally present in this artifact.
- If a query asks for a different chain, regulator, exchange, API family, or agent
  workflow, return no match rather than stretching this artifact.
- Treat source URLs as provenance; verify live source status before paid API runs.
