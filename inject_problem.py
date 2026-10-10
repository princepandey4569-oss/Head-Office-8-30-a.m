"""Inject repeatable scenarios required for the FreshBasket challenge.

Run data_generator.py first. This script only edits the generated demo data and
can be rerun without compounding the injected changes.
"""
from __future__ import annotations

from pathlib import Path
import numpy as np
import pandas as pd

DATA_DIR = Path(__file__).parent / "data"


def latest_dates(frame: pd.DataFrame, column: str = "date") -> tuple[str | None, str | None]:
    if column not in frame.columns:
        return None, None
    dates = sorted(pd.to_datetime(frame[column], errors="coerce").dropna().dt.strftime("%Y-%m-%d").unique())
    return (dates[-1], dates[-2]) if len(dates) >= 2 else ((dates[-1], None) if dates else (None, None))


def require_files() -> None:
    required = [
        "stores.csv", "products.csv", "sales.csv", "inventory.csv", "wastage.csv",
        "purchase_orders.csv", "customers.csv", "staff.csv", "compliance.csv",
    ]
    missing = [name for name in required if not (DATA_DIR / name).exists()]
    if missing:
        raise FileNotFoundError(f"Missing datasets: {', '.join(missing)}. Run data_generator.py first.")


def main() -> None:
    require_files()
    stores = pd.read_csv(DATA_DIR / "stores.csv")
    products = pd.read_csv(DATA_DIR / "products.csv")
    sales = pd.read_csv(DATA_DIR / "sales.csv", parse_dates=["date"])
    inventory = pd.read_csv(DATA_DIR / "inventory.csv")
    wastage = pd.read_csv(DATA_DIR / "wastage.csv", parse_dates=["date"])
    purchase_orders = pd.read_csv(DATA_DIR / "purchase_orders.csv")
    customers = pd.read_csv(DATA_DIR / "customers.csv", parse_dates=["date"])
    staff = pd.read_csv(DATA_DIR / "staff.csv")
    compliance = pd.read_csv(DATA_DIR / "compliance.csv")

    required_ids = ["Store_0017", "Store_0008", "Store_0012", "Store_0021", "Store_0033", "Store_0044"]
    missing_ids = set(required_ids) - set(stores["store_id"].astype(str))
    if missing_ids:
        raise ValueError(f"Expected demo stores are missing: {', '.join(sorted(missing_ids))}")

    sales_current_date, sales_previous_date = latest_dates(sales)
    waste_current_date, waste_previous_date = latest_dates(wastage)
    customer_current_date, customer_previous_date = latest_dates(customers)

    if not all([sales_current_date, sales_previous_date, waste_current_date, waste_previous_date,
                customer_current_date, customer_previous_date]):
        raise ValueError("Dated sales, wastage and customer datasets must contain at least two snapshots.")

    def set_wastage_factor(
        store_id: str,
        factor: float,
        reason: str = "Overstocked",
        sku_filter: set[str] | None = None,
    ) -> None:
        """Set a repeatable, store-level wastage change from the previous snapshot.

        The aggregate target is corrected after per-SKU integer rounding so the
        reported growth closely matches the scenario brief rather than drifting
        upward because many small quantities are rounded independently.
        """
        previous_rows = wastage[
            (wastage.store_id == store_id)
            & (wastage.date == pd.Timestamp(waste_previous_date))
        ].set_index("sku")["qty_wasted"]
        current_mask = (
            (wastage.store_id == store_id)
            & (wastage.date == pd.Timestamp(waste_current_date))
        )
        if sku_filter is not None:
            previous_rows = previous_rows.loc[previous_rows.index.astype(str).isin(sku_filter)]
            current_mask &= wastage["sku"].astype(str).isin(sku_filter)
        current_indices = wastage.index[current_mask]
        current_skus = wastage.loc[current_indices, "sku"]
        baseline = pd.to_numeric(current_skus.map(previous_rows), errors="coerce").fillna(0).to_numpy(dtype=float)
        if not len(current_indices):
            return
        baseline = np.maximum(1, baseline)
        updated = np.maximum(1, np.rint(baseline * factor)).astype(int)
        target_total = max(len(updated), int(round(float(baseline.sum()) * factor)))
        difference = target_total - int(updated.sum())
        if difference > 0:
            for offset in range(difference):
                updated[offset % len(updated)] += 1
        elif difference < 0:
            remaining = -difference
            while remaining:
                candidates = np.flatnonzero(updated > 1)
                if not len(candidates):
                    break
                for index in candidates:
                    if remaining == 0:
                        break
                    updated[index] -= 1
                    remaining -= 1
        wastage.loc[current_indices, "qty_wasted"] = updated
        wastage.loc[current_indices, "reason"] = reason

    # Scenario 1: Store 17 — match the challenge brief through source signals,
    # not by assigning a risk label: sales -18%, footfall -5%, transactions -15%,
    # fresh-food wastage +28%, 12 fast-moving fresh SKUs short, overdue inbound POs,
    # and a separate set of overstocked fresh SKUs.
    store_id = "Store_0017"
    previous_store_sales = sales[
        (sales.store_id == store_id) & (sales.date == pd.Timestamp(sales_previous_date))
    ].set_index("sku")
    current_mask = (sales.store_id == store_id) & (sales.date == pd.Timestamp(sales_current_date))
    for idx in sales.index[current_mask]:
        sku = sales.at[idx, "sku"]
        if sku in previous_store_sales.index:
            sales.at[idx, "qty_sold"] = max(1, int(round(float(previous_store_sales.loc[sku, "qty_sold"]) * 0.82)))
    price_map = products.set_index("sku")["price"]
    sales.loc[current_mask, "revenue"] = sales.loc[current_mask].apply(
        lambda row: int(row["qty_sold"] * price_map.get(row["sku"], 0)), axis=1
    )

    perishability_map = products.set_index("sku")["perishability"].astype(str).str.title()
    shelf_life_map = pd.to_numeric(products.set_index("sku")["shelf_life_days"], errors="coerce").fillna(0)
    fresh_skus = set(perishability_map[perishability_map.isin(["High", "Medium"])].index.astype(str))
    previous_fresh_sales = previous_store_sales[
        previous_store_sales.index.astype(str).isin(fresh_skus)
    ]
    fast_movers = set(previous_fresh_sales.sort_values("qty_sold", ascending=False).head(12).index.astype(str))
    # The stockout is deliberately focused on the 12 highest-volume fresh SKUs.
    low_stock_mask = (inventory.store_id == store_id) & inventory.sku.astype(str).isin(fast_movers)
    inventory.loc[low_stock_mask, "stock"] = 2
    inventory.loc[low_stock_mask, "reorder_level"] = 25

    # Create a second, distinct problem: slow-selling perishable stock in excess
    # of plausible shelf-life cover. This makes the right decision a stock-mix
    # correction, not a blanket instruction to order more of everything.
    store_fresh = previous_fresh_sales.loc[~previous_fresh_sales.index.astype(str).isin(fast_movers)].copy()
    slow_fresh_skus = set(store_fresh.sort_values("qty_sold", ascending=True).head(8).index.astype(str))
    store_current_sales = sales.loc[current_mask].set_index("sku")["qty_sold"]
    for sku in slow_fresh_skus:
        mask = (inventory.store_id == store_id) & (inventory.sku.astype(str) == sku)
        daily_sales = max(1, int(store_current_sales.get(sku, 1)))
        shelf_days = max(1, int(shelf_life_map.get(sku, 3)))
        excess_stock = max(180, daily_sales * (shelf_days + 3))
        inventory.loc[mask, "stock"] = excess_stock
        inventory.loc[mask, "reorder_level"] = max(10, int(round(excess_stock * 0.20)))

    # Raise fresh-food wastage by 28% in the same perishability cohort. Non-fresh
    # SKUs are intentionally left unchanged so the analyzer can distinguish it.
    set_wastage_factor(store_id, factor=1.28, reason="Overstocked", sku_filter=fresh_skus)

    overdue_date = (pd.Timestamp.today().normalize() - pd.Timedelta(days=2)).strftime("%Y-%m-%d")
    orders_for_store = purchase_orders.index[purchase_orders.store_id == store_id].tolist()
    while len(orders_for_store) < 2:
        extra = len(orders_for_store) + 1
        purchase_orders.loc[len(purchase_orders)] = {
            "po": f"PO_SIM_0017_{extra}", "supplier": f"Supplier_{extra:03d}",
            "sku": sorted(fast_movers)[(extra - 1) % len(fast_movers)], "qty": 50,
            "expected_date": overdue_date, "status": "Delayed", "store_id": store_id,
        }
        orders_for_store = purchase_orders.index[purchase_orders.store_id == store_id].tolist()
    # Ensure two overdue orders refer to genuinely short, fast-moving SKUs.
    for order_position, idx in enumerate(orders_for_store[:2]):
        purchase_orders.at[idx, "status"] = "Delayed"
        purchase_orders.at[idx, "expected_date"] = overdue_date
        purchase_orders.at[idx, "sku"] = sorted(fast_movers)[order_position]

    current_customer_mask = (customers.store_id == store_id) & (customers.date == pd.Timestamp(customer_current_date))
    previous_customer = customers[(customers.store_id == store_id) & (customers.date == pd.Timestamp(customer_previous_date))].iloc[0]
    customers.loc[current_customer_mask, "footfall"] = max(50, int(round(previous_customer.footfall * 0.95)))
    customers.loc[current_customer_mask, "transactions"] = max(20, int(round(previous_customer.transactions * 0.85)))
    previous_complaints = max(1, int(previous_customer.get("complaints", 1)))
    if "complaints" in customers.columns:
        current_complaints = max(previous_complaints + 1, int(round(previous_complaints * 1.35)))
        customers.loc[current_customer_mask, "complaints"] = current_complaints
        # Make the reasons inspectable: shelf availability is the dominant theme,
        # with fresh-quality complaints present as a separate waste/quality clue.
        if "stock_availability_complaints" in customers.columns:
            stock_complaints = max(1, int(round(current_complaints * 0.60)))
            quality_complaints = int(round(current_complaints * 0.25))
            service_complaints = max(0, current_complaints - stock_complaints - quality_complaints)
            customers.loc[current_customer_mask, "stock_availability_complaints"] = stock_complaints
            customers.loc[current_customer_mask, "fresh_quality_complaints"] = quality_complaints
            customers.loc[current_customer_mask, "service_complaints"] = service_complaints

    # Scenario 2: Store 08 — a clear but plausible overstock-related anomaly.
    store_id = "Store_0008"
    set_wastage_factor(store_id, factor=1.80, reason="Overstocked")

    # Scenario 3: Store 12 — severe compliance issue.
    compliance.loc[compliance.store_id == "Store_0012", "checklist_score"] = 48
    compliance.loc[compliance.store_id == "Store_0012", "open_issues"] = 9

    # Scenario 4: Store 21 — staffing coverage and transaction problem.
    staff.loc[staff.store_id == "Store_0021", "attendance"] = 0.55
    staff.loc[staff.store_id == "Store_0021", "productivity"] = 0.45
    staff.loc[staff.store_id == "Store_0021", "staffing_level"] = 4
    customer_mask = (customers.store_id == "Store_0021") & (customers.date == pd.Timestamp(customer_current_date))
    customers.loc[customer_mask, "transactions"] = 60
    sales_previous_21 = sales[(sales.store_id == "Store_0021") & (sales.date == pd.Timestamp(sales_previous_date))].set_index("sku")
    current_21_mask = (sales.store_id == "Store_0021") & (sales.date == pd.Timestamp(sales_current_date))
    for idx in sales.index[current_21_mask]:
        sku = sales.at[idx, "sku"]
        if sku in sales_previous_21.index:
            sales.at[idx, "qty_sold"] = max(1, int(round(float(sales_previous_21.loc[sku, "qty_sold"]) * 0.70)))
    sales.loc[current_21_mask, "revenue"] = sales.loc[current_21_mask].apply(
        lambda row: int(row["qty_sold"] * price_map.get(row["sku"], 0)), axis=1
    )

    # Scenario 5: Store 33 — stock-cover exceeds shelf life for highly perishable SKUs.
    store_id = "Store_0033"
    perishable_skus = products.loc[products.perishability.isin(["High", "Medium"])].head(12)["sku"].tolist()
    for sku in perishable_skus:
        inventory_mask = (inventory.store_id == store_id) & (inventory.sku == sku)
        inventory.loc[inventory_mask, "stock"] = 150
        inventory.loc[inventory_mask, "reorder_level"] = 20
        sales_current_mask = (
            (sales.store_id == store_id) & (sales.sku == sku)
            & (sales.date == pd.Timestamp(sales_current_date))
        )
        sales.loc[sales_current_mask, "qty_sold"] = 2
        sales.loc[sales_current_mask, "revenue"] = 2 * int(price_map.get(sku, 0))

    # Scenario 6: Store 44 — average basket value has fallen materially.
    store_id = "Store_0044"
    current_bill_mask = (customers.store_id == store_id) & (customers.date == pd.Timestamp(customer_current_date))
    previous_bill = customers[(customers.store_id == store_id) & (customers.date == pd.Timestamp(customer_previous_date))]["avg_bill_value"].iloc[0]
    customers.loc[current_bill_mask, "avg_bill_value"] = max(80, int(round(previous_bill * 0.78)))

    # ------------------------------------------------------------------
    # Additional deterministic scenario cohorts.
    # These create a believable spread of operational conditions for the
    # demo. We change the source signals (never assign random risk labels),
    # so the analyzer must discover and score the problems itself.
    # ------------------------------------------------------------------
    def adjust_sales(store_id: str, drop: float) -> None:
        previous = sales[
            (sales.store_id == store_id)
            & (sales.date == pd.Timestamp(sales_previous_date))
        ].set_index("sku")["qty_sold"]
        current_mask = (
            (sales.store_id == store_id)
            & (sales.date == pd.Timestamp(sales_current_date))
        )
        current_skus = sales.loc[current_mask, "sku"]
        baseline = current_skus.map(previous).fillna(sales.loc[current_mask, "qty_sold"])
        new_qty = (baseline.astype(float) * (1 - drop)).round().clip(lower=1).astype(int)
        sales.loc[current_mask, "qty_sold"] = new_qty.to_numpy()
        sales.loc[current_mask, "revenue"] = (
            sales.loc[current_mask, "qty_sold"] * current_skus.map(price_map)
        ).to_numpy()

    def adjust_customer_metrics(
        store_id: str,
        *,
        transaction_drop: float | None = None,
        footfall_drop: float | None = None,
        bill_drop: float | None = None,
        complaint_increase: float | None = None,
    ) -> None:
        current_mask = (
            (customers.store_id == store_id)
            & (customers.date == pd.Timestamp(customer_current_date))
        )
        previous_rows = customers[
            (customers.store_id == store_id)
            & (customers.date == pd.Timestamp(customer_previous_date))
        ]
        if previous_rows.empty:
            return
        previous_row = previous_rows.iloc[0]
        for column, reduction in [
            ("transactions", transaction_drop),
            ("footfall", footfall_drop),
            ("avg_bill_value", bill_drop),
        ]:
            if reduction is not None:
                customers.loc[current_mask, column] = max(
                    1, int(round(float(previous_row[column]) * (1 - reduction)))
                )
        if complaint_increase is not None and "complaints" in customers.columns:
            new_total = max(
                1, int(round(float(previous_row.get("complaints", 1)) * (1 + complaint_increase)))
            )
            customers.loc[current_mask, "complaints"] = new_total
            if "stock_availability_complaints" in customers.columns:
                stock_count = int(round(new_total * 0.55))
                quality_count = int(round(new_total * 0.20))
                service_count = max(0, new_total - stock_count - quality_count)
                customers.loc[current_mask, "stock_availability_complaints"] = stock_count
                customers.loc[current_mask, "fresh_quality_complaints"] = quality_count
                customers.loc[current_mask, "service_complaints"] = service_count

    def set_low_stock(store_id: str, count: int, out_every: int = 0) -> None:
        indices = inventory.index[inventory.store_id == store_id][:count]
        positions = np.arange(1, len(indices) + 1)
        stock_values = np.full(len(indices), 2, dtype=int)
        if out_every:
            stock_values[positions % out_every == 0] = 0
        inventory.loc[indices, "stock"] = stock_values
        inventory.loc[indices, "reorder_level"] = 25

    def set_delayed_orders(store_id: str, count: int = 2) -> None:
        overdue = (pd.Timestamp.today().normalize() - pd.Timedelta(days=2)).strftime("%Y-%m-%d")
        indices = purchase_orders.index[purchase_orders.store_id == store_id].tolist()
        for idx in indices[:count]:
            purchase_orders.at[idx, "status"] = "Delayed"
            purchase_orders.at[idx, "expected_date"] = overdue
        while len(indices) < count:
            purchase_orders.loc[len(purchase_orders)] = {
                "po": f"PO_SIM_{store_id}_{len(indices) + 1}",
                "supplier": f"Supplier_{(int(store_id[-4:]) % 100) + 1:03d}",
                "sku": inventory.loc[inventory.store_id == store_id, "sku"].iloc[len(indices)],
                "qty": 50,
                "expected_date": overdue,
                "status": "Delayed",
                "store_id": store_id,
            }
            indices = purchase_orders.index[purchase_orders.store_id == store_id].tolist()

    def increase_wastage(store_id: str, factor: float) -> None:
        previous = wastage[
            (wastage.store_id == store_id)
            & (wastage.date == pd.Timestamp(waste_previous_date))
        ].set_index("sku")["qty_wasted"]
        current_mask = (
            (wastage.store_id == store_id)
            & (wastage.date == pd.Timestamp(waste_current_date))
        )
        current_skus = wastage.loc[current_mask, "sku"]
        baseline = current_skus.map(previous).fillna(wastage.loc[current_mask, "qty_wasted"]).astype(float)
        updated = np.maximum(baseline + 1, np.rint(baseline * factor)).astype(int)
        wastage.loc[current_mask, "qty_wasted"] = updated
        wastage.loc[current_mask, "reason"] = "Overstocked"

    perishable_skus = products.loc[
        products.perishability.isin(["High", "Medium"]), "sku"
    ].head(18).tolist()

    def create_expiry_pressure(store_id: str, count: int = 12) -> None:
        selected_skus = perishable_skus[:count]
        inventory_mask = (inventory.store_id == store_id) & inventory.sku.isin(selected_skus)
        inventory.loc[inventory_mask, "stock"] = 145
        inventory.loc[inventory_mask, "reorder_level"] = 20
        sales_mask = (
            (sales.store_id == store_id) & sales.sku.isin(selected_skus)
            & (sales.date == pd.Timestamp(sales_current_date))
        )
        sales.loc[sales_mask, "qty_sold"] = 2
        sales.loc[sales_mask, "revenue"] = (
            2 * sales.loc[sales_mask, "sku"].map(price_map)
        ).to_numpy()

    # 45–49: net selling prices are discounted more heavily while unit cost and
    # quantities remain fixed. This creates an explicit gross-margin-pressure
    # scenario from revenue and synthetic unit-cost records (not a fake risk label).
    for store_number in range(45, 50):
        store_id = f"Store_{store_number:04d}"
        current_mask = (sales.store_id == store_id) & (sales.date == pd.Timestamp(sales_current_date))
        discount_factor = 0.84 + ((store_number - 45) % 3) * 0.02
        sales.loc[current_mask, "revenue"] = np.rint(
            sales.loc[current_mask, "revenue"].astype(float) * discount_factor
        ).astype(int)

    # 50–89: shelf gaps + delayed supply + weakened conversion + complaints + thin staffing.
    for store_number in range(50, 90):
        store_id = f"Store_{store_number:04d}"
        set_low_stock(store_id, count=16 + store_number % 5, out_every=5)
        set_delayed_orders(store_id, count=2)
        adjust_sales(store_id, drop=0.10 + (store_number % 7) * 0.01)
        adjust_customer_metrics(
            store_id,
            transaction_drop=0.12 + (store_number % 6) * 0.01,
            footfall_drop=0.02 + (store_number % 3) * 0.01,
            complaint_increase=0.25 + (store_number % 4) * 0.05,
        )
        staff_mask = staff.store_id == store_id
        staff.loc[staff_mask, "attendance"] = 0.66 + (store_number % 5) * 0.01
        staff.loc[staff_mask, "productivity"] = 0.55 + (store_number % 4) * 0.01
        staff.loc[staff_mask, "staffing_level"] = 5

    # 90–139: rising fresh-food waste + perishable cover + softer basket value.
    for store_number in range(90, 140):
        store_id = f"Store_{store_number:04d}"
        increase_wastage(store_id, factor=1.35)
        create_expiry_pressure(store_id, count=10 + store_number % 5)
        adjust_customer_metrics(store_id, bill_drop=0.13 + (store_number % 4) * 0.01)

    # 140–189: several moderate compliance findings combined with staffing
    # pressure and a commercial decline. The combination should rank above a
    # single isolated warning, while still being below the critical threshold.
    for store_number in range(140, 190):
        store_id = f"Store_{store_number:04d}"
        compliance_mask = compliance.store_id == store_id
        compliance.loc[compliance_mask, "checklist_score"] = 54 + (store_number % 15)
        compliance.loc[compliance_mask, "open_issues"] = 5 + (store_number % 3)
        staff_mask = staff.store_id == store_id
        staff.loc[staff_mask, "attendance"] = 0.64 + (store_number % 6) * 0.01
        staff.loc[staff_mask, "productivity"] = 0.52 + (store_number % 6) * 0.01
        adjust_sales(store_id, drop=0.10 + (store_number % 7) * 0.01)
        adjust_customer_metrics(
            store_id,
            transaction_drop=0.12 + (store_number % 7) * 0.01,
            footfall_drop=0.01 + (store_number % 4) * 0.01,
        )

    # 190–229: demand/conversion dips with otherwise stable footfall and
    # modest staff pressure. These cases are useful for the commercial view.
    for store_number in range(190, 230):
        store_id = f"Store_{store_number:04d}"
        adjust_sales(store_id, drop=0.10 + (store_number % 8) * 0.01)
        adjust_customer_metrics(
            store_id,
            transaction_drop=0.14 + (store_number % 8) * 0.01,
            footfall_drop=0.00 + (store_number % 3) * 0.01,
        )
        staff_mask = staff.store_id == store_id
        staff.loc[staff_mask, "attendance"] = 0.70 + (store_number % 4) * 0.01
        staff.loc[staff_mask, "productivity"] = 0.57 + (store_number % 3) * 0.01

    # 230–269: mixed stock/wastage/expiry pressure; a subset also has late POs.
    for store_number in range(230, 270):
        store_id = f"Store_{store_number:04d}"
        set_low_stock(store_id, count=12 + store_number % 6, out_every=6)
        increase_wastage(store_id, factor=1.32)
        create_expiry_pressure(store_id, count=8 + store_number % 5)
        if store_number % 2 == 0:
            set_delayed_orders(store_id, count=2)

    # 270–284 and 285–299: deliberately severe compliance/staff scenarios.
    # These are explicit demo cases, not random priority assignments.
    for store_number in range(270, 285):
        store_id = f"Store_{store_number:04d}"
        compliance_mask = compliance.store_id == store_id
        compliance.loc[compliance_mask, "checklist_score"] = 45 + (store_number % 5)
        compliance.loc[compliance_mask, "open_issues"] = 8
        set_low_stock(store_id, count=12, out_every=4)
        set_delayed_orders(store_id, count=2)

    for store_number in range(285, 300):
        store_id = f"Store_{store_number:04d}"
        staff_mask = staff.store_id == store_id
        staff.loc[staff_mask, "attendance"] = 0.54 + (store_number % 3) * 0.01
        staff.loc[staff_mask, "productivity"] = 0.44 + (store_number % 4) * 0.01
        staff.loc[staff_mask, "staffing_level"] = 3
        set_low_stock(store_id, count=12, out_every=4)
        adjust_sales(store_id, drop=0.16 + (store_number % 5) * 0.01)
        adjust_customer_metrics(store_id, transaction_drop=0.18 + (store_number % 5) * 0.01)

    print("Additional scenario cohorts prepared for Stores 0050–0299.")

    # Save all modified inputs.
    for filename, frame in [
        ("sales.csv", sales), ("inventory.csv", inventory), ("wastage.csv", wastage),
        ("purchase_orders.csv", purchase_orders), ("customers.csv", customers),
        ("staff.csv", staff), ("compliance.csv", compliance),
    ]:
        if "date" in frame.columns:
            frame["date"] = pd.to_datetime(frame["date"], errors="coerce").dt.strftime("%Y-%m-%d")
        frame.to_csv(DATA_DIR / filename, index=False)

    print("Problem scenarios injected:")
    print("  Store_0017 — sales, transactions, wastage, stock shortages and delayed suppliers")
    print("  Store_0008 — high overstock-related wastage")
    print("  Store_0012 — severe compliance failure")
    print("  Store_0021 — staffing and transaction decline")
    print("  Store_0033 — perishable stock likely to outlast shelf life")
    print("  Store_0044 — average bill value decline")
    print("  Stores_0045–0049 — net sales discount / gross-margin pressure")
    print("Data saved. Run data_analyzer.py to refresh the risk report.")


if __name__ == "__main__":
    main()
