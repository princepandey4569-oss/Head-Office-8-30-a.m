"""Generate reproducible, varied FreshBasket demo data.

The demo contains two dated snapshots for sales, customers and wastage so the
analyzer can explain changes rather than relying only on single-day totals.
Running this script overwrites CSV files in ./data.
"""
from __future__ import annotations

from pathlib import Path
import numpy as np
import pandas as pd

DATA_DIR = Path(__file__).parent / "data"
NUM_STORES = 1_000
NUM_PRODUCTS = 100
NUM_PURCHASE_ORDERS = 5_000
SEED = 42


def main(seed: int | None = None) -> None:
    """Generate the source datasets. Passing a seed makes a new demo batch reproducible."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    effective_seed = SEED if seed is None else int(seed)
    rng = np.random.default_rng(effective_seed)
    today = pd.Timestamp.today().normalize()
    previous_date = today - pd.Timedelta(days=7)
    current_date = today

    print(f"Generating FreshBasket demo data (seed={effective_seed})…", flush=True)

    # 1. Store master. Region is a larger operating territory; area is a
    # smaller assigned cluster within that territory. This supports a genuine
    # management hierarchy instead of using the same city field for every tier.
    store_ids = np.array([f"Store_{i:04d}" for i in range(1, NUM_STORES + 1)])
    locations = rng.choice(["Bengaluru", "Mysuru", "Hubballi", "Mangaluru", "Chennai"], NUM_STORES)
    region_by_location = {
        "Bengaluru": "Karnataka South", "Mysuru": "Karnataka South",
        "Hubballi": "Karnataka North", "Mangaluru": "Karnataka Coast",
        "Chennai": "Tamil Nadu",
    }
    areas_by_location = {
        "Bengaluru": ["Bengaluru North", "Bengaluru Central", "Bengaluru South"],
        "Mysuru": ["Mysuru East", "Mysuru Central", "Mysuru West"],
        "Hubballi": ["Hubballi North", "Hubballi Central", "Hubballi South"],
        "Mangaluru": ["Mangaluru North", "Mangaluru Coastal", "Mangaluru South"],
        "Chennai": ["Chennai North", "Chennai Central", "Chennai South"],
    }
    regions = np.array([region_by_location[str(location)] for location in locations])
    areas = np.array([rng.choice(areas_by_location[str(location)]) for location in locations])
    stores = pd.DataFrame({
        "store_id": store_ids,
        "location": locations,
        "region": regions,
        "area": areas,
        "franchisee": [f"Franchisee_{i:04d}" for i in range(1, NUM_STORES + 1)],
        "format": rng.choice(["Express", "Standard", "Large"], NUM_STORES, p=[0.35, 0.45, 0.20]),
        "status": "Active",
    })
    stores.to_csv(DATA_DIR / "stores.csv", index=False)

    # 2. Product catalogue. Perishability and shelf-life are kept together to
    # support expiry-risk checks in the analyzer.
    categories = rng.choice(["Dairy", "Vegetables", "Fruits", "Bakery", "Packaged"], NUM_PRODUCTS)
    perishability = np.select(
        [np.isin(categories, ["Dairy", "Vegetables", "Bakery"]), np.isin(categories, ["Fruits"])],
        ["High", "Medium"], default="Low"
    )
    shelf_life = np.where(
        perishability == "High", rng.integers(2, 12, NUM_PRODUCTS),
        np.where(perishability == "Medium", rng.integers(4, 22, NUM_PRODUCTS), rng.integers(30, 181, NUM_PRODUCTS))
    )
    product_prices = rng.integers(20, 501, NUM_PRODUCTS)
    # Synthetic unit cost is an explicit demo extension so the agent can flag
    # gross-margin pressure rather than pretending revenue alone is margin.
    unit_costs = np.maximum(1, np.rint(product_prices * rng.uniform(0.55, 0.82, NUM_PRODUCTS))).astype(int)
    products = pd.DataFrame({
        "sku": [f"SKU{i:04d}" for i in range(1, NUM_PRODUCTS + 1)],
        "category": categories,
        "price": product_prices,
        "unit_cost": unit_costs,
        "perishability": perishability,
        "shelf_life_days": shelf_life,
    })
    products.to_csv(DATA_DIR / "products.csv", index=False)

    # Store-by-product arrays used by the dated data tables.
    store_grid = np.repeat(store_ids, NUM_PRODUCTS)
    sku_grid = np.tile(products["sku"].to_numpy(), NUM_STORES)
    prices = products.set_index("sku")["price"]
    row_count = NUM_STORES * NUM_PRODUCTS

    # 3. Sales snapshots: previous week and current day. A shared store trend
    # plus modest SKU noise gives most stores stable sales with some variation.
    baseline_qty = rng.integers(18, 86, row_count)
    store_trend = np.clip(rng.normal(0.0, 0.035, NUM_STORES), -0.10, 0.10)
    sku_noise = rng.uniform(-0.06, 0.06, row_count)
    current_qty = np.maximum(1, np.rint(baseline_qty * (1 + np.repeat(store_trend, NUM_PRODUCTS) + sku_noise))).astype(int)
    sales_previous = pd.DataFrame({
        "store_id": store_grid,
        "sku": sku_grid,
        "qty_sold": baseline_qty,
        "revenue": baseline_qty * sku_grid.astype(object),  # replaced below with price lookup
        "date": previous_date.strftime("%Y-%m-%d"),
    })
    sales_previous["revenue"] = sales_previous["qty_sold"] * sales_previous["sku"].map(prices)
    sales_current = pd.DataFrame({
        "store_id": store_grid,
        "sku": sku_grid,
        "qty_sold": current_qty,
        "revenue": current_qty * sku_grid.astype(object),  # replaced below with price lookup
        "date": current_date.strftime("%Y-%m-%d"),
    })
    sales_current["revenue"] = sales_current["qty_sold"] * sales_current["sku"].map(prices)
    pd.concat([sales_previous, sales_current], ignore_index=True).to_csv(DATA_DIR / "sales.csv", index=False)

    # 4. Current inventory. Healthy stock cover varies by product type: fresh
    # categories carry fewer days of stock, while packaged goods can hold more.
    # The injector below introduces deliberate exceptions for the demo.
    sku_perishability = np.tile(products["perishability"].to_numpy(), NUM_STORES)
    cover_days = np.where(
        sku_perishability == "High", rng.uniform(1.05, 1.85, row_count),
        np.where(
            sku_perishability == "Medium", rng.uniform(1.6, 3.8, row_count),
            rng.uniform(3.5, 12.0, row_count),
        ),
    )
    stock = np.maximum(0, np.rint(current_qty * cover_days)).astype(int)
    reorder_days = rng.uniform(0.55, 0.90, row_count)
    reorder_level = np.maximum(4, np.rint(current_qty * reorder_days)).astype(int)
    inventory = pd.DataFrame({
        "store_id": store_grid,
        "sku": sku_grid,
        "stock": stock,
        "reorder_level": reorder_level,
    })
    inventory.to_csv(DATA_DIR / "inventory.csv", index=False)

    # 5. Wastage snapshots for the same comparison dates. Baselines are positive
    # so percentage-change calculations remain meaningful.
    wastage_previous_qty = rng.integers(1, 4, row_count)
    wastage_current_qty = np.maximum(1, np.rint(wastage_previous_qty * rng.uniform(0.90, 1.10, row_count))).astype(int)
    wastage_previous = pd.DataFrame({
        "store_id": store_grid,
        "sku": sku_grid,
        "qty_wasted": wastage_previous_qty,
        "reason": rng.choice(["Expired", "Damaged", "Overstocked"], row_count, p=[0.40, 0.20, 0.40]),
        "date": previous_date.strftime("%Y-%m-%d"),
    })
    wastage_current = pd.DataFrame({
        "store_id": store_grid,
        "sku": sku_grid,
        "qty_wasted": wastage_current_qty,
        "reason": rng.choice(["Expired", "Damaged", "Overstocked"], row_count, p=[0.40, 0.20, 0.40]),
        "date": current_date.strftime("%Y-%m-%d"),
    })
    pd.concat([wastage_previous, wastage_current], ignore_index=True).to_csv(DATA_DIR / "wastage.csv", index=False)

    # 6. Purchase orders. Delays are relatively uncommon before the scenarios
    # are injected, avoiding a network where almost every store is high-risk.
    po_count = NUM_PURCHASE_ORDERS
    purchase_orders = pd.DataFrame({
        "po": [f"PO{i:05d}" for i in range(1, po_count + 1)],
        "supplier": rng.choice([f"Supplier_{i:03d}" for i in range(1, 101)], po_count),
        "sku": rng.choice(products["sku"], po_count),
        "qty": rng.integers(10, 101, po_count),
        # Normal orders are expected today or in the next six days. Overdue
        # deliveries are introduced deliberately by inject_problem.py.
        "expected_date": (today + pd.to_timedelta(rng.integers(0, 7, po_count), unit="D")).strftime("%Y-%m-%d"),
        "status": rng.choice(["Pending", "Dispatched", "Delivered", "Delayed"], po_count, p=[0.22, 0.20, 0.57, 0.01]),
        "store_id": rng.choice(store_ids, po_count),
    })
    purchase_orders.to_csv(DATA_DIR / "purchase_orders.csv", index=False)

    # 7. Customer snapshots. Current values are linked to the prior snapshot,
    # allowing the analyzer to compare traffic, transactions and basket value.
    previous_footfall = rng.integers(180, 901, NUM_STORES)
    current_footfall = np.maximum(50, np.rint(previous_footfall * rng.uniform(0.94, 1.06, NUM_STORES))).astype(int)
    previous_transactions = np.maximum(30, np.rint(previous_footfall * rng.uniform(0.30, 0.58, NUM_STORES))).astype(int)
    current_transactions = np.maximum(20, np.rint(previous_transactions * rng.uniform(0.90, 1.10, NUM_STORES))).astype(int)
    previous_bill = rng.integers(180, 851, NUM_STORES)
    current_bill = np.maximum(80, np.rint(previous_bill * rng.uniform(0.94, 1.06, NUM_STORES))).astype(int)
    previous_complaints = rng.integers(2, 13, NUM_STORES)
    current_complaints = np.maximum(0, np.rint(previous_complaints * rng.uniform(0.75, 1.25, NUM_STORES))).astype(int)

    # Synthetic feedback themes make the customer signal diagnosable instead of
    # leaving the agent with one unexplained complaint total. Theme counts add up
    # exactly to complaints in each snapshot; the named scenario injector can
    # then create a believable shelf-availability / fresh-quality pattern.
    def split_complaints(total: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        stock_share = rng.uniform(0.35, 0.60, NUM_STORES)
        quality_share = rng.uniform(0.15, 0.30, NUM_STORES)
        stock_theme = np.floor(total * stock_share).astype(int)
        quality_theme = np.floor(total * quality_share).astype(int)
        service_theme = np.maximum(0, total - stock_theme - quality_theme).astype(int)
        return stock_theme, quality_theme, service_theme

    prev_stock_complaints, prev_quality_complaints, prev_service_complaints = split_complaints(previous_complaints)
    curr_stock_complaints, curr_quality_complaints, curr_service_complaints = split_complaints(current_complaints)
    customers = pd.concat([
        pd.DataFrame({
            "store_id": store_ids, "date": previous_date.strftime("%Y-%m-%d"),
            "footfall": previous_footfall, "transactions": previous_transactions,
            "avg_bill_value": previous_bill,
            "complaints": previous_complaints,
            "stock_availability_complaints": prev_stock_complaints,
            "fresh_quality_complaints": prev_quality_complaints,
            "service_complaints": prev_service_complaints,
        }),
        pd.DataFrame({
            "store_id": store_ids, "date": current_date.strftime("%Y-%m-%d"),
            "footfall": current_footfall, "transactions": current_transactions,
            "avg_bill_value": current_bill,
            "complaints": current_complaints,
            "stock_availability_complaints": curr_stock_complaints,
            "fresh_quality_complaints": curr_quality_complaints,
            "service_complaints": curr_service_complaints,
        }),
    ], ignore_index=True)
    customers.to_csv(DATA_DIR / "customers.csv", index=False)

    # 8. Staff and compliance snapshots.
    staff = pd.DataFrame({
        "store_id": store_ids,
        "attendance": rng.uniform(0.78, 0.99, NUM_STORES).round(2),
        "staffing_level": rng.integers(6, 21, NUM_STORES),
        "productivity": rng.uniform(0.62, 0.98, NUM_STORES).round(2),
    })
    staff.to_csv(DATA_DIR / "staff.csv", index=False)

    compliance = pd.DataFrame({
        "store_id": store_ids,
        "checklist_score": rng.integers(75, 101, NUM_STORES),
        "open_issues": rng.integers(0, 4, NUM_STORES),
        "last_inspection": today.strftime("%Y-%m-%d"),
    })
    compliance.to_csv(DATA_DIR / "compliance.csv", index=False)

    print(f"Created {NUM_STORES:,} stores and {NUM_PRODUCTS} products.")
    print("Saved dated sales, customer/complaint and wastage snapshots plus inventory, orders, staff and compliance.")
    print(f"Data directory: {DATA_DIR}")
    print("Next: python inject_problem.py, then python data_analyzer.py")


if __name__ == "__main__":
    main()
