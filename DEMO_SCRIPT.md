# FreshBasket AI — 3-minute demo script (replacement dataset)

## 0:00–0:20 — Sign in and frame the problem

Use the demo credentials shown on the sign-in page. Explain that the workspace ranks 25 Bengaluru-area franchise stores using the supplied operational records. The data is a challenge dataset and should not be described as live production data.

## 0:20–0:45 — Show the network picture

Point to the current store count, priority distribution, risk queue and problem-signal summaries. The current analyzer run reports 25 stores: 5 High and 20 Medium. Risk scores are rule-based signals for investigation, not a trained forecast.

## 0:45–1:20 — Investigate FB-17

Open FB-17 (Marathahalli). The current report shows sales down about 16.6%, average bill value down about 20%, 12 products below reorder level and delayed supplier lines. Discuss checking the low-stock fast movers and confirming the purchase-order ETAs before preparing a duplicate replenishment proposal. Do not claim that fresh wastage is rising at this store; the current report shows its wastage trend moving down.

## 1:20–1:55 — Compare options

Use the Decision Centre and what-if simulator to compare a transfer, replenishment and wait. Point out that transfer quantities are capped by estimated donor surplus. The simulator is non-persistent; it does not alter inventory or place orders.

## 1:55–2:20 — Show different problems

- FB-13: sharp increase in fresh-food wastage; inspect reasons and perishable cover.
- FB-21: compliance checklist 58/100 and five open issues; assign corrective work and follow-up.
- FB-12: low staffing attendance/productivity with sales pressure; review shift coverage.
- FB-02: wastage and perishable stock-cover exposure; inspect date codes and consider targeted stock rotation.
- FB-24: sales and average bill decline; investigate basket mix and availability before broad discounting.

## 2:20–2:45 — Record the human decision

Open Action Approvals from a store brief, review a listed recommendation, add a note, and approve or reject it. The decision is recorded as simulated; no external business operation is executed.

## 2:45–3:00 — Refresh and close

Click **Re-analyze dataset**. Explain that this reruns analysis on the currently installed CSVs without regenerating or overwriting them. Close with: “FreshBasket observes operational signals, links evidence, compares options and leaves the final decision with a manager.”

## Important data limitations

- The supplied bundle identifies a stock snapshot dated 2026-11-16 and history through 2026-11-15. These timestamps are preserved as supplied, not represented as live current operations.
- The dataset does not include unit costs or complaint counts, so margin and complaint metrics are unavailable rather than inferred.
- Scores and explanations are rule-based decision support, not proof of causation.
- The demo login is a presentation gate, not production authentication.
