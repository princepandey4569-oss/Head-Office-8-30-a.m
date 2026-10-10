"""FastAPI service for the FreshBasket operations dashboard."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Literal
import json
import os
import secrets
import tempfile
from threading import Lock

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
import data_analyzer
import data_generator
import inject_problem
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
REPORT_FILE = DATA_DIR / "store_risk_report.csv"
APPROVAL_FILE = DATA_DIR / "approved_actions.csv"
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
_refresh_lock = Lock()
_last_demo_seed: int | None = None
FRONTEND_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    *[origin.strip() for origin in os.getenv("FRONTEND_ORIGINS", "").split(",") if origin.strip()],
]

# Demo delegation policy: one accountable owner per risk tier. Store-level
# execution tasks can be delegated further, but the risk owner remains clear.
DESIGNATION_CONFIG = {
    "head": {
        "key": "head", "label": "Head of Franchise Operations", "level": 1,
        "priority": "Critical", "scope": "Network-wide", "due_label": "Immediate",
        "description": "Owns critical incidents and the network morning brief.",
    },
    "regional": {
        "key": "regional", "label": "Regional Operations Manager", "level": 2,
        "priority": "High", "scope": "Assigned region", "due_label": "Today",
        "description": "Owns high-priority cases and reports critical escalations upward.",
    },
    "area": {
        "key": "area", "label": "Area Operations Manager", "level": 3,
        "priority": "Medium", "scope": "Assigned operating area", "due_label": "Today", 
        "description": "Owns medium-priority cases and coordinates follow-through across stores.",
    },
    "store": {
        "key": "store", "label": "Store Manager", "level": 4,
        "priority": "Low", "scope": "Assigned store", "due_label": "This shift",
        "description": "Owns low-risk store follow-up and local remediation tasks.",
    },
    "shift": {
        "key": "shift", "label": "Shift Supervisor", "level": 5,
        "priority": "Routine", "scope": "Assigned store / current shift", "due_label": "This shift",
        "description": "Completes physical checks, shelf verification and shift handover tasks.",
    },
}
PRIORITY_OWNER = {"Critical": "head", "High": "regional", "Medium": "area", "Low": "store"}
DEMO_REGIONS = ["Karnataka South", "Karnataka North", "Karnataka Coast", "Tamil Nadu"]
DEMO_AREAS_BY_REGION = {
    "Karnataka South": ["Bengaluru North", "Bengaluru Central", "Bengaluru South", "Mysuru East", "Mysuru Central", "Mysuru West"],
    "Karnataka North": ["Hubballi North", "Hubballi Central", "Hubballi South"],
    "Karnataka Coast": ["Mangaluru North", "Mangaluru Coastal", "Mangaluru South"],
    "Tamil Nadu": ["Chennai North", "Chennai Central", "Chennai South"],
}


def normalize_designation(value: str | None) -> str:
    """Normalize a demo designation key/label to its hierarchy key."""
    candidate = str(value or "head").strip().lower()
    if candidate in DESIGNATION_CONFIG:
        return candidate
    for key, config in DESIGNATION_CONFIG.items():
        if candidate == config["label"].lower():
            return key
    raise HTTPException(status_code=422, detail="Unknown designation. Choose a supported FreshBasket role.")


def priority_owner_label(priority: str | None) -> str:
    key = PRIORITY_OWNER.get(str(priority or "Low").title(), "store")
    return DESIGNATION_CONFIG[key]["label"]

app = FastAPI(
    title="FreshBasket AI API",
    description="Operational intelligence for the FreshBasket franchise network.",
    version="1.1.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class ActionRequest(BaseModel):
    store_id: str = Field(min_length=1, max_length=80)
    action: str = Field(min_length=3, max_length=500)
    decision: Literal["Approved", "Rejected"]
    manager_note: str = Field(default="", max_length=1000)
    manager_name: str = Field(default="Manager", min_length=1, max_length=80)
    manager_designation: str = Field(default="head", min_length=2, max_length=40)
    manager_region: str | None = Field(default=None, max_length=80)
    manager_area: str | None = Field(default=None, max_length=80)
    manager_store_id: str | None = Field(default=None, max_length=80)


class SimulationRequest(BaseModel):
    store_id: str = Field(min_length=1, max_length=80)
    kind: Literal["transfer", "replenishment", "markdown", "wait"]
    sku: str | None = Field(default=None, max_length=80)
    quantity: int | None = Field(default=None, ge=0, le=100000)
    markdown_percent: float = Field(default=10, ge=0, le=50)


def load_refresh_metadata() -> dict:
    """Read the last successful simulated refresh timestamp, if present."""
    try:
        with (DATA_DIR / "demo_refresh.json").open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return payload if isinstance(payload, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def write_refresh_metadata(payload: dict) -> None:
    """Persist refresh metadata atomically so a restart keeps the last update time."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    handle, temporary_name = tempfile.mkstemp(prefix="demo_refresh_", suffix=".json", dir=DATA_DIR)
    os.close(handle)
    try:
        with open(temporary_name, "w", encoding="utf-8") as stream:
            json.dump(payload, stream, ensure_ascii=False, indent=2)
        os.replace(temporary_name, DATA_DIR / "demo_refresh.json")
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)


