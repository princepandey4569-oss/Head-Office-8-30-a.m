# CYPHER Challenge 04 — 3-minute demo script

**Story:** Kavitha Menon needs to know which stores need attention at 8:30 a.m., why, and what should happen next. Use the curated Store 17 case to demonstrate a decision, not just a dashboard.

## 0:00–0:20 — Sign in and frame the problem

Enter a manager name and use the demo credentials shown on the login screen. Open the Overview page.

Say: “FreshBasket combines sales, inventory, wastage, supplier, customer, staffing and compliance signals into one operations view. This data is synthetic, but the scenarios are deliberately built from the Challenge 04 brief.”

## 0:20–0:45 — Show the network picture

Point to store count, risk distribution, the priority queue and the problem-signal summaries. Click the risk-mix chart or one high-risk store to show that the values come from the current report.

Say: “The priority count is derived from the analyzed store report. It is not a number painted into the page.”

## 0:45–1:20 — Investigate Store 17

Open **Decision Centre**, select Store 17, and inspect its evidence. Call out sales down about 18%, footfall down about 5%, transactions down about 15%, 12 products below reorder level, fresh wastage up about 28%, and at least two delayed purchase-order lines. Read the connected-signal explanation and one alternative action.

Say: “The system does not claim that one signal proves the cause. It explains why low availability and late inbound lines deserve investigation alongside the transaction decline, while also checking excess fresh stock.”

## 1:20–1:55 — Compare options before acting

In the **What-if simulator**, test a transfer, an order and the wait baseline. Use **Add to comparison** after each run. Point to target-stock gaps, stock cover, the donor cap and the illustrative cost, then prepare a manager review from a suitable recommendation.

Say: “A transfer is only suggested up to the feasible proposal quantity. These numbers are estimates; a manager must verify physical stock, donor demand, date codes and actual costs. The simulator does not change inventory.”

## 1:55–2:20 — Show network and fresh-food reasoning

Open **Stock Balancing** to show one same-SKU donor/recipient proposal. Then open **Waste & Expiry** to show rising fresh wastage, stock cover and catalog shelf-life exposure. Optionally use **Store Performance** to show how transactions, footfall, basket value and complaint themes can tell different stories.

## 2:20–2:45 — Record the human decision

Return to **Action Approvals**. Check that the selected store, recommendation and simulation context appear in the form. Add a short manager note, select Approve or Reject, and record it. Point to the new history row and state that approval means simulated execution only.

## 2:45–3:00 — Demonstrate repeatability and close

Open **Scenario Lab** and point out the Store 08, 12, 21, 33 and 44 cases. Finish with:

“FreshBasket follows observe, connect, compare, recommend and manager approval. The analyzer is transparent and rule-based, the source records are synthetic, and no supplier, POS, HR or external system is changed.”

## If a judge asks about limitations

- The provided business data is synthetic and reproducible.
- Risk and root-cause explanations are rule-based investigation leads, not a trained forecasting model or proof of causation.
- Unit costs and markdown response assumptions are illustrative, not finance-approved.
- Physical stock, expiry dates, open purchase-order realities and final actions require manager validation.
- The login is a presentation-only demo gate, not production authentication.


## Extra 30-second workforce delegation demo

After the Store 17 story, sign out and switch the demo designation to **Regional Operations Manager**. Choose **Karnataka South** and show that the queue contains High cases from that region, while Critical cases remain with Head Office. Switch to **Area Operations Manager**, choose a region and area, and show the Medium queue narrowed to that area. Finally select **Shift Supervisor** for a store and point to the shelf/date-code/handover checklist. Explain that the same shared demo credential only simulates different employee views; real deployment would require individual accounts and server-side authorization.
