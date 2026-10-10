# FreshBasket AI — Franchise Operations Intelligence


## Hosting for hackathon submission

This repository now includes `Dockerfile`, `render.yaml`, and `DEPLOY_ON_RENDER.md` for deploying the complete React + FastAPI app as one Render service. Follow [`DEPLOY_ON_RENDER.md`](DEPLOY_ON_RENDER.md); a custom domain is not required because Render provides an `onrender.com` address.

FreshBasket AI is a self-contained demonstration workspace for franchise operations. It combines store sales, inventory, wastage, supplier, customer, staffing and compliance signals into a ranked morning brief, store-level explanations and manager-reviewed simulated actions.

The React interface is driven by the FastAPI report rather than hard-coded dashboard cards. It includes a public main page and a redesigned, responsive sign-in experience: a focused manager form, high-contrast blue/cyan styling with restrained orange accents, a branded access header, clearer labels, visible demo credentials, and separately tuned light and dark surfaces. The sign-in screen also includes a visible “Go to main page” option. The login and landing page preserve the same light/day and dark theme preference. The workspace also includes a manager-name field on sign-in, a personalized morning greeting, a profile menu with My profile / Workspace preferences / Help & support / Sign out, a persistent light/day and dark theme switch, a working SVG risk distribution chart, a problem-signal view, store search and filters, store-level evidence, browser-saved daily task checkmarks, and a server-recorded action-decision history. The toolbar refresh re-analyzes the currently installed franchise dataset and reloads the report. It does not replace or regenerate the source CSVs. Browser reloads keep the current report.

## What the project does

- **Public main page:** an introductory homepage with a workspace preview, capability cards, the agent workflow, challenge details and a direct sign-in route. The login page has a “Go to main page” control; the workspace logo returns to the dashboard overview.
- **Overview:** current network totals, assessed priority counts, average risk, detected signal counts and highest-urgency stores.
- **Store operations:** searchable and filterable 25-store directory for the supplied franchise dataset with risk score and an inspection drawer.
- **Risk analytics:** risk-band distribution, problem-category counts, gross-margin pressure, customer complaint patterns and stores with large commercial declines.
- **Morning decision brief:** an Observe → Connect → Compare → Recommend → Manager approval flow that opens the most urgent stores with linked signals, comparison options and action evidence.
- **Decision Centre:** three priority interventions with linked evidence, ranked response options, and an embedded what-if simulator for transfer, replenishment, markdown or wait-and-monitor.
- **What-if simulator:** compares illustrative stock cover, target-stock gaps, donor-surplus caps, indicative costs and markdown sell-through without changing source data. Save up to four runs side by side (including a wait baseline), then queue a selected analyzer recommendation for manager review with the comparison context in its note.
- **Stock Balancing:** network-level same-SKU donor/recipient proposals prioritised by recipient urgency; proposed quantities are capped across the displayed list so one donor SKU is not over-allocated in the suggestion table.
- **Waste & Expiry:** identifies stores with rising wastage and/or catalog-shelf-life stock-cover exposure, with clearly marked synthetic-cost estimates and product-level evidence.
- **Store Performance:** compares sales, transactions, footfall, average bill value, complaints and synthetic gross-margin movement; users can open each affected store to inspect its evidence.
- **Scenario Lab:** repeatable review path for current dataset cases (FB-17, FB-13, FB-21, FB-12, FB-02 and FB-24); refresh re-analyzes the same source data.
- **Store-level risk explanation:** weighted contributions by inventory, wastage, suppliers, compliance, staffing, sales, margin, customers and expiry, with any minimum-risk escalation floor shown separately.
- **Actionable fresh-stock evidence:** the high-velocity short items, days of cover, reorder gap, open PO quantity, suggested replenishment, shelf-life exposure and potential donor-store transfer candidates.
- **Feedback themes:** synthetic counts for shelf availability, fresh-food quality and service/checkout so customer complaints can be examined alongside stock, waste and transaction movement.
- **Daily tasks:** recommendations linked to store findings; completion checkmarks persist in this browser.
- **Action approvals:** approve or reject an analyzer-recommended action, add a note and retain a decision record in `data/approved_actions.csv`.
- **Theme preference:** switch between light/day mode and dark mode from the login screen or workspace toolbar. Your choice is saved in this browser and remains after a page refresh.
- **Demo login:** presentation gate with a manager-name field and the demo credentials below. The manager name is stored in this browser and used in the morning brief and profile area.
- **Manager menu:** open the avatar at the top-right to access My profile, Workspace preferences, Help & support, and Sign out. The sidebar profile also opens the profile editor.
- **Data pipeline:** reproducible synthetic data, repeatable injected problem scenarios, rule-based risk analysis and a CSV report consumed by the API.

