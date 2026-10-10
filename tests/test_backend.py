from __future__ import annotations

import json

import pandas as pd
import pytest
from fastapi.testclient import TestClient

import backend
from data_analyzer import get_priority


@pytest.fixture()
def client(tmp_path, monkeypatch):
    report = pd.DataFrame([
        {
            "store_id": "Store_0001", "location": "Bengaluru", "region": "Karnataka South", "area": "Bengaluru Central", "format": "Standard",
            "risk_score": 82, "priority": "Critical", "urgency_rank": 1,
            "detected_problems": "Sales are down 18%; 12 products are low-stock",
            "recommended_actions": "Prepare a replenishment proposal;Review shelf availability",
            "root_cause": "Low stock and sales decline appear together.",
            "sales_change_pct": -18.0, "wastage_growth_pct": 28.0,
            "low_stock_count": 12, "delayed_orders": 2,
            "inventory_problem": True, "wastage_problem": True,
            "supplier_problem": True, "compliance_problem": False,
            "staffing_problem": False, "sales_problem": True,
            "customer_problem": True, "expiry_problem": False,
            "estimated_fresh_wastage_cost_current": 1250.0,
            "estimated_fresh_wastage_cost_change": 250.0,
            "fresh_wastage_current": 5,
            "fresh_wastage_previous": 3,
            "fresh_wastage_growth_pct": 28.0,
            "low_stock_items_json": json.dumps([
                {"sku": "SKU0001", "stock": 2, "daily_sales": 4, "reorder_level": 25,
                 "proposed_replenishment_units": 25, "unit_cost": 10, "unit_price": 20,
                 "shelf_life_days": 60}
            ]),
            "expiry_items_json": json.dumps([
                {"sku": "SKU0009", "stock": 15, "daily_sales": 2, "shelf_life_days": 3,
                 "unit_price": 100, "unit_cost": 40, "estimated_stock_cost": 600}
            ]),
            "transfer_candidates_json": json.dumps([
                {"sku": "SKU0001", "from_store": "Store_0002", "to_store": "Store_0001",
                 "available_surplus_units": 15, "suggested_units": 10,
                 "donor_current_stock_units": 80, "donor_daily_sales": 10,
                 "donor_reorder_level": 30, "donor_safety_reserve_units": 30,
                 "donor_days_of_stock_before": 8.0,
                 "receiver_days_of_stock": 0.5}
            ]),
            "data_as_of": "2026-10-09",
        },
        {
            "store_id": "Store_0002", "location": "Mysuru", "region": "Karnataka South", "area": "Mysuru Central", "format": "Express",
            "risk_score": 12, "priority": "Low", "urgency_rank": 2,
            "detected_problems": "No major operational issue detected",
            "recommended_actions": "Continue routine monitoring and complete the daily store checks",
            "root_cause": "No linked exception pattern found.",
            "sales_change_pct": 2.0, "wastage_growth_pct": 0.0,
            "low_stock_count": 0, "delayed_orders": 0,
            "inventory_problem": False, "wastage_problem": False,
            "supplier_problem": False, "compliance_problem": False,
            "staffing_problem": False, "sales_problem": False,
            "customer_problem": False, "expiry_problem": False,
            "data_as_of": "2026-10-09",
        },
    ])
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    report_file = data_dir / "store_risk_report.csv"
    report.to_csv(report_file, index=False)
    monkeypatch.setattr(backend, "DATA_DIR", data_dir)
    monkeypatch.setattr(backend, "REPORT_FILE", report_file)
    monkeypatch.setattr(backend, "APPROVAL_FILE", data_dir / "approved_actions.csv")
    with TestClient(backend.app) as test_client:
        yield test_client


def test_risk_priority_thresholds():
    assert get_priority(70) == "Critical"
    assert get_priority(69) == "High"
    assert get_priority(50) == "High"
    assert get_priority(49) == "Medium"
    assert get_priority(30) == "Medium"
    assert get_priority(29) == "Low"


