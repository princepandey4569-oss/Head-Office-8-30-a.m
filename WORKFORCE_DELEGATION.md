# FreshBasket AI — Designation-Based Work Distribution

## Purpose

A single Head of Franchise Operations should not have to personally work every exception across 1,000 stores. FreshBasket AI groups work by assessed priority, gives each case one accountable owner, and delegates local verification to store teams without silently transferring case ownership.

## Responsibility ladder

| Level | Role | Primary ownership | Geography / scope | Typical urgency |
|---|---|---|---|---|
| 1 | Head of Franchise Operations | Critical cases and network-wide prioritisation | All stores | Immediate |
| 2 | Regional Operations Manager | High-priority cases | Assigned operating region | Today |
| 3 | Area Operations Manager | Medium-priority cases | Assigned operating area inside a region | Today |
| 4 | Store Manager | Low-priority cases and local remediation | One assigned store | This shift |
| 5 | Shift Supervisor | Shelf checks, date-code rotation, physical verification, service observations and shift handover | One assigned store / shift | This shift |

## Routing rules

- Critical cases remain owned by the Head of Franchise Operations.
- High-priority cases route to the Regional Operations Manager responsible for that region.
- Medium-priority cases route to the Area Operations Manager responsible for that area.
- Low-priority cases route to the Store Manager assigned to that store.
- Shift Supervisors receive operational checks and verification tasks. They do not approve business actions.
- For an escalated case, Store Managers and Shift Supervisors can perform local evidence-gathering or remediation tasks, but the case's primary owner remains at its designated tier.
- The owner of an approval must match the risk tier. Area and Regional managers must also match the case's geographic assignment; Store Managers can approve Low cases only for their assigned store.

## Demo geography

The synthetic data groups locations into four regions:

- **Karnataka South:** Bengaluru and Mysuru
- **Karnataka North:** Hubballi
- **Karnataka Coast:** Mangaluru
- **Tamil Nadu:** Chennai

Each store receives a synthetic area assignment, such as Bengaluru North, Mysuru Central or Chennai South. Areas are derived demo labels—not real franchise territories.

## How to demonstrate it

1. Sign in as **Head of Franchise Operations**. Open **Team workload** to view the network distribution by risk tier.
2. Sign out and choose **Regional Operations Manager**. Select a region. The task queue contains High-priority cases in that region; Critical cases remain escalated to Head Office.
3. Sign out and choose **Area Operations Manager**. Select a region and an area. The task queue contains Medium-priority cases in that area.
4. Sign out and choose **Store Manager**, select a store ID such as `Store_0017`, and inspect local tasks. If that store has a Critical/High/Medium case, local tasks are shown with the designated escalation owner; the Store Manager cannot approve that higher-risk case.
5. Sign out and choose **Shift Supervisor** for the same store. The queue contains routine checks plus issue-verification tasks. Approval controls are unavailable to this role.
6. Attempt to approve a case from the wrong designation or outside the assigned scope. The API should reject the action.

## Important prototype limitation

All supplied business data is synthetic. The login form uses one shared demo account and lets a presenter select a designation to preview that role's experience. This demonstrates role-based routing and UI behaviour; it is **not secure identity authentication**. In production, each employee would sign in with an authenticated individual account, and the server—not client-supplied role fields—would determine their role, region, area and store permissions.

Case scoring and owner routing use explicit priority rules. The current region/area assignments are synthetic and must be mapped to the organisation's real reporting lines before operational use. All action approvals remain simulated; no external system is changed.