def regenerate_demo_snapshot() -> dict:
    """Re-analyze the currently installed franchise dataset without replacing it.

    The supplied Challenge 04 dataset is authoritative. Refresh must never invoke
    the legacy generator/injector because those scripts create a different 1,000-
    store schema and would silently replace the user's new data.
    """
    if not _refresh_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="A data refresh is already in progress.")
    try:
        analyzed_report = data_analyzer.analyze_stores()
        if analyzed_report.empty:
            raise RuntimeError("Analysis returned an empty store report.")
        refreshed_at = datetime.now().astimezone().isoformat(timespec="seconds")
        metadata = {"refreshed_at": refreshed_at, "mode": "provided_dataset_reanalysis"}
        write_refresh_metadata(metadata)
        counts = analyzed_report["priority"].astype(str).str.title().value_counts()
        avg_risk = pd.to_numeric(analyzed_report["risk_score"], errors="coerce").fillna(0).mean()
        return {
            "message": "The installed franchise dataset was re-analyzed. Source CSV files were not changed.",
            "refreshed_at": refreshed_at,
            "total_stores": int(len(analyzed_report)),
            "critical_stores": int(counts.get("Critical", 0)),
            "high_stores": int(counts.get("High", 0)),
            "medium_stores": int(counts.get("Medium", 0)),
            "low_stores": int(counts.get("Low", 0)),
            "average_risk_score": round(float(avg_risk), 1),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not analyze the installed dataset: {exc}") from exc
    finally:
        _refresh_lock.release()


def load_report() -> pd.DataFrame:
    if not REPORT_FILE.exists():
        raise HTTPException(
            status_code=503,
            detail="Risk report not found. Run data_generator.py, inject_problem.py and data_analyzer.py first.",
        )
    try:
        report = pd.read_csv(REPORT_FILE)
    except (OSError, pd.errors.ParserError) as exc:
        raise HTTPException(status_code=503, detail=f"Could not read the store risk report: {exc}") from exc
    required = {"store_id", "risk_score", "priority", "detected_problems", "recommended_actions"}
    missing = required - set(report.columns)
    if missing:
        raise HTTPException(status_code=503, detail=f"Risk report is missing required columns: {', '.join(sorted(missing))}")
    report["store_id"] = report["store_id"].astype(str)
    report["priority"] = report["priority"].astype(str).str.title()
    return report


def load_approvals() -> pd.DataFrame:
    columns = ["timestamp", "store_id", "action", "decision", "execution_status", "manager_note", "manager_name", "manager_designation", "manager_region", "manager_area", "manager_store_id"]
    if not APPROVAL_FILE.exists():
        return pd.DataFrame(columns=columns)
    try:
        history = pd.read_csv(APPROVAL_FILE).fillna("")
    except (OSError, pd.errors.ParserError):
        return pd.DataFrame(columns=columns)
    for column in columns:
        if column not in history.columns:
            history[column] = ""
    return history[columns]


def save_approval(store_id: str, action: str, decision: str, manager_note: str, manager_name: str = "Manager", manager_designation: str = "head", manager_region: str | None = None, manager_store_id: str | None = None, manager_area: str | None = None) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    new_record = pd.DataFrame([{
        "timestamp": datetime.now().astimezone().isoformat(timespec="seconds"),
        "store_id": store_id,
        "action": action,
        "decision": decision,
        "execution_status": "Simulated" if decision == "Approved" else "Not run — rejected",
        "manager_note": manager_note.strip(),
        "manager_name": manager_name.strip() or "Manager",
        "manager_designation": manager_designation.strip() or "head",
        "manager_region": (manager_region or "").strip(),
        "manager_area": (manager_area or "").strip(),
        "manager_store_id": (manager_store_id or "").strip(),
    }])
    updated = pd.concat([load_approvals(), new_record], ignore_index=True)

    # Replace atomically so a partial write is less likely to damage action history.
    handle, temporary_name = tempfile.mkstemp(prefix="approved_actions_", suffix=".csv", dir=DATA_DIR)
    os.close(handle)
    try:
        updated.to_csv(temporary_name, index=False)
        os.replace(temporary_name, APPROVAL_FILE)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)


JSON_REPORT_FIELDS = {
    "signal_links_json": "signal_links",
    "low_stock_items_json": "low_stock_items",
    "expiry_items_json": "expiry_items",
    "transfer_candidates_json": "transfer_candidates",
    "action_options_json": "action_options",
    "complaint_themes_json": "complaint_themes",
}


def serialize_record(record: dict) -> dict:
    """Convert one report row to JSON-safe values and decode structured briefs."""
    result = {}
    for key, value in record.items():
        if key in JSON_REPORT_FIELDS:
            continue
        if value is None:
            result[key] = None
        elif pd.isna(value):
            result[key] = None
        elif hasattr(value, "item"):
            result[key] = value.item()
        else:
            result[key] = value

    for column, public_name in JSON_REPORT_FIELDS.items():
        if column not in record:
            continue
        raw_value = record[column]
        if raw_value is None or (isinstance(raw_value, float) and pd.isna(raw_value)):
            result[public_name] = []
            continue
        try:
            parsed = json.loads(str(raw_value))
            result[public_name] = parsed if isinstance(parsed, list) else []
        except (TypeError, json.JSONDecodeError):
            result[public_name] = []
    return result


def as_bool_series(report: pd.DataFrame, column: str) -> pd.Series:
    if column not in report.columns:
        return pd.Series(False, index=report.index)
    value = report[column]
    if value.dtype == bool:
        return value.fillna(False)
    return value.astype(str).str.strip().str.lower().isin(["true", "1", "yes"])


@app.get("/")
def home():
    """Serve the React app when built, otherwise retain a useful API root response."""
    index_file = FRONTEND_DIST / "index.html"
    if index_file.is_file():
        return FileResponse(index_file, media_type="text/html")
    return {"message": "FreshBasket AI API", "status": "running", "docs": "/docs"}


@app.get("/api/health")
def health() -> dict:
    report_ready = REPORT_FILE.exists()
    return {
        "status": "connected" if report_ready else "waiting_for_data",
        "report_ready": report_ready,
        "service": "FreshBasket AI API",
        "version": app.version,
        "last_refreshed_at": load_refresh_metadata().get("refreshed_at"),
    }


@app.post("/api/demo/refresh")
def refresh_demo_data() -> dict:
    """Explicitly simulate a new report batch for demos; normal GETs stay read-only."""
    return regenerate_demo_snapshot()