def test_health_and_dashboard_are_data_driven(client):
    health = client.get("/api/health")
    dashboard = client.get("/api/dashboard")
    assert health.status_code == 200
    assert health.json()["report_ready"] is True
    assert dashboard.status_code == 200
    assert dashboard.json()["total_stores"] == 2
    assert dashboard.json()["critical_stores"] == 1
    assert dashboard.json()["low_stores"] == 1
    assert dashboard.json()["average_risk_score"] == 47.0


def test_store_filters_and_ranked_order(client):
    response = client.get("/api/stores", params={"priority": "Critical", "order": "ranked"})
    assert response.status_code == 200
    assert response.json()["count"] == 1
    assert response.json()["stores"][0]["store_id"] == "Store_0001"
    searched = client.get("/api/stores", params={"search": "Mysuru"})
    assert searched.json()["count"] == 1
    assert searched.json()["stores"][0]["store_id"] == "Store_0002"


def test_agent_morning_brief_exposes_ranked_human_review_flow(client):
    response = client.get("/api/agent/morning-brief", params={"limit": 2})
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_stores"] == 2
    assert payload["human_approval_required"] is True
    assert payload["execution_mode"] == "simulated_only"
    assert payload["decision_loop"] == [
        "Observe signals", "Connect related evidence", "Compare response options",
        "Recommend a next move", "Wait for manager approval",
    ]
    assert payload["decisions"][0]["store_id"] == "Store_0001"


def test_serialize_record_decodes_structured_decision_fields():
    result = backend.serialize_record({
        "store_id": "Store_0001",
        "signal_links_json": '[{"title":"Shelf gaps","evidence":["12 low-stock SKUs"]}]',
        "action_options_json": '[{"title":"Transfer stock","recommended":true}]',
        "low_stock_items_json": '[{"sku":"SKU001","proposed_replenishment_units":10}]',
        "complaint_themes_json": '[{"label":"Shelf availability","current":3,"previous":1,"change_pct":200.0}]',
    })
    assert result["signal_links"][0]["title"] == "Shelf gaps"
    assert result["action_options"][0]["recommended"] is True
    assert result["low_stock_items"][0]["proposed_replenishment_units"] == 10
    assert result["complaint_themes"][0]["label"] == "Shelf availability"
    assert "signal_links_json" not in result


def test_problem_summary_and_tasks(client):
    summary = client.get("/api/problem-summary").json()
    inventory = next(item for item in summary["problems"] if item["key"] == "inventory_problem")
    assert inventory["count"] == 1
    tasks = client.get("/api/stores/Store_0001/tasks")
    assert tasks.status_code == 200
    assert len(tasks.json()["tasks"]) == 2


def test_action_decision_persists_and_is_simulated(client):
    payload = {
        "store_id": "Store_0001",
        "action": "Prepare a replenishment proposal",
        "decision": "Approved",
        "manager_note": "Review fast movers first.",
    }
    response = client.post("/api/actions", json=payload)
    assert response.status_code == 200
    assert response.json()["execution_status"] == "Simulated"
    history = client.get("/api/actions").json()
    assert history["count"] == 1
    assert history["actions"][0]["manager_note"] == "Review fast movers first."
    assert history["actions"][0]["manager_name"] == "Manager"


def test_unrecommended_action_is_rejected(client):
    response = client.post("/api/actions", json={
        "store_id": "Store_0001", "action": "Order a thousand bananas",
        "decision": "Approved", "manager_note": "Not an actual system action",
    })
    assert response.status_code == 400


def test_unknown_store_is_not_found(client):
    assert client.get("/api/stores/Store_9999").status_code == 404



def test_stock_balancing_limits_suggestions_to_known_donor_surplus(client):
    response = client.get("/api/stock-balancing", params={"limit": 10})
    assert response.status_code == 200
    payload = response.json()
    assert payload["allocation_method"] == "priority-ranked, same-SKU, donor-surplus-capped, reserve-protected"
    assert payload["count"] == 1
    proposal = payload["transfers"][0]
    assert proposal["from_store"] == "Store_0002"
    assert proposal["to_store"] == "Store_0001"
    assert proposal["suggested_units"] == 10
    assert proposal["estimated_units_value"] == 100
    assert proposal["donor_current_stock_units"] == 80
    assert proposal["donor_safety_reserve_units"] == 30
    assert proposal["donor_stock_after_proposal"] == 70
    assert proposal["donor_reserve_protected"] is True
    assert proposal["network_safety_status"] == "Protected"
    assert "Verify physical stock" in proposal["allocation_note"]


