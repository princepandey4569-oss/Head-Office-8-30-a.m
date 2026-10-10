# CYPHER Challenge 04 — Implementation and Validation

## One-line decision

**FreshBasket AI decides which franchise stores deserve attention first, why the available signals point to a likely operational problem, and which next action is most defensible for a manager to review.** It does not autonomously execute business operations.

## Requirement-to-implementation map

| Challenge requirement | Implementation | Evidence to show in the demo |
|---|---|---|
| Head Office view ranked by urgency | `data_analyzer.py` calculates a risk score from inventory, wastage, supplier, compliance, staffing, sales, gross margin, customer and expiry signals. The report stores a stable `urgency_rank`. | Overview priority queue and risk-distribution chart. |
| Read all relevant business records | The data pipeline joins stores, products, dated sales, inventory, wastage, purchase orders, customer activity/feedback, staff and compliance. | Open Risk Analytics and then inspect an individual store. |
| Detect at least three different issue types | Explicit issue flags cover inventory shortages, wastage, supplier delays, compliance, staffing, sales/basket movement, gross-margin pressure, customer activity/complaints and expiry exposure. | Problem-signal counts and a store's “Why this store is flagged” section. |
| Explain linked causes rather than listing KPIs | `signal_links_json` includes evidence, an interpretation, strength and caveat. The Store 17 case connects stock shortages, delayed inbound lines, conversion loss, rising feedback and excess fresh stock. | Open Store 17 and read “How the signals connect”. |
| Explain sales versus footfall | The analyzer compares changes in sales, transactions, footfall and average bill value across two snapshots. | Store 17 shows sales down about 18%, visits down about 5% and transactions down about 15%. |
| Identify fast movers that may run out | SKU-level daily movement is compared to stock and reorder levels; the report estimates stock cover, order gaps and suggested replenishment. | “Fast-moving items below reorder” table, including open PO quantity and action timing. |
| Identify stock likely to expire | Perishable stock cover is compared with SKU shelf life. | “Perishables with excess stock cover” in the store brief. |
| Explain rising fresh-food waste | Wastage is calculated separately for high-/medium-perishability or fresh-category SKUs, so a rise is not concealed by packaged-product totals. | Store 17 fresh-food wastage trend and excess-cover evidence. |
| Recommend what to order, how much and when | Replenishment suggestions use a target stock/cover, the reorder gap and non-delivered purchase order quantities; transfer candidates are evaluated first when peer stores have surplus. | Inspect proposed unit amounts and “Immediate shelf / transfer check” or other action timing labels. |
| Consider supplier issues | Overdue/delayed POs are joined to shortage SKUs where possible. | Store 17 shows two delayed PO lines aimed at low-stock fast movers. |
| Compare practical actions | The decision packet returns up to three options with a fit score, evidence-backed expected impact, rationale and trade-off. Options can include inter-store transfer, supplier recovery, wastage/markdown, compliance, staffing or commercial investigation. | “Compare response options” in a store detail drawer. |
| Store manager daily to-do list | Tasks are generated from recommended actions; completion checkmarks persist in local browser storage. | Daily Tasks page; open a task's supporting store brief. |
| Human approval before action | The Approvals page accepts only actions listed for the selected store. Decisions and manager notes are stored by the API; approved actions are explicitly marked simulated. | Load a recommended action, record approve/reject, and show decision history. |
| No live supplier / POS / ERP operation | Actions are logged as simulated; no real supplier order, markdown or external system is changed. | Demo notice on the action-approval screen and API response. |
| Working prototype and refresh behavior | `POST /api/demo/refresh` regenerates synthetic source records in a staging directory, reruns the pipeline, and refreshes the view; ordinary browser refresh retains the active batch. | Click the workspace refresh control and confirm last-updated time. |

## Curated Store 17 challenge case

The data injector changes source records, not the risk label. A deterministic seed allows repeatable tests, while the toolbar's fresh seed gives a different synthetic demo batch on refresh.

For the tested seed used by `tests/test_challenge_four.py`, the current analysis is expected to show approximately:

- Sales down **18%** versus the earlier snapshot.
- Footfall down **5%**, while transactions are down **15%**.
- Fresh-food wastage up approximately **28%**.
- **12** high-velocity fresh SKUs below reorder levels.
- At least **2** delayed/overdue purchase orders referring to those short fast movers.
- A second group of slower perishable SKUs with stock cover beyond shelf life, to prevent the agent from recommending “order more of everything”.
- Rising customer complaints, with a synthetic theme split emphasizing shelf availability and also exposing fresh-quality/service feedback.
- Peer-store candidates with surplus stock where available, plus transfer, supplier recovery and waste-reduction options to compare.

The values can move slightly with a new synthetic seed; the analysis rules re-evaluate the generated records rather than preserve a hard-coded score. The store is expected to rank Critical because the combination of stock gaps, delayed supply, fresh waste and commercial weakness is a high-impact pattern.

## Additional scenarios

- Stores 8 and the 90–139 cohort expose rising fresh-food wastage / excess perishable cover.
- Store 12 and the 270–284 cohort expose compliance exceptions.
- Store 21 and the 285–299 cohort expose staffing and transaction problems.
- Store 44 exposes an average-basket drop.
- Stores 45–49 expose discount-driven gross-margin pressure, using explicitly synthetic `unit_cost` values.
- Stores 50–89 expose overlapping stock gaps, delayed supply, weak conversion, complaints and thin staffing.

These are source-signal scenarios. The analyzer infers score and issue labels from records; the injector does not set risk scores or priority categories directly.

