from __future__ import annotations

import json

import data_analyzer
import data_generator
import inject_problem


def test_challenge_four_story_is_supported_by_source_signals(tmp_path, monkeypatch):
    """Run the real synthetic pipeline and verify the named Challenge 04 case."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setattr(data_generator, "DATA_DIR", data_dir)
    monkeypatch.setattr(inject_problem, "DATA_DIR", data_dir)
    monkeypatch.setattr(data_analyzer, "DATA_DIR", data_dir)
    monkeypatch.setattr(data_analyzer, "REPORT_FILE", data_dir / "store_risk_report.csv")

    data_generator.main(seed=42)
    inject_problem.main()
    report = data_analyzer.analyze_stores()

    assert {"region", "area"}.issubset(report.columns)
    assert report["region"].notna().all()
    assert report["area"].notna().all()

    case = report.loc[report["store_id"] == "Store_0017"].iloc[0]
    assert case["priority"] == "Critical"
    assert abs(float(case["sales_change_pct"]) - (-18.0)) <= 1.0
    assert abs(float(case["footfall_change_pct"]) - (-5.0)) <= 1.0
    assert abs(float(case["transactions_change_pct"]) - (-15.0)) <= 1.5
    assert abs(float(case["fresh_wastage_growth_pct"]) - 28.0) <= 1.0
    assert int(case["low_stock_count"]) == 12
    assert int(case["delayed_orders"]) >= 2
    assert bool(case["inventory_problem"])
    assert bool(case["supplier_problem"])
    assert bool(case["wastage_problem"])
    assert bool(case["sales_problem"])
    assert bool(case["customer_problem"])
    assert bool(case["complaints_problem"])

    links = json.loads(case["signal_links_json"])
    options = json.loads(case["action_options_json"])
    transfers = json.loads(case["transfer_candidates_json"])
    low_stock_items = json.loads(case["low_stock_items_json"])
    complaint_themes = json.loads(case["complaint_themes_json"])
    assert len(links) >= 3
    assert len(options) >= 3
    assert sum(bool(option["recommended"]) for option in options) == 1
    assert len(transfers) > 0
    assert len(low_stock_items) >= 6
    for transfer in transfers:
        assert transfer["donor_safety_reserve_units"] >= transfer["donor_reorder_level"]
        assert transfer["donor_current_stock_units"] - transfer["suggested_units"] >= transfer["donor_safety_reserve_units"]
        assert transfer["donor_reserve_protected"] is True
    assert "shelf gaps" in links[0]["title"].lower() or "inbound delays" in links[0]["title"].lower()
    assert any(option["kind"] == "supplier" for option in options)
    assert any(option["kind"] == "waste" for option in options)
    assert complaint_themes[0]["label"] == "Shelf availability"
    assert sum(theme["current"] for theme in complaint_themes) == int(case["complaints_current"])
    assert case["risk_score"] >= case["risk_score_base"]
    assert int(case["risk_floor_adjustment"]) >= 0

    # A separate scenario validates the challenge's gross-margin warning. This
    # uses explicitly marked synthetic unit costs; it is not real finance data.
    margin_case = report.loc[report["store_id"] == "Store_0045"].iloc[0]
    assert bool(margin_case["margin_problem"])
    assert float(margin_case["gross_margin_change_pp"]) <= -5.0