def test_waste_expiry_endpoint_returns_flagged_stores_and_value_caveat(client):
    response = client.get("/api/waste-expiry", params={"limit": 10})
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    store = payload["stores"][0]
    assert store["store_id"] == "Store_0001"
    assert store["wastage_problem"] is True
    assert store["expiry_problem"] is True
    assert store["estimated_fresh_wastage_cost_current"] == 1250
    assert "not finance-validated" in payload["value_basis"]


def test_decision_simulator_caps_transfers_and_does_not_mutate_report(client):
    before = client.get("/api/stores/Store_0001").json()
    response = client.post("/api/decision/simulate", json={
        "store_id": "Store_0001", "kind": "transfer", "sku": "SKU0001", "quantity": 50,
    })
    assert response.status_code == 200
    result = response.json()
    assert result["quantity"] == 10
    assert result["maximum_feasible_units"] == 10
    assert result["quantity_cap_applied"] is True
    assert result["donor_current_stock_units"] == 80
    assert result["donor_safety_reserve_units"] == 30
    assert result["donor_stock_after_transfer"] == 70
    assert result["donor_reserve_protected"] is True
    assert result["network_safety_status"] == "Protected"
    assert result["shortage_units_before"] == 23
    assert result["shortage_units_after"] == 13
    assert result["persistent_change"] is False
    assert "No inventory" in result["notice"]
    after = client.get("/api/stores/Store_0001").json()
    assert before["risk_score"] == after["risk_score"]


def test_decision_simulator_allows_zero_units_as_a_no_op(client):
    response = client.post("/api/decision/simulate", json={
        "store_id": "Store_0001", "kind": "transfer", "sku": "SKU0001", "quantity": 0,
    })
    assert response.status_code == 200
    result = response.json()
    assert result["quantity"] == 0
    assert result["stock_after"] == result["current_stock"]
    assert result["shortage_units_after"] == result["shortage_units_before"]
    assert result["quantity_cap_applied"] is False


def test_wait_simulation_reports_baseline_without_changing_stock(client):
    response = client.post("/api/decision/simulate", json={
        "store_id": "Store_0001", "kind": "wait",
    })
    assert response.status_code == 200
    result = response.json()
    assert result["quantity"] == 0
    assert result["current_stock"] == result["stock_after"] == 2
    assert result["days_of_cover_before"] == result["days_of_cover_after"] == 0.5
    assert result["shortage_units_before"] == result["shortage_units_after"] == 23
    assert result["persistent_change"] is False


def test_decision_simulator_explains_markdown_assumptions(client):
    response = client.post("/api/decision/simulate", json={
        "store_id": "Store_0001", "kind": "markdown", "sku": "SKU0009", "markdown_percent": 15,
    })
    assert response.status_code == 200
    result = response.json()
    assert result["markdown_percent"] == 15
    assert result["illustrative_sell_through_units"] >= result["baseline_sell_through_units"]
    assert result["estimated_revenue_at_markdown"] is not None
    assert any("illustrative" in item.lower() for item in result["assumptions"])
    assert result["persistent_change"] is False


def test_action_history_records_explicit_manager_identity(client):
    response = client.post("/api/actions", json={
        "store_id": "Store_0001", "action": "Prepare a replenishment proposal",
        "decision": "Rejected", "manager_note": "Check transfer first.", "manager_name": "Priya Nair",
    })
    assert response.status_code == 200
    history = client.get("/api/actions").json()["actions"]
    assert history[0]["manager_name"] == "Priya Nair"
    assert history[0]["decision"] == "Rejected"
    assert history[0]["execution_status"] == "Not run — rejected"