@app.get("/api/dashboard")
def dashboard() -> dict:
    report = load_report()
    counts = report["priority"].value_counts()
    return {
        "total_stores": int(len(report)),
        "critical_stores": int(counts.get("Critical", 0)),
        "high_stores": int(counts.get("High", 0)),
        "medium_stores": int(counts.get("Medium", 0)),
        "low_stores": int(counts.get("Low", 0)),
        "average_risk_score": round(float(pd.to_numeric(report["risk_score"], errors="coerce").fillna(0).mean()), 1),
        "data_as_of": str(report["data_as_of"].max()) if "data_as_of" in report.columns and not report.empty else None,
        "last_refreshed_at": load_refresh_metadata().get("refreshed_at"),
    }


@app.get("/api/agent/morning-brief")
def agent_morning_brief(limit: int = Query(default=5, ge=1, le=10)) -> dict:
    """Return the agent's ranked intervention queue with evidence and alternatives."""
    report = load_report()
    if "urgency_rank" in report.columns:
        ranked = report.sort_values(["urgency_rank", "risk_score"], ascending=[True, False])
    else:
        ranked = report.sort_values("risk_score", ascending=False)
    counts = report["priority"].value_counts() if "priority" in report.columns else pd.Series(dtype=int)
    attention_count = int(counts.get("Critical", 0) + counts.get("High", 0))
    decisions = []
    for raw in ranked.head(limit).to_dict(orient="records"):
        store = serialize_record(raw)
        decisions.append({
            "store_id": store.get("store_id"),
            "location": store.get("location"),
            "risk_score": store.get("risk_score"),
            "priority": store.get("priority"),
            "detected_problems": store.get("detected_problems"),
            "root_cause": store.get("root_cause"),
            "signal_links": store.get("signal_links", []),
            "action_options": store.get("action_options", []),
            "recommended_actions": store.get("recommended_actions"),
        })
    return {
        "as_of": str(report["data_as_of"].max()) if "data_as_of" in report.columns and not report.empty else None,
        "last_refreshed_at": load_refresh_metadata().get("refreshed_at"),
        "total_stores": int(len(report)),
        "attention_count": attention_count,
        "decision_loop": ["Observe signals", "Connect related evidence", "Compare response options", "Recommend a next move", "Wait for manager approval"],
        "human_approval_required": True,
        "execution_mode": "simulated_only",
        "decisions": decisions,
    }


@app.get("/api/problem-summary")
def problem_summary() -> dict:
    report = load_report()
    flags = [
        ("Inventory shortages", "inventory_problem"),
        ("Unusual wastage", "wastage_problem"),
        ("Supplier delays", "supplier_problem"),
        ("Compliance", "compliance_problem"),
        ("Staffing", "staffing_problem"),
        ("Sales performance", "sales_problem"),
        ("Gross-margin pressure", "margin_problem"),
        ("Customer activity", "customer_problem"),
        ("Customer complaints", "complaints_problem"),
        ("Expiry risk", "expiry_problem"),
    ]
    return {
        "problems": [
            {"label": label, "count": int(as_bool_series(report, column).sum()), "key": column}
            for label, column in flags
        ]
    }


@app.get("/api/stores")
def get_stores(
    priority: str | None = Query(default=None),
    search: str | None = Query(default=None, max_length=100),
    order: Literal["mixed", "ranked", "random", "shuffle"] = "mixed",
    limit: int = Query(default=1000, ge=1, le=2000),
) -> dict:
    report = load_report()
    if priority and priority.lower() != "all":
        report = report[report["priority"].str.lower() == priority.lower()]
    if search:
        mask = report["store_id"].str.contains(search.strip(), case=False, na=False, regex=False)
        for column in ["detected_problems", "root_cause", "location"]:
            if column in report.columns:
                mask = mask | report[column].astype(str).str.contains(search.strip(), case=False, na=False, regex=False)
        report = report[mask]

    if order == "ranked":
        sort_columns = [col for col in ["urgency_rank", "risk_score", "total_wastage"] if col in report.columns]
        report = report.sort_values(
            sort_columns,
            ascending=[True, False, False][:len(sort_columns)],
        ) if sort_columns else report.sort_values("risk_score", ascending=False)
    elif order in {"random", "shuffle"}:
        # Explicit random mode is available when a caller truly wants an
        # unrestricted shuffle. Scores and priorities are never recalculated.
        report = report.sample(frac=1).reset_index(drop=True)
    else:
        # Mix the presentation without changing risk values. Interleave
        # priority groups so a dominant Low group does not fill the first page.
        priority_order = ["Critical", "High", "Medium", "Low"]
        buckets = {}
        for level in priority_order:
            bucket = report[report["priority"].str.lower() == level.lower()]
            if not bucket.empty:
                buckets[level] = bucket.sample(frac=1, random_state=None).index.tolist()
        ordered_indices = []
        cursor = {level: 0 for level in buckets}
        while True:
            added = False
            for level in priority_order:
                rows = buckets.get(level, [])
                position = cursor.get(level, 0)
                if position < len(rows):
                    ordered_indices.append(rows[position])
                    cursor[level] = position + 1
                    added = True
            if not added:
                break
        if ordered_indices:
            report = report.loc[ordered_indices]

    report = report.head(limit)
    records = [serialize_record(row) for row in report.to_dict(orient="records")]
    return {"count": len(records), "stores": records}


@app.get("/api/stores/{store_id}/tasks")
def get_store_tasks(store_id: str) -> dict:
    report = load_report()
    store = report[report["store_id"] == store_id]
    if store.empty:
        raise HTTPException(status_code=404, detail="Store not found")
    row = store.iloc[0]
    raw_actions = str(row.get("recommended_actions", ""))
    tasks = [part.strip() for part in raw_actions.split(";") if part.strip()]
    return {
        "store_id": store_id,
        "risk_score": int(row.get("risk_score", 0)),
        "priority": str(row.get("priority", "Low")),
        "root_cause": str(row.get("root_cause", "Review current store signals.")),
        "tasks": [{"id": index + 1, "title": task, "status": "Pending"} for index, task in enumerate(tasks)],
    }


def _recommended_actions_for_row(row: dict) -> list[str]:
    actions = [part.strip() for part in str(row.get("recommended_actions", "") or "").split(";") if part.strip()]
    return actions or ["Review current store signals and confirm the next operational step."]