The public main page is an explanatory product page, while the operations dashboard remains behind the demo sign-in gate. This keeps the “Go to main page” destination meaningful without exposing the decision workspace before sign-in.

The project deliberately avoids charting-library dependencies. The donut and bars are rendered with SVG/CSS, which keeps the risk chart self-contained and prevents a missing chart package from silently leaving a blank panel.

## Page navigation and loading behavior

The workspace uses browser History API navigation so the in-app **Back** and **Next** controls work alongside the browser Back/Forward buttons. The selected public screen or workspace page is encoded in the page URL, and the current route history is retained for the open browser tab. Reloading the page returns to the current page when the demo session is still active.

Refreshing dashboard data does not navigate away from the current page or clear the existing report while requests are pending. Newly returned API data updates the dashboard state; if the API is unavailable, the current page remains visible with a retry message. The refresh action re-analyzes the currently installed source data; it does not regenerate or overwrite source rows. Ordinary page navigation and a normal browser reload do not regenerate the dataset.

## Typography readability

Routine interface text has been enlarged for readability across light and dark themes. See `FONT_READABILITY_UPDATE.md` for details.

## Requirements

- Python 3.10 or newer (Python 3.11+ recommended)
- Node.js 18 or newer, with npm
- Internet connection for first-time Python and frontend package installation

## Run on Windows

1. Extract the complete folder to a normal local directory.
2. Double-click `Run_FreshBasket_AI.bat`.
3. On first run, it creates `.venv`, installs Python dependencies, builds the synthetic report if it is missing or uses an older report schema, and installs frontend packages.
4. Keep both terminal windows open.
5. Open `http://localhost:5173` if the browser does not open automatically.

The API documentation is available at `http://127.0.0.1:8000/docs`.

For the challenge review, see [`ARCHITECTURE.svg`](ARCHITECTURE.svg), the timed [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md), and [`CHALLENGE_04_VALIDATION.md`](CHALLENGE_04_VALIDATION.md). The Python suite has 24 passing tests, including designation-based workload routing and scoped approval checks. A production Vite build has not been confirmed in this environment because npm registry DNS resolution failed; after dependencies install locally, run `npm run build` from `frontend`.

### Key API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Backend and report health plus last refresh time |
| `GET` | `/api/dashboard` | Network totals, assessed risk mix and average score |
| `GET` | `/api/agent/morning-brief` | Ranked intervention decisions with linked evidence and options |
| `GET` | `/api/problem-summary` | Number of stores affected by each issue type |
| `GET` | `/api/stores?order=ranked` | Ranked store directory; supports priority and search filters |
| `GET` | `/api/stores/{store_id}` | Store findings, score components, feedback themes, SKU evidence and action options |
| `GET` | `/api/stores/{store_id}/tasks` | Task list for a store |
| `GET` | `/api/stock-balancing?limit=100` | Ranked, donor-surplus-capped inter-store transfer candidates |
| `GET` | `/api/waste-expiry?limit=250` | Wastage and perishable-cover exception stores |
| `POST` | `/api/decision/simulate` | Non-persistent transfer/replenishment/markdown/wait what-if calculation |
| `POST` | `/api/actions` | Record a manager's approve/reject decision and note |
| `GET` | `/api/actions` | Decision history, including manager identity |
| `POST` | `/api/demo/refresh` | Re-analyze the installed franchise dataset without changing source CSVs |

## Demo login

- **Email:** `ops@freshbasket.demo`
- **Password:** `freshbasket123`

This is a client-side demo gate, not production authentication. Do not use it to protect real business or personal information.

## Manual setup

Run commands from the extracted project directory.

### 1. Install Python dependencies

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

For this replacement franchise dataset, analyze the supplied source records with:

```powershell
python data_analyzer.py
```

**Do not run `data_generator.py` or `inject_problem.py` while using this dataset.** Those legacy scripts create the old `Store_0001` / 1,000-store synthetic schema and would replace the provided `FB-01` through `FB-25` records.

Start the API in the project directory:

```powershell
python -m uvicorn backend:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Start the React frontend

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Tests

From the project root:

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest
```