## Transparency and limitations

- The data is synthetic and should be described as demo data, not actual FreshBasket information.
- Risk scores and narrative links are rule-based diagnostic leads, not a trained ML forecast or proof of causation.
- Complaint categories are additional synthetic fields used to demonstrate how customer feedback can be joined with operational signals; they are not present in every real source system.
- `unit_cost` is a synthetic extension used to demonstrate margin-pressure detection. The displayed margin metrics are not finance-validated values and should not be used to make real pricing decisions.
- Inventory quantities, stock cover and suggested transfers/replenishment are suggestions for manager review. Donor reserve, current shelf reality, pack sizes, actual delivery ETA and expiry-date-level records would need validation in a production setting.
- The demo login is a presentation gate, not production authentication.

## Automated verification

Run from the project root:

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest
```

The challenge-specific test runs the source data generator, scenario injector and analysis engine in a temporary folder, verifies the Store 17 cross-signal pattern, and checks that the margin-pressure scenario, structured links, action comparisons and transfer candidates are present.

## Manager identity and workspace menu update

The sign-in screen now asks for a manager name before the email and password fields. The submitted name is trimmed, validated, and stored in browser local storage for this demo. The Head Office greeting, sidebar identity, and avatar initials use the entered name rather than a hard-coded "Kavitha" label. The manager can update the name later from **My profile**.

The top-right avatar opens a menu with **My profile**, **Workspace preferences**, **Help & support**, and **Sign out**. Workspace preferences exposes the persistent day/dark theme and current API connection status; Help & support explains the dashboard's main workflow and its synthetic-data/demo limitations. The menu closes on outside click or Escape.

Validation for this package: `python -m pytest -q` passes all 24 tests; JSX parsing reports zero syntax diagnostics; CSS parsing reports zero syntax errors; Python source compiles; and `ARCHITECTURE.svg` parses as valid XML. A Vite production build could not be verified here because npm could not resolve `registry.npmjs.org` (`EAI_AGAIN`) while installing dependencies. On Windows, run `npm install` and then `npm run build` inside `frontend` after network access is available.


## Added operations features

- **Decision Centre:** summarizes the highest-urgency store cases and exposes connected signals, alternatives and the manager approval flow.
- **What-if decision simulator:** `POST /api/decision/simulate` calculates transfer, replenishment, markdown and wait scenarios. Responses include assumptions and `persistent_change: false`; the endpoint never writes inventory, sales or pricing data. The Decision Centre can keep up to four calculation results side by side, including a no-op baseline, and load a chosen analyzer recommendation into the approval workflow with simulation context in the manager note.
- **Stock Balancing:** `GET /api/stock-balancing` combines same-SKU donor/recipient candidates, ranks them by recipient urgency and caps suggested quantities per donor/SKU across the displayed list. Physical shelf quantity and donor demand still require confirmation.
- **Waste & Expiry:** `GET /api/waste-expiry` groups stores with unusual waste or perishable stock-cover exposure, including synthetic estimates of wastage value.
- **Store Performance:** exposes current/previous snapshot movement across sales, footfall, transactions, average bill value, complaint themes and synthetic margin pressure.
- **Scenario Lab:** provides review paths for Stores 17, 08, 12, 21, 33 and 44, with their evidence drawn from the current report rather than hard-coded display metrics.
- **Visual refinements:** theme-aware surfaces and controls, responsive layouts for new views, accessible labels, focused hover states and reusable spacing/typography. Light/day and dark mode stay available.

## Additional automated checks

The API suite now also checks that stock-balancing candidates expose a donor-surplus cap, waste/expiry findings explain the synthetic cost basis, transfer simulation respects available surplus without changing the report, markdown output labels its uplift assumption, and action history records the manager identity. Run `python -m pytest` from the project root to repeat these checks.


## Public main page navigation

The sign-in screen includes a **Go to main page** control. It opens a public product overview with a workspace preview, capabilities, the explainable decision workflow and Challenge 04 context. The public page has sign-in calls to action back to the demo credentials form. The sidebar brand in the signed-in workspace returns to the dashboard overview. Theme preference is shared and persists in browser local storage.


## Day mode review

Added a scoped day-mode refinement to improve text contrast, table legibility, card boundaries, form controls, overlays, and readability across the decision centre, what-if simulator, stock balancing, waste/expiry, scenario lab, and action comparison surfaces. The dark theme rules remain scoped to `.theme-dark`. CSS parsing reported zero syntax errors.


## Designation-based work distribution

- **Head of Franchise Operations — Critical:** network-wide incident owner and final decision-maker for Critical cases.
- **Regional Operations Manager — High:** owns High-priority cases within the selected synthetic region and escalates Critical cases upward.
- **Area Operations Manager — Medium:** owns Medium-priority cases inside the selected region + area.
- **Store Manager — Low:** owns Low-priority cases at the assigned store; higher-risk cases create local execution tasks while preserving the designated upstream owner.
- **Shift Supervisor — Routine:** receives shelf, date-code, service observation and handover checks at the assigned store and cannot approve business actions.

The sign-in form collects a name and designation, plus region/area or store scope when needed. The task queue, navigation visibility, dashboard data, and approval options are scoped to that designation. The API checks that an approving role matches the priority owner and validates its region/area/store scope. The login is still a shared demo credential that simulates role selection; it must not be described as secure authentication. See [`WORKFORCE_DELEGATION.md`](WORKFORCE_DELEGATION.md) for detailed routing rules and demo instructions.