def _local_execution_tasks(store: dict) -> list[dict]:
    """Create store-scoped execution tasks without taking ownership of an escalated case."""
    tasks: list[dict] = []
    def flag(name: str) -> bool:
        value = store.get(name, False)
        return str(value).strip().lower() in {"true", "1", "yes"} if not isinstance(value, bool) else value

    if flag("inventory_problem") or int(store.get("low_stock_count", 0) or 0) > 0:
        tasks.append({"title": "Verify fast-moving shelf availability and confirm physical counts.", "category": "Inventory"})
    if flag("wastage_problem") or flag("expiry_problem"):
        tasks.append({"title": "Inspect fresh date codes, rotate stock and record waste reasons.", "category": "Waste & expiry"})
    if flag("supplier_problem") or int(store.get("delayed_orders", 0) or 0) > 0:
        tasks.append({"title": "Confirm delayed delivery status and update the receiving handover.", "category": "Supplier follow-up"})
    if flag("compliance_problem"):
        tasks.append({"title": "Complete open compliance checklist items and record evidence.", "category": "Compliance"})
    if flag("staffing_problem"):
        tasks.append({"title": "Review shift coverage and document any service-capacity gaps.", "category": "Staffing"})
    if flag("customer_problem") or flag("complaints_problem"):
        tasks.append({"title": "Record unresolved customer concerns and report repeat issues.", "category": "Customer experience"})
    if not tasks:
        tasks.append({"title": "Complete the daily opening, shelf-availability and handover checklist.", "category": "Routine"})
    return tasks


@app.get("/api/workforce/overview")
def workforce_overview() -> dict:
    """Summarize how network store cases route through the designation hierarchy."""
    report = load_report()
    roles = []
    for key in ["head", "regional", "area", "store", "shift"]:
        config = DESIGNATION_CONFIG[key]
        if key == "shift":
            store_count = int(len(report))
            task_count = sum(3 + len(_local_execution_tasks(row)) for row in report.to_dict(orient="records"))
        else:
            tier = config["priority"]
            subset = report[report["priority"].astype(str).str.title() == tier]
            store_count = int(len(subset))
            task_count = sum(len(_recommended_actions_for_row(row)) for row in subset.to_dict(orient="records"))
        roles.append({**config, "store_count": store_count, "task_count": task_count,
                      "priority_owner": key != "shift"})
    counts = report["priority"].astype(str).str.title().value_counts()
    return {
        "total_stores": int(len(report)),
        "roles": roles,
        "routing_policy": {"Critical": DESIGNATION_CONFIG["head"]["label"],
                           "High": DESIGNATION_CONFIG["regional"]["label"],
                           "Medium": DESIGNATION_CONFIG["area"]["label"],
                           "Low": DESIGNATION_CONFIG["store"]["label"],
                           "Routine": DESIGNATION_CONFIG["shift"]["label"]},
        "risk_counts": {level: int(counts.get(level, 0)) for level in ["Critical", "High", "Medium", "Low"]},
        "demo_only": True,
        "note": "Counts are computed from the current synthetic report. Role selection demonstrates routing only; production access requires authenticated accounts and server-side permissions.",
    }


