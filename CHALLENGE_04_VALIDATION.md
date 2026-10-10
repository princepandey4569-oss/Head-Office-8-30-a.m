# FreshBasket AI — replacement dataset validation

## Dataset and compatibility

The active franchise dataset contains 25 stores (`FB-01` through `FB-25`), 42 SKUs, 54,021 sales rows, 8,926 wastage rows, 1,050 inventory rows, 111 purchase orders, 1,500 customer snapshots, 1,500 staff snapshots and 75 compliance inspections. The analyzer adapts `store` to its internal `store_id` key without rewriting the source CSVs. It chooses the latest staff record and compliance inspection per store before merging, preventing daily/inspection history from duplicating stores.

## Verified analysis result

The current run produced one row per store and 127 report columns, including the structured evidence fields consumed by the API. Current priority distribution: 5 High and 20 Medium. The report is generated from the supplied records; values can change if the source dataset is updated.

Current high-signal cases:

- **FB-17 — Marathahalli:** sales down approximately 16.6%, average bill value down approximately 20%, 12 products below reorder level and delayed supplier lines. Current wastage trend is down, so it should not be described as a rising-wastage case.
- **FB-13 — RT Nagar:** fresh-food wastage increase and perishable-cover exposure.
- **FB-21 — Nagarbhavi:** compliance checklist score 58/100 with five open issues.
- **FB-12 — Vijayanagar:** staffing attendance/productivity concern alongside sales pressure.
- **FB-02 — BTM Layout:** wastage and perishable-cover exposure.
- **FB-24 — Sahakar Nagar:** sales and average bill decline.

## API smoke checks performed

- `GET /api/health` returns 200 with `report_ready: true`.
- `GET /api/dashboard` returns 200 and reports 25 stores.
- `GET /api/stores?order=ranked&limit=3` returns ranked store records.
- `GET /api/problem-summary` returns issue counts.
- `GET /api/agent/morning-brief` returns the current decision brief.
- `GET /api/stock-balancing?limit=5` returns transfer candidates.
- `GET /api/waste-expiry?limit=5` returns waste/expiry cases.
- `GET /api/workforce/overview` returns role-routing information.
- `GET /api/stores/FB-17` returns a store detail record.
- `POST /api/demo/refresh` re-analyzes the current dataset and does not replace source CSVs.
- Python source compilation passed; React JSX parsing reported zero syntax diagnostics.

## Limitations and safeguards

- The bundle's README labels stock data as 2026-11-16 and daily history through 2026-11-15. These are preserved source timestamps, not live data assertions.
- No unit-cost fields are supplied; gross margin cannot be calculated and is marked unavailable.
- No complaint fields are supplied; complaint metrics are marked unavailable rather than treated as measured zeros.
- The dataset is a curated challenge dataset. The risk engine is rule-based and provides investigation leads, not proof of causation or a trained ML forecast.
- Transfers and replenishment are suggestions for manager review. The what-if simulator does not modify source inventory or execute external actions.
- Legacy `data_generator.py` and `inject_problem.py` are not part of the active replacement-data workflow. Running them manually would replace the provided dataset with the older generated schema.