def test_demo_refresh_rebuilds_report_and_persists_timestamp(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    report_file = data_dir / "store_risk_report.csv"
    baseline = pd.DataFrame([
        {
            "store_id": f"Store_{i:04d}", "risk_score": 10, "priority": "Low",
            "detected_problems": "Routine monitoring", "recommended_actions": "Review daily checks",
        }
        for i in range(1, 1001)
    ])
    baseline.to_csv(report_file, index=False)
    monkeypatch.setattr(backend, "BASE_DIR", tmp_path)
    monkeypatch.setattr(backend, "DATA_DIR", data_dir)
    monkeypatch.setattr(backend, "REPORT_FILE", report_file)
    monkeypatch.setattr(backend, "APPROVAL_FILE", data_dir / "approved_actions.csv")

    seeds = []
    source_files = [
        "stores.csv", "products.csv", "sales.csv", "inventory.csv",
        "wastage.csv", "purchase_orders.csv", "customers.csv", "staff.csv", "compliance.csv",
    ]

    def fake_generate(seed=None):
        seeds.append(seed)
        for filename in source_files:
            (backend.data_generator.DATA_DIR / filename).write_text("synthetic", encoding="utf-8")

    def fake_inject():
        return None

    def fake_analyze():
        priorities = (["Critical"] * 2) + (["High"] * 3) + (["Medium"] * 5) + (["Low"] * 990)
        report = pd.DataFrame({
            "store_id": [f"Store_{i:04d}" for i in range(1, 1001)],
            "risk_score": [80] * 2 + [60] * 3 + [40] * 5 + [10] * 990,
            "priority": priorities,
            "detected_problems": ["Demo finding"] * 1000,
            "recommended_actions": ["Review demo finding"] * 1000,
            "data_as_of": ["2026-10-09"] * 1000,
        })
        report.to_csv(backend.data_analyzer.REPORT_FILE, index=False)
        return report

    monkeypatch.setattr(backend.data_generator, "main", fake_generate)
    monkeypatch.setattr(backend.inject_problem, "main", fake_inject)
    monkeypatch.setattr(backend.data_analyzer, "analyze_stores", fake_analyze)

    with TestClient(backend.app) as test_client:
        response = test_client.post("/api/demo/refresh")
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["total_stores"] == 1000
        assert payload["critical_stores"] == 2
        assert payload["high_stores"] == 3
        assert payload["medium_stores"] == 5
        assert payload["low_stores"] == 990
        current_dashboard = test_client.get("/api/dashboard").json()
        assert current_dashboard["last_refreshed_at"] == payload["refreshed_at"]

    assert len(seeds) == 1
    assert isinstance(seeds[0], int)
    assert (data_dir / "demo_refresh.json").exists()


def test_workforce_overview_routes_risk_tiers_to_designations(client):
    response = client.get('/api/workforce/overview')
    assert response.status_code == 200
    payload = response.json()
    roles = {role['key']: role for role in payload['roles']}
    assert roles['head']['priority'] == 'Critical'
    assert roles['regional']['priority'] == 'High'
    assert roles['area']['priority'] == 'Medium'
    assert roles['store']['priority'] == 'Low'
    assert roles['shift']['priority'] == 'Routine'
    assert roles['head']['store_count'] == 1
    assert roles['store']['store_count'] == 1
    assert payload['routing_policy']['Critical'] == 'Head of Franchise Operations'
    assert payload['demo_only'] is True


def test_workforce_tasks_are_scoped_to_role_and_store(client):
    head = client.get('/api/workforce/tasks', params={'designation': 'head'}).json()
    assert head['designation'] == 'head'
    assert head['tasks']
    assert all(task['priority'] == 'Critical' for task in head['tasks'])
    assert all(task['owner_role'] == 'Head of Franchise Operations' for task in head['tasks'])

    store = client.get('/api/workforce/tasks', params={'designation': 'store', 'store_id': 'Store_0002'})
    assert store.status_code == 200
    assert store.json()['tasks']
    assert all(task['store_id'] == 'Store_0002' for task in store.json()['tasks'])

    shift = client.get('/api/workforce/tasks', params={'designation': 'shift', 'store_id': 'Store_0001'})
    assert shift.status_code == 200
    assert len(shift.json()['tasks']) >= 3
    assert all(task['owner_role'] == 'Shift Supervisor' for task in shift.json()['tasks'])


def test_workforce_requires_store_scope_for_local_roles(client):
    assert client.get('/api/workforce/tasks', params={'designation': 'store'}).status_code == 422
    assert client.get('/api/workforce/tasks', params={'designation': 'shift'}).status_code == 422
    assert client.get('/api/workforce/tasks', params={'designation': 'shift', 'store_id': 'Store_9999'}).status_code == 404


def test_action_approval_is_limited_to_the_priority_owner(client):
    payload = {
        'store_id': 'Store_0001',
        'action': 'Prepare a replenishment proposal',
        'decision': 'Approved',
        'manager_note': 'Correct owner check',
        'manager_name': 'Area Operator',
        'manager_designation': 'area',
    }
    response = client.post('/api/actions', json=payload)
    assert response.status_code == 403
    assert 'Head of Franchise Operations' in response.json()['detail']

    payload['manager_designation'] = 'shift'
    response = client.post('/api/actions', json=payload)
    assert response.status_code == 403
    assert 'Shift Supervisors' in response.json()['detail']


def test_workforce_queues_obey_region_and_area_scope(client):
    report = pd.read_csv(backend.REPORT_FILE)
    base = report.iloc[1].copy()
    records = []
    for store_id, priority, score, location, region, area in [
        ("Store_0003", "High", 58, "Hubballi", "Karnataka North", "Hubballi Central"),
        ("Store_0004", "High", 56, "Bengaluru", "Karnataka South", "Bengaluru North"),
        ("Store_0005", "Medium", 42, "Bengaluru", "Karnataka South", "Bengaluru North"),
        ("Store_0006", "Medium", 41, "Bengaluru", "Karnataka South", "Bengaluru Central"),
    ]:
        row = base.copy()
        row["store_id"] = store_id
        row["priority"] = priority
        row["risk_score"] = score
        row["location"] = location
        row["region"] = region
        row["area"] = area
        report = pd.concat([report, pd.DataFrame([row])], ignore_index=True)
        records.append(row)
    report.to_csv(backend.REPORT_FILE, index=False)

    regional = client.get('/api/workforce/tasks', params={
        'designation': 'regional', 'region': 'Karnataka North'
    })
    assert regional.status_code == 200
    assert {task['store_id'] for task in regional.json()['tasks']} == {'Store_0003'}
    assert all(task['priority'] == 'High' for task in regional.json()['tasks'])

    area = client.get('/api/workforce/tasks', params={
        'designation': 'area', 'region': 'Karnataka South', 'area': 'Bengaluru North'
    })
    assert area.status_code == 200
    assert {task['store_id'] for task in area.json()['tasks']} == {'Store_0005'}
    assert area.json()['area'] == 'Bengaluru North'
    assert all(task['priority'] == 'Medium' for task in area.json()['tasks'])


def test_area_manager_action_must_match_assigned_area(client):
    report = pd.read_csv(backend.REPORT_FILE)
    row = report.iloc[1].copy()
    row['store_id'] = 'Store_0003'
    row['priority'] = 'Medium'
    row['risk_score'] = 42
    row['location'] = 'Bengaluru'
    row['region'] = 'Karnataka South'
    row['area'] = 'Bengaluru North'
    report = pd.concat([report, pd.DataFrame([row])], ignore_index=True)
    report.to_csv(backend.REPORT_FILE, index=False)
    payload = {
        'store_id': 'Store_0003',
        'action': 'Continue routine monitoring and complete the daily store checks',
        'decision': 'Approved',
        'manager_name': 'Area Operator',
        'manager_designation': 'area',
        'manager_region': 'Karnataka South',
        'manager_area': 'Bengaluru Central',
    }
    response = client.post('/api/actions', json=payload)
    assert response.status_code == 403
    assert 'assigned operating area' in response.json()['detail']
    payload['manager_area'] = 'Bengaluru North'
    response = client.post('/api/actions', json=payload)
    assert response.status_code == 200
    assert response.json()['manager_area'] == 'Bengaluru North'
    recorded = client.get('/api/actions').json()['actions'][0]
    assert recorded['manager_area'] == 'Bengaluru North'