Tests cover priority thresholds, dashboard counts, filtering/search, problem summaries, task generation, approval persistence and manager identity, action validation, unknown stores, stock-balancing surplus caps, waste/expiry reporting, non-persistent transfer and markdown simulations, and the synthetic refresh endpoint with persisted update timestamps. The dedicated Challenge 04 pipeline test validates the Store 17 scenario using underlying generated source signals, including sales, footfall, transactions, fresh-food wastage, low-stock fast movers, overdue purchase orders and customer feedback; it also checks the margin-pressure cohort and the structured action alternatives.

## Data flow and interpretation

1. The supplied dataset contains 25 stores (`FB-01` to `FB-25`), 42 SKUs and dated sales, customer, staff and wastage records plus inventory, purchase orders and compliance inspections.
2. `data_analyzer.py` adapts the provided column names in memory, selects the latest store-level staff/inspection records, compares dated snapshots, detects operational concerns, computes rule-based risk scores, and writes the structured report to `data/store_risk_report.csv`.
3. `backend.py` exposes the report over the API, serves `/api/agent/morning-brief`, decodes structured evidence for store detail views, calculates stock balancing and waste/expiry views, runs non-persistent what-if comparisons, and records decisions in `data/approved_actions.csv`.
4. The React UI requests these APIs and calculates display-only summaries. The toolbar refresh re-runs the analyzer on the installed source data and updates refresh metadata; it does not overwrite source CSVs or change the store network.

See [`CHALLENGE_04_VALIDATION.md`](CHALLENGE_04_VALIDATION.md) for a point-by-point mapping from the official Challenge 04 requirements to the implementation and verification evidence. [`ARCHITECTURE.svg`](ARCHITECTURE.svg) shows the data and decision flow; [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) gives a timed 3-minute presentation plan.

Risk scores and root-cause narratives are transparent heuristics, not a trained machine-learning prediction or proof of causation. All business data is synthetic. Approving an action records **simulated** execution only; no supplier is contacted, no purchase order is placed and no external business system is changed. Task-completion checkmarks are saved in the browser, while manager decisions are saved by the backend. The what-if simulator never mutates inventory, purchase orders or prices; it reports its assumptions and explicitly labels the result as simulated.

## Troubleshooting

- **Website opens but says API offline:** keep the backend terminal open and confirm `http://127.0.0.1:8000/api/health` opens.
- **Risk report not found:** from the project root, run the three data-pipeline commands in the order above.
- **Frontend dependencies fail to install:** check internet access and your Node.js/npm versions, then run `npm install` from `frontend`.
- **Need a new demo data batch:** click the refresh icon in the top bar. It regenerates synthetic source data with a fresh seed, reapplies the curated operational scenarios, re-runs the risk analysis, and then reloads all dashboard views. This can take a few seconds. A normal browser reload keeps the latest generated dataset; it does not create a new one.


## Day mode visual correction

The day/light theme uses a dedicated high-contrast palette for the operations workspace and Challenge 04 pages. Text, controls, table headers, decision cards, stock-balancing panels, waste/expiry panels, scenario cards, dialogs, and comparison tables use clearer foreground/background separation while the dark theme remains independently styled. A CSS parser check completed with zero syntax errors.

## Visual theme

The interface uses a no-green FreshBasket palette: cobalt/azure blue for navigation and primary actions, tangerine orange for calls to action, violet for AI insights, and berry red/amber for risk states. The light theme uses deep navy text and slate secondary text on cool off-white/white surfaces. The dark theme uses near-white text and light-slate secondary text on midnight/navy-charcoal surfaces. Inputs, menus, tables, status badges and chart legends are themed separately to keep both appearances readable.

See [`COLOR_PALETTE.md`](COLOR_PALETTE.md) for the full palette, text-contrast spot checks, and guidance for extending the theme consistently.


## Designation-based task distribution

FreshBasket includes a demo responsibility ladder so work can be routed across a large franchise network instead of leaving every issue with one person. Critical cases remain with the Head of Franchise Operations; High cases route to the Regional Operations Manager; Medium cases route to the Area Operations Manager; Low cases route to the Store Manager; and Shift Supervisors handle routine checks and local verification. Regional managers are scoped to a synthetic region; Area managers select an area inside that region; Store Managers and Shift Supervisors are scoped to one store. Local execution tasks do not take ownership away from a higher-level case owner.

See [`WORKFORCE_DELEGATION.md`](WORKFORCE_DELEGATION.md) for the mapping, route rules and a role-switch demo plan. The single shared login is a presentation-only role preview, not secure per-employee authentication. Production deployment would require individual sign-in and server-side role/region/area/store permissions.