@app.get("/api/workforce/tasks")
def workforce_tasks(
    designation: str = Query(default="head", min_length=2, max_length=40),
    region: str | None = Query(default=None, max_length=80),
    area: str | None = Query(default=None, max_length=80),
    store_id: str | None = Query(default=None, max_length=80),
    limit: int = Query(default=200, ge=1, le=1000),
) -> dict:
    """Return work assigned to a role using the current report and explicit scope."""
    role_key = normalize_designation(designation)
    role = DESIGNATION_CONFIG[role_key]
    report = load_report()
    if role_key in {"store", "shift"}:
        if not store_id:
            raise HTTPException(status_code=422, detail="A store ID is required for Store Manager and Shift Supervisor roles.")
        scoped = report[report["store_id"].astype(str).str.upper() == store_id.strip().upper()]
        if scoped.empty:
            raise HTTPException(status_code=404, detail=f"Store {store_id} was not found in the current report.")
        rows = scoped.to_dict(orient="records")
    else:
        scoped = report.copy()
        if role_key in {"regional", "area"}:
            if not region:
                raise HTTPException(status_code=422, detail="An assigned operating region is required for this role.")
            if "region" in scoped.columns and scoped["region"].notna().any():
                region_values = scoped["region"].astype(str)
            else:
                # Backward compatibility for older test/user datasets with only city-level location.
                region_values = scoped.get("location", pd.Series("", index=scoped.index)).astype(str)
            scoped = scoped[region_values.str.casefold() == region.strip().casefold()]
        if role_key == "area":
            if not area:
                raise HTTPException(status_code=422, detail="An assigned operating area is required for Area Operations Managers.")
            permitted_areas = DEMO_AREAS_BY_REGION.get(region.strip(), [])
            if permitted_areas and area.strip() not in permitted_areas:
                raise HTTPException(status_code=422, detail="The selected area does not belong to the assigned region.")
            if "area" in scoped.columns and scoped["area"].notna().any():
                scoped = scoped[scoped["area"].astype(str).str.casefold() == area.strip().casefold()]
            # On legacy datasets without area labels, the selected region remains the best available scope.
        rows = scoped.to_dict(orient="records")

    tasks: list[dict] = []
    escalation_count = 0
    if role_key in {"head", "regional", "area"}:
        target_priority = role["priority"]
        # Include escalations count separately so a lower tier knows upward cases exist
        # without transferring ownership of those cases away from their assigned role.
        for row in rows:
            priority = str(row.get("priority", "Low")).title()
            if role_key != "head" and priority == "Critical":
                escalation_count += 1
            if priority != target_priority:
                continue
            store = serialize_record(row)
            for index, action in enumerate(_recommended_actions_for_row(store), start=1):
                tasks.append({
                    "id": f"{store.get('store_id')}::{role_key}::{index}",
                    "store_id": store.get("store_id"), "location": store.get("location") or "—",
                    "task": action, "priority": priority, "risk_score": float(store.get("risk_score", 0) or 0),
                    "owner_role": role["label"], "assignment_type": "Primary case ownership",
                    "due_label": role["due_label"], "escalated_to": None,
                    "detected_problems": store.get("detected_problems", ""),
                })
    elif role_key == "store":
        store = serialize_record(rows[0])
        priority = str(store.get("priority", "Low")).title()
        primary_owner = priority_owner_label(priority)
        if priority == "Low":
            for index, action in enumerate(_recommended_actions_for_row(store), start=1):
                tasks.append({
                    "id": f"{store.get('store_id')}::store::{index}", "store_id": store.get("store_id"),
                    "location": store.get("location") or "—", "task": action, "priority": priority,
                    "risk_score": float(store.get("risk_score", 0) or 0), "owner_role": role["label"],
                    "assignment_type": "Primary low-priority ownership", "due_label": "This shift",
                    "escalated_to": None, "detected_problems": store.get("detected_problems", ""),
                })
        else:
            for index, local_task in enumerate(_local_execution_tasks(store), start=1):
                tasks.append({
                    "id": f"{store.get('store_id')}::store-local::{index}", "store_id": store.get("store_id"),
                    "location": store.get("location") or "—", "task": local_task["title"],
                    "priority": priority, "risk_score": float(store.get("risk_score", 0) or 0),
                    "owner_role": role["label"], "assignment_type": f"Local execution · {local_task['category']}",
                    "due_label": "This shift", "escalated_to": primary_owner,
                    "detected_problems": store.get("detected_problems", ""),
                })
    else:  # shift supervisor: a local execution checklist for one assigned store.
        store = serialize_record(rows[0])
        priority = str(store.get("priority", "Low")).title()
        routine = [
            {"title": "Spot-check key shelves and report any unavailable fast movers.", "category": "Shelf checks"},
            {"title": "Inspect fresh-product date codes and rotate stock using first-expiry-first-out.", "category": "Fresh stock"},
            {"title": "Complete the shift handover and record unresolved customer or service issues.", "category": "Shift handover"},
        ]
        for index, item in enumerate(routine, start=1):
            tasks.append({
                "id": f"{store.get('store_id')}::shift::{index}", "store_id": store.get("store_id"),
                "location": store.get("location") or "—", "task": item["title"], "priority": priority,
                "risk_score": float(store.get("risk_score", 0) or 0), "owner_role": role["label"],
                "assignment_type": f"Routine execution · {item['category']}", "due_label": "This shift",
                "escalated_to": priority_owner_label(priority) if priority != "Low" else "Store Manager",
                "detected_problems": store.get("detected_problems", ""),
            })
        for index, item in enumerate(_local_execution_tasks(store), start=len(tasks) + 1):
            tasks.append({
                "id": f"{store.get('store_id')}::shift-issue::{index}", "store_id": store.get("store_id"),
                "location": store.get("location") or "—", "task": item["title"], "priority": priority,
                "risk_score": float(store.get("risk_score", 0) or 0), "owner_role": role["label"],
                "assignment_type": f"Issue verification · {item['category']}", "due_label": "This shift",
                "escalated_to": priority_owner_label(priority) if priority != "Low" else "Store Manager",
                "detected_problems": store.get("detected_problems", ""),
            })

    priority_sort = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    tasks.sort(key=lambda item: (priority_sort.get(item["priority"], 4), -float(item.get("risk_score", 0))))
    return {
        "designation": role_key, "designation_label": role["label"],
        "scope": "Assigned operating area" if role_key == "area" else role["scope"],
        "region": region if role_key in {"regional", "area"} else None,
        "area": area if role_key == "area" else None,
        "store_id": store_id if role_key in {"store", "shift"} else None,
        "count": len(tasks[:limit]), "total_tasks": len(tasks), "tasks": tasks[:limit],
        "escalation_count": escalation_count, "demo_only": True,
        "note": "Assignments are calculated from synthetic Challenge 04 data. Critical ownership remains with the Head of Franchise Operations; lower-level execution tasks do not transfer incident ownership.",
    }


@app.get("/api/stores/{store_id}")
def get_store(store_id: str) -> dict:
    report = load_report()
    store = report[report["store_id"] == store_id]
    if store.empty:
        raise HTTPException(status_code=404, detail="Store not found")
    return serialize_record(store.iloc[0].to_dict())


