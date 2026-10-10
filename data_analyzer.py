"""FreshBasket operational analysis engine.

Loads demo business datasets, joins store-level sales/customer/inventory/wastage/
supplier/staff/compliance signals, calculates risk, and writes a ranked report.
The output is used by backend.py and the React dashboard.
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterable
import json
import numpy as np
import pandas as pd

DATA_DIR = Path(__file__).parent / "data"
REPORT_FILE = DATA_DIR / "store_risk_report.csv"
PRIORITY_ORDER = ["Critical", "High", "Medium", "Low"]


def get_priority(score: int | float) -> str:
    if score >= 70:
        return "Critical"
    if score >= 50:
        return "High"
    if score >= 30:
        return "Medium"
    return "Low"


def safe_pct_change(current: pd.Series, previous: pd.Series) -> pd.Series:
    """Percentage change; a missing/zero baseline yields 0 rather than infinity."""
    prev = pd.to_numeric(previous, errors="coerce").fillna(0)
    curr = pd.to_numeric(current, errors="coerce").fillna(0)
    result = pd.Series(np.zeros(len(curr)), index=curr.index, dtype=float)
    valid = prev > 0
    result.loc[valid] = ((curr.loc[valid] - prev.loc[valid]) / prev.loc[valid]) * 100
    return result.replace([np.inf, -np.inf], 0).fillna(0).round(1)


def read_csv_required(filename: str) -> pd.DataFrame:
    """Load a required source file and adapt the Challenge 04 schema in memory.

    The supplied franchise dataset uses ``store`` rather than ``store_id`` and
    has daily staff/customer rows plus repeated compliance inspections. This
    adapter preserves the original CSVs exactly while presenting one normalized
    store-level schema to the existing, richer analyzer.
    """
    path = DATA_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"Required dataset not found: {path}.")
    frame = pd.read_csv(path)
    if "store" in frame.columns and "store_id" not in frame.columns:
        frame = frame.rename(columns={"store": "store_id"})

    if filename == "stores.csv":
        if "operating_status" in frame.columns and "status" not in frame.columns:
            # The source may contain historical closure notes in parentheses;
            # use the leading current status rather than matching the word anywhere.
            frame["status"] = frame["operating_status"].astype(str).str.split("(").str[0].str.strip()
        # This dataset covers Bengaluru locations. Add the existing workspace's
        # hierarchy fields as transparent geography labels for role scoping.
        if "region" not in frame.columns:
            frame["region"] = "Karnataka South"
        if "area" not in frame.columns:
            north = {"Malleshwaram", "Rajajinagar", "RT Nagar", "Hebbal", "Yelahanka", "Hennur", "Sahakar Nagar", "Nagarbhavi"}
            central = {"Jayanagar", "Banashankari", "Basavanagudi", "Vijayanagar", "Ulsoor", "Indiranagar", "Domlur", "Kalyan Nagar"}
            frame["area"] = frame["location"].astype(str).map(
                lambda value: "Bengaluru North" if value in north else ("Bengaluru Central" if value in central else "Bengaluru South")
            )
        if frame["store_id"].isna().any() or frame["store_id"].duplicated().any():
            raise ValueError("stores.csv must contain one non-empty, unique row per store/store_id.")

    elif filename == "staff.csv":
        if "date" in frame.columns:
            frame["date"] = pd.to_datetime(frame["date"], errors="coerce")
            frame = frame.sort_values("date").groupby("store_id", as_index=False).tail(1).copy()
        if "attendance" not in frame.columns:
            present = pd.to_numeric(frame.get("staff_present", 0), errors="coerce")
            level = pd.to_numeric(frame.get("staffing_level", 0), errors="coerce").clip(lower=1)
            frame["attendance"] = (present / level).clip(0, 1).fillna(0)
        if "productivity" not in frame.columns:
            tps = pd.to_numeric(frame.get("transactions_per_staff", 0), errors="coerce")
            frame["productivity"] = (tps / 10.0).clip(0, 1.5).fillna(0)

    elif filename == "compliance.csv":
        if "inspection_date" in frame.columns:
            frame["inspection_date"] = pd.to_datetime(frame["inspection_date"], errors="coerce")
            frame = frame.sort_values("inspection_date").groupby("store_id", as_index=False).tail(1).copy()

    elif filename == "purchase_orders.csv":
        # Dataset status labels include strings such as "Delayed – no revised date".
        # The analyzer below recognises any status beginning with "delayed".
        pass

    return frame


def _prepare_dates(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    if "date" in frame.columns:
        frame["date"] = pd.to_datetime(frame["date"], errors="coerce")
    return frame


def _snapshot_summary(
    frame: pd.DataFrame,
    values: Iterable[str],
    prefix: str,
    sum_values: Iterable[str] | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Timestamp | None, pd.Timestamp | None]:
    """Return current and previous per-store snapshots from a dated data table.

    Legacy single-snapshot files are also supported; their change percentages
    later resolve to zero rather than inventing a trend.
    """
    values = list(values)
    sum_values = set(sum_values or values)
    work = _prepare_dates(frame)
    if "date" not in work.columns or work["date"].notna().sum() == 0:
        agg = {col: ("sum" if col in sum_values else "mean") for col in values if col in work.columns}
        current = work.groupby("store_id", as_index=False).agg(agg)
        current = current.rename(columns={col: f"{prefix}_{col}" for col in values if col in current.columns})
        return current, pd.DataFrame(columns=["store_id"]), None, None

    dates = sorted(work["date"].dropna().unique())
    current_date = pd.Timestamp(dates[-1]) if dates else None
    previous_date = pd.Timestamp(dates[-2]) if len(dates) > 1 else None

    def aggregate_for(date_value: pd.Timestamp | None, label: str) -> pd.DataFrame:
        if date_value is None:
            return pd.DataFrame(columns=["store_id"])
        day = work[work["date"] == date_value]
        agg = {col: ("sum" if col in sum_values else "mean") for col in values if col in day.columns}
        result = day.groupby("store_id", as_index=False).agg(agg)
        return result.rename(columns={col: f"{label}_{col}" for col in values if col in result.columns})

    return aggregate_for(current_date, f"current_{prefix}"), aggregate_for(previous_date, f"previous_{prefix}"), current_date, previous_date


def _column_or_zero(frame: pd.DataFrame, column: str, default: float = 0) -> pd.Series:
    if column not in frame.columns:
        return pd.Series(default, index=frame.index, dtype=float)
    return pd.to_numeric(frame[column], errors="coerce").fillna(default)


def _merge_safely(base: pd.DataFrame, addition: pd.DataFrame) -> pd.DataFrame:
    if addition.empty or "store_id" not in addition.columns:
        return base
    # Each helper returns no more than one row per store. Keep this assertion
    # close to the merge so duplicated snapshots cannot silently duplicate stores.
    if addition["store_id"].duplicated().any():
        raise ValueError("Internal analyzer error: a store summary has duplicate store_id values.")
    return base.merge(addition, on="store_id", how="left")


def analyze_stores() -> pd.DataFrame:
    print("Loading FreshBasket datasets…", flush=True)
    stores = read_csv_required("stores.csv")
    products = read_csv_required("products.csv")
    sales = read_csv_required("sales.csv")
    inventory = read_csv_required("inventory.csv")
    wastage = read_csv_required("wastage.csv")
    purchase_orders = read_csv_required("purchase_orders.csv")
    customers = read_csv_required("customers.csv")
    staff = read_csv_required("staff.csv")
    compliance = read_csv_required("compliance.csv")

    if "store_id" not in stores.columns or stores["store_id"].duplicated().any():
        raise ValueError("stores.csv must contain one unique row per store_id.")

    # 1. Sales snapshots and trend
    sales_work = _prepare_dates(sales)
    sales_work["revenue"] = pd.to_numeric(sales_work.get("revenue", 0), errors="coerce").fillna(0)
    sales_work["qty_sold"] = pd.to_numeric(sales_work.get("qty_sold", 0), errors="coerce").fillna(0)
    has_cost_data = "unit_cost" in products.columns
    if has_cost_data and "sku" in products.columns:
        unit_cost_by_sku = products.drop_duplicates("sku").set_index("sku")["unit_cost"]
        sales_work["unit_cost"] = pd.to_numeric(sales_work["sku"].map(unit_cost_by_sku), errors="coerce").fillna(0)
        sales_work["gross_profit"] = sales_work["revenue"] - (sales_work["qty_sold"] * sales_work["unit_cost"])
    else:
        # Older / user-supplied reports without cost data remain supported; we
        # do not invent a gross-margin result when cost is unknown.
        sales_work["gross_profit"] = 0.0
    sales_summary, sales_previous, sales_current_date, sales_previous_date = _snapshot_summary(
        sales_work, ["revenue", "qty_sold", "gross_profit"], "sales", sum_values=["revenue", "qty_sold", "gross_profit"]
    )
    report = stores.copy()
    report["has_cost_data"] = bool(has_cost_data)
    report = _merge_safely(report, sales_summary)
    report = _merge_safely(report, sales_previous)
    report["total_sales"] = _column_or_zero(report, "current_sales_revenue")
    report["previous_sales"] = _column_or_zero(report, "previous_sales_revenue")
    report["total_units_sold"] = _column_or_zero(report, "current_sales_qty_sold")
    report["previous_units_sold"] = _column_or_zero(report, "previous_sales_qty_sold")
    report["current_gross_profit"] = _column_or_zero(report, "current_sales_gross_profit")
    report["previous_gross_profit"] = _column_or_zero(report, "previous_sales_gross_profit")
    report["gross_margin_pct"] = np.where(report["total_sales"] > 0, report["current_gross_profit"] / report["total_sales"] * 100, 0).round(1)
    report["previous_gross_margin_pct"] = np.where(report["previous_sales"] > 0, report["previous_gross_profit"] / report["previous_sales"] * 100, 0).round(1)
    report["gross_margin_change_pp"] = (report["gross_margin_pct"] - report["previous_gross_margin_pct"]).round(1)
    report["sales_change_pct"] = safe_pct_change(report["total_sales"], report["previous_sales"])

    # SKU-level latest sales supports inventory cover and expiry checks.
    if "date" in sales_work.columns and sales_work["date"].notna().any():
        latest_sales_date = sales_work["date"].max()
        current_sales_sku = sales_work[sales_work["date"] == latest_sales_date].groupby(
            ["store_id", "sku"], as_index=False
        ).agg(current_qty_sold=("qty_sold", "sum"))
    else:
        current_sales_sku = sales_work.groupby(["store_id", "sku"], as_index=False).agg(
            current_qty_sold=("qty_sold", "sum")
        )

    # 2. Inventory health and perishable stock cover
    inventory_work = inventory.copy()
    for column in ["stock", "reorder_level"]:
        inventory_work[column] = pd.to_numeric(inventory_work.get(column, 0), errors="coerce").fillna(0)
    inventory_work["low_stock"] = inventory_work["stock"] < inventory_work["reorder_level"]
    inventory_work["out_of_stock"] = inventory_work["stock"] <= 0

    products_small = products[[col for col in ["sku", "category", "perishability", "shelf_life_days", "price", "unit_cost"] if col in products.columns]].drop_duplicates("sku")
    inventory_products = inventory_work.merge(products_small, on="sku", how="left")
    inventory_products = inventory_products.merge(current_sales_sku, on=["store_id", "sku"], how="left")
    inventory_products["current_qty_sold"] = _column_or_zero(inventory_products, "current_qty_sold")
    inventory_products["days_of_stock"] = inventory_products["stock"] / inventory_products["current_qty_sold"].clip(lower=1)
    shelf_life = pd.to_numeric(inventory_products.get("shelf_life_days", 0), errors="coerce").fillna(0)
    perishability = inventory_products.get("perishability", pd.Series("Low", index=inventory_products.index)).astype(str).str.title()
    inventory_products["expiry_risk"] = (
        perishability.isin(["High", "Medium"])
        & (shelf_life > 0)
        & (inventory_products["stock"] > 0)
        & (inventory_products["days_of_stock"] > shelf_life)
    )
    inventory_summary = inventory_products.groupby("store_id", as_index=False).agg(
        low_stock_count=("low_stock", "sum"),
        out_of_stock_count=("out_of_stock", "sum"),
        total_stock=("stock", "sum"),
        products_tracked=("stock", "count"),
        perishable_expiry_risk_count=("expiry_risk", "sum"),
    )
    inventory_summary["low_stock_count"] = inventory_summary["low_stock_count"].astype(int)
    inventory_summary["out_of_stock_count"] = inventory_summary["out_of_stock_count"].astype(int)
    inventory_summary["perishable_expiry_risk_count"] = inventory_summary["perishable_expiry_risk_count"].astype(int)
    report = _merge_safely(report, inventory_summary)
    report["low_stock_ratio"] = _column_or_zero(report, "low_stock_count") / _column_or_zero(report, "products_tracked").clip(lower=1)

    # 3. Wastage growth by store.
    wastage_work = wastage.copy()
    wastage_work["qty_wasted"] = pd.to_numeric(wastage_work.get("qty_wasted", 0), errors="coerce").fillna(0)
    if "unit_cost" in products_small.columns and "sku" in wastage_work.columns:
        unit_cost_map = products_small.drop_duplicates("sku").set_index("sku")["unit_cost"]
        wastage_work["unit_cost"] = pd.to_numeric(wastage_work["sku"].map(unit_cost_map), errors="coerce").fillna(0)
        wastage_work["wastage_value"] = wastage_work["qty_wasted"] * wastage_work["unit_cost"]
    else:
        wastage_work["wastage_value"] = np.nan
    wastage_current, wastage_previous, _, _ = _snapshot_summary(
        wastage_work, ["qty_wasted", "wastage_value"], "wastage", sum_values=["qty_wasted", "wastage_value"]
    )
    report = _merge_safely(report, wastage_current)
    report = _merge_safely(report, wastage_previous)
    # Older CSVs without dates use current_wastage_qty_wasted directly.
    report["total_wastage"] = _column_or_zero(report, "current_wastage_qty_wasted")
    report["previous_wastage"] = _column_or_zero(report, "previous_wastage_qty_wasted")
    report["estimated_wastage_cost_current"] = _column_or_zero(report, "current_wastage_wastage_value")
    report["estimated_wastage_cost_previous"] = _column_or_zero(report, "previous_wastage_wastage_value")
    report["estimated_wastage_cost_change"] = (report["estimated_wastage_cost_current"] - report["estimated_wastage_cost_previous"]).round(0)
    report["wastage_growth_pct"] = safe_pct_change(report["total_wastage"], report["previous_wastage"])

    # Fresh-food wastage is tracked separately from the whole assortment. This
    # avoids hiding a produce/dairy/bakery problem behind packaged-goods volume.
    fresh_mask = wastage_work.merge(products_small, on="sku", how="left")
    fresh_perishability = fresh_mask.get("perishability", pd.Series("Low", index=fresh_mask.index)).astype(str).str.title()
    fresh_categories = fresh_mask.get("category", pd.Series("", index=fresh_mask.index)).astype(str).str.lower()
    fresh_mask = fresh_mask[fresh_perishability.isin(["High", "Medium"]) | fresh_categories.isin(["dairy", "vegetables", "fruits", "bakery"])]
    fresh_current, fresh_previous, _, _ = _snapshot_summary(
        fresh_mask, ["qty_wasted", "wastage_value"], "fresh_wastage", sum_values=["qty_wasted", "wastage_value"]
    )
    report = _merge_safely(report, fresh_current)
    report = _merge_safely(report, fresh_previous)
    report["fresh_wastage_current"] = _column_or_zero(report, "current_fresh_wastage_qty_wasted")
    report["fresh_wastage_previous"] = _column_or_zero(report, "previous_fresh_wastage_qty_wasted")
    report["estimated_fresh_wastage_cost_current"] = _column_or_zero(report, "current_fresh_wastage_wastage_value")
    report["estimated_fresh_wastage_cost_previous"] = _column_or_zero(report, "previous_fresh_wastage_wastage_value")
    report["estimated_fresh_wastage_cost_change"] = (report["estimated_fresh_wastage_cost_current"] - report["estimated_fresh_wastage_cost_previous"]).round(0)
    report["fresh_wastage_growth_pct"] = safe_pct_change(report["fresh_wastage_current"], report["fresh_wastage_previous"])

    # 4. Supplier reliability and overdue order count.
    purchase_orders["status"] = purchase_orders.get("status", "").astype(str).str.strip().str.lower()
    if "expected_date" in purchase_orders.columns:
        purchase_orders["expected_date"] = pd.to_datetime(purchase_orders["expected_date"], errors="coerce")
        today = pd.Timestamp.today().normalize()
        is_overdue = purchase_orders["expected_date"].notna() & (purchase_orders["expected_date"] < today)
    else:
        is_overdue = pd.Series(False, index=purchase_orders.index)
    delayed_status = purchase_orders["status"].str.startswith("delayed", na=False)
    # A delayed status is meaningful on its own; overdue pending/dispatched POs
    # are also counted as a supplier warning.
    purchase_orders["is_delayed_order"] = delayed_status | (is_overdue & ~purchase_orders["status"].eq("delivered"))
    delayed_summary = purchase_orders.groupby("store_id", as_index=False).agg(
        delayed_orders=("is_delayed_order", "sum")
    )
    report = _merge_safely(report, delayed_summary)

    # 5. Customer snapshots and changes.
    has_complaint_data = any(col in customers.columns for col in [
        "complaints", "stock_availability_complaints", "fresh_quality_complaints", "service_complaints"
    ])
    report["has_complaint_data"] = bool(has_complaint_data)
    customer_cols = [
        col for col in [
            "footfall", "transactions", "avg_bill_value", "complaints",
            "stock_availability_complaints", "fresh_quality_complaints", "service_complaints",
        ] if col in customers.columns
    ]
    customer_current, customer_previous, _, _ = _snapshot_summary(
        customers, customer_cols, "customers", sum_values=[]
    )
    report = _merge_safely(report, customer_current)
    report = _merge_safely(report, customer_previous)
    customer_metrics = [
        "footfall", "transactions", "avg_bill_value", "complaints",
        "stock_availability_complaints", "fresh_quality_complaints", "service_complaints",
    ]
    for metric in customer_metrics:
        report[f"{metric}_current"] = _column_or_zero(report, f"current_customers_{metric}")
        report[f"{metric}_previous"] = _column_or_zero(report, f"previous_customers_{metric}")
        report[f"{metric}_change_pct"] = safe_pct_change(report[f"{metric}_current"], report[f"{metric}_previous"])
    report["footfall"] = report["footfall_current"]
    report["transactions"] = report["transactions_current"]
    report["avg_bill_value"] = report["avg_bill_value_current"]
    report["complaints"] = report["complaints_current"]
    report["conversion_rate"] = (report["transactions"] / report["footfall"].clip(lower=1) * 100).round(1)

    # 6. Staff and compliance.
    for source, numeric_cols in [
        (staff, ["attendance", "staffing_level", "productivity"]),
        (compliance, ["checklist_score", "open_issues"]),
    ]:
        source = source.copy()
        for column in numeric_cols:
            source[column] = pd.to_numeric(source.get(column, 0), errors="coerce").fillna(0)
        report = _merge_safely(report, source[["store_id"] + numeric_cols])
    for column in ["attendance", "staffing_level", "productivity", "checklist_score", "open_issues"]:
        report[column] = _column_or_zero(report, column)
    report["attendance_pct"] = (report["attendance"] * 100).round(0).astype(int)
    report["productivity_pct"] = (report["productivity"] * 100).round(0).astype(int)

    # Ensure predictable numeric fields even when using older or partial demo CSVs.
    for column in [
        "total_sales", "previous_sales", "total_units_sold", "previous_units_sold",
        "current_gross_profit", "previous_gross_profit", "gross_margin_pct", "previous_gross_margin_pct", "gross_margin_change_pp",
        "low_stock_count", "out_of_stock_count", "total_stock", "products_tracked",
        "perishable_expiry_risk_count", "total_wastage", "previous_wastage", "delayed_orders",
        "fresh_wastage_current", "fresh_wastage_previous", "fresh_wastage_growth_pct",
        "footfall", "transactions", "avg_bill_value", "complaints", "attendance", "staffing_level",
        "productivity", "checklist_score", "open_issues",
    ]:
        report[column] = _column_or_zero(report, column)
    report["total_sales"] = report["total_sales"].round(0)
    report["total_wastage"] = report["total_wastage"].round(0)

    # 7. Operational problem detection.
    report["inventory_problem"] = (
        ((_column_or_zero(report, "low_stock_count") >= 8) & (report["low_stock_ratio"] >= 0.08))
        | (_column_or_zero(report, "out_of_stock_count") >= 3)
    )
    wastage_q90 = report["total_wastage"].quantile(0.90)
    wastage_q75 = report["total_wastage"].quantile(0.75)
    report["wastage_problem"] = (
        ((report["wastage_growth_pct"] >= 25) & (report["total_wastage"] >= report["previous_wastage"] * 1.15))
        | ((report["fresh_wastage_growth_pct"] >= 25) & (report["fresh_wastage_current"] >= report["fresh_wastage_previous"] * 1.15))
        | ((report["total_wastage"] > wastage_q90) & (report["total_wastage"] > wastage_q75 * 1.4))
    )
    report["supplier_problem"] = _column_or_zero(report, "delayed_orders") >= 1
    report["compliance_problem"] = (report["checklist_score"] < 75) | (report["open_issues"] >= 4)
    report["staffing_problem"] = (
        (report["attendance"] < 0.75) | (report["productivity"] < 0.60) | (report["staffing_level"] <= 4)
    )
    report["margin_problem"] = (report["gross_margin_change_pp"] <= -5.0) if has_cost_data else False
    report["sales_problem"] = (report["sales_change_pct"] <= -10) | (report["avg_bill_value_change_pct"] <= -12)
    report["complaints_problem"] = (report["complaints_change_pct"] >= 25) & (report["complaints_current"] >= 3)
    report["customer_problem"] = (
        (report["transactions_change_pct"] <= -10)
        | (report["conversion_rate"] < 25)
        | report["complaints_problem"]
    )
    report["expiry_problem"] = report["perishable_expiry_risk_count"] >= 3

    # 8. Risk scoring: each component has a business interpretation and bounded
    # contribution. Scores remain tied to observed signals, not display order.
    report["inventory_risk"] = np.where(
        report["inventory_problem"],
        (8 + report["low_stock_ratio"] * 38 + report["out_of_stock_count"] * 2).clip(0, 25),
        0,
    )
    relevant_wastage_growth = pd.concat(
        [report["wastage_growth_pct"].clip(lower=0), report["fresh_wastage_growth_pct"].clip(lower=0)], axis=1
    ).max(axis=1)
    growth_component = ((relevant_wastage_growth * 0.12) + 12).clip(0, 24)
    report["wastage_risk"] = np.where(report["wastage_problem"], growth_component, 0)
    report["supplier_risk"] = np.where(report["supplier_problem"], (8 + (report["delayed_orders"] - 1).clip(lower=0) * 4).clip(0, 16), 0)
    report["compliance_risk"] = np.where(
        report["compliance_problem"],
        (12 + ((75 - report["checklist_score"]).clip(lower=0) * 0.25) + (report["open_issues"] * 1.2)).clip(0, 25),
        0,
    )
    report["staffing_risk"] = np.where(
        report["staffing_problem"],
        (10 + ((0.75 - report["attendance"]).clip(lower=0) * 35)
         + ((0.60 - report["productivity"]).clip(lower=0) * 30)
         + (report["staffing_level"].le(4).astype(int) * 5)).clip(0, 22),
        0,
    )
    report["sales_risk"] = np.where(report["sales_problem"], (10 + ((-report["sales_change_pct"]).clip(lower=0) * 0.18) + ((-report["avg_bill_value_change_pct"]).clip(lower=0) * 0.10)).clip(0, 18), 0)
    report["margin_risk"] = np.where(report["margin_problem"], (8 + ((-report["gross_margin_change_pp"]).clip(lower=0) * 0.8)).clip(0, 16), 0)
    report["customer_risk"] = np.where(report["customer_problem"], (7 + ((-report["transactions_change_pct"]).clip(lower=0) * 0.10) + report["complaints_problem"].astype(int) * 3).clip(0, 18), 0)
    report["expiry_risk"] = np.where(report["expiry_problem"], (8 + report["perishable_expiry_risk_count"].clip(upper=8)).clip(0, 16), 0)

    risk_columns = ["inventory_risk", "wastage_risk", "supplier_risk", "compliance_risk", "staffing_risk", "sales_risk", "margin_risk", "customer_risk", "expiry_risk"]
    report["risk_score_base"] = report[risk_columns].sum(axis=1).round().clip(0, 100).astype(int)
    report["risk_score"] = report["risk_score_base"].copy()

    # A single high-impact exception should not be hidden in the Low queue just
    # because the other measures look healthy. This floor applies to substantive
    # findings, not every minor signal (for example, one routine supplier delay).
    high_impact_exception = (
        report["inventory_problem"]
        | report["wastage_problem"]
        | report["compliance_problem"]
        | report["staffing_problem"]
        | report["margin_problem"]
        | report["expiry_problem"]
        | (report["sales_change_pct"] <= -15)
        | (report["avg_bill_value_change_pct"] <= -20)
    )
    report.loc[high_impact_exception, "risk_score"] = report.loc[
        high_impact_exception, "risk_score"
    ].clip(lower=30)

    # Escalate the specific *combination* that most closely matches the brief:
    # simultaneous shelf gaps, supplier delays, rising wastage and commercial
    # weakness. This is a general rule based on signals, not a Store ID override.
    connected_supply_and_waste_crisis = (
        report["inventory_problem"]
        & report["supplier_problem"]
        & report["wastage_problem"]
        & report["sales_problem"]
        & report["customer_problem"]
    )
    report.loc[connected_supply_and_waste_crisis, "risk_score"] = report.loc[
        connected_supply_and_waste_crisis, "risk_score"
    ].clip(lower=70)

    # Explicitly protect the challenge's severe demonstration cases from being
    # hidden by the other mild generated signals.
    severe_compliance = (report["checklist_score"] < 50) | (report["open_issues"] >= 8)
    severe_staffing = (report["attendance"] < 0.60) & (report["productivity"] < 0.50)
    report.loc[severe_compliance | severe_staffing, "risk_score"] = report.loc[
        severe_compliance | severe_staffing, "risk_score"
    ].clip(lower=70)
    report["risk_floor_adjustment"] = (report["risk_score"] - report["risk_score_base"]).clip(lower=0).astype(int)
    report["priority"] = report["risk_score"].map(get_priority)

    # 9. Human-readable problem statements, root-cause reasoning and actions.
    def identify_problems(row: pd.Series) -> list[str]:
        problems: list[str] = []
        if row["sales_problem"]:
            if row["sales_change_pct"] <= -10:
                problems.append(f"Sales are down {abs(row['sales_change_pct']):.1f}% versus the previous snapshot")
            if row["avg_bill_value_change_pct"] <= -12:
                problems.append(f"Average bill value is down {abs(row['avg_bill_value_change_pct']):.1f}%")
        if row.get("margin_problem", False):
            problems.append(f"Gross margin rate has fallen {abs(row['gross_margin_change_pp']):.1f} percentage points")
        if row.get("complaints_problem", False):
            problems.append(f"Customer complaints are up {row['complaints_change_pct']:.1f}% ({int(row['complaints_current'])} in the latest snapshot)")
        if row["inventory_problem"]:
            problems.append(f"{int(row['low_stock_count'])} products are below reorder levels")
        if row["wastage_problem"]:
            if row["fresh_wastage_growth_pct"] >= 25 and row["fresh_wastage_current"] >= row["fresh_wastage_previous"] * 1.15:
                problems.append(f"Fresh-food wastage is up {row['fresh_wastage_growth_pct']:.1f}% versus the previous snapshot")
            elif row["wastage_growth_pct"] >= 25:
                problems.append(f"Product wastage is up {row['wastage_growth_pct']:.1f}% versus the previous snapshot")
            else:
                problems.append("Product wastage is unusually high compared with other stores")
        if row["supplier_problem"]:
            problems.append(f"{int(row['delayed_orders'])} supplier order(s) are delayed or overdue")
        if row["compliance_problem"]:
            problems.append(f"Compliance checklist is {int(row['checklist_score'])}/100 with {int(row['open_issues'])} open issue(s)")
        if row["staffing_problem"]:
            problems.append(f"Staff coverage concern: {int(row['attendance_pct'])}% attendance and {int(row['productivity_pct'])}% productivity")
        if row["customer_problem"]:
            if row["transactions_change_pct"] <= -10:
                problems.append(f"Transactions are down {abs(row['transactions_change_pct']):.1f}%")
            else:
                problems.append(f"Customer conversion is low at {row['conversion_rate']:.1f}%")
        if row["expiry_problem"]:
            problems.append(f"{int(row['perishable_expiry_risk_count'])} perishable products may not sell before shelf life ends")
        return problems or ["No major operational issue detected"]

    def explain_root_cause(row: pd.Series) -> str:
        explanations: list[str] = []
        if row["inventory_problem"] and row["supplier_problem"]:
            explanations.append(
                f"{int(row['low_stock_count'])} products are below reorder levels and "
                f"{int(row['delayed_orders'])} supplier order(s) are delayed. The delivery delay may be extending shelf gaps; "
                "prioritize the fastest-moving missing items and confirm the new ETA."
            )
        if row["sales_problem"] and row["customer_problem"]:
            explanations.append(
                f"Sales changed by {row['sales_change_pct']:.1f}% and transactions changed by "
                f"{row['transactions_change_pct']:.1f}%, while footfall changed by {row['footfall_change_pct']:.1f}%. "
                "That pattern points to weaker conversion and/or basket size rather than footfall alone."
            )
        elif row["sales_problem"]:
            explanations.append(
                f"Sales changed by {row['sales_change_pct']:.1f}% against a footfall change of "
                f"{row['footfall_change_pct']:.1f}%. Review availability, promotions and basket mix before assigning a cause."
            )
        if row["wastage_problem"] and row["expiry_problem"]:
            growth_label = "fresh-food wastage" if row["fresh_wastage_growth_pct"] >= row["wastage_growth_pct"] else "total product wastage"
            growth_value = max(float(row["fresh_wastage_growth_pct"]), float(row["wastage_growth_pct"]))
            explanations.append(
                f"{growth_label.capitalize()} is changing by {growth_value:.1f}% and {int(row['perishable_expiry_risk_count'])} perishable items have stock cover beyond shelf life. "
                "That combination suggests some lines may be over-ordered while fast movers are short; inspect the SKU mix before increasing the entire order."
            )
        elif row["wastage_problem"] and row["inventory_problem"]:
            explanations.append(
                "Wastage and low-stock signals coexist across the assortment, which can indicate ordering imbalance between categories; "
                "inspect SKU-level demand and waste reasons rather than increasing every order."
            )
        elif row["wastage_problem"]:
            explanations.append(
                f"Wastage changed by {row['wastage_growth_pct']:.1f}% versus the previous snapshot or is materially above the network range. "
                "Review expiry, damage and overstock reasons before adjusting purchasing."
            )
        if row.get("margin_problem", False):
            explanations.append(
                f"Gross margin rate fell {abs(row['gross_margin_change_pp']):.1f} percentage points to {row['gross_margin_pct']:.1f}%. "
                "Check discounting and product/category mix against the cost assumptions before changing prices or promotions."
            )
        if row.get("complaints_problem", False):
            explanations.append(
                f"Customer complaints rose {row['complaints_change_pct']:.1f}% to {int(row['complaints_current'])}. "
                "When complaints increase alongside weaker transactions, inspect availability, checkout/service friction and complaint reasons before treating it as a demand-only decline."
            )
        if row["staffing_problem"] and row["customer_problem"]:
            explanations.append(
                "Low transactions coincide with staffing or productivity concerns. Check peak-hour coverage and service conditions "
                "before attributing the drop to demand."
            )
        if row["compliance_problem"]:
            explanations.append(
                f"The compliance score is {int(row['checklist_score'])}/100 with {int(row['open_issues'])} open issue(s); "
                "assign an owner and due date for each unresolved finding."
            )
        if row["expiry_problem"] and not row["wastage_problem"]:
            explanations.append(
                f"Stock cover exceeds shelf life for {int(row['perishable_expiry_risk_count'])} perishable SKU(s), "
                "so these items should be checked for markdown or stock rotation today."
            )
        if not explanations:
            explanations.append("No linked exception pattern was found in the current snapshots; continue routine checks and monitor the next update.")
        return " ".join(explanations)

    def recommend_actions(row: pd.Series) -> list[str]:
        actions: list[str] = []
        if row["inventory_problem"]:
            actions.append(f"Prepare a replenishment proposal for {int(row['low_stock_count'])} low-stock products, prioritizing fast movers")
        if row["supplier_problem"]:
            actions.append("Contact the supplier, confirm revised delivery times, and escalate overdue orders")
        if row["wastage_problem"]:
            actions.append("Review wastage reasons and order quantities, then markdown eligible fresh stock before expiry")
        if row["expiry_problem"]:
            actions.append("Inspect at-risk perishable SKUs, rotate stock, and propose markdowns where suitable")
        if row["compliance_problem"]:
            actions.append("Assign corrective tasks for open compliance issues and schedule a follow-up inspection")
        if row["staffing_problem"]:
            actions.append("Review shift coverage and move available staff to the busiest hours")
        if row["sales_problem"] or row["customer_problem"]:
            actions.append("Check shelf availability, customer feedback, conversion and average basket before changing promotions")
        if not actions:
            actions.append("Continue routine monitoring and complete the daily store checks")
        return actions

    report["detected_problems_list"] = report.apply(identify_problems, axis=1)
    report["detected_problems"] = report["detected_problems_list"].apply("; ".join)
    report["root_cause"] = report.apply(explain_root_cause, axis=1)

    # Build transparent, structured decision briefs. The rules compare operational
    # signals, SKU-level stock positions and overdue POs; they do not claim that
    # correlated signals prove causation, and all proposed actions require approval.
    inventory_products["store_id"] = inventory_products["store_id"].astype(str)
    inventory_products["sku"] = inventory_products["sku"].astype(str)
    inventory_products["stock_surplus"] = (
        inventory_products["stock"]
        - np.maximum(inventory_products["reorder_level"], np.ceil(inventory_products["current_qty_sold"] * 1.2))
    ).clip(lower=0)
    location_by_store = stores.set_index("store_id")["location"].astype(str).to_dict() if "location" in stores.columns else {}
    inventory_products["location"] = inventory_products["store_id"].map(location_by_store).fillna("Unknown")
    inventory_by_store = {key: group for key, group in inventory_products.groupby("store_id", sort=False)}
    donor_by_sku = {
        str(sku): group[group["stock_surplus"] > 0].sort_values("stock_surplus", ascending=False)
        for sku, group in inventory_products.groupby("sku", sort=False)
    }
    delayed_orders_by_store = {
        str(key): group for key, group in purchase_orders[purchase_orders["is_delayed_order"]].groupby("store_id", sort=False)
    } if "is_delayed_order" in purchase_orders.columns else {}

    def as_int(value: object, default: int = 0) -> int:
        try:
            if pd.isna(value):
                return default
            return int(round(float(value)))
        except (TypeError, ValueError):
            return default

    def build_decision_packet(row: pd.Series) -> dict:
        store_id = str(row["store_id"])
        store_inv = inventory_by_store.get(store_id, pd.DataFrame())
        if store_inv.empty:
            low_df = pd.DataFrame()
            expiry_df = pd.DataFrame()
        else:
            low_df = store_inv[store_inv["stock"] < store_inv["reorder_level"]].sort_values(
                ["current_qty_sold", "days_of_stock"], ascending=[False, True]
            ).head(8)
            expiry_df = store_inv[store_inv["expiry_risk"]].sort_values(
                ["days_of_stock", "shelf_life_days"], ascending=[False, True]
            ).head(8)

        low_stock_items: list[dict] = []
        for _, item in low_df.iterrows():
            stock = as_int(item.get("stock"))
            reorder = as_int(item.get("reorder_level"))
            daily_sales = max(0, as_int(item.get("current_qty_sold")))
            gap = max(0, reorder - stock)
            two_day_gap = max(0, int(np.ceil(daily_sales * 2)) - stock)
            is_fresh_item = str(item.get("perishability", "Low")).title() in {"High", "Medium"}
            target_days = 2 if is_fresh_item else 3
            target_stock = max(reorder, int(np.ceil(daily_sales * target_days)))
            store_po_rows = purchase_orders[
                (purchase_orders["store_id"].astype(str) == store_id)
                & (purchase_orders["sku"].astype(str) == str(item.get("sku", "")))
                & (~purchase_orders["status"].astype(str).str.lower().isin(["delivered", "cancelled", "canceled"]))
            ]
            open_po_qty = as_int(pd.to_numeric(store_po_rows.get("qty", pd.Series(dtype=float)), errors="coerce").fillna(0).sum()) if not store_po_rows.empty else 0
            target_gap = max(0, target_stock - stock)
            proposed_qty = max(0, target_gap - open_po_qty)
            cover_days = round(float(item.get("days_of_stock", 0) or 0), 1)
            timing = "Immediate shelf / transfer check" if cover_days <= 1 else ("Resolve today" if cover_days <= 2 else "Next replenishment cycle")
            low_stock_items.append({
                "sku": str(item.get("sku", "")),
                "category": str(item.get("category", "Unknown")),
                "perishability": str(item.get("perishability", "Unknown")),
                "stock": stock,
                "reorder_level": reorder,
                "daily_sales": daily_sales,
                "days_of_stock": round(float(item.get("days_of_stock", 0) or 0), 1),
                "reorder_gap_units": gap,
                "two_day_gap_units": two_day_gap,
                "open_po_qty": open_po_qty,
                "target_stock_units": target_stock,
                "proposed_replenishment_units": proposed_qty,
                "target_cover_days": target_days,
                "unit_price": as_int(item.get("price")),
                "unit_cost": as_int(item.get("unit_cost")),
                "estimated_replenishment_cost": as_int(item.get("unit_cost")) * proposed_qty if pd.notna(item.get("unit_cost", np.nan)) else None,
                "action_timing": timing,
            })

        transfer_candidates: list[dict] = []
        for item in low_stock_items:
            donor_pool = donor_by_sku.get(item["sku"])
            if donor_pool is None or donor_pool.empty:
                continue
            donor_pool = donor_pool[donor_pool["store_id"].astype(str) != store_id]
            if donor_pool.empty:
                continue
            receiving_location = location_by_store.get(store_id, "Unknown")
            same_location = donor_pool[donor_pool["location"].astype(str) == str(receiving_location)]
            if not same_location.empty:
                donor_pool = same_location
            donor = donor_pool.iloc[0]
            donor_stock = as_int(donor.get("stock"))
            donor_daily_sales = max(0, as_int(donor.get("current_qty_sold")))
            # Protect a donor reserve equal to the larger of its reorder level
            # or 1.2 days of recent SKU demand. The surplus field is calculated
            # from the same floor, so proposals cannot silently empty a donor.
            donor_reserve = max(
                as_int(donor.get("reorder_level")),
                int(np.ceil(donor_daily_sales * 1.2)),
            )
            available = min(as_int(donor.get("stock_surplus")), max(0, donor_stock - donor_reserve))
            gap = max(item["reorder_gap_units"], item["two_day_gap_units"], 1)
            suggested = min(available, gap)
            if suggested <= 0:
                continue
            donor_after = donor_stock - suggested
            donor_days_before = round(donor_stock / donor_daily_sales, 2) if donor_daily_sales > 0 else None
            donor_days_after = round(donor_after / donor_daily_sales, 2) if donor_daily_sales > 0 else None
            transfer_candidates.append({
                "sku": item["sku"],
                "category": item["category"],
                "from_store": str(donor.get("store_id", "")),
                "from_location": str(donor.get("location", "Unknown")),
                "to_store": store_id,
                "to_location": str(receiving_location),
                "available_surplus_units": available,
                "suggested_units": suggested,
                "donor_current_stock_units": donor_stock,
                "donor_daily_sales": donor_daily_sales,
                "donor_reorder_level": as_int(donor.get("reorder_level")),
                "donor_safety_reserve_units": donor_reserve,
                "donor_stock_after_proposal": donor_after,
                "donor_days_of_stock_before": donor_days_before,
                "donor_days_of_stock_after_proposal": donor_days_after,
                "donor_reserve_protected": donor_after >= donor_reserve,
                "receiver_stock": item["stock"],
                "receiver_reorder_level": item["reorder_level"],
                "receiver_days_of_stock": item["days_of_stock"],
                "network_safety_policy": "Keep donor stock at or above max(reorder level, 1.2 days of recent demand).",
            })
            if len(transfer_candidates) >= 5:
                break

        expiry_items = [{
            "sku": str(item.get("sku", "")),
            "category": str(item.get("category", "Unknown")),
            "stock": as_int(item.get("stock")),
            "daily_sales": max(0, as_int(item.get("current_qty_sold"))),
            "days_of_stock": round(float(item.get("days_of_stock", 0) or 0), 1),
            "shelf_life_days": as_int(item.get("shelf_life_days")),
            "unit_price": as_int(item.get("price")),
            "unit_cost": as_int(item.get("unit_cost")),
            "estimated_stock_cost": as_int(item.get("stock", 0)) * as_int(item.get("unit_cost", 0)),
            "estimated_excess_units": max(0, as_int(item.get("stock", 0)) - as_int(item.get("current_qty_sold", 0)) * as_int(item.get("shelf_life_days", 0))),
        } for _, item in expiry_df.iterrows()]

        store_late_orders = delayed_orders_by_store.get(store_id, pd.DataFrame())
        delayed_skus = set(store_late_orders.get("sku", pd.Series(dtype=str)).astype(str)) if not store_late_orders.empty else set()
        low_skus = {item["sku"] for item in low_stock_items}
        matched_delayed_skus = sorted(delayed_skus & low_skus)

        complaint_theme_fields = [
            ("Shelf availability", "stock_availability_complaints"),
            ("Fresh-food quality", "fresh_quality_complaints"),
            ("Service / checkout", "service_complaints"),
        ]
        complaint_themes: list[dict] = []
        for label, field in complaint_theme_fields:
            current_count = as_int(row.get(f"{field}_current", 0))
            previous_count = as_int(row.get(f"{field}_previous", 0))
            if current_count <= 0 and previous_count <= 0:
                continue
            change_pct = 0.0
            if previous_count > 0:
                change_pct = round((current_count - previous_count) / previous_count * 100, 1)
            complaint_themes.append({
                "label": label,
                "current": current_count,
                "previous": previous_count,
                "change_pct": change_pct,
            })
        complaint_themes.sort(key=lambda item: (item["current"], item["change_pct"]), reverse=True)

        links: list[dict] = []
        sales_change = float(row.get("sales_change_pct", 0) or 0)
        tx_change = float(row.get("transactions_change_pct", 0) or 0)
        footfall_change = float(row.get("footfall_change_pct", 0) or 0)
        bill_change = float(row.get("avg_bill_value_change_pct", 0) or 0)
        if bool(row.get("sales_problem", False)) or bool(row.get("customer_problem", False)):
            if sales_change <= -10 or tx_change <= -10 or bill_change <= -12:
                evidence = [f"Revenue/sales change: {sales_change:+.1f}%", f"Transactions: {tx_change:+.1f}%", f"Footfall: {footfall_change:+.1f}%", f"Average bill: {bill_change:+.1f}%"]
                if bool(row.get("complaints_problem", False)):
                    evidence.append(f"Complaints: {float(row.get('complaints_change_pct', 0)):+.1f}%")
                theme_summary = [f"{theme['label']}: {theme['current']}" for theme in complaint_themes if theme["current"] > 0]
                if theme_summary:
                    evidence.append("Complaint themes: " + "; ".join(theme_summary))
                top_theme = complaint_themes[0]["label"] if complaint_themes else ""
                if abs(tx_change) > abs(footfall_change) + 5 and bool(row.get("complaints_problem", False)) and top_theme == "Shelf availability" and bool(row.get("inventory_problem", False)):
                    implication = "Transactions are falling materially faster than visits, complaints are rising, and shelf availability is the largest recorded feedback theme while SKU shortages are present. Check the affected shelves and late inbound lines first; this is a strong investigation lead, not proof of causation."
                elif top_theme == "Fresh-food quality" and (bool(row.get("wastage_problem", False)) or bool(row.get("expiry_problem", False))):
                    implication = "Fresh-food quality feedback coincides with elevated wastage or excess perishable cover. Inspect date codes, handling, damaged units and wastage reasons before changing the purchase plan."
                elif abs(tx_change) > abs(footfall_change) + 5 and bool(row.get("complaints_problem", False)):
                    implication = "Transactions are falling materially faster than visits while complaints are rising. Check the leading complaint theme, shelf conditions and service execution before blaming lower footfall alone."
                elif abs(tx_change) > abs(footfall_change) + 5:
                    implication = "Transactions are falling materially faster than visits. Availability, conversion and service execution deserve checking before blaming lower footfall alone."
                elif bill_change <= -12:
                    implication = "The average basket is shrinking. Check item availability, category mix and substitution before using a broad promotion."
                else:
                    implication = "Sales weakness is visible, but these snapshots alone cannot isolate the cause. Compare availability, offers and customer feedback before changing prices."
                links.append({"title": "Commercial decline is not explained by traffic alone", "evidence": evidence, "interpretation": implication, "strength": "Pattern observed", "caveat": "Complaint themes are synthetic demo categories. Correlated signals guide investigation but do not prove a single cause."})

        if bool(row.get("inventory_problem", False)) and bool(row.get("supplier_problem", False)):
            evidence = [f"{as_int(row.get('low_stock_count'))} products below reorder level", f"{as_int(row.get('delayed_orders'))} delayed/overdue supplier orders"]
            if matched_delayed_skus:
                evidence.append(f"{len(matched_delayed_skus)} delayed PO SKU(s) overlap with the low-stock list: {', '.join(matched_delayed_skus[:3])}")
                implication = "Inbound delays overlap with specific shelf gaps, so they may prolong shortages. Protect those fast movers first and verify the revised ETA before placing a duplicate order."
                strength = "SKU-level overlap"
            else:
                implication = "Shelf gaps and late inbound orders coexist, but the report did not confirm that they affect the same SKUs. Match each PO to its item before expediting or duplicating it."
                strength = "Signals coexist"
            links.append({"title": "Shelf gaps and inbound delays may reinforce each other", "evidence": evidence, "interpretation": implication, "strength": strength, "caveat": "Do not place a duplicate order until open quantities and revised ETAs are checked."})

        fresh_growth = float(row.get("fresh_wastage_growth_pct", 0) or 0)
        if bool(row.get("wastage_problem", False)) or bool(row.get("expiry_problem", False)):
            evidence = [f"Fresh-food wastage change: {fresh_growth:+.1f}%", f"{as_int(row.get('perishable_expiry_risk_count'))} perishable SKU(s) with cover beyond shelf life"]
            if expiry_items:
                evidence.append("Examples: " + ", ".join(f"{item['sku']} ({item['days_of_stock']:.1f} days cover vs {item['shelf_life_days']} days shelf life)" for item in expiry_items[:3]))
            implication = "Some slow-moving fresh lines may be overstocked while fast movers are short. Review SKU-level demand, waste reason and expiry date; use rotation/markdown and reduce repeat buys where justified instead of increasing every order."
            links.append({"title": "Fresh waste and excess cover point to a stock-mix issue", "evidence": evidence, "interpretation": implication, "strength": "Cross-signal pattern" if expiry_items else "Wastage signal", "caveat": "Waste growth can have multiple causes; confirm the reason code and physical shelf condition."})

        if bool(row.get("margin_problem", False)):
            links.append({"title": "Revenue has weakened relative to product cost", "evidence": [f"Gross margin rate: {float(row.get('previous_gross_margin_pct', 0)):.1f}% → {float(row.get('gross_margin_pct', 0)):.1f}%", f"Margin change: {float(row.get('gross_margin_change_pp', 0)):+.1f} percentage points", f"Sales change: {sales_change:+.1f}%"], "interpretation": "Net revenue is falling faster than the cost basis in the synthetic source data. Check discounts, pricing and category mix; the unit costs are generated demo assumptions, not accounting data.", "strength": "Margin trend observed", "caveat": "Replace synthetic unit cost with finance-approved COGS before using this for a real commercial decision."})

        if bool(row.get("complaints_problem", False)):
            links.append({"title": "Customer complaints reinforce the experience hypothesis", "evidence": [f"Complaints: {float(row.get('complaints_change_pct', 0)):+.1f}%", f"Latest complaints: {as_int(row.get('complaints_current'))}", f"Transactions: {tx_change:+.1f}%"], "interpretation": "Complaints rising together with weaker transactions can indicate shelf availability or service friction. Inspect the actual complaint reasons to decide whether the response belongs to store operations, replenishment or customer service.", "strength": "Cross-signal pattern", "caveat": "Complaint counts are synthetic in this demo; the current schema does not contain complaint text or severity."})

        if bool(row.get("staffing_problem", False)) and bool(row.get("customer_problem", False)):
            links.append({"title": "Staff coverage may be adding friction", "evidence": [f"Attendance: {as_int(row.get('attendance_pct'))}%", f"Productivity: {as_int(row.get('productivity_pct'))}%", f"Transactions: {tx_change:+.1f}%"], "interpretation": "Low staffing/productivity and weak transactions appear together. Check peak-hour coverage and checkout/service queues before attributing the full loss to product demand.", "strength": "Signals coexist", "caveat": "Roster and hour-level queue data would be needed to verify the relationship."})

        if bool(row.get("compliance_problem", False)):
            links.append({"title": "Compliance requires an owned correction", "evidence": [f"Checklist: {as_int(row.get('checklist_score'))}/100", f"Open issues: {as_int(row.get('open_issues'))}"], "interpretation": "The checklist and unresolved issue count justify assigning a named owner, due time and follow-up inspection; this should not wait for commercial recovery work.", "strength": "Direct operational exception", "caveat": "Resolve against the inspection record and local SOP; the score is not a substitute for the underlying finding."})

        action_list = recommend_actions(row)
        transfer_action = ""
        if bool(row.get("inventory_problem", False)) and transfer_candidates:
            transfer_action = f"Prepare an inter-store transfer proposal for {len(transfer_candidates)} low-stock SKU(s) with available surplus"
            action_list.insert(0, transfer_action)

        options: list[dict] = []
        def add_option(kind: str, title: str, action_text: str, impact: str, tradeoff: str, score: int, rationale: str) -> None:
            if not action_text or any(option["action"] == action_text for option in options):
                return
            options.append({"kind": kind, "title": title, "action": action_text, "expected_impact": impact, "tradeoff": tradeoff, "score": score, "rationale": rationale, "recommended": False})

        if bool(row.get("compliance_problem", False)) and float(row.get("checklist_score", 100) or 100) < 60:
            compliance_action = next((a for a in action_list if a.startswith("Assign corrective tasks")), "")
            add_option("compliance", "Close the compliance exception", compliance_action, f"Checklist {as_int(row.get('checklist_score'))}/100; {as_int(row.get('open_issues'))} open issue(s).", "Needs an accountable owner and a follow-up check; don't mark complete without evidence.", 100, "Mandatory controls outrank routine commercial improvements.")

        if bool(row.get("inventory_problem", False)):
            if transfer_action:
                units = sum(item["suggested_units"] for item in transfer_candidates)
                add_option("transfer", "Transfer verified surplus before buying more", transfer_action, f"Potentially cover {units} unit(s) across {len(transfer_candidates)} SKU(s); best candidates are listed below.", "Requires donor-store confirmation and manager approval; keep the donor's reserve intact.", 98, "Fast-moving shelf gaps are time-sensitive, and some other stores may have usable surplus.")
            else:
                replenishment = next((a for a in action_list if a.startswith("Prepare a replenishment")), "")
                add_option("replenishment", "Build a targeted replenishment proposal", replenishment, f"{as_int(row.get('low_stock_count'))} SKU(s) sit below reorder level.", "Confirm open PO quantities, lead time and demand before raising a duplicate order.", 92, "Prioritise high-velocity SKUs and the units needed to restore minimum cover.")

        if bool(row.get("supplier_problem", False)):
            supplier_action = next((a for a in action_list if a.startswith("Contact the supplier")), "")
            matched_note = f" {len(matched_delayed_skus)} late SKU(s) also appear in the low-stock list." if matched_delayed_skus else " Match PO lines against the shortage list first."
            add_option("supplier", "Recover the overdue inbound plan", supplier_action, f"{as_int(row.get('delayed_orders'))} delayed/overdue purchase order(s).{matched_note}", "This improves ETA visibility, but may not solve today's gap without a transfer or a confirmed expedited delivery.", 91, "The inbound plan should be checked before committing to another purchase.")

        if bool(row.get("wastage_problem", False)) or bool(row.get("expiry_problem", False)):
            waste_action = next((a for a in action_list if a.startswith("Review wastage reasons")), "") or next((a for a in action_list if a.startswith("Inspect at-risk")), "")
            add_option("waste", "Reduce avoidable fresh-food loss", waste_action, f"Fresh-food wastage change {fresh_growth:+.1f}%; {as_int(row.get('perishable_expiry_risk_count'))} perishable SKU(s) show excess cover.", "Markdowns may reduce margin; first verify dates, waste reasons and current demand.", 88, "The assortment shows signs of overstock on some lines, so a blanket order increase could worsen waste.")

        if bool(row.get("margin_problem", False)):
            commercial_action = next((a for a in action_list if a.startswith("Check shelf availability")), "")
            add_option("margin", "Review discounting and category margin", commercial_action, f"Gross margin {float(row.get('previous_gross_margin_pct', 0)):.1f}% → {float(row.get('gross_margin_pct', 0)):.1f}% ({float(row.get('gross_margin_change_pp', 0)):+.1f} percentage points).", "Unit costs are synthetic; do not change price or promotion decisions until finance validates cost inputs.", 89, "Margin pressure can be obscured by looking at revenue alone.")

        if bool(row.get("staffing_problem", False)):
            staff_action = next((a for a in action_list if a.startswith("Review shift coverage")), "")
            add_option("staffing", "Stabilise peak-hour cover", staff_action, f"Attendance {as_int(row.get('attendance_pct'))}%; productivity {as_int(row.get('productivity_pct'))}%.", "Only move staff where coverage and role requirements allow; verify the busiest periods.", 87, "Staffing is a plausible contributor when customer transactions are weak.")

        if bool(row.get("sales_problem", False)) or bool(row.get("customer_problem", False)):
            commercial_action = next((a for a in action_list if a.startswith("Check shelf availability")), "")
            add_option("commercial", "Investigate the sales / conversion gap", commercial_action, f"Sales {sales_change:+.1f}%; transactions {tx_change:+.1f}%; footfall {footfall_change:+.1f}%.", "Avoid broad discounting until availability, service and average basket have been checked.", 84, "A decline in revenue should be decomposed into visits, conversion and basket value before choosing a promotion.")

        if not options:
            action_text = action_list[0] if action_list else "Continue routine monitoring and complete the daily store checks"
            add_option("monitor", "Continue routine checks", action_text, "No major threshold breach in the current snapshot.", "Re-check after the next reporting cycle or if new incidents arrive.", 40, "Keep an eye on the next data snapshot without escalating a false alarm.")

        options.sort(key=lambda option: option["score"], reverse=True)
        options = options[:3]
        if options:
            options[0]["recommended"] = True
        # Keep every available action approval-safe: the UI can only submit items
        # drawn from this exact server-generated list.
        deduped_actions = list(dict.fromkeys([option["action"] for option in options if option["action"]] + action_list))
        if not deduped_actions:
            deduped_actions = ["Continue routine monitoring and complete the daily store checks"]

        # Put the most actionable cross-signal explanation first. This makes the
        # morning brief open with the decision-driving relationship, not merely
        # the first KPI that happened to be evaluated.
        def link_priority(link: dict) -> int:
            title = str(link.get("title", "")).lower()
            if bool(row.get("inventory_problem", False)) and bool(row.get("supplier_problem", False)) and ("shelf gaps" in title or "inbound delays" in title):
                return 0
            if "fresh waste" in title or "excess cover" in title or "fresh-food quality" in str(link.get("interpretation", "")).lower():
                return 1
            if "commercial decline" in title:
                return 2
            return 3
        links.sort(key=link_priority)

        return {
            "recommended_actions_list": deduped_actions,
            "signal_links": links,
            "low_stock_items": low_stock_items,
            "expiry_items": expiry_items,
            "transfer_candidates": transfer_candidates,
            "action_options": options,
            "complaint_themes": complaint_themes,
        }

    decision_packets = report.apply(build_decision_packet, axis=1)
    report["recommended_actions_list"] = decision_packets.apply(lambda packet: packet["recommended_actions_list"])
    report["recommended_actions"] = report["recommended_actions_list"].apply("; ".join)
    report["daily_tasks"] = report["recommended_actions"]
    for field in ["signal_links", "low_stock_items", "expiry_items", "transfer_candidates", "action_options", "complaint_themes"]:
        report[f"{field}_json"] = decision_packets.apply(lambda packet: json.dumps(packet[field], ensure_ascii=False, separators=(",", ":")))

    # 10. Rank by urgency; general dashboard order is shuffled by the API only.
    report = report.sort_values(
        by=["risk_score", "total_wastage", "sales_change_pct"],
        ascending=[False, False, True],
    ).reset_index(drop=True)
    report["urgency_rank"] = np.arange(1, len(report) + 1)
    report["data_as_of"] = sales_current_date.strftime("%Y-%m-%d") if sales_current_date is not None else pd.Timestamp.today().strftime("%Y-%m-%d")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    report.to_csv(REPORT_FILE, index=False)

    counts = report["priority"].value_counts().reindex(PRIORITY_ORDER, fill_value=0)
    print("\n========== FRESHBASKET ANALYSIS ==========")
    print(f"Stores analysed: {len(report):,}")
    print("Priority distribution:")
    print(counts.to_string())
    print("\nHighest-urgency stores:")
    print(report[["store_id", "risk_score", "priority", "detected_problems"]].head(8).to_string(index=False, max_colwidth=95))
    print("\nScenario validation:")
    scenario_cols = ["store_id", "risk_score", "priority", "sales_change_pct", "gross_margin_change_pp", "transactions_change_pct", "complaints_change_pct", "wastage_growth_pct", "fresh_wastage_growth_pct", "detected_problems"]
    print(report[scenario_cols].head(6).to_string(index=False, max_colwidth=80))
    print(f"\nRisk report written to: {REPORT_FILE}")
    return report


if __name__ == "__main__":
    analyze_stores()