@app.get("/api/stock-balancing")
def stock_balancing(limit: int = Query(default=100, ge=1, le=1000)) -> dict:
    """Return suggested same-SKU transfers, limiting over-allocation per donor SKU."""
    report = load_report()
    records = [serialize_record(row) for row in report.to_dict(orient="records")]
    stores_by_id = {str(store.get("store_id")): store for store in records}
    candidates = []
    for receiver in records:
        for candidate in receiver.get("transfer_candidates", []) or []:
            sku = str(candidate.get("sku", ""))
            donor_id = str(candidate.get("from_store", ""))
            receiver_id = str(candidate.get("to_store", receiver.get("store_id", "")))
            if not sku or not donor_id or not receiver_id or donor_id == receiver_id:
                continue
            donor = stores_by_id.get(donor_id, {})
            donor_stock = candidate.get("donor_current_stock_units")
            donor_reserve = candidate.get("donor_safety_reserve_units")
            donor_daily_sales = max(0, int(candidate.get("donor_daily_sales", 0) or 0))
            candidates.append({
                **candidate,
                "from_store": donor_id,
                "to_store": receiver_id,
                "donor_priority": donor.get("priority", "Low"),
                "donor_risk_score": int(donor.get("risk_score", 0) or 0),
                "receiver_priority": receiver.get("priority", "Low"),
                "receiver_risk_score": int(receiver.get("risk_score", 0) or 0),
                "receiver_problems": receiver.get("detected_problems", ""),
                "receiver_root_cause": receiver.get("root_cause", ""),
                "receiver_days_of_stock": float(candidate.get("receiver_days_of_stock", 0) or 0),
                "donor_days_of_stock_before": candidate.get("donor_days_of_stock_before"),
                "donor_safety_reserve_units": int(donor_reserve) if donor_reserve is not None else None,
                "donor_current_stock_units": int(donor_stock) if donor_stock is not None else None,
                "estimated_units_value": round(float(candidate.get("suggested_units", 0) or 0) * float(next((x.get("unit_cost", 0) for x in receiver.get("low_stock_items", []) if str(x.get("sku")) == sku), 0) or 0), 2),
                "donor_daily_sales": donor_daily_sales,
            })
    priority_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    candidates.sort(key=lambda item: (
        priority_order.get(str(item.get("receiver_priority", "Low")), 4),
        -int(item.get("receiver_risk_score", 0)),
        float(item.get("receiver_days_of_stock", 99)),
    ))
    remaining_surplus = {}
    starting_surplus = {}
    output = []
    seen = set()
    for candidate in candidates:
        key = (candidate["from_store"], candidate["sku"])
        route_key = (candidate["sku"], candidate["from_store"], candidate["to_store"])
        if route_key in seen:
            continue
        seen.add(route_key)
        if key not in remaining_surplus:
            initial = max(0, int(candidate.get("available_surplus_units", 0) or 0))
            remaining_surplus[key] = initial
            starting_surplus[key] = initial
        qty = min(max(0, int(candidate.get("suggested_units", 0) or 0)), remaining_surplus[key])
        remaining_surplus[key] -= qty
        if qty <= 0:
            continue
        candidate["suggested_units"] = qty
        candidate["remaining_donor_surplus_after_proposal"] = remaining_surplus[key]
        donor_stock = candidate.get("donor_current_stock_units")
        donor_reserve = candidate.get("donor_safety_reserve_units")
        # Account for higher-priority proposals already allocated from this same
        # donor/SKU. All proposals share one surplus budget, not one budget each.
        total_allocated = starting_surplus[key] - remaining_surplus[key]
        donor_after = max(0, int(donor_stock) - total_allocated) if donor_stock is not None else None
        reserve_protected = (donor_after >= int(donor_reserve)) if donor_after is not None and donor_reserve is not None else None
        candidate["donor_stock_after_proposal"] = donor_after
        candidate["donor_days_of_stock_after_proposal"] = round(donor_after / candidate["donor_daily_sales"], 2) if donor_after is not None and candidate.get("donor_daily_sales", 0) else None
        candidate["donor_reserve_protected"] = reserve_protected
        candidate["network_safety_status"] = "Protected" if reserve_protected is True else ("Check donor data" if reserve_protected is None else "Unsafe — review allocation")
        candidate["allocation_note"] = (
            "Network-safe estimate: proposals are ranked by recipient urgency, surplus is allocated once per donor/SKU, "
            "and the donor reserve is protected by the analyzer rule. Verify physical stock and upcoming donor demand before approval."
        )
        output.append(candidate)
    return {
        "count": len(output[:limit]),
        "transfers": output[:limit],
        "allocation_method": "priority-ranked, same-SKU, donor-surplus-capped, reserve-protected",
        "safety_policy": "Keep donor stock at or above max(reorder level, 1.2 days of recent SKU demand).",
        "human_verification_required": True,
    }


@app.get("/api/waste-expiry")
def waste_expiry(limit: int = Query(default=250, ge=1, le=1000)) -> dict:
    """Return stores with wastage or perishable cover requiring a closer look."""
    report = load_report()
    records = [serialize_record(row) for row in report.to_dict(orient="records")]
    flagged = []
    for store in records:
        expiry_items = store.get("expiry_items", []) or []
        fresh_growth = float(store.get("fresh_wastage_growth_pct", 0) or 0)
        overall_growth = float(store.get("wastage_growth_pct", 0) or 0)
        has_waste = bool(store.get("wastage_problem", False)) or fresh_growth >= 20 or overall_growth >= 25
        has_expiry = bool(expiry_items) or bool(store.get("expiry_problem", False))
        if not (has_waste or has_expiry):
            continue
        flagged.append({
            "store_id": store.get("store_id"), "location": store.get("location"),
            "priority": store.get("priority"), "risk_score": store.get("risk_score"),
            "wastage_problem": has_waste, "expiry_problem": has_expiry,
            "fresh_wastage_current": store.get("fresh_wastage_current", 0),
            "fresh_wastage_previous": store.get("fresh_wastage_previous", 0),
            "fresh_wastage_growth_pct": fresh_growth,
            "wastage_growth_pct": overall_growth,
            "estimated_fresh_wastage_cost_current": store.get("estimated_fresh_wastage_cost_current", 0),
            "estimated_fresh_wastage_cost_change": store.get("estimated_fresh_wastage_cost_change", 0),
            "expiry_items": expiry_items,
            "root_cause": store.get("root_cause", ""),
            "recommended_actions": store.get("recommended_actions", ""),
            "action_options": store.get("action_options", []),
        })
    flagged.sort(key=lambda item: (
        bool(item["expiry_problem"]) and bool(item["wastage_problem"]),
        float(item.get("fresh_wastage_growth_pct", 0) or 0),
        int(item.get("risk_score", 0) or 0),
    ), reverse=True)
    return {"count": len(flagged[:limit]), "stores": flagged[:limit], "value_basis": "Synthetic unit cost, not finance-validated COGS."}


@app.post("/api/decision/simulate")
def simulate_decision(request: SimulationRequest) -> dict:
    """Run a non-persistent what-if calculation using the current report evidence."""
    report = load_report()
    match = report[report["store_id"] == request.store_id]
    if match.empty:
        raise HTTPException(status_code=404, detail="Store not found")
    store = serialize_record(match.iloc[0].to_dict())
    low_items = store.get("low_stock_items", []) or []
    expiry_items = store.get("expiry_items", []) or []
    selected = None
    if request.kind in {"transfer", "replenishment"}:
        selected = next((item for item in low_items if request.sku and str(item.get("sku")) == request.sku), None)
        if selected is None and low_items:
            selected = low_items[0]
        if selected is None:
            raise HTTPException(status_code=400, detail="This store has no SKU-level low-stock item to simulate.")
    elif request.kind == "markdown":
        selected = next((item for item in expiry_items if request.sku and str(item.get("sku")) == request.sku), None)
        if selected is None and expiry_items:
            selected = expiry_items[0]
        if selected is None:
            raise HTTPException(status_code=400, detail="This store has no SKU-level expiry item to simulate.")

    result = {"store_id": request.store_id, "kind": request.kind, "sku": request.sku, "assumptions": [], "persistent_change": False}
    if request.kind in {"transfer", "replenishment"}:
        stock = int(selected.get("stock", 0) or 0)
        daily_sales = max(1, int(selected.get("daily_sales", 0) or 0))
        if request.kind == "transfer":
            # Use the network-wide allocation, not the receiver's raw candidate
            # alone. This prevents the same donor surplus being promised in full
            # to several recipient stores in parallel.
            global_proposals = stock_balancing(limit=1000).get("transfers", [])
            candidate = next((item for item in global_proposals
                              if str(item.get("to_store")) == request.store_id
                              and str(item.get("sku")) == str(selected.get("sku"))), None)
            local_candidate = next((item for item in (store.get("transfer_candidates", []) or [])
                                    if str(item.get("sku")) == str(selected.get("sku"))), None)
            available = int(candidate.get("available_surplus_units", 0) or 0) if candidate else 0
            suggested_units = int(candidate.get("suggested_units", 0) or 0) if candidate else 0
            maximum_feasible = min(available, suggested_units) if candidate else 0
            requested_qty = int(request.quantity if request.quantity is not None else maximum_feasible)
            quantity = min(max(0, requested_qty), maximum_feasible)
            result["donor_store"] = candidate.get("from_store") if candidate else (local_candidate.get("from_store") if local_candidate else None)
            result["available_surplus_units"] = available
            result["maximum_feasible_units"] = maximum_feasible
            result["quantity"] = quantity
            result["quantity_cap_applied"] = requested_qty > maximum_feasible
            donor_stock = candidate.get("donor_current_stock_units") if candidate else (local_candidate.get("donor_current_stock_units") if local_candidate else None)
            donor_reserve = candidate.get("donor_safety_reserve_units") if candidate else (local_candidate.get("donor_safety_reserve_units") if local_candidate else None)
            donor_daily = int((candidate or local_candidate or {}).get("donor_daily_sales", 0) or 0)
            donor_after = max(0, int(donor_stock) - quantity) if donor_stock is not None else None
            reserve_protected = (donor_after >= int(donor_reserve)) if donor_after is not None and donor_reserve is not None else None
            result.update({
                "donor_current_stock_units": int(donor_stock) if donor_stock is not None else None,
                "donor_safety_reserve_units": int(donor_reserve) if donor_reserve is not None else None,
                "donor_stock_after_transfer": donor_after,
                "donor_days_of_stock_before": round(int(donor_stock) / donor_daily, 2) if donor_stock is not None and donor_daily > 0 else None,
                "donor_days_of_stock_after": round(donor_after / donor_daily, 2) if donor_after is not None and donor_daily > 0 else None,
                "donor_reserve_protected": reserve_protected,
                "network_safety_status": "Protected" if reserve_protected is True else ("Check donor data" if reserve_protected is None else "Reserve would be breached"),
            })
            result["action_summary"] = f"Transfer {quantity} unit(s) of {selected.get('sku')} from {result['donor_store']} to {request.store_id}" if quantity else "No network-safe transfer quantity is available from a donor store in this snapshot."
            result["assumptions"].append("Transfer quantity is capped by the network-wide surplus allocation and estimated donor reserve; verify physical shelf count and upcoming donor demand before approval.")
        else:
            proposed = int(selected.get("proposed_replenishment_units", 0) or 0)
            quantity = int(request.quantity if request.quantity is not None else proposed)
            result["quantity"] = max(0, quantity)
            result["estimated_cost"] = round(quantity * float(selected.get("unit_cost", 0) or 0), 2) if selected.get("unit_cost") is not None else None
            result["action_summary"] = f"Replenish {quantity} unit(s) of {selected.get('sku')} at {request.store_id}"
            result["assumptions"].append("Synthetic unit cost is for demonstration only and is not finance-validated.")
        after_stock = stock + int(result.get("quantity", 0))
        result.update({
            "current_stock": stock,
            "reorder_level": int(selected.get("reorder_level", 0) or 0),
            "daily_sales": daily_sales,
            "days_of_cover_before": round(stock / daily_sales, 2),
            "days_of_cover_after": round(after_stock / daily_sales, 2),
            "reorder_gap_units_before": max(0, int(selected.get("reorder_level", 0) or 0) - stock),
            "reorder_gap_units_after": max(0, int(selected.get("reorder_level", 0) or 0) - after_stock),
            "target_stock_units": int(selected.get("target_stock_units", selected.get("reorder_level", 0)) or 0),
            "shortage_units_before": max(0, int(selected.get("target_stock_units", selected.get("reorder_level", 0)) or 0) - stock),
            "shortage_units_after": max(0, int(selected.get("target_stock_units", selected.get("reorder_level", 0)) or 0) - after_stock),
            "stock_after": after_stock,
        })
    elif request.kind == "markdown":
        stock = int(selected.get("stock", 0) or 0)
        daily_sales = max(1, int(selected.get("daily_sales", 0) or 0))
        shelf_life = max(1, int(selected.get("shelf_life_days", 0) or 0))
        discount = float(request.markdown_percent)
        baseline_units = min(stock, daily_sales * shelf_life)
        uplift_factor = min(1.5, 1 + discount * 0.02)
        projected_units = min(stock, int(round(baseline_units * uplift_factor)))
        price = float(selected.get("unit_price", 0) or 0)
        result.update({
            "quantity": stock, "current_stock": stock, "daily_sales": daily_sales,
            "shelf_life_days": shelf_life, "days_of_cover_before": round(stock / daily_sales, 2),
            "markdown_percent": discount, "baseline_sell_through_units": baseline_units,
            "illustrative_sell_through_units": projected_units,
            "additional_units_cleared_estimate": max(0, projected_units - baseline_units),
            "estimated_revenue_at_markdown": round(projected_units * price * (1 - discount / 100), 2) if price else None,
            "action_summary": f"Model a {discount:.0f}% markdown for {selected.get('sku')} at {request.store_id}",
            "assumptions": ["Markdown uplift is an illustrative scenario factor, not a learned forecast.", "Shelf-life days are catalog defaults in this synthetic demo; inspect actual date codes before acting."],
        })
    else:
        # The no-op scenario should still expose the current position so a manager
        # can compare it with transfer / order / markdown alternatives.
        baseline_item = next((item for item in low_items if request.sku and str(item.get("sku")) == request.sku), None)
        if baseline_item is None and low_items:
            baseline_item = low_items[0]
        if baseline_item is None and expiry_items:
            baseline_item = expiry_items[0]
        result.update({
            "action_summary": f"Wait and continue monitoring {request.store_id}",
            "quantity": 0,
            "current_risk_score": int(store.get("risk_score", 0) or 0),
            "assumptions": ["This baseline makes no operational change; it is useful only as a comparison case."],
        })
        if baseline_item is not None:
            stock = int(baseline_item.get("stock", 0) or 0)
            daily_sales = max(1, int(baseline_item.get("daily_sales", 0) or 0))
            target_stock = int(baseline_item.get("target_stock_units", baseline_item.get("reorder_level", stock)) or stock)
            result.update({
                "sku": str(baseline_item.get("sku", "")),
                "current_stock": stock,
                "stock_after": stock,
                "daily_sales": daily_sales,
                "days_of_cover_before": round(stock / daily_sales, 2),
                "days_of_cover_after": round(stock / daily_sales, 2),
                "target_stock_units": target_stock,
                "shortage_units_before": max(0, target_stock - stock),
                "shortage_units_after": max(0, target_stock - stock),
            })
    result["notice"] = "Simulation only. No inventory, orders, prices, or external systems were changed."
    return result


@app.post("/api/actions")
def create_action(request: ActionRequest) -> dict:
    report = load_report()
    store = report[report["store_id"] == request.store_id]
    if store.empty:
        raise HTTPException(status_code=404, detail="Store not found")
    if not request.action.strip():
        raise HTTPException(status_code=400, detail="Action cannot be empty")

    recommended = str(store.iloc[0].get("recommended_actions", ""))
    allowed_actions = [part.strip() for part in recommended.split(";") if part.strip()]
    if request.action not in allowed_actions:
        raise HTTPException(status_code=400, detail="Action is not a recommendation for this store")

    role_key = normalize_designation(request.manager_designation)
    if role_key == "shift":
        raise HTTPException(status_code=403, detail="Shift Supervisors can complete local checks but cannot approve business actions.")
    store_priority = str(store.iloc[0].get("priority", "Low")).title()
    required_owner = PRIORITY_OWNER.get(store_priority, "store")
    if role_key != required_owner:
        required_label = DESIGNATION_CONFIG[required_owner]["label"]
        raise HTTPException(status_code=403, detail=f"{store_priority} cases are assigned to {required_label}. Your role should complete its own queue or escalate the case.")
    if role_key in {"regional", "area"}:
        if not request.manager_region:
            raise HTTPException(status_code=403, detail="Regional and Area managers must provide their assigned region.")
        store_region = str(store.iloc[0].get("region") or store.iloc[0].get("location", ""))
        if store_region.casefold() != request.manager_region.strip().casefold():
            raise HTTPException(status_code=403, detail="This store is outside the manager's assigned operating region.")
    if role_key == "area":
        if not request.manager_area:
            raise HTTPException(status_code=403, detail="Area managers must provide their assigned operating area.")
        store_area = str(store.iloc[0].get("area", ""))
        if store_area and store_area.casefold() != request.manager_area.strip().casefold():
            raise HTTPException(status_code=403, detail="This store is outside the manager's assigned operating area.")
    if role_key == "store":
        if not request.manager_store_id or request.manager_store_id.strip().upper() != request.store_id.strip().upper():
            raise HTTPException(status_code=403, detail="Store Managers can approve low-priority actions only for their assigned store.")

    save_approval(request.store_id, request.action.strip(), request.decision, request.manager_note, request.manager_name, role_key, request.manager_region, request.manager_store_id, request.manager_area)
    approved = request.decision == "Approved"
    return {
        "message": (
            "Action approved; simulated execution recorded. No external system was changed."
            if approved else "Action rejected; no simulation was run."
        ),
        "store_id": request.store_id,
        "decision": request.decision,
        "manager_name": request.manager_name.strip() or "Manager",
        "manager_designation": role_key,
        "manager_region": request.manager_region,
        "manager_area": request.manager_area,
        "manager_store_id": request.manager_store_id,
        "execution_status": "Simulated" if approved else "Not run — rejected",
        "action": request.action,
    }


@app.get("/api/actions")
def get_actions() -> dict:
    approvals = load_approvals()
    # Newest first for the approvals workspace.
    if not approvals.empty:
        approvals = approvals.sort_values("timestamp", ascending=False)
    return {"count": len(approvals), "actions": approvals.to_dict(orient="records")}


@app.get("/{full_path:path}", include_in_schema=False)
def serve_frontend_route(full_path: str):
    """Serve built frontend assets and support client-side routes on direct visits/reload."""
    index_file = FRONTEND_DIST / "index.html"
    if not index_file.is_file():
        raise HTTPException(status_code=404, detail="Frontend build not found. Run npm run build in frontend/.")

    dist_root = FRONTEND_DIST.resolve()
    requested_file = (FRONTEND_DIST / full_path).resolve()
    try:
        requested_file.relative_to(dist_root)
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found")

    if full_path and requested_file.is_file():
        return FileResponse(requested_file)
    # React uses URL query parameters for in-app history; unknown paths should still load the SPA.
    return FileResponse(index_file, media_type="text/html")
