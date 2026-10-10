import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
const DEMO_EMAIL = 'ops@freshbasket.demo';
const DEMO_PASSWORD = 'freshbasket123';
const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: 'grid', group: 'Workspace' },
  { id: 'decisions', label: 'Decision centre', icon: 'pulse', group: 'Workspace' },
  { id: 'stores', label: 'Store operations', icon: 'store', group: 'Workspace' },
  { id: 'performance', label: 'Store performance', icon: 'trend', group: 'Workspace' },
  { id: 'analytics', label: 'Risk analytics', icon: 'chart', group: 'Workspace' },
  { id: 'balancing', label: 'Stock balancing', icon: 'truck', group: 'Operations' },
  { id: 'waste', label: 'Waste & expiry', icon: 'leaf', group: 'Operations' },
  { id: 'scenarios', label: 'Scenario lab', icon: 'file', group: 'Operations' },
  { id: 'tasks', label: 'Daily tasks', icon: 'checklist', group: 'Workflow' },
  { id: 'approvals', label: 'Action approvals', icon: 'clipboard', group: 'Workflow' },
  { id: 'workforce', label: 'Team workload', icon: 'users', group: 'Workflow' },
];
const VALID_PAGE_IDS = new Set(NAV_ITEMS.map((item) => item.id));

function normalizeRoute(route) {
  if (route?.screen === 'workspace') {
    return { screen: 'workspace', page: VALID_PAGE_IDS.has(route.page) ? route.page : 'overview' };
  }
  return { screen: route?.screen === 'home' ? 'home' : 'login' };
}

function readRouteFromLocation() {
  const url = new URL(window.location.href);
  const requestedScreen = url.searchParams.get('fbRoute');
  if (requestedScreen === 'home' || requestedScreen === 'login') {
    return { screen: requestedScreen };
  }
  if (requestedScreen === 'workspace') {
    const page = url.searchParams.get('fbPage');
    const authenticated = sessionStorage.getItem('freshbasket-demo-session-v2') === 'active';
    return authenticated ? normalizeRoute({ screen: 'workspace', page }) : { screen: 'login' };
  }
  return sessionStorage.getItem('freshbasket-demo-session-v2') === 'active'
    ? { screen: 'workspace', page: 'overview' }
    : { screen: 'login' };
}

function routeUrl(route) {
  const url = new URL(window.location.href);
  url.searchParams.set('fbRoute', route.screen);
  if (route.screen === 'workspace') url.searchParams.set('fbPage', route.page);
  else url.searchParams.delete('fbPage');
  return `${url.pathname}${url.search}${url.hash}`;
}

function sameRoute(left, right) {
  return Boolean(left && right && left.screen === right.screen && left.page === right.page);
}

function readSavedNavigation(initialRoute) {
  try {
    const saved = JSON.parse(sessionStorage.getItem('freshbasket-navigation-history-v1') || 'null');
    if (Array.isArray(saved?.entries) && Number.isInteger(saved.index) && saved.index >= 0 && saved.index < saved.entries.length) {
      const entries = saved.entries.map(normalizeRoute);
      if (sameRoute(entries[saved.index], initialRoute)) return { entries, index: saved.index };
    }
  } catch { /* Start with the current page when no valid saved route history exists. */ }
  return { entries: [initialRoute], index: 0 };
}

function persistNavigation(navigation) {
  try { sessionStorage.setItem('freshbasket-navigation-history-v1', JSON.stringify(navigation)); }
  catch { /* Navigation keeps working for the current page if storage is unavailable. */ }
}

function HistoryControls({ canGoBack, canGoForward, onBack, onForward }) {
  return <div className="history-controls" aria-label="Page history">
    <button type="button" className="history-control" onClick={onBack} disabled={!canGoBack} title="Go to the previous page" aria-label="Go to the previous page"><span aria-hidden="true">←</span><span className="history-control-label">Back</span></button>
    <button type="button" className="history-control" onClick={onForward} disabled={!canGoForward} title="Go to the next page" aria-label="Go to the next page"><span className="history-control-label">Next</span><span aria-hidden="true">→</span></button>
  </div>;
}

const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const DESIGNATIONS = [
  { key: 'head', label: 'Head of Franchise Operations', level: 'Level 1', priority: 'Critical', scope: 'Network-wide', description: 'Own critical incidents, set priorities, and review the network morning brief.' },
  { key: 'regional', label: 'Regional Operations Manager', level: 'Level 2', priority: 'High', scope: 'Assigned region', description: 'Own high-priority cases in your region and escalate critical incidents to Head Office.' },
  { key: 'area', label: 'Area Operations Manager', level: 'Level 3', priority: 'Medium', scope: 'Assigned operating area', description: 'Resolve medium-priority exceptions and coordinate follow-through across stores.' },
  { key: 'store', label: 'Store Manager', level: 'Level 4', priority: 'Low', scope: 'Assigned store', description: 'Own routine store follow-up and complete local remediation tasks.' },
  { key: 'shift', label: 'Shift Supervisor', level: 'Level 5', priority: 'Routine', scope: 'Assigned store / current shift', description: 'Complete shelf checks, date-code rotation, physical verification and shift handover.' },
];
const OPERATING_REGIONS = ['Karnataka South', 'Karnataka North', 'Karnataka Coast', 'Tamil Nadu'];
const OPERATING_AREAS_BY_REGION = {
  'Karnataka South': ['Bengaluru North', 'Bengaluru Central', 'Bengaluru South', 'Mysuru East', 'Mysuru Central', 'Mysuru West'],
  'Karnataka North': ['Hubballi North', 'Hubballi Central', 'Hubballi South'],
  'Karnataka Coast': ['Mangaluru North', 'Mangaluru Coastal', 'Mangaluru South'],
  'Tamil Nadu': ['Chennai North', 'Chennai Central', 'Chennai South'],
};
const PRIORITY_OWNER = { Critical: 'head', High: 'regional', Medium: 'area', Low: 'store' };
const ROLE_PAGES = {
  head: ['overview', 'decisions', 'stores', 'performance', 'analytics', 'balancing', 'waste', 'scenarios', 'tasks', 'approvals', 'workforce'],
  regional: ['overview', 'decisions', 'stores', 'performance', 'analytics', 'balancing', 'waste', 'scenarios', 'tasks', 'approvals', 'workforce'],
  area: ['overview', 'decisions', 'stores', 'performance', 'analytics', 'balancing', 'waste', 'scenarios', 'tasks', 'approvals', 'workforce'],
  store: ['overview', 'stores', 'performance', 'waste', 'tasks', 'approvals', 'workforce'],
  shift: ['overview', 'stores', 'tasks', 'workforce'],
};
const roleDetails = (key) => DESIGNATIONS.find((item) => item.key === key) || DESIGNATIONS[0];
const normalizeStoreId = (value) => { const match = String(value || '').trim().match(/^store_(\d{4})$/i); return match ? `Store_${match[1]}` : 'Store_0017'; };
const storedRegionOrDefault = (value) => OPERATING_REGIONS.includes(value) ? value : 'Karnataka South';
const storedAreaOrDefault = (regionValue, areaValue) => { const options = OPERATING_AREAS_BY_REGION[storedRegionOrDefault(regionValue)] || []; return options.includes(areaValue) ? areaValue : (options[0] || 'Bengaluru Central'); };
const PRIORITY_COLORS = { Critical: '#bc5148', High: '#d78a32', Medium: '#6384a6', Low: '#346185' };
const PROBLEM_ICONS = {
  inventory_problem: 'box', wastage_problem: 'leaf', supplier_problem: 'truck', compliance_problem: 'shield',
  staffing_problem: 'users', sales_problem: 'trend', margin_problem: 'trend', customer_problem: 'users',
  complaints_problem: 'alert', expiry_problem: 'clock',
};

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = typeof payload.detail === 'string' ? payload.detail : `Request failed (${response.status})`;
    throw new Error(reason);
  }
  return payload;
}

function Icon({ name, size = 18, strokeWidth = 1.8, className = '' }) {
  const shared = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round', className, 'aria-hidden': true };
  const paths = {
    leaf: <><path d="M20.5 3.5C12 3.5 5 6.8 5 13.2c0 3 2.3 5.3 5.4 5.3 6.2 0 9.7-7.6 10.1-15Z"/><path d="M3.5 21c2.6-5.2 6.1-8.2 11.4-10.8"/></>,
    basket: <><path d="M3 10h18l-1.6 10H4.6L3 10Z"/><path d="m7 10 5-7 5 7"/><path d="M8 13v4M12 13v4M16 13v4"/></>,
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></>,
    home: <><path d="m3 10 9-7 9 7"/><path d="M5.5 9v11h13V9"/><path d="M9.5 20v-6h5v6"/></>,
    store: <><path d="M4 10.5V20h16v-9.5"/><path d="M3 9.5 5 4h14l2 5.5"/><path d="M3 9.5c0 1.4 1.1 2.5 2.5 2.5S8 10.9 8 9.5c0 1.4 1.1 2.5 2.5 2.5S13 10.9 13 9.5c0 1.4 1.1 2.5 2.5 2.5S18 10.9 18 9.5c0 1.4 1.1 2.5 2.5 2.5"/><path d="M9 20v-5h6v5"/></>,
    chart: <><path d="M4 19.5h16"/><path d="M6.5 16V10"/><path d="M12 16V5"/><path d="M17.5 16v-8"/></>,
    checklist: <><rect x="4" y="4" width="16" height="17" rx="2"/><path d="m7 9 1.5 1.5L11 8"/><path d="M13 9h4"/><path d="m7 15 1.5 1.5L11 14"/><path d="M13 15h4"/></>,
    clipboard: <><rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5.5V4a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4v1.5"/><path d="m8.5 12 2 2 5-5"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.7"/><path d="m16 16 4.2 4.2"/></>,
    refresh: <><path d="M20 7v5h-5"/><path d="M4.7 10a7.5 7.5 0 0 1 12.7-3L20 12"/><path d="M4 17v-5h5"/><path d="M19.3 14a7.5 7.5 0 0 1-12.7 3L4 12"/></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    down: <path d="m7 10 5 5 5-5"/>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    check: <path d="m5 12 4.5 4.5L19 7"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>,
    alert: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5"/><path d="M12 16.5h.01"/></>,
    box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4.4 7.6 7.6 4.3 7.6-4.3M12 12v9"/></>,
    truck: <><path d="M3 6h11v11H3z"/><path d="M14 10h4l3 3v4h-7z"/><circle cx="7.5" cy="18.5" r="1.5"/><circle cx="17.5" cy="18.5" r="1.5"/></>,
    shield: <><path d="M12 3 19 6v5c0 4.7-3.1 7.8-7 10-3.9-2.2-7-5.3-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-1.5A4.5 4.5 0 0 1 7.5 14h3A4.5 4.5 0 0 1 15 18.5V20"/><path d="M16 5.5a3 3 0 0 1 0 5.8M18 14.3a4.5 4.5 0 0 1 3 4.2V20"/></>,
    trend: <><path d="m3.5 16.5 5-5 4 3 7-8"/><path d="M14.5 6.5h5v5"/></>,
    logout: <><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></>,
    moon: <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.6 8.6 0 1 0 20.5 14.2Z"/>,
    eye: <><path d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
    eyeOff: <><path d="m3 3 18 18"/><path d="M10.6 6.1A10 10 0 0 1 12 6c6.2 0 9.5 6 9.5 6a15.6 15.6 0 0 1-3 3.5"/><path d="M6.2 6.8C3.8 8.4 2.5 12 2.5 12s3.3 6 9.5 6c1.4 0 2.7-.3 3.8-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></>,
    filter: <><path d="M4 5h16M7 12h10M10 19h4"/></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    pulse: <path d="M3 12h4l3-7 4 14 3-7h4"/>,
    file: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></>,
    question: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 1 1 3.8 1.7c-1.1.9-1.6 1.2-1.6 2.6"/><path d="M12 16.7h.01"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.1.9-1.2 2.1-1.4-.5a7.8 7.8 0 0 1-1.7 1l-.2 1.5h-2.4l-.3-1.5a7.8 7.8 0 0 1-1.7-1l-1.4.5-1.2-2.1 1.1-.9a6.9 6.9 0 0 1 0-2l-1.1-.9 1.2-2.1 1.4.5a7.8 7.8 0 0 1 1.7-1l.3-1.5h2.4l.2 1.5a7.8 7.8 0 0 1 1.7 1l1.4-.5 1.2 2.1-1.1.9a6.9 6.9 0 0 1 0 1.9Z" transform="translate(-1.5 -1.5)"/></>,
    user: <><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></>,
  };
  return <svg {...shared}>{paths[name] || paths.pulse}</svg>;
}

function Brand({ compact = false }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}>
    <div className="brand-mark"><Icon name="basket" size={25} strokeWidth={2} /></div>
    <div className="brand-copy"><strong>FreshBasket</strong><span>INTELLIGENT OPERATIONS</span></div>
  </div>;
}

function PriorityBadge({ priority }) {
  const value = PRIORITIES.includes(priority) ? priority : 'Low';
  return <span className={`priority-badge priority-${value.toLowerCase()}`}><span className="priority-dot" />{value}</span>;
}

function RiskBar({ value, color, max = 100 }) {
  const width = Math.min(100, Math.max(0, Number(value || 0) / max * 100));
  return <div className="risk-track"><span style={{ width: `${width}%`, background: color }} /></div>;
}

function RiskDonut({ dashboard }) {
  const items = PRIORITIES.map((name) => ({ name, value: Number(dashboard?.[`${name.toLowerCase()}_stores`] || 0), color: PRIORITY_COLORS[name] }));
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;
  return <div className="donut-wrap">
    <svg className="donut-svg" viewBox="0 0 132 132" role="img" aria-label="Store risk distribution">
      <circle cx="66" cy="66" r={radius} fill="none" stroke="#efefef" strokeWidth="15" />
      {items.map((item) => {
        const arc = total ? item.value / total * circumference : 0;
        const offset = accumulated;
        accumulated += arc;
        return <circle key={item.name} cx="66" cy="66" r={radius} fill="none" stroke={item.color} strokeWidth="15" strokeDasharray={`${arc} ${circumference - arc}`} strokeDashoffset={-offset} transform="rotate(-90 66 66)" strokeLinecap="butt" />;
      })}
      <text x="66" y="62" className="donut-number">{formatCompact(total)}</text>
      <text x="66" y="80" className="donut-label">stores</text>
    </svg>
    <div className="donut-legend">
      {items.map((item) => <div className="legend-row" key={item.name}>
        <span className="legend-label"><i style={{ background: item.color }} />{item.name}</span>
        <strong>{formatNumber(item.value)}</strong>
        <small>{total ? `${Math.round(item.value / total * 100)}%` : '0%'}</small>
      </div>)}
    </div>
  </div>;
}

function formatNumber(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(numeric) : '—';
}
function formatCompact(value) {
  return new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
}
function formatTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function formatPct(value, showPlus = true) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  return `${number > 0 && showPlus ? '+' : ''}${number.toFixed(1)}%`;
}
function splitSemicolon(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || '').split(';').map((part) => part.trim()).filter(Boolean);
}
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
function todayLabel() {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date());
}
function initials(name) { return String(name || 'KM').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase(); }

function ThemeToggle({ theme, onToggle }) {
  const target = theme === 'dark' ? 'light' : 'dark';
  return <button type="button" className="theme-toggle icon-button" onClick={onToggle} title={`Switch to ${target} mode`} aria-label={`Switch to ${target} mode`}>
    <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
    <span>{theme === 'dark' ? 'Day mode' : 'Dark mode'}</span>
  </button>;
}

function MainPage({ theme, onToggleTheme, onGoToLogin, canGoBack, canGoForward, onBack, onForward }) {
  const capabilities = [
    { icon: 'pulse', title: 'Spot the signal', copy: 'Catch unusual sales drops, shelf gaps, late deliveries and rising waste before they turn into a bad trading day.' },
    { icon: 'search', title: 'Connect the cause', copy: 'Bring sales, footfall, stock, staff and compliance into one explainable store brief.' },
    { icon: 'check', title: 'Choose the next move', copy: 'Compare practical options, understand the trade-offs and leave the final call with the manager.' },
    { icon: 'users', title: 'Route by responsibility', copy: 'Critical cases stay with Head Office; High, Medium, Low and routine work flow to the right designation.' },
  ];
  const workflow = [
    ['01', 'Observe', 'Read the latest store signals.'],
    ['02', 'Investigate', 'Connect evidence across the business.'],
    ['03', 'Compare', 'Estimate the effect of different responses.'],
    ['04', 'Approve', 'Record a manager-reviewed simulation.'],
  ];
  return <main className={`public-home theme-${theme}`}>
    <header className="public-nav">
      <button type="button" className="public-brand-button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="FreshBasket home"><Brand compact /></button>
      <nav className="public-nav-links" aria-label="Public navigation">
        <a href="#public-features">What it does</a>
        <a href="#public-workflow">How it works</a>
        <a href="#public-challenge">Challenge 04</a>
      </nav>
      <div className="public-nav-actions"><HistoryControls canGoBack={canGoBack} canGoForward={canGoForward} onBack={onBack} onForward={onForward} /><ThemeToggle theme={theme} onToggle={onToggleTheme} /><button type="button" className="primary-button public-signin" onClick={onGoToLogin}>Open workspace <Icon name="arrow" size={16} /></button></div>
    </header>

    <section className="public-hero">
      <div className="public-hero-copy">
        <div className="public-kicker"><span className="live-dot" /> FRANCHISE OPERATIONS INTELLIGENCE</div>
        <h1>Better mornings start with <em>the right decision.</em></h1>
        <p className="public-hero-lede">FreshBasket AI brings store performance, stock health, fresh-food waste and team signals into one clear view of what needs attention today.</p>
        <div className="public-hero-actions"><button type="button" className="primary-button public-hero-cta" onClick={onGoToLogin}>Enter the workspace <Icon name="arrow" size={17} /></button><a className="public-secondary-link" href="#public-features">Explore the approach <span>↓</span></a></div>
        <div className="public-trust-row"><span><Icon name="shield" size={16} /> Manager stays in control</span><span><Icon name="pulse" size={16} /> Evidence-led recommendations</span></div>
      </div>
      <div className="public-hero-visual" aria-label="Illustration of the FreshBasket morning operations brief">
        <div className="hero-glow" />
        <div className="hero-preview-top"><span className="hero-preview-brand"><span className="hero-preview-leaf"><Icon name="basket" size={17} /></span><span><strong>Morning brief</strong><small>FRANCHISE NETWORK</small></span></span><span className="hero-preview-status"><i /> DEMO SNAPSHOT</span></div>
        <div className="hero-preview-head"><div><span className="micro-label">NETWORK HEALTH</span><strong>Attention, clearly ranked.</strong></div><span className="hero-preview-risk"><small>Average risk</small><strong>14.1<small>/100</small></strong></span></div>
        <div className="hero-preview-metrics"><div><small>Stores monitored</small><strong>1,000</strong><span>Network-wide view</span></div><div><small>Need attention</small><strong className="hero-risk-text">136</strong><span>Critical + high</span></div></div>
        <div className="hero-preview-queue"><div className="hero-preview-queue-head"><strong>Priority queue</strong><span>TOP FINDINGS</span></div>
          <div className="hero-preview-row"><span className="hero-queue-number">01</span><span className="hero-queue-copy"><strong>Store_0017</strong><small>Stock gaps · late inbound · fresh waste</small></span><span className="hero-critical-pill">Critical</span></div>
          <div className="hero-preview-row"><span className="hero-queue-number">02</span><span className="hero-queue-copy"><strong>Store_0012</strong><small>Compliance issues need follow-up</small></span><span className="hero-high-pill">High</span></div>
        </div>
        <div className="hero-preview-foot"><span><i /> Built from synthetic challenge data</span><span>Challenge 04 / 11</span></div>
      </div>
      <div className="public-hero-orbit public-orbit-one" /><div className="public-hero-orbit public-orbit-two" />
    </section>

    <section className="public-value-strip" aria-label="FreshBasket capabilities">
      <div><span className="value-strip-icon"><Icon name="chart" size={19} /></span><span><strong>One connected view</strong><small>Sales, inventory, waste and people</small></span></div>
      <div><span className="value-strip-icon"><Icon name="search" size={19} /></span><span><strong>Reasons, not just scores</strong><small>Evidence behind each flag</small></span></div>
      <div><span className="value-strip-icon"><Icon name="check" size={19} /></span><span><strong>Human-approved actions</strong><small>Simulated before anything changes</small></span></div>
    </section>

    <section className="public-section public-features" id="public-features">
      <div className="public-section-heading"><span className="eyebrow">DESIGNED FOR THE 8:30 A.M. QUESTION</span><h2>From a pile of reports to a clear next step.</h2><p>Managers shouldn't need to open six spreadsheets to understand why a store is struggling.</p></div>
      <div className="public-capability-grid">{capabilities.map((item, index) => <article className="public-capability-card" key={item.title}><div className="public-capability-top"><span className="public-capability-icon"><Icon name={item.icon} size={21} /></span><span>0{index + 1}</span></div><h3>{item.title}</h3><p>{item.copy}</p></article>)}</div>
    </section>

    <section className="public-process-section" id="public-workflow">
      <div className="public-section-heading"><span className="eyebrow light-eyebrow">A SIMPLE, EXPLAINABLE LOOP</span><h2>Every recommendation has a reason.</h2><p>The workspace takes the manager from a signal to an action that can be reviewed and recorded.</p></div>
      <div className="public-workflow-grid">{workflow.map(([number, title, copy]) => <div className="public-workflow-step" key={number}><span>{number}</span><strong>{title}</strong><small>{copy}</small></div>)}</div>
    </section>

    <section className="public-challenge-section" id="public-challenge">
      <div className="public-challenge-copy"><span className="eyebrow">CYPHER 2026 · CHALLENGE 04 / 11</span><h2>Know which stores need you today — and why.</h2><p>Explore store operations, decision comparisons, stock balancing, wastage and expiry risks, performance signals, daily tasks and manager approvals.</p><button type="button" className="primary-button public-hero-cta" onClick={onGoToLogin}>Go to main workspace <Icon name="arrow" size={17} /></button></div>
      <div className="public-challenge-note"><span className="challenge-note-icon"><Icon name="info" size={21} /></span><strong>A transparent demo, not a black box.</strong><p>All supplied business data is synthetic. Risk scores are rule-based signals, explanations are leads to investigate, and approved actions are simulations only.</p></div>
    </section>
    <footer className="public-footer"><Brand compact /><span>FreshBasket AI <i>·</i> Franchise Operations Intelligence</span><button type="button" className="public-footer-link" onClick={onGoToLogin}>Sign in to workspace <Icon name="arrow" size={15} /></button></footer>
  </main>;
}

function LoginScreen({ onLogin, theme, onToggleTheme, onGoToMainPage, canGoBack, canGoForward, onBack, onForward }) {
  const [managerName, setManagerName] = useState(() => {
    try { return localStorage.getItem('freshbasket-manager-name') || ''; } catch { return ''; }
  });
  const [designation, setDesignation] = useState(() => {
    try { return localStorage.getItem('freshbasket-manager-designation') || 'head'; } catch { return 'head'; }
  });
  const [region, setRegion] = useState(() => {
    try { return storedRegionOrDefault(localStorage.getItem('freshbasket-manager-region')); } catch { return 'Karnataka South'; }
  });
  const [area, setArea] = useState(() => {
    try { const savedRegion = storedRegionOrDefault(localStorage.getItem('freshbasket-manager-region')); return storedAreaOrDefault(savedRegion, localStorage.getItem('freshbasket-manager-area')); } catch { return 'Bengaluru Central'; }
  });
  const [assignedStoreId, setAssignedStoreId] = useState(() => {
    try { return normalizeStoreId(localStorage.getItem('freshbasket-manager-store')); } catch { return 'Store_0017'; }
  });
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = (event) => {
    event.preventDefault();
    setError('');
    const cleanName = managerName.trim().replace(/\s+/g, ' ');
    if (!cleanName) {
      setError('Enter your name so the morning brief can address you correctly.');
      return;
    }
    if (cleanName.length > 80) {
      setError('Please keep the manager name under 80 characters.');
      return;
    }
    if (!DESIGNATIONS.some((item) => item.key === designation)) {
      setError('Choose a designation before continuing.');
      return;
    }
    const storeIdMatch = assignedStoreId.trim().match(/^store_(\d{4})$/i);
    const cleanStoreId = storeIdMatch ? `Store_${storeIdMatch[1]}` : assignedStoreId.trim();
    if (['store', 'shift'].includes(designation) && !/^STORE_\d{4}$/i.test(cleanStoreId)) {
      setError('Enter a store ID in the format Store_0017.');
      return;
    }
    if (['regional', 'area'].includes(designation) && !region) {
      setError('Choose your assigned operating region.');
      return;
    }
    if (designation === 'area' && !OPERATING_AREAS_BY_REGION[region]?.includes(area)) {
      setError('Choose an operating area within your assigned region.');
      return;
    }
    setBusy(true);
    window.setTimeout(() => {
      if (email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD) {
        onLogin({ name: cleanName, designation, region, area, storeId: cleanStoreId });
      } else {
        setError('Those demo credentials did not match. Use the details shown below.');
      }
      setBusy(false);
    }, 220);
  };
  const fillDemo = () => { setEmail(DEMO_EMAIL); setPassword(DEMO_PASSWORD); setError(''); };
  return <main className={`login-shell theme-${theme}`}>
    <section className="login-story">
      <Brand />
      <div className="story-main">
        <div className="eyebrow light-eyebrow"><span className="live-dot" /> OPERATIONS INTELLIGENCE</div>
        <h1>Every store tells a story.<br /><em>Know where to look.</em></h1>
        <p>Bring sales, stock, wastage, staffing and compliance into one clear view of what needs attention today.</p>
        <div className="story-points">
          <div><span className="story-icon"><Icon name="pulse" size={22} /></span><div><strong>See the signals</strong><small>Spot exceptions across the network.</small></div></div>
          <div><span className="story-icon"><Icon name="search" size={22} /></span><div><strong>Understand the cause</strong><small>Connect the dots, not just the numbers.</small></div></div>
          <div><span className="story-icon"><Icon name="check" size={22} /></span><div><strong>Decide with confidence</strong><small>Review actions before they are simulated.</small></div></div>
        </div>
      </div>
      <div className="login-story-footer"><span>FreshBasket Franchise Network</span><span>CHALLENGE 04 · DEMO ENVIRONMENT</span></div>
      <div className="story-orbit orbit-one" /><div className="story-orbit orbit-two" />
    </section>
    <section className="login-form-side">
      <div className="login-top-actions">
        <button type="button" className="go-main-button" onClick={onGoToMainPage}><Icon name="arrow" size={15} /><span>Go to main page</span></button>
        <HistoryControls canGoBack={canGoBack} canGoForward={canGoForward} onBack={onBack} onForward={onForward} /><ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      <form className="login-form" onSubmit={submit}>
        <div className="login-card-heading">
          <span className="login-card-emblem"><Icon name="basket" size={21} strokeWidth={2} /></span>
          <span className="login-card-heading-copy"><strong>Team member workspace</strong><small>FreshBasket AI · Challenge 04</small></span>
          <span className="login-access-status"><i /> DEMO ACCESS</span>
        </div>
        <h2>Welcome back<span className="login-heading-accent">.</span></h2>
        <p className="form-subtitle">Sign in to review today’s priorities and make better store decisions.</p>
        <label htmlFor="manager-name">Employee / manager name</label>
        <div className="input-with-icon"><Icon name="user" size={18} /><input id="manager-name" type="text" value={managerName} onChange={(e) => setManagerName(e.target.value)} placeholder="e.g. Prince Pandey" autoComplete="name" maxLength={80} required /></div>
        <label htmlFor="designation">Designation &amp; responsibility</label>
        <div className="input-with-icon select-with-icon designation-input"><Icon name="users" size={18} /><select id="designation" value={designation} onChange={(event) => setDesignation(event.target.value)} required aria-describedby="designation-hint">{DESIGNATIONS.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</select></div>
        <div className="login-role-note" id="designation-hint"><span className="login-role-level">{roleDetails(designation).level}</span><span>{roleDetails(designation).priority === 'Routine' ? 'Routine execution' : `${roleDetails(designation).priority} case owner`}</span><p>{roleDetails(designation).description}</p></div>
        {['regional', 'area'].includes(designation) && <><label htmlFor="assigned-region">{designation === 'area' ? 'Parent operating region' : 'Assigned operating region'}</label><div className="input-with-icon select-with-icon designation-input"><Icon name="pin" size={18} /><select id="assigned-region" value={region} onChange={(event) => { const nextRegion = event.target.value; setRegion(nextRegion); if (!OPERATING_AREAS_BY_REGION[nextRegion]?.includes(area)) setArea(OPERATING_AREAS_BY_REGION[nextRegion]?.[0] || ''); }} required>{OPERATING_REGIONS.map((item) => <option value={item} key={item}>{item}</option>)}</select></div></>}
        {designation === 'area' && <><label htmlFor="assigned-area">Assigned operating area</label><div className="input-with-icon select-with-icon designation-input"><Icon name="pin" size={18} /><select id="assigned-area" value={area} onChange={(event) => setArea(event.target.value)} required>{(OPERATING_AREAS_BY_REGION[region] || []).map((item) => <option value={item} key={item}>{item}</option>)}</select></div><small className="form-hint">Medium-priority cases in this area are assigned to you. Critical and high cases stay with senior owners.</small></>}
        {['store', 'shift'].includes(designation) && <><label htmlFor="assigned-store">Assigned store ID</label><div className="input-with-icon designation-input"><Icon name="store" size={18} /><input id="assigned-store" value={assignedStoreId} onChange={(event) => setAssignedStoreId(event.target.value)} placeholder="Store_0017" pattern="[Ss][Tt][Oo][Rr][Ee]_\d{4}" title="Use a store ID such as Store_0017" required /></div></>}
        <label htmlFor="email">Work email</label>
        <div className="input-with-icon"><Icon name="users" size={18} /><input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></div>
        <div className="password-label"><label htmlFor="password">Password</label><button type="button" className="text-button" onClick={fillDemo}>Demo access</button></div>
        <div className="input-with-icon"><Icon name="shield" size={18} /><input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /><button type="button" className="field-action" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'}><Icon name={showPassword ? 'eyeOff' : 'eye'} size={19} /></button></div>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="primary-button login-submit" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in to workspace'}<Icon name="arrow" size={18} /></button>
        <div className="credentials-card"><div className="credentials-heading"><Icon name="question" size={17} /><strong>Demo credentials</strong></div><div className="credential-row"><span>Email</span><code>{DEMO_EMAIL}</code></div><div className="credential-row"><span>Password</span><code>{DEMO_PASSWORD}</code></div><button type="button" className="text-button credentials-fill" onClick={fillDemo}>Fill demo details</button></div>
        <p className="login-disclaimer">Demo mode: designation selection previews a role-specific queue. Production requires individual employee accounts and server-side access control.</p>
        <div className="login-bottom"><span>Built for better store decisions</span><span>Help &amp; support <span aria-hidden="true">↗</span></span></div>
      </form>
    </section>
  </main>;
}

function WorkspacePanel({ panel, managerName, email, designation, region, area, assignedStoreId, theme, onToggleTheme, health, onClose, onSaveName }) {
  const [draftName, setDraftName] = useState(managerName || '');
  const [saveError, setSaveError] = useState('');
  useEffect(() => { setDraftName(managerName || ''); setSaveError(''); }, [managerName, panel]);
  if (!panel) return null;
  const title = panel === 'profile' ? 'My profile' : panel === 'settings' ? 'Workspace preferences' : 'Help & support';
  const handleSubmit = (event) => {
    event.preventDefault();
    const cleanName = draftName.trim().replace(/\s+/g, ' ');
    if (!cleanName) { setSaveError('Enter a manager name before saving.'); return; }
    if (cleanName.length > 80) { setSaveError('Keep the name under 80 characters.'); return; }
    onSaveName(cleanName);
  };
  return <div className="workspace-modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="workspace-modal" role="dialog" aria-modal="true" aria-labelledby="workspace-modal-title">
      <header className="workspace-modal-header"><div><span className="eyebrow">FRESHBASKET WORKSPACE</span><h2 id="workspace-modal-title">{title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close panel"><Icon name="close" size={17} /></button></header>
      {panel === 'profile' && <form className="workspace-modal-body" onSubmit={handleSubmit}>
        <div className="profile-identity"><span className="profile-identity-avatar">{initials(draftName || managerName)}</span><div><strong>{managerName}</strong><small>{roleDetails(designation).label}</small></div></div>
        <label htmlFor="profile-manager-name">Manager name</label>
        <input className="workspace-text-input" id="profile-manager-name" value={draftName} onChange={(event) => setDraftName(event.target.value)} maxLength={80} required />
        <label htmlFor="profile-email">Work email</label>
        <input className="workspace-text-input is-readonly" id="profile-email" value={email} readOnly />
        <div className="profile-note"><Icon name="question" size={16} /><span>This name appears in the morning greeting and profile. Designation: {roleDetails(designation).label}. Scope: {designation === 'head' ? 'Network-wide' : designation === 'area' ? `${region} · ${area}` : designation === 'regional' ? region : assignedStoreId}.</span></div>
        {saveError && <p className="login-error">{saveError}</p>}
        <div className="workspace-modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button">Save profile</button></div>
      </form>}
      {panel === 'settings' && <div className="workspace-modal-body">
        <div className="setting-row"><div className="setting-row-icon"><Icon name={theme === 'dark' ? 'moon' : 'sun'} size={18} /></div><div className="setting-row-copy"><strong>Appearance</strong><span>Choose the theme for this browser. Your choice is saved after refresh.</span></div><button type="button" className="secondary-button setting-action" onClick={onToggleTheme}>{theme === 'dark' ? 'Switch to day mode' : 'Switch to dark mode'}</button></div>
        <div className="setting-row"><div className="setting-row-icon"><Icon name="user" size={18} /></div><div className="setting-row-copy"><strong>Manager profile</strong><span>Signed in as {managerName} · {roleDetails(designation).label}. Update the display name from My profile. Change demo designation by signing out and choosing another role on the login screen.</span></div></div>
        <div className="setting-row"><div className="setting-row-icon"><Icon name="pulse" size={18} /></div><div className="setting-row-copy"><strong>Operations API</strong><span>{health?.status === 'connected' ? 'Connected · risk report available' : 'Not connected · keep the backend terminal running'}</span></div><span className={`setting-status ${health?.status === 'connected' ? 'is-online' : 'is-offline'}`}>{health?.status === 'connected' ? 'Online' : 'Offline'}</span></div>
        <div className="workspace-modal-actions"><button type="button" className="primary-button" onClick={onClose}>Done</button></div>
      </div>}
      {panel === 'help' && <div className="workspace-modal-body">
        <p className="help-intro">A quick guide to the FreshBasket operations workspace.</p>
        <div className="help-topic"><strong>Overview</strong><p>Start with the highest-urgency stores and the network risk mix. Select a store to review its evidence.</p></div>
        <div className="help-topic"><strong>Store operations &amp; risk analytics</strong><p>Search and filter stores, inspect sales and stock signals, and look for connected issues rather than treating each KPI alone.</p></div>
        <div className="help-topic"><strong>Daily tasks &amp; action approvals</strong><p>Review suggested actions and record an approval or rejection. Actions are simulated only; no supplier order is sent.</p></div>
        <div className="help-disclaimer"><Icon name="alert" size={16} /><span>This challenge workspace uses synthetic data and rule-based risk indicators. Use it as a decision-support demo, not as a live business system.</span></div>
        <div className="workspace-modal-actions"><button type="button" className="primary-button" onClick={onClose}>Got it</button></div>
      </div>}
    </section>
  </div>;
}
function MetricCard({ label, value, note, icon, tone = 'blue', valueSuffix = '' }) {
  return <article className="metric-card">
    <div className={`metric-icon metric-icon-${tone}`}><Icon name={icon} size={20} /></div>
    <div className="metric-label">{label}</div>
    <div className="metric-value">{value}{valueSuffix && <small>{valueSuffix}</small>}</div>
    <div className="metric-note">{note}</div>
  </article>;
}

function PanelHeader({ title, description, action, onAction }) {
  return <div className="panel-header"><div><h3>{title}</h3>{description && <p>{description}</p>}</div>{action && <button className="quiet-link" onClick={onAction}>{action}<Icon name="arrow" size={16} /></button>}</div>;
}

function StoreQueue({ stores, onSelectStore, onViewAll }) {
  return <section className="panel queue-panel">
    <PanelHeader title="Priority queue" description="Stores ranked by operational urgency" action="View all stores" onAction={onViewAll} />
    {stores.length ? <div className="queue-list">
      {stores.slice(0, 6).map((store, index) => {
        const problems = splitSemicolon(store.detected_problems);
        return <button className="queue-row" key={store.store_id} onClick={() => onSelectStore(store)}>
          <span className="queue-rank">{String(index + 1).padStart(2, '0')}</span>
          <span className="queue-store-icon"><Icon name="store" size={19} /></span>
          <span className="queue-store-copy"><strong>{store.store_id}</strong><small>{store.location || 'Franchise location'} · {problems[0] || 'Review operating signals'}</small></span>
          <span className="queue-score"><strong>{Math.round(Number(store.risk_score || 0))}</strong><small>risk score</small></span>
          <PriorityBadge priority={store.priority} />
          <Icon name="arrow" size={17} className="queue-arrow" />
        </button>;
      })}
    </div> : <EmptyState title="No store data yet" body="Start the backend after the demo data report has been generated." />}
  </section>;
}

function AgentDecisionPanel({ stores, onSelectStore }) {
  const ranked = stores.filter((store) => Number(store.risk_score || 0) > 0).slice(0, 3);
  const challengeStore = stores.find((store) => store.store_id === 'Store_0017');
  const decisions = [...ranked];
  if (challengeStore && !decisions.some((store) => store.store_id === challengeStore.store_id)) decisions.push(challengeStore);
  return <section className="panel agent-decision-panel">
    <div className="agent-panel-heading">
      <div>
        <span className="eyebrow"><i className="agent-status-dot" /> EXPLAINABLE DECISION SUPPORT</span>
        <h3>What needs attention this morning?</h3>
        <p>Each priority is built from observed signals, linked evidence and a proposed next move. A manager still makes the final decision.</p>
      </div>
      <span className="agent-engine-badge"><Icon name="pulse" size={15} /> FreshBasket decision engine</span>
    </div>
    <div className="agent-loop" aria-label="Decision support steps">
      {[['01', 'Observe', 'Sales · stock · waste'], ['02', 'Connect', 'Relate the signals'], ['03', 'Compare', 'Check practical options'], ['04', 'Recommend', 'Prepare the next move'], ['05', 'Approve', 'Manager decides']].map(([number, title, caption], index) => <div className="agent-loop-step" key={number}>
        <span className="agent-loop-number">{number}</span><div><strong>{title}</strong><small>{caption}</small></div>{index < 4 && <span className="agent-loop-arrow">›</span>}
      </div>)}
    </div>
    <div className="agent-decision-grid">
      {decisions.map((store, index) => {
        const best = (Array.isArray(store.action_options) ? store.action_options : []).find((option) => option.recommended) || store.action_options?.[0];
        const firstLink = (Array.isArray(store.signal_links) ? store.signal_links : [])[0];
        const isChallenge = store.store_id === 'Store_0017';
        const evidence = [];
        if (Number.isFinite(Number(store.sales_change_pct))) evidence.push(`Sales ${formatPct(store.sales_change_pct)}`);
        if (Number.isFinite(Number(store.transactions_change_pct))) evidence.push(`Transactions ${formatPct(store.transactions_change_pct)}`);
        if (Number.isFinite(Number(store.footfall_change_pct))) evidence.push(`Footfall ${formatPct(store.footfall_change_pct)}`);
        if (Number(store.fresh_wastage_growth_pct) >= 20) evidence.push(`Fresh waste ${formatPct(store.fresh_wastage_growth_pct)}`);
        if (Number(store.gross_margin_change_pp) <= -5) evidence.push(`Margin ${Number(store.gross_margin_change_pp).toFixed(1)} pp`);
        if (Number(store.complaints_change_pct) >= 25) evidence.push(`Complaints ${formatPct(store.complaints_change_pct)}`);
        return <article className={`agent-decision-card ${best?.recommended ? 'agent-card-recommended' : ''} ${isChallenge ? 'agent-challenge-card' : ''}`} key={store.store_id}>
          <div className="agent-card-top"><span className="agent-rank">{isChallenge ? 'CHALLENGE CASE' : `PRIORITY ${String(index + 1).padStart(2, '0')}`}</span><PriorityBadge priority={store.priority} /></div>
          <div className="agent-card-store"><div><h4>{store.store_id}</h4><span>{store.location || 'Franchise location'}{store.format ? ` · ${store.format}` : ''}</span></div><div className="agent-card-score"><strong>{Math.round(Number(store.risk_score || 0))}</strong><small>/100</small></div></div>
          <div className="agent-card-finding"><span className="agent-section-label">CONNECTED FINDING</span><strong>{firstLink?.title || splitSemicolon(store.detected_problems)[0] || 'Routine monitoring'}</strong><p>{firstLink?.interpretation || store.root_cause || 'Review the current operating signals.'}</p></div>
          <div className="agent-evidence-pills">{evidence.slice(0, 4).map((item) => <span key={item}>{item}</span>)}</div>
          <div className="agent-card-next"><span className="agent-section-label">NEXT MOVE TO REVIEW</span><strong>{best?.title || splitSemicolon(store.recommended_actions)[0] || 'Review daily checks'}</strong><p>{best?.expected_impact || 'Open the store brief to inspect the evidence and choose the next step.'}</p></div>
          <button className="agent-open-button" onClick={() => onSelectStore(store)}>Open decision brief <Icon name="arrow" size={15} /></button>
        </article>;
      })}
      {!decisions.length && <EmptyState title="No assessed stores yet" body="The agent decision queue will appear once the source data has been analyzed." />}
    </div>
    <p className="agent-disclaimer"><Icon name="question" size={14} /> Findings are explainable rule-based leads over synthetic data, not proof of causation. Transfers, markdowns and supplier actions remain simulated until a manager approves them.</p>
  </section>;
}

function EmptyState({ title, body, action, onAction }) {
  return <div className="empty-state"><span><Icon name="file" size={23} /></span><strong>{title}</strong><p>{body}</p>{action && <button className="secondary-button" onClick={onAction}>{action}</button>}</div>;
}

function OverviewPage({ dashboard, stores, problems, actions, managerName, designation = 'head', region, area, assignedStoreId, onSelectStore, onNavigate, onRefresh, loading }) {
  const role = roleDetails(designation);
  const focusPriorityKey = `${role.priority.toLowerCase()}_stores`;
  const needsAttention = dashboard ? (designation === 'shift' ? 3 : ['store', 'shift'].includes(designation) ? Number(dashboard.total_stores || 0) : Number(dashboard[focusPriorityKey] || 0)) : null;
  const focusLabel = designation === 'head' ? 'Critical cases' : designation === 'regional' ? 'High-priority cases' : designation === 'area' ? 'Medium-priority cases' : designation === 'store' ? 'Assigned store' : 'Shift checklist';
  const focusNote = designation === 'head' ? 'Requires Head Office attention' : designation === 'regional' ? 'Owned by regional operations' : designation === 'area' ? 'Owned by area operations' : designation === 'store' ? assignedStoreId : 'Routine execution tasks';
  const scopeDescription = designation === 'head' ? 'Here is where the network needs your attention today.' : designation === 'regional' ? `Your high-priority queue across ${region}, with critical escalations kept visible.` : designation === 'area' ? `Your medium-priority queue for ${area} · ${region}, with higher-risk escalations kept visible.` : `Your assigned work for ${assignedStoreId}. Critical ownership stays with Head Office.`;
  const scopeLabel = designation === 'head' ? 'NETWORK-WIDE MORNING BRIEF' : `${role.priority.toUpperCase()} · ASSIGNED WORK QUEUE`;
  const signals = problems.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const activeProblemCount = problems.filter((item) => Number(item.count || 0) > 0).length;
  const topProblems = [...problems].sort((a, b) => Number(b.count || 0) - Number(a.count || 0)).slice(0, 5);
  return <div className="page-stack">
    <section className="welcome-banner">
      <div className="welcome-copy"><span className="eyebrow light-eyebrow">{scopeLabel}</span><h2>{greeting()}, {managerName || 'Manager'}.</h2><p>{scopeDescription}</p><div className="welcome-meta"><span><Icon name="clock" size={15} /> Data snapshot: {dashboard?.data_as_of || todayLabel()}</span><span><Icon name="pulse" size={15} /> {dashboard?.last_refreshed_at ? `Last demo update ${formatTimestamp(dashboard.last_refreshed_at)}` : 'Preloaded demo data · refresh to simulate an update'}</span></div></div>
      <div className="welcome-risk"><span>{designation === 'head' ? 'Average network risk' : 'Average risk in your scope'}</span><strong>{Number(dashboard?.average_risk_score || 0).toFixed(1)}<small>/100</small></strong><RiskBar value={dashboard?.average_risk_score || 0} color="#b5cbe2" /></div>
      <div className="welcome-leaf"><Icon name="leaf" size={80} strokeWidth={1.1} /></div>
      <div className="welcome-ring" />
    </section>
    {loading && !dashboard && <div className="inline-loading"><span className="spinner" /> Connecting to the operations API…</div>}
    <section className="metrics-grid">
      <MetricCard label={designation === 'head' ? 'Stores monitored' : 'Stores in scope'} value={dashboard ? formatNumber(dashboard.total_stores) : '—'} note={designation === 'head' ? 'Across the franchise network' : designation === 'regional' ? region : designation === 'area' ? `${area} · ${region}` : assignedStoreId} icon="store" tone="blue" />
      <MetricCard label={focusLabel} value={dashboard ? formatNumber(needsAttention) : '—'} note={focusNote} icon="alert" tone="red" />
      <MetricCard label="Signal flags" value={dashboard ? formatNumber(signals) : '—'} note={`${activeProblemCount} operational categories tracked`} icon="pulse" tone="amber" />
      <MetricCard label="Actions reviewed" value={dashboard ? formatNumber(actions.length) : '—'} note="Manager decisions recorded" icon="clipboard" tone="blue" />
    </section>
    <AgentDecisionPanel stores={stores} onSelectStore={onSelectStore} />
    {['head', 'regional', 'area'].includes(designation) && <section className="network-safety-banner" aria-label="Network-safe transfer protection">
      <span className="network-safety-banner-icon"><Icon name="shield" size={21} /></span>
      <div className="network-safety-banner-copy"><strong>Network-safe decisions</strong><p>Transfer proposals are capped by available donor surplus, protect a stock reserve, and share one allocation budget across recipients. Managers still verify physical counts before approval.</p></div>
      <button type="button" className="secondary-button" onClick={() => onNavigate('balancing')}>Review stock balancing <Icon name="arrow" size={15} /></button>
    </section>}
    <section className="overview-grid">
      <StoreQueue stores={stores} onSelectStore={onSelectStore} onViewAll={() => onNavigate('stores')} />
      <section className="panel risk-mix-panel"><PanelHeader title={designation === 'head' ? 'Network risk mix' : 'Risk mix in your scope'} description="Distribution by assessed urgency" />{dashboard ? <RiskDonut dashboard={dashboard} /> : <EmptyState title="Risk report unavailable" body="The distribution will appear when the API connection is restored." />}<div className="chart-footnote"><span className="tiny-status-dot" /> Updated from the current risk report</div></section>
    </section>
    <section className="overview-grid overview-grid-lower">
      <section className="panel problem-panel"><PanelHeader title="Where exceptions are appearing" description="Stores with each detected problem type" action="Open analytics" onAction={() => onNavigate('analytics')} />
        <div className="problem-bars">{topProblems.map((problem) => <div className="problem-bar-row" key={problem.key}><div className="problem-bar-label"><span className="problem-icon"><Icon name={PROBLEM_ICONS[problem.key] || 'pulse'} size={16} /></span><span>{problem.label}</span><strong>{formatNumber(problem.count)}</strong></div><RiskBar value={problem.count} max={Math.max(1, ...topProblems.map((item) => Number(item.count || 0)))} color="#3b6180" /></div>)}</div>
      </section>
      <section className="panel action-summary-panel"><PanelHeader title="Decision activity" description="The latest manager review history" action={designation === 'shift' ? 'Open task list' : 'Review actions'} onAction={() => onNavigate(designation === 'shift' ? 'tasks' : 'approvals')} />
        {actions.length ? <div className="recent-actions">{actions.slice(0, 4).map((action, index) => <div className="recent-action-row" key={`${action.timestamp}-${index}`}><span className={`decision-icon ${action.decision === 'Approved' ? 'decision-approved' : 'decision-rejected'}`}><Icon name={action.decision === 'Approved' ? 'check' : 'close'} size={15} /></span><div><strong>{action.store_id}</strong><p>{action.action}</p><small>{action.timestamp ? new Date(action.timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Recorded decision'}</small></div><span className={`decision-label ${action.decision === 'Approved' ? 'text-approved' : 'text-rejected'}`}>{action.decision}</span></div>)}</div> : <EmptyState title="No decisions recorded" body="Review a store recommendation and record the manager's decision. This demo only records simulated actions." action={designation === 'shift' ? 'Open task list' : 'Open approvals'} onAction={() => onNavigate(designation === 'shift' ? 'tasks' : 'approvals')} />}
      </section>
    </section>
    <p className="data-note"><Icon name="question" size={14} /> Risk scores are transparent rule-based indicators over synthetic demo data. They highlight where to investigate, not proof of cause.</p>
  </div>;
}

function StoresPage({ stores, onSelectStore }) {
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState('All');
  const [sort, setSort] = useState('ranked');
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const filtered = useMemo(() => stores.filter((store) => {
    const matchesPriority = priority === 'All' || String(store.priority).toLowerCase() === priority.toLowerCase();
    const haystack = [store.store_id, store.location, store.detected_problems, store.root_cause, store.franchisee].join(' ').toLowerCase();
    return matchesPriority && haystack.includes(query.trim().toLowerCase());
  }).sort((a, b) => sort === 'ranked' ? Number(b.risk_score || 0) - Number(a.risk_score || 0) : String(a.store_id).localeCompare(String(b.store_id))), [stores, query, priority, sort]);
  useEffect(() => setPage(1), [query, priority, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  return <div className="page-stack">
    <div className="page-intro"><div><span className="eyebrow">NETWORK DIRECTORY</span><h2>Store operations</h2><p>Search the network, review live risk signals, and open a store's operating brief.</p></div><div className="intro-counter"><strong>{formatNumber(filtered.length)}</strong><span>stores in view</span></div></div>
    <section className="panel directory-panel">
      <div className="directory-toolbar"><div className="search-field"><Icon name="search" size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search store, region or issue…" aria-label="Search stores" />{query && <button className="clear-search" onClick={() => setQuery('')} aria-label="Clear search"><Icon name="close" size={15} /></button>}</div><div className="filter-control"><Icon name="filter" size={16} /><select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Filter by priority"><option>All</option>{PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select></div><select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort stores"><option value="ranked">Highest risk first</option><option value="name">Store ID A–Z</option></select></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Store</th><th>Region</th><th>Risk score</th><th>Priority</th><th>Primary finding</th><th>Sales change</th><th /></tr></thead><tbody>{pageRows.map((store) => <tr key={store.store_id} onClick={() => onSelectStore(store)} className="clickable-row"><td><div className="store-cell"><span className="table-store-icon"><Icon name="store" size={17} /></span><span><strong>{store.store_id}</strong><small>{store.format || 'Franchise store'}</small></span></div></td><td>{store.location || '—'}</td><td><div className="table-score"><strong>{Math.round(Number(store.risk_score || 0))}</strong><RiskBar value={store.risk_score} color={PRIORITY_COLORS[store.priority] || PRIORITY_COLORS.Low} /></div></td><td><PriorityBadge priority={store.priority} /></td><td><span className="primary-finding">{splitSemicolon(store.detected_problems)[0] || 'Routine monitoring'}</span></td><td className={Number(store.sales_change_pct) < 0 ? 'negative-value' : 'positive-value'}>{formatPct(store.sales_change_pct)}</td><td><button className="row-open" aria-label={`Open ${store.store_id}`}><Icon name="arrow" size={16} /></button></td></tr>)}</tbody></table>
        {!pageRows.length && <EmptyState title="No matching stores" body="Try a different store name, location, problem keyword or priority filter." action="Clear filters" onAction={() => { setQuery(''); setPriority('All'); }} />}
      </div>
      <div className="table-pagination"><span>Showing <strong>{filtered.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filtered.length)}</strong> of <strong>{formatNumber(filtered.length)}</strong> stores</span><div><button className="page-button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button><span className="page-count">{page} / {pageCount}</span><button className="page-button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</button></div></div>
    </section>
    <p className="data-note"><Icon name="question" size={14} /> Opening a store shows the recorded signals and recommendations used by the analysis engine.</p>
  </div>;
}

function AnalyticsPage({ dashboard, problems, stores, onSelectStore }) {
  const total = Number(dashboard?.total_stores || 0);
  const attention = Number(dashboard?.critical_stores || 0) + Number(dashboard?.high_stores || 0);
  const maximumProblem = Math.max(1, ...problems.map((item) => Number(item.count || 0)));
  const commercial = [...stores].sort((a, b) => Number(a.sales_change_pct || 0) - Number(b.sales_change_pct || 0)).slice(0, 5);
  const topRisk = stores.slice(0, 5);
  return <div className="page-stack">
    <div className="page-intro"><div><span className="eyebrow">EXPLAINABLE RISK SIGNALS</span><h2>Risk analytics</h2><p>Understand the mix of operational exceptions and identify where follow-up may have the most impact.</p></div><div className="intro-counter"><strong>{Number(dashboard?.average_risk_score || 0).toFixed(1)}<small>/100</small></strong><span>average network risk</span></div></div>
    <section className="analytics-top-grid">
      <div className="panel analytics-risk-panel"><PanelHeader title="Risk distribution" description="Assessed stores by risk band" /><RiskDonut dashboard={dashboard} /><div className="analytics-total-line"><span>Stores in report</span><strong>{formatNumber(total)}</strong></div></div>
      <div className="panel signal-panel"><PanelHeader title="Operational problem signals" description="A store can appear in more than one category" />
        <div className="signal-list">{[...problems].sort((a, b) => Number(b.count || 0) - Number(a.count || 0)).map((problem) => <div className="signal-item" key={problem.key}><div className="signal-title"><span className="problem-icon"><Icon name={PROBLEM_ICONS[problem.key] || 'pulse'} size={17} /></span><span>{problem.label}</span><strong>{formatNumber(problem.count)}</strong></div><div className="signal-progress"><span style={{ width: `${Math.min(100, Number(problem.count || 0) / maximumProblem * 100)}%` }} /></div><small>{total ? `${(Number(problem.count || 0) / total * 100).toFixed(1)}% of stores` : '0% of stores'}</small></div>)}</div>
      </div>
    </section>
    <section className="panel band-panel"><PanelHeader title="Priority bands" description="How much of the network falls into each assessed band" />
      <div className="band-grid">{PRIORITIES.map((level) => { const value = Number(dashboard?.[`${level.toLowerCase()}_stores`] || 0); return <div key={level} className={`band-card band-${level.toLowerCase()}`}><div className="band-card-top"><span><i style={{ background: PRIORITY_COLORS[level] }} />{level}</span><strong>{formatNumber(value)}</strong></div><RiskBar value={value} max={Math.max(1, total)} color={PRIORITY_COLORS[level]} /><small>{total ? `${(value / total * 100).toFixed(1)}% of network` : '0% of network'}</small></div>; })}</div>
    </section>
    <section className="analytics-lower-grid">
      <section className="panel"><PanelHeader title="Largest sales declines" description="Current snapshot compared with the previous snapshot" />{commercial.length ? <div className="mini-store-list">{commercial.map((store) => <button key={store.store_id} className="mini-store-row" onClick={() => onSelectStore(store)}><span className="mini-store-ident"><strong>{store.store_id}</strong><small>{store.location || 'Franchise location'}</small></span><span className="mini-change negative-value">{formatPct(store.sales_change_pct)}</span><PriorityBadge priority={store.priority} /></button>)}</div> : <EmptyState title="No store data" body="The report is not available yet." />}</section>
      <section className="panel"><PanelHeader title="Highest assessed risk" description="Review the most urgent open exceptions" />{topRisk.length ? <div className="mini-store-list">{topRisk.map((store) => <button key={store.store_id} className="mini-store-row" onClick={() => onSelectStore(store)}><span className="mini-store-ident"><strong>{store.store_id}</strong><small>{splitSemicolon(store.detected_problems)[0] || 'Review operating signals'}</small></span><span className="mini-risk-number">{Math.round(Number(store.risk_score || 0))}<small>/100</small></span><PriorityBadge priority={store.priority} /></button>)}</div> : <EmptyState title="No store data" body="The report is not available yet." />}</section>
    </section>
    <p className="data-note"><Icon name="question" size={14} /> Signal categories can overlap. Scores are generated by an explainable, rule-based demo analyzer and are not trained-model predictions.</p>
  </div>;
}

function WorkforcePage({ designation, region, area, assignedStoreId, stores, onSelectStore, onNavigate }) {
  const [overview, setOverview] = useState(null);
  const [queue, setQueue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const role = roleDetails(designation);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ designation, limit: '200' });
    if (['regional', 'area'].includes(designation) && region) params.set('region', region);
    if (designation === 'area' && area) params.set('area', area);
    if (['store', 'shift'].includes(designation) && assignedStoreId) params.set('store_id', assignedStoreId);
    Promise.all([api('/api/workforce/overview'), api(`/api/workforce/tasks?${params.toString()}`)])
      .then(([summary, assigned]) => {
        if (!active) return;
        setOverview(summary);
        setQueue(assigned);
      })
      .catch((reason) => { if (active) setError(reason.message || 'Could not load the workforce queue.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [designation, region, area, assignedStoreId, stores]);

  const roleCards = overview?.roles || [];
  const assignedRole = roleCards.find((item) => item.key === designation) || role;
  const queueTasks = queue?.tasks || [];
  const totalPriorityStores = overview?.total_stores || stores.length;
  const isHead = designation === 'head';
  const assignments = [
    { priority: 'Critical', key: 'head', icon: 'alert', title: 'Head Office', copy: 'Critical incidents stay with the network lead.' },
    { priority: 'High', key: 'regional', icon: 'pin', title: 'Regional operations', copy: 'High-priority cases are handled regionally.' },
    { priority: 'Medium', key: 'area', icon: 'grid', title: 'Area operations', copy: 'Medium cases are coordinated across stores.' },
    { priority: 'Low', key: 'store', icon: 'store', title: 'Store managers', copy: 'Low-risk follow-up and store routines.' },
    { priority: 'Routine', key: 'shift', icon: 'checklist', title: 'Shift supervisors', copy: 'Physical checks and shift handover tasks.' },
  ];
  return <div className="page-stack workforce-page">
    <div className="page-intro"><div><span className="eyebrow">SEVERITY-BASED DELEGATION</span><h2>Team workload</h2><p>Keep critical decisions with senior leadership and move execution to the closest responsible team.</p></div><div className="intro-counter"><strong>{formatNumber(queue?.total_tasks || 0)}</strong><span>tasks in your queue</span></div></div>
    <section className="workforce-hero panel">
      <div className="workforce-hero-icon"><Icon name="users" size={25} /></div>
      <div className="workforce-hero-copy"><span className="eyebrow">YOUR ASSIGNMENT</span><h3>{role.label}</h3><p>{role.description}</p><div className="workforce-scope-row"><span className="workforce-scope-pill">{role.level}</span><span className="workforce-scope-pill">{designation === 'area' ? `${area} · ${region}` : designation === 'regional' ? region : ['store', 'shift'].includes(designation) ? assignedStoreId : 'All 1,000 stores'}</span><span className={`workforce-priority-pill priority-${role.priority.toLowerCase()}`}>{role.priority === 'Routine' ? 'Routine execution' : `${role.priority} case ownership`}</span></div></div>
      <div className="workforce-hero-numbers"><div><strong>{formatNumber(queue?.total_tasks || 0)}</strong><span>Assigned tasks</span></div><div><strong>{formatNumber(queue?.escalation_count || 0)}</strong><span>Critical escalations to monitor</span></div></div>
    </section>

    <section className="panel">
      <div className="panel-header"><div><h3>Responsibility ladder</h3><p>Each risk level has one accountable owner; local execution may be delegated without moving ownership.</p></div><span className="workforce-policy-chip">5 levels · 1 routing policy</span></div>
      <div className="role-hierarchy-grid">{assignments.map((assignment) => {
        const stats = roleCards.find((item) => item.key === assignment.key) || {};
        const active = assignment.key === designation;
        return <article className={`role-hierarchy-card ${active ? 'role-hierarchy-card-active' : ''}`} key={assignment.key}>
          <div className="role-card-top"><span className={`role-card-icon role-icon-${assignment.key}`}><Icon name={assignment.icon} size={19} /></span><span className="role-level">{roleDetails(assignment.key).level}</span></div>
          <span className="role-priority-label">{assignment.priority === 'Routine' ? 'STORE EXECUTION' : `${assignment.priority.toUpperCase()} PRIORITY`}</span>
          <h4>{roleDetails(assignment.key).label}</h4><p>{assignment.copy}</p>
          <div className="role-card-stats">{(isHead || active) ? <><span><strong>{formatNumber(isHead ? stats.store_count : (assignment.key === 'shift' ? stores.length : stores.filter((store) => store.priority === assignment.priority).length))}</strong><small>{assignment.key === 'shift' ? 'stores in checklist scope' : `${assignment.priority.toLowerCase()} cases in scope`}</small></span><span><strong>{formatNumber(isHead ? stats.task_count : (queue?.total_tasks || 0))}</strong><small>{assignment.key === 'shift' ? 'execution tasks' : 'assigned actions'}</small></span></> : <span className="role-card-scope-note"><strong>—</strong><small>Managed at this level</small></span>}</div>
          {active && <span className="your-role-indicator"><Icon name="check" size={13} /> Your current role</span>}
        </article>;
      })}</div>
    </section>

    {isHead && <section className="panel workforce-routing-panel"><div className="panel-header"><div><h3>Network allocation</h3><p>Cases routed from the current risk report, not hard-coded counts.</p></div><span className="data-source-chip">{formatNumber(totalPriorityStores)} stores assessed</span></div><div className="allocation-rows">{(overview?.roles || []).filter((item) => item.key !== 'shift').map((item) => {
      const total = Math.max(1, totalPriorityStores);
      return <div className="allocation-row" key={item.key}><div className="allocation-label"><span className={`allocation-dot allocation-${item.key}`} /><strong>{item.label}</strong><span>{item.priority} queue</span></div><div className="allocation-track"><span className={`allocation-fill allocation-fill-${item.key}`} style={{ width: `${Math.min(100, item.store_count / total * 100)}%` }} /></div><strong className="allocation-count">{formatNumber(item.store_count)}</strong><small>{Math.round(item.store_count / total * 1000) / 10}% of stores</small></div>;
    })}</div></section>}

    <section className="panel workforce-queue-panel">
      <div className="panel-header"><div><h3>My assigned work</h3><p>{queue?.scope || role.scope}{queue?.region ? ` · ${queue.region}` : ''}{queue?.area ? ` · ${queue.area}` : ''}{queue?.store_id ? ` · ${queue.store_id}` : ''}</p></div><button className="secondary-button" onClick={() => onNavigate('tasks')}>Open task list <Icon name="arrow" size={15} /></button></div>
      {error && <div className="connection-banner workforce-error"><span className="connection-icon"><Icon name="alert" size={17} /></span><div><strong>Queue could not be loaded</strong><p>{error}</p></div></div>}
      {loading ? <div className="workforce-loading"><span className="loading-spinner" /> Loading your assigned queue…</div> : queueTasks.length ? <div className="workforce-task-list">{queueTasks.slice(0, 8).map((task) => {
        const store = stores.find((item) => item.store_id === task.store_id);
        return <article className="workforce-task-row" key={task.id}><div className="workforce-task-priority"><PriorityBadge priority={task.priority} /><span>{task.due_label || 'Today'}</span></div><div className="workforce-task-main"><strong>{task.task}</strong><small>{task.store_id} · {task.location} · {task.assignment_type}</small>{task.escalated_to && <span className="escalation-note">Execution support · case owner: {task.escalated_to}</span>}</div><button className="icon-button workforce-open-button" aria-label={`Open ${task.store_id}`} title="Inspect store evidence" onClick={() => store && onSelectStore(store)} disabled={!store}><Icon name="arrow" size={16} /></button></article>;
      })}</div> : <EmptyState title="No tasks in this queue" body={designation === 'head' ? 'No critical cases are in the current report.' : 'There are no tasks matching this designation and scope in the current snapshot.'} />}
      {queue?.total_tasks > 8 && <div className="workforce-queue-footer"><span>Showing 8 of {formatNumber(queue.total_tasks)} assigned tasks.</span><button className="quiet-link" onClick={() => onNavigate('tasks')}>See all assigned tasks <Icon name="arrow" size={14} /></button></div>}
    </section>
    <p className="data-note"><Icon name="shield" size={14} /> Demo role routing is calculated from synthetic data. This is a presentation workflow, not production identity/access management. Critical cases remain owned by Head Office; local verification tasks do not change that ownership.</p>
  </div>;
}

function buildTasks(stores) {
  const result = [];
  stores.forEach((store) => {
    splitSemicolon(store.recommended_actions).forEach((task, index) => {
      result.push({ id: `${store.store_id}::${index}`, store_id: store.store_id, location: store.location || '—', task, priority: store.priority, risk_score: Number(store.risk_score || 0), index });
    });
  });
  return result.sort((a, b) => {
    const levelDiff = PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority);
    return levelDiff || b.risk_score - a.risk_score;
  });
}

function TasksPage({ stores, onSelectStore, designation, region, area, assignedStoreId }) {
  const [scope, setScope] = useState('Open');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [tasks, setTasks] = useState([]);
  const [queueMeta, setQueueMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [doneIds, setDoneIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('freshbasket-completed-tasks') || '{}'); } catch { return {}; }
  });
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ designation, limit: '1000' });
    if (['regional', 'area'].includes(designation) && region) params.set('region', region);
    if (designation === 'area' && area) params.set('area', area);
    if (['store', 'shift'].includes(designation) && assignedStoreId) params.set('store_id', assignedStoreId);
    setLoading(true);
    setError('');
    api(`/api/workforce/tasks?${params.toString()}`)
      .then((payload) => { if (active) { setTasks(payload.tasks || []); setQueueMeta(payload); } })
      .catch((reason) => { if (active) { setTasks([]); setQueueMeta(null); setError(reason.message || 'Could not load assigned tasks.'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [designation, region, area, assignedStoreId, stores]);
  const visible = useMemo(() => tasks.filter((task) => {
    const completed = Boolean(doneIds[task.id]);
    const matchesScope = scope === 'All' || (scope === 'Completed' ? completed : !completed);
    const matchesQuery = `${task.store_id} ${task.location} ${task.task} ${task.priority} ${task.owner_role || ''}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesScope && matchesQuery;
  }), [tasks, doneIds, scope, query]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageRows = visible.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => setPage(1), [scope, query, designation, region, area, assignedStoreId]);
  const completedCount = tasks.filter((task) => doneIds[task.id]).length;
  const toggle = (id) => setDoneIds((previous) => {
    const next = { ...previous, [id]: !previous[id] };
    try { localStorage.setItem('freshbasket-completed-tasks', JSON.stringify(next)); } catch { /* Completion stays active for this session. */ }
    return next;
  });
  const role = roleDetails(designation);
  return <div className="page-stack">
    <div className="page-intro"><div><span className="eyebrow">DESIGNATION-BASED FOLLOW-THROUGH</span><h2>Daily tasks</h2><p>Work is routed to the role responsible for the risk tier, with store-level execution kept clear.</p></div><div className="intro-counter"><strong>{formatNumber(completedCount)}<small> / {formatNumber(tasks.length)}</small></strong><span>tasks checked off in this browser</span></div></div>
    <section className="task-role-banner panel"><div className="task-role-icon"><Icon name="checklist" size={22} /></div><div><span className="eyebrow">YOUR ASSIGNED QUEUE</span><h3>{role.label}</h3><p>{queueMeta?.scope || role.scope}{queueMeta?.region ? ` · ${queueMeta.region}` : ''}{queueMeta?.area ? ` · ${queueMeta.area}` : ''}{queueMeta?.store_id ? ` · ${queueMeta.store_id}` : ''}. {queueMeta?.note || role.description}</p></div><span className={`workforce-priority-pill priority-${role.priority.toLowerCase()}`}>{role.priority === 'Routine' ? 'Routine execution' : `${role.priority} owner`}</span></section>
    <section className="task-progress-panel"><div><span className="task-progress-kicker">YOUR TASK PROGRESS</span><strong>{tasks.length ? Math.round(completedCount / tasks.length * 100) : 0}%</strong><span>{formatNumber(tasks.length - completedCount)} tasks remain open</span></div><div className="task-big-track"><span style={{ width: `${tasks.length ? completedCount / tasks.length * 100 : 0}%` }} /></div><Icon name="checklist" size={31} /></section>
    {queueMeta?.escalation_count > 0 && <div className="escalation-banner"><Icon name="alert" size={17} /><span><strong>{formatNumber(queueMeta.escalation_count)} critical case(s) need Head Office ownership.</strong> Your queue remains responsible for its assigned tier; escalate rather than taking over another designation's decision.</span></div>}
    <section className="panel tasks-panel"><div className="task-toolbar"><div className="segmented-tabs">{['Open', 'Completed', 'All'].map((item) => <button key={item} className={scope === item ? 'active' : ''} onClick={() => setScope(item)}>{item}{item === 'Open' && <small>{formatNumber(tasks.length - completedCount)}</small>}</button>)}</div><div className="search-field task-search"><Icon name="search" size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a task or store…" /></div></div>
      {error && <div className="connection-banner workforce-error"><span className="connection-icon"><Icon name="alert" size={17} /></span><div><strong>Assigned queue unavailable</strong><p>{error}</p><small>Check that the FastAPI backend is running.</small></div></div>}
      {loading ? <div className="workforce-loading"><span className="loading-spinner" /> Loading tasks for {role.label}…</div> : <div className="task-list">{pageRows.map((task) => { const completed = Boolean(doneIds[task.id]); const store = stores.find((item) => item.store_id === task.store_id); return <div className={`task-row ${completed ? 'task-completed' : ''}`} key={task.id}><button className={`task-checkbox ${completed ? 'checked' : ''}`} onClick={() => toggle(task.id)} aria-label={completed ? 'Mark task open' : 'Mark task complete'}>{completed && <Icon name="check" size={15} />}</button><div className="task-copy"><div className="task-title-line"><strong>{task.task}</strong>{completed && <span className="completed-pill">Completed</span>}</div><button className="task-store-link" onClick={() => store && onSelectStore(store)} disabled={!store}>{task.store_id} · {task.location} <Icon name="arrow" size={13} /></button><small className="task-assignment-meta">{task.assignment_type || 'Assigned task'} · {task.due_label || 'Today'}{task.escalated_to ? ` · Escalation owner: ${task.escalated_to}` : ''}</small></div><PriorityBadge priority={task.priority} /><span className="task-score">{Math.round(task.risk_score)}<small>risk</small></span></div>; })}
        {!pageRows.length && !error && <EmptyState title="No tasks match this view" body={designation === 'head' ? 'There are no Critical cases in the current report, or the selected filter removed them.' : 'No tasks were found for this designation and scope. Check the selected region/store or choose another task filter.'} action="Show all tasks" onAction={() => { setScope('All'); setQuery(''); }} />}
      </div>}
      <div className="table-pagination"><span>Showing <strong>{visible.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, visible.length)}</strong> of <strong>{formatNumber(visible.length)}</strong> tasks</span><div><button className="page-button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button><span className="page-count">{page} / {pageCount}</span><button className="page-button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</button></div></div>
    </section>
    <p className="data-note"><Icon name="shield" size={14} /> Task completion is saved in this browser for the demo. It doesn't modify stock or external task systems. Critical, High, Medium and Low case ownership stays with its designated tier.</p>
  </div>;
}

function ApprovalsPage({ stores, actions, draft, onClearDraft, onSubmitAction, busy, designation, region, area, assignedStoreId }) {
  const [storeId, setStoreId] = useState(draft?.store_id || '');
  const [action, setAction] = useState(draft?.action || '');
  const [note, setNote] = useState(draft?.manager_note || '');
  const [decision, setDecision] = useState('Approved');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');
  const role = roleDetails(designation);
  const canApprove = designation !== 'shift';
  const expectedPriority = role.priority;
  const approvalStores = stores.filter((store) => {
    if (!canApprove || store.priority !== expectedPriority) return false;
    if (designation === 'store' && assignedStoreId && store.store_id !== assignedStoreId) return false;
    if (designation === 'regional' && region && String(store.region || store.location) !== region) return false;
    if (designation === 'area' && area && String(store.area || '') !== area) return false;
    return true;
  });
  const selectedStore = approvalStores.find((store) => store.store_id === storeId);
  const recommended = splitSemicolon(selectedStore?.recommended_actions);
  useEffect(() => {
    if (draft?.store_id) setStoreId(draft.store_id);
    if (draft?.action) setAction(draft.action);
    if (draft?.manager_note !== undefined) setNote(draft.manager_note || '');
  }, [draft]);
  useEffect(() => { if (!recommended.includes(action)) setAction(recommended[0] || ''); }, [storeId, recommended.length]);
  const filteredActions = actions.filter((item) => filter === 'All' || item.decision === filter);
  const handleSubmit = async (event) => {
    event.preventDefault(); setError('');
    if (!storeId || !action) { setError('Select a store and a recommendation before recording a decision.'); return; }
    const ok = await onSubmitAction({ store_id: storeId, action, decision, manager_note: note });
    if (ok) { setNote(''); setError(''); onClearDraft(); }
    else setError('The decision could not be saved. Check the API status and try again.');
  };
  return <div className="page-stack">
    <div className="page-intro"><div><span className="eyebrow">HUMAN REVIEW WORKFLOW</span><h2>Action approvals</h2><p>Make the call on a store recommendation and keep a traceable decision record.</p></div><div className="intro-counter"><strong>{formatNumber(actions.length)}</strong><span>decisions recorded</span></div></div>
    <section className="approval-grid">
      <section className="panel approval-form-panel"><PanelHeader title="Review a recommendation" description="Approvals are recorded as simulated decisions only" />
        <form onSubmit={handleSubmit} className="approval-form">
          <div className="approval-role-hint"><Icon name="shield" size={16} /><span><strong>{role.label}</strong><small>Your approval queue is limited to {expectedPriority.toLowerCase()} priority cases{['regional', 'area'].includes(designation) ? ` in ${designation === 'area' ? `${area} · ${region}` : region}` : designation === 'store' ? ` at ${assignedStoreId}` : ''}.</small></span></div>
          {!canApprove && <p className="form-error">Shift Supervisors complete local verification tasks. Business actions must be approved by the accountable risk owner.</p>}
          <label htmlFor="approval-store">Store</label><select id="approval-store" className="form-select" value={storeId} onChange={(e) => { setStoreId(e.target.value); setAction(''); }} required disabled={!canApprove}><option value="">Choose an assigned store…</option>{approvalStores.map((store) => <option key={store.store_id} value={store.store_id}>{store.store_id} · {store.location || 'Franchise store'} · risk {Math.round(Number(store.risk_score || 0))}</option>)}</select>
          {selectedStore && <div className="selected-store-preview"><span className="selected-store-icon"><Icon name="store" size={19} /></span><div><strong>{selectedStore.store_id}</strong><small>{selectedStore.location || 'Franchise location'} · {splitSemicolon(selectedStore.detected_problems)[0] || 'Routine monitoring'}</small></div><PriorityBadge priority={selectedStore.priority} /></div>}
          <label htmlFor="approval-action">Recommended action</label><select id="approval-action" className="form-select" value={action} onChange={(e) => setAction(e.target.value)} required disabled={!selectedStore}><option value="">Choose a recommendation…</option>{recommended.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <label>Manager decision</label><div className="decision-toggle"><button type="button" className={decision === 'Approved' ? 'decision-choice selected approve-choice' : 'decision-choice'} onClick={() => setDecision('Approved')}><Icon name="check" size={17} /> Approve action</button><button type="button" className={decision === 'Rejected' ? 'decision-choice selected reject-choice' : 'decision-choice'} onClick={() => setDecision('Rejected')}><Icon name="close" size={17} /> Reject action</button></div>
          <label htmlFor="manager-note">Manager note <span className="optional-label">Optional</span></label><textarea id="manager-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add context, owner, or follow-up notes…" rows={3} maxLength={1000} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="primary-button approval-submit" disabled={!canApprove || busy || !storeId || !action}>{busy ? 'Saving decision…' : 'Record decision'}<Icon name="arrow" size={17} /></button>
          <p className="approval-warning"><Icon name="shield" size={16} /> This demo does not place orders, contact suppliers, apply markdowns, or modify external systems.</p>
        </form>
      </section>
      <section className="panel approval-history-panel"><div className="history-header"><PanelHeader title="Decision history" description="Most recent manager decisions first" /><select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter decisions" className="small-select"><option>All</option><option>Approved</option><option>Rejected</option></select></div>
        {filteredActions.length ? <div className="history-list">{filteredActions.slice(0, 30).map((item, index) => <article className="history-item" key={`${item.timestamp}-${index}`}><span className={`decision-icon ${item.decision === 'Approved' ? 'decision-approved' : 'decision-rejected'}`}><Icon name={item.decision === 'Approved' ? 'check' : 'close'} size={15} /></span><div className="history-copy"><div className="history-title"><strong>{item.store_id}</strong><span className={item.decision === 'Approved' ? 'text-approved' : 'text-rejected'}>{item.decision}</span></div><p>{item.action}</p>{item.manager_note && <blockquote>{item.manager_note}</blockquote>}<small>{item.timestamp ? new Date(item.timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Time not available'} · {item.manager_name ? `by ${item.manager_name} · ` : ''}{item.manager_designation ? `${roleDetails(item.manager_designation).label} · ` : ''}{item.manager_region ? `${item.manager_region} · ` : ''}{item.manager_area ? `${item.manager_area} · ` : ''}{item.manager_store_id ? `${item.manager_store_id} · ` : ''}{item.execution_status || 'Recorded'}</small></div></article>)}</div> : <EmptyState title="No decisions yet" body="Use the review form to approve or reject one of a store's recommended actions." />}
      </section>
    </section>
  </div>;
}

function StoreDrawer({ store, onClose, onQueueApproval, designation }) {
  useEffect(() => {
    if (!store) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('drawer-open');
    return () => { window.removeEventListener('keydown', onKey); document.body.classList.remove('drawer-open'); };
  }, [store, onClose]);
  if (!store) return null;
  const problems = splitSemicolon(store.detected_problems);
  const recommendations = splitSemicolon(store.recommended_actions);
  const caseOwnerKey = PRIORITY_OWNER[store.priority] || 'store';
  const isAccountableRole = caseOwnerKey === designation;
  const signalLinks = Array.isArray(store.signal_links) ? store.signal_links : [];
  const actionOptions = Array.isArray(store.action_options) ? store.action_options : [];
  const lowStockItems = Array.isArray(store.low_stock_items) ? store.low_stock_items : [];
  const expiryItems = Array.isArray(store.expiry_items) ? store.expiry_items : [];
  const transferCandidates = Array.isArray(store.transfer_candidates) ? store.transfer_candidates : [];
  const complaintThemes = Array.isArray(store.complaint_themes) ? store.complaint_themes : [];
  const riskContributions = [
    ['Inventory shortages', 'inventory_risk'],
    ['Wastage / overstock', 'wastage_risk'],
    ['Supplier delays', 'supplier_risk'],
    ['Compliance', 'compliance_risk'],
    ['Staffing', 'staffing_risk'],
    ['Sales movement', 'sales_risk'],
    ['Margin pressure', 'margin_risk'],
    ['Customer activity', 'customer_risk'],
    ['Expiry exposure', 'expiry_risk'],
  ].map(([label, key]) => ({ label, points: Math.max(0, Number(store[key] || 0)) }))
    .filter((item) => item.points > 0)
    .sort((a, b) => b.points - a.points);
  const maxRiskContribution = Math.max(1, ...riskContributions.map((item) => item.points));
  const facts = [
    { label: 'Sales change', value: formatPct(store.sales_change_pct), tone: Number(store.sales_change_pct) < 0 ? 'negative-value' : '' },
    { label: 'Fresh-food waste', value: formatPct(store.fresh_wastage_growth_pct), tone: Number(store.fresh_wastage_growth_pct) > 0 ? 'negative-value' : '' },
    { label: 'Transactions change', value: formatPct(store.transactions_change_pct), tone: Number(store.transactions_change_pct) < 0 ? 'negative-value' : '' },
    { label: 'Footfall change', value: formatPct(store.footfall_change_pct), tone: Number(store.footfall_change_pct) < 0 ? 'negative-value' : '' },
    { label: 'Low-stock products', value: formatNumber(store.low_stock_count) },
    { label: 'Delayed orders', value: formatNumber(store.delayed_orders) },
    { label: 'At-risk perishables', value: formatNumber(store.perishable_expiry_risk_count) },
    { label: 'Gross margin rate', value: store.gross_margin_pct !== undefined ? `${Number(store.gross_margin_pct).toFixed(1)}%` : '—' },
    { label: 'Margin movement', value: store.gross_margin_change_pp !== undefined ? `${Number(store.gross_margin_change_pp) > 0 ? '+' : ''}${Number(store.gross_margin_change_pp).toFixed(1)} pp` : '—', tone: Number(store.gross_margin_change_pp) < 0 ? 'negative-value' : '' },
    { label: 'Complaints (latest)', value: `${formatNumber(store.complaints_current)} · ${formatPct(store.complaints_change_pct)}`, tone: Number(store.complaints_change_pct) > 0 ? 'negative-value' : '' },
    { label: 'Compliance score', value: store.checklist_score !== undefined ? `${Math.round(Number(store.checklist_score))}/100` : '—' },
  ];
  return <div className="drawer-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="store-drawer" aria-label={`${store.store_id} store details`}>
    <div className="drawer-top"><span className="eyebrow">STORE INSPECTION BRIEF</span><button className="icon-button drawer-close" onClick={onClose} aria-label="Close details"><Icon name="close" size={20} /></button></div>
    <div className="drawer-heading"><span className="drawer-store-icon"><Icon name="store" size={23} /></span><div><h2>{store.store_id}</h2><p><Icon name="pin" size={14} /> {store.location || 'Franchise location'}{store.format ? ` · ${store.format}` : ''}</p></div></div>
    <div className="drawer-risk-block"><div><span>Assessed risk score</span><strong>{Math.round(Number(store.risk_score || 0))}<small>/100</small></strong></div><PriorityBadge priority={store.priority} /><RiskBar value={store.risk_score} color={PRIORITY_COLORS[store.priority] || PRIORITY_COLORS.Low} /></div>
    <div className={`case-owner-banner ${isAccountableRole ? 'case-owner-current' : 'case-owner-escalated'}`}><span className="case-owner-icon"><Icon name={isAccountableRole ? 'shield' : 'users'} size={17} /></span><div><span className="micro-label">ACCOUNTABLE CASE OWNER</span><strong>{roleDetails(caseOwnerKey).label}</strong><p>{isAccountableRole ? 'This priority tier belongs to your designation. Review evidence and approve or reject the proposed action.' : `Your role can complete local execution tasks, but the ${store.priority} case must be owned by ${roleDetails(caseOwnerKey).label}.`}</p></div></div>
    <section className="drawer-section"><h3>Risk score breakdown</h3><div className="risk-score-meta"><div><span>Weighted signal score</span><strong>{Math.round(Number(store.risk_score_base ?? store.risk_score ?? 0))}/100</strong></div><div><span>Escalation adjustment</span><strong>+{Math.round(Number(store.risk_floor_adjustment || 0))}</strong></div></div>{riskContributions.length ? <div className="risk-contribution-list">{riskContributions.map((item) => <div className="risk-contribution-row" key={item.label}><div><span>{item.label}</span><strong>{item.points.toFixed(1)}</strong></div><div className="risk-contribution-track"><span style={{ width: `${Math.max(5, (item.points / maxRiskContribution) * 100)}%` }} /></div></div>)}</div> : <p className="drawer-muted">No material risk contribution was calculated in this snapshot.</p>}<p className="drawer-muted">Transparent rule-based points. The final score can apply a minimum floor to substantive exceptions so an isolated high-impact issue is not buried.</p></section>
    <section className="drawer-section"><h3>Why this store is flagged</h3><p className="root-cause-copy">{store.root_cause || 'No explanatory summary is available for this store.'}</p><div className="finding-list">{problems.map((problem, index) => <div className="finding-row" key={`${problem}-${index}`}><span className="finding-bullet"><Icon name="alert" size={14} /></span><span>{problem}</span></div>)}</div></section>
    <section className="drawer-section"><h3>Evidence from the current report</h3><div className="store-facts-grid">{facts.map((fact) => <div className="store-fact" key={fact.label}><span>{fact.label}</span><strong className={fact.tone}>{fact.value}</strong></div>)}</div></section>
    {complaintThemes.length > 0 && <section className="drawer-section"><h3>Customer feedback themes <span>{formatNumber(store.complaints_current)}</span></h3><div className="complaint-theme-grid">{complaintThemes.map((theme) => <article className="complaint-theme-pill" key={theme.label}><div><strong>{theme.label}</strong><span>{theme.current} now · {theme.previous} previous</span></div><b className={Number(theme.change_pct) > 0 ? 'negative-value' : ''}>{Number(theme.change_pct) > 0 ? '+' : ''}{Number(theme.change_pct).toFixed(1)}%</b></article>)}</div><p className="drawer-muted">Feedback themes are synthetic demo signals. Confirm the actual complaint records before assigning cause or changing operations.</p></section>}
    <section className="drawer-section"><h3>How the signals connect <span>{signalLinks.length}</span></h3>
      {signalLinks.length ? <div className="signal-link-list">{signalLinks.map((link, index) => <article className="signal-link-card" key={`${link.title}-${index}`}><div className="signal-link-heading"><span className="signal-link-number">{String(index + 1).padStart(2, '0')}</span><strong>{link.title}</strong><span className="signal-strength">{link.strength}</span></div><div className="signal-evidence-pills">{(link.evidence || []).map((evidence) => <span key={evidence}>{evidence}</span>)}</div><p>{link.interpretation}</p>{link.caveat && <small className="signal-caveat">Check before acting: {link.caveat}</small>}</article>)}</div> : <p className="drawer-muted">The report has no connected signal narrative for this store yet.</p>}
    </section>
    {lowStockItems.length > 0 && <section className="drawer-section"><h3>Fast-moving items below reorder <span>{formatNumber(store.low_stock_count)}</span></h3><div className="sku-evidence-list">{lowStockItems.slice(0, 6).map((item) => <div className="sku-evidence-row" key={item.sku}><div><strong>{item.sku}</strong><small>{item.category} · {item.daily_sales} sold in latest snapshot · {item.days_of_stock} day(s) cover · {item.action_timing}</small></div><span><strong>{item.stock}</strong> in stock <small>reorder at {item.reorder_level} · open PO {item.open_po_qty} · draft +{item.proposed_replenishment_units}</small></span></div>)}</div>{transferCandidates.length > 0 && <div className="transfer-shortlist"><strong>Potential donor-store stock (verify before moving)</strong>{transferCandidates.slice(0, 4).map((item) => <div className="transfer-row" key={`${item.sku}-${item.from_store}`}><span><b>{item.sku}</b><small>{item.from_store} · {item.from_location}</small></span><span>{item.suggested_units} unit(s)<small>suggested transfer</small></span></div>)}</div>}</section>}
    {expiryItems.length > 0 && <section className="drawer-section"><h3>Perishables with excess stock cover <span>{expiryItems.length}</span></h3><div className="sku-evidence-list">{expiryItems.slice(0, 5).map((item) => <div className="sku-evidence-row" key={item.sku}><div><strong>{item.sku}</strong><small>{item.category} · {item.stock} units · {item.daily_sales} sold in latest snapshot</small></div><span className="negative-value"><strong>{item.days_of_stock}</strong> days cover<small>shelf life {item.shelf_life_days} days</small></span></div>)}</div></section>}
    <section className="drawer-section"><h3>Compare response options <span>{actionOptions.length || recommendations.length}</span></h3>
      {actionOptions.length ? <div className="action-option-list">{actionOptions.map((option, index) => <article className={`action-option-card ${option.recommended ? 'action-option-best' : ''}`} key={`${option.kind}-${index}`}><div className="action-option-top"><span className="option-kind">{option.recommended ? 'BEST CURRENT MOVE' : `ALTERNATIVE ${index}`}</span><span className="option-fit">Fit {option.score}/100</span></div><h4>{option.title}</h4><p className="option-rationale">{option.rationale}</p><div className="option-detail"><span>EXPECTED IMPACT</span><p>{option.expected_impact}</p></div><div className="option-detail option-tradeoff"><span>TRADE-OFF TO CHECK</span><p>{option.tradeoff}</p></div><button onClick={() => onQueueApproval(store, option.action)}>{option.recommended ? 'Review recommended move' : 'Review this alternative'} <Icon name="arrow" size={14} /></button></article>)}</div> : <div className="recommendation-list">{recommendations.map((recommendation, index) => <div className="recommendation-card" key={`${recommendation}-${index}`}><span className="recommendation-number">{String(index + 1).padStart(2, '0')}</span><p>{recommendation}</p><button onClick={() => onQueueApproval(store, recommendation)}>Review action <Icon name="arrow" size={14} /></button></div>)}</div>}
    </section>
    <div className="drawer-footer"><span><Icon name="question" size={14} /> Recommendations require manager review.</span><button className="secondary-button" onClick={onClose}>Done</button></div>
  </aside></div>;
}

function currencyINR(value) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value));
}

function getBestOption(store, kind = null) {
  const options = Array.isArray(store?.action_options) ? store.action_options : [];
  return options.find((option) => option.recommended && (!kind || option.kind === kind))
    || options.find((option) => !kind || option.kind === kind)
    || options.find((option) => option.recommended)
    || options[0]
    || null;
}

function DecisionCentrePage({ stores, onSelectStore, onQueueApproval }) {
  const priorities = useMemo(() => [...stores]
    .filter((store) => Number(store.risk_score || 0) >= 30 || splitSemicolon(store.detected_problems).length > 0)
    .sort((a, b) => Number(b.risk_score || 0) - Number(a.risk_score || 0))
    .slice(0, 8), [stores]);
  const criticalCount = stores.filter((store) => store.priority === 'Critical').length;
  const multiSignal = stores.filter((store) => (Array.isArray(store.signal_links) ? store.signal_links.length : 0) >= 2).length;
  return <div className="page-stack premium-page">
    <section className="page-hero page-hero-decision">
      <div className="page-hero-copy"><span className="hero-kicker"><span className="live-dot" /> HEAD OFFICE DECISION DESK</span><h2>Make the next move<br /><em>with the evidence in view.</em></h2><p>FreshBasket connects sales, shelf availability, wastage, suppliers and customer signals—then gives the manager the final say.</p><div className="hero-actions"><span className="hero-chip"><Icon name="shield" size={15} /> Human approval required</span><span className="hero-chip"><Icon name="pulse" size={15} /> Explainable, rule-based analysis</span></div></div>
      <div className="hero-side-stat"><span>Critical stores</span><strong>{formatNumber(criticalCount)}</strong><small>of {formatNumber(stores.length)} monitored</small><div className="hero-stat-foot"><i /> {formatNumber(multiSignal)} stores have multiple linked signals</div></div>
      <div className="hero-ornament hero-ornament-one" /><div className="hero-ornament hero-ornament-two" />
    </section>
    <section className="decision-steps-strip"><div><span>01</span><strong>Observe</strong><small>Source records</small></div><b>→</b><div><span>02</span><strong>Connect</strong><small>Evidence patterns</small></div><b>→</b><div><span>03</span><strong>Compare</strong><small>Practical options</small></div><b>→</b><div><span>04</span><strong>Recommend</strong><small>One next move</small></div><b>→</b><div><span>05</span><strong>Approve</strong><small>Manager decides</small></div></section>
    <div className="page-intro compact-page-intro"><div><span className="eyebrow">TODAY'S INTERVENTIONS</span><h2>Start with the stores that need a decision</h2><p>These are the highest-priority stores in the current report, ranked by assessed risk.</p></div><div className="intro-counter"><strong>{formatNumber(priorities.length)}<small> / 8</small></strong><span>priority briefs shown</span></div></div>
    <section className="decision-centre-grid">
      {priorities.slice(0, 6).map((store, index) => {
        const best = getBestOption(store);
        const links = Array.isArray(store.signal_links) ? store.signal_links : [];
        const evidence = [];
        if (Number(store.sales_change_pct) <= -8) evidence.push({ label: `Sales ${formatPct(store.sales_change_pct)}`, tone: 'red' });
        if (Number(store.transactions_change_pct) <= -8) evidence.push({ label: `Transactions ${formatPct(store.transactions_change_pct)}`, tone: 'amber' });
        if (Number(store.low_stock_count) > 0) evidence.push({ label: `${formatNumber(store.low_stock_count)} low-stock SKUs`, tone: 'amber' });
        if (Number(store.fresh_wastage_growth_pct) >= 20) evidence.push({ label: `Fresh waste ${formatPct(store.fresh_wastage_growth_pct)}`, tone: 'red' });
        if (Number(store.delayed_orders) > 0) evidence.push({ label: `${formatNumber(store.delayed_orders)} delayed POs`, tone: 'blue' });
        if (Number(store.perishable_expiry_risk_count) > 0) evidence.push({ label: `${formatNumber(store.perishable_expiry_risk_count)} expiry risks`, tone: 'amber' });
        return <article className={`decision-brief-card ${store.priority === 'Critical' ? 'decision-brief-critical' : ''}`} key={store.store_id}>
          <div className="decision-brief-top"><span className="decision-brief-rank">#{String(index + 1).padStart(2, '0')} · {store.location || 'Network store'}</span><PriorityBadge priority={store.priority} /></div>
          <div className="decision-brief-title"><div><h3>{store.store_id}</h3><p>{store.format || 'Franchise store'}{store.franchisee ? ` · ${store.franchisee}` : ''}</p></div><div className="decision-brief-score"><strong>{Math.round(Number(store.risk_score || 0))}</strong><small>risk / 100</small></div></div>
          <div className="decision-evidence-row">{evidence.slice(0, 4).map((item) => <span className={`evidence-chip evidence-${item.tone}`} key={item.label}>{item.label}</span>)}</div>
          <div className="decision-brief-section"><span className="micro-label">LIKELY EXPLANATION</span><strong>{links[0]?.title || splitSemicolon(store.detected_problems)[0] || 'Routine monitoring'}</strong><p>{links[0]?.interpretation || store.root_cause || 'The current report does not show a strong cross-signal pattern.'}</p></div>
          <div className="decision-next-move"><span className="micro-label">SUGGESTED NEXT MOVE</span><strong>{best?.title || splitSemicolon(store.recommended_actions)[0] || 'Review the daily store checks'}</strong><small>{best?.expected_impact || 'Inspect evidence before taking action.'}</small></div>
          <div className="decision-card-actions"><button className="secondary-button" onClick={() => onSelectStore(store)}>Inspect evidence</button>{best?.action && <button className="primary-button" onClick={() => onQueueApproval(store, best.action)}>Review action <Icon name="arrow" size={15} /></button>}</div>
        </article>;
      })}
      {!priorities.length && <EmptyState title="No decision briefs yet" body="The decision desk will populate after the API loads an analyzed report." />}
    </section>
    <WhatIfSimulator stores={stores} onQueueApproval={onQueueApproval} />
    <p className="data-note"><Icon name="question" size={14} /> This workspace uses synthetic business data and transparent rules. A linked pattern is an investigation lead, not proof of cause; simulations do not change stock or execute purchases.</p>
  </div>;
}

function WhatIfSimulator({ stores, onQueueApproval }) {
  const suitableStores = useMemo(() => stores.filter((store) => (store.low_stock_items || []).length || (store.expiry_items || []).length), [stores]);
  const defaultStore = suitableStores.find((store) => store.store_id === 'Store_0017') || suitableStores[0];
  const [storeId, setStoreId] = useState(defaultStore?.store_id || '');
  const [kind, setKind] = useState('transfer');
  const [sku, setSku] = useState('');
  const [quantity, setQuantity] = useState(null);
  const [markdown, setMarkdown] = useState(10);
  const [result, setResult] = useState(null);
  const [comparisonRuns, setComparisonRuns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectedStore = stores.find((store) => store.store_id === storeId);
  const candidates = selectedStore?.transfer_candidates || [];
  const stockItems = selectedStore?.low_stock_items || [];
  const expiryItems = selectedStore?.expiry_items || [];
  const items = kind === 'markdown' ? expiryItems : kind === 'transfer' ? stockItems.filter((item) => candidates.some((candidate) => candidate.sku === item.sku)) : stockItems;
  const selectedItem = items.find((item) => item.sku === sku) || items[0];
  useEffect(() => {
    if (suitableStores.length && !suitableStores.some((store) => store.store_id === storeId)) setStoreId(defaultStore?.store_id || suitableStores[0].store_id);
  }, [suitableStores, storeId, defaultStore]);
  useEffect(() => { setSku(items[0]?.sku || ''); setQuantity(null); setResult(null); setError(''); }, [storeId, kind]);
  useEffect(() => { setResult(null); }, [sku, quantity, markdown]);
  useEffect(() => { setQuantity(null); }, [sku]);
  const donorSurplus = Number(candidates.find((item) => item.sku === selectedItem?.sku)?.available_surplus_units || 0);
  const suggested = kind === 'transfer' ? Number(candidates.find((item) => item.sku === selectedItem?.sku)?.suggested_units || 0) : Number(selectedItem?.proposed_replenishment_units || 0);
  const cap = kind === 'transfer' ? Math.min(donorSurplus, suggested) : kind === 'markdown' ? 50 : Number(selectedItem?.target_stock_units || selectedItem?.proposed_replenishment_units || 0);
  const approvalOption = selectedStore ? getBestOption(selectedStore, kind === 'markdown' ? 'waste' : kind === 'transfer' ? 'transfer' : null) : null;
  const saveComparison = (simulation) => {
    const key = `${simulation.store_id}::${simulation.kind}::${simulation.sku || ''}::${simulation.quantity ?? 0}::${simulation.markdown_percent ?? 0}`;
    setComparisonRuns((current) => [...current.filter((item) => item.comparison_key !== key), { ...simulation, comparison_key: key }].slice(-4));
  };
  const run = async () => {
    setBusy(true); setError('');
    try {
      const payload = await api('/api/decision/simulate', { method: 'POST', body: JSON.stringify({ store_id: storeId, kind, sku: kind === 'wait' ? null : selectedItem?.sku || null, quantity, markdown_percent: markdown }) });
      setResult(payload);
    } catch (exception) { setError(exception.message || 'The simulation could not be calculated.'); }
    finally { setBusy(false); }
  };
  return <section className="panel whatif-panel">
    <div className="whatif-heading"><div><span className="eyebrow"><Icon name="pulse" size={14} /> DECISION SIMULATOR</span><h2>What changes if we act now?</h2><p>Change the intervention and compare it with the current position before sending anything for approval.</p></div><span className="simulation-stamp"><Icon name="shield" size={15} /> Non-persistent simulation</span></div>
    <div className="whatif-layout"><div className="whatif-controls">
      <label htmlFor="whatif-store">Store</label><select id="whatif-store" value={storeId} onChange={(event) => setStoreId(event.target.value)}>{suitableStores.slice(0, 300).map((store) => <option key={store.store_id} value={store.store_id}>{store.store_id} · {store.location} · risk {Math.round(Number(store.risk_score || 0))}</option>)}</select>
      <label htmlFor="whatif-kind">Action to test</label><select id="whatif-kind" value={kind} onChange={(event) => setKind(event.target.value)}><option value="transfer">Transfer stock</option><option value="replenishment">Replenishment order</option><option value="markdown">Fresh markdown scenario</option><option value="wait">Wait and monitor</option></select>
      {kind !== 'wait' && <><label htmlFor="whatif-sku">Product / SKU</label><select id="whatif-sku" value={selectedItem?.sku || ''} onChange={(event) => setSku(event.target.value)}>{items.map((item) => <option key={item.sku} value={item.sku}>{item.sku} · {item.category || 'Product'}{kind === 'markdown' ? ` · ${item.days_of_stock}d cover` : ` · ${item.stock} in stock`}</option>)}</select></>}
      {kind === 'transfer' && selectedItem && <div className="slider-setting"><div><label htmlFor="whatif-qty">Transfer quantity</label><strong>{quantity ?? suggested} units</strong></div><input id="whatif-qty" type="range" min="0" max={Math.max(1, Math.min(500, cap))} value={quantity ?? suggested} onChange={(event) => setQuantity(Number(event.target.value))} /><small>Suggested {formatNumber(suggested)} · donor surplus estimate {formatNumber(donorSurplus)}</small></div>}
      {kind === 'replenishment' && selectedItem && <div className="slider-setting"><div><label htmlFor="whatif-replenish">Replenishment quantity</label><strong>{quantity ?? suggested} units</strong></div><input id="whatif-replenish" type="range" min="0" max={Math.max(1, Math.min(1000, Number(selectedItem.target_stock_units || 0) * 2))} value={quantity ?? suggested} onChange={(event) => setQuantity(Number(event.target.value))} /><small>Analyzer suggestion {formatNumber(suggested)} · open PO quantity {formatNumber(selectedItem.open_po_qty)}</small></div>}
      {kind === 'markdown' && <div className="slider-setting"><div><label htmlFor="whatif-markdown">Markdown assumption</label><strong>{markdown}%</strong></div><input id="whatif-markdown" type="range" min="0" max="50" step="5" value={markdown} onChange={(event) => setMarkdown(Number(event.target.value))} /><small>Illustrative demand uplift only; confirm actual expiry dates and price rules.</small></div>}
      <button className="primary-button simulate-button" onClick={run} disabled={busy || (kind !== 'wait' && !selectedItem)}>{busy ? 'Calculating…' : 'Run what-if simulation'}<Icon name="arrow" size={16} /></button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
    <div className="whatif-results">
      {!result && <div className="whatif-empty"><span className="whatif-orb"><Icon name="pulse" size={25} /></span><h3>Test before you commit</h3><p>The simulator calculates stock cover, shortage changes, indicative cost or markdown sell-through based on the selected report row.</p><div className="whatif-empty-note"><Icon name="info" size={14} /> It won't alter the report, inventory, prices or purchase orders.</div></div>}
      {result && <><div className="simulation-result-top"><span className="micro-label">SIMULATION RESULT</span><span className="simulation-kind-pill">{result.kind}</span></div><h3>{result.action_summary}</h3>
        <div className="simulation-kpi-grid">{result.days_of_cover_before !== undefined && <div><span>Cover before</span><strong>{Number(result.days_of_cover_before).toFixed(1)}d</strong></div>}{result.days_of_cover_after !== undefined && <div><span>Cover after</span><strong>{Number(result.days_of_cover_after).toFixed(1)}d</strong></div>}{result.shortage_units_before !== undefined && <div><span>Target gap before</span><strong>{formatNumber(result.shortage_units_before)}</strong></div>}{result.shortage_units_after !== undefined && <div><span>Target gap after</span><strong>{formatNumber(result.shortage_units_after)}</strong></div>}{result.target_stock_units !== undefined && <div><span>Target stock</span><strong>{formatNumber(result.target_stock_units)}</strong></div>}{result.estimated_cost !== undefined && <div><span>Indicative cost</span><strong>{currencyINR(result.estimated_cost)}</strong></div>}{result.additional_units_cleared_estimate !== undefined && <div><span>Extra units cleared*</span><strong>{formatNumber(result.additional_units_cleared_estimate)}</strong></div>}{result.estimated_revenue_at_markdown !== undefined && <div><span>Revenue at markdown*</span><strong>{currencyINR(result.estimated_revenue_at_markdown)}</strong></div>}{result.stock_after !== undefined && <div><span>Stock after</span><strong>{formatNumber(result.stock_after)}</strong></div>}</div>
        {result.donor_store && <p className="simulation-assumption">Potential donor: <strong>{result.donor_store}</strong> · proposed quantity {formatNumber(result.quantity)} units.</p>}
        {result.kind === 'transfer' && result.donor_store && <section className={`network-safety-check ${result.donor_reserve_protected === true ? 'is-safe' : result.donor_reserve_protected === false ? 'is-blocked' : 'needs-check'}`} aria-label="Network safety check">
          <div className="network-safety-check-heading"><span className="network-safety-check-icon"><Icon name={result.donor_reserve_protected === true ? 'shield' : 'alert'} size={17} /></span><span><strong>{result.donor_reserve_protected === true ? 'Donor reserve protected' : result.donor_reserve_protected === false ? 'Donor reserve needs attention' : 'Verify donor reserve'}</strong><small>{result.donor_reserve_protected === true ? 'The simulated transfer stays above the calculated stock floor.' : result.donor_reserve_protected === false ? 'Do not approve until the transfer quantity is reduced.' : 'SKU-level donor stock details are incomplete in this report.'}</small></span><b className="network-safety-status">{result.network_safety_status || 'Review'}</b></div>
          <div className="network-safety-metrics"><div><span>Donor stock now</span><strong>{result.donor_current_stock_units == null ? '—' : formatNumber(result.donor_current_stock_units)}</strong></div><div><span>Protected reserve</span><strong>{result.donor_safety_reserve_units == null ? '—' : formatNumber(result.donor_safety_reserve_units)}</strong></div><div><span>After this transfer</span><strong>{result.donor_stock_after_transfer == null ? '—' : formatNumber(result.donor_stock_after_transfer)}</strong></div><div><span>Cover after</span><strong>{result.donor_days_of_stock_after == null ? '—' : `${Number(result.donor_days_of_stock_after).toFixed(1)} days`}</strong></div></div>
          <p className="network-safety-policy">A proposal cannot use more than the network-allocated surplus. Confirm the real shelf count and the donor's next demand before approval.</p>
        </section>}
        <ul className="simulation-assumptions">{(result.assumptions || []).map((item) => <li key={item}>{item}</li>)}</ul><div className="simulation-notice"><Icon name="shield" size={15} /> {result.notice}</div>
        <div className="simulation-result-actions">
          <button className="secondary-button" onClick={() => saveComparison(result)}><Icon name="chart" size={15} /> Add to comparison</button>
          {result.kind !== 'wait' && approvalOption?.action && <button className="primary-button simulation-approval-cta" onClick={() => onQueueApproval(selectedStore, approvalOption.action, `What-if review: ${result.action_summary}. ${result.quantity !== undefined ? `Proposed quantity: ${formatNumber(result.quantity)} unit(s). ` : ''}${result.shortage_units_after !== undefined ? `Target stock gap after proposal: ${formatNumber(result.shortage_units_after)} unit(s). ` : ''}${result.estimated_cost !== undefined ? `Illustrative cost: ${currencyINR(result.estimated_cost)}. ` : ''}Validate physical stock, expiry and finance assumptions before recording an approval.`)}><Icon name="clipboard" size={15} /> Prepare manager review <Icon name="arrow" size={15} /></button>}
        </div>
      </>}
    </div></div>
    <section className="simulation-comparison">
      <div className="simulation-comparison-heading"><div><span className="eyebrow">DECISION WORKBENCH</span><h3>Compare response options</h3><p>Keep up to four what-if runs beside each other before choosing which recommendation to review.</p></div><div className="comparison-heading-actions"><span>{comparisonRuns.length} / 4 options</span><button className="quiet-link" onClick={() => setComparisonRuns([])} disabled={!comparisonRuns.length}>Clear</button></div></div>
      {comparisonRuns.length ? <div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>Scenario</th><th>Quantity</th><th>Cover before → after</th><th>Target gap before → after</th><th>Cost / value</th><th /></tr></thead><tbody>{comparisonRuns.map((item) => <tr key={item.comparison_key}><td><strong>{item.kind}</strong><small>{item.store_id}{item.sku ? ` · ${item.sku}` : ''}</small></td><td>{formatNumber(item.quantity)}</td><td>{item.days_of_cover_before !== undefined ? `${Number(item.days_of_cover_before).toFixed(1)}d → ${Number(item.days_of_cover_after ?? item.days_of_cover_before).toFixed(1)}d` : '—'}</td><td>{item.shortage_units_before !== undefined ? `${formatNumber(item.shortage_units_before)} → ${formatNumber(item.shortage_units_after ?? item.shortage_units_before)}` : '—'}</td><td>{item.estimated_cost !== undefined && item.estimated_cost !== null ? currencyINR(item.estimated_cost) : item.estimated_revenue_at_markdown !== undefined && item.estimated_revenue_at_markdown !== null ? currencyINR(item.estimated_revenue_at_markdown) : '—'}</td><td><button className="comparison-remove" onClick={() => setComparisonRuns((current) => current.filter((candidate) => candidate.comparison_key !== item.comparison_key))} aria-label={`Remove ${item.kind} simulation from comparison`}><Icon name="close" size={14} /></button></td></tr>)}</tbody></table></div> : <div className="comparison-empty"><Icon name="chart" size={18} /><span><strong>No options saved yet</strong><small>Run a transfer, replenishment, markdown or wait baseline, then choose “Add to comparison”.</small></span></div>}
      <p className="comparison-footnote"><Icon name="info" size={13} /> Comparison runs live in this page session only. Every row is illustrative; none changes stock or prices.</p>
    </section>
  </section>;
}

function StockBalancingPage({ balancing, stores, onSelectStore, onQueueApproval }) {
  const [query, setQuery] = useState('');
  const [urgency, setUrgency] = useState('All');
  const transferRows = balancing?.transfers || [];
  const visible = useMemo(() => transferRows.filter((item) => {
    const matchesQuery = `${item.sku} ${item.category} ${item.from_store} ${item.from_location} ${item.to_store} ${item.to_location}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (urgency === 'All' || item.receiver_priority === urgency);
  }), [transferRows, query, urgency]);
  const feasibleUnits = visible.reduce((sum, item) => sum + Number(item.suggested_units || 0), 0);
  const review = (transfer) => {
    const store = stores.find((item) => item.store_id === transfer.to_store);
    if (!store) return;
    const option = getBestOption(store, 'transfer');
    const action = option?.action || splitSemicolon(store.recommended_actions)[0];
    if (action) onQueueApproval(store, action, `Network-safe transfer review: ${transfer.suggested_units} unit(s) of ${transfer.sku} from ${transfer.from_store} to ${transfer.to_store}. Donor stock before: ${transfer.donor_current_stock_units ?? 'unknown'}; reserve floor: ${transfer.donor_safety_reserve_units ?? 'unknown'}; estimated stock after network allocation: ${transfer.donor_stock_after_proposal ?? 'unknown'}. ${transfer.allocation_note || ''} Verify physical count and upcoming donor demand before approval.`);
    else onSelectStore(store);
  };
  return <div className="page-stack premium-page">
    <div className="page-intro"><div><span className="eyebrow">NETWORK-SAFE INVENTORY COORDINATION</span><h2>Stock balancing</h2><p>Move feasible surplus to stores with shelf gaps without spending a donor store's protected stock reserve.</p></div><div className="intro-counter"><strong>{formatNumber(transferRows.length)}</strong><span>transfer proposals</span></div></div>
    <section className="stock-balance-summary"><div><span>Proposals in view</span><strong>{formatNumber(visible.length)}</strong><small>Ranked by recipient urgency and stock cover</small></div><div><span>Units suggested</span><strong>{formatNumber(feasibleUnits)}</strong><small>After proposal-level donor caps</small></div><div><span>Priority recipients</span><strong>{formatNumber(visible.filter((item) => ['Critical', 'High'].includes(item.receiver_priority)).length)}</strong><small>Critical or high assessed risk</small></div><div className="balance-summary-art"><Icon name="truck" size={32} /><span>Balance the network first</span></div></section>
    <section className="panel stock-balance-panel"><div className="section-toolbar"><div><h3>Suggested transfer lanes</h3><p>Inspect donor and recipient evidence before approving a simulated transfer.</p></div><div className="directory-toolbar compact-toolbar"><div className="search-field"><Icon name="search" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search SKU, store, region…" /></div><select className="sort-select" value={urgency} onChange={(event) => setUrgency(event.target.value)}><option>All</option><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></div></div>
      <div className="balance-table-wrap"><table className="data-table balance-table"><thead><tr><th>Product</th><th>Source store</th><th>Recipient</th><th>Recipient cover</th><th>Transfer qty</th><th>Priority</th><th /></tr></thead><tbody>{visible.slice(0, 100).map((item, index) => <tr key={`${item.sku}-${item.from_store}-${item.to_store}-${index}`}><td><div className="balance-product"><span className="product-dot"><Icon name="box" size={16} /></span><span><strong>{item.sku}</strong><small>{item.category}</small></span></div></td><td><button className="table-text-button" onClick={() => { const store = stores.find((x) => x.store_id === item.from_store); if (store) onSelectStore(store); }}><strong>{item.from_store}</strong><small>{item.from_location}</small></button><span className="surplus-tag">Surplus est. {formatNumber(item.available_surplus_units)}</span><small className="network-safe-detail">Reserve {item.donor_safety_reserve_units == null ? '—' : formatNumber(item.donor_safety_reserve_units)} · after allocation {item.donor_stock_after_proposal == null ? '—' : formatNumber(item.donor_stock_after_proposal)}</small><span className={`network-safe-pill ${item.donor_reserve_protected === true ? 'is-safe' : 'needs-check'}`}>{item.donor_reserve_protected === true ? 'Reserve protected' : 'Verify donor'}</span></td><td><button className="table-text-button" onClick={() => { const store = stores.find((x) => x.store_id === item.to_store); if (store) onSelectStore(store); }}><strong>{item.to_store}</strong><small>{item.to_location}</small></button><span className="shortage-tag">Reorder {formatNumber(item.receiver_reorder_level)}</span></td><td><strong className={Number(item.receiver_days_of_stock) <= 1 ? 'negative-value' : ''}>{Number(item.receiver_days_of_stock || 0).toFixed(1)} days</strong></td><td><strong>{formatNumber(item.suggested_units)} units</strong><small className="table-subnote">Capped at donor surplus</small></td><td><PriorityBadge priority={item.receiver_priority} /></td><td><button className="row-open" onClick={() => review(item)} title="Review transfer proposal" aria-label={`Review transfer from ${item.from_store} to ${item.to_store}`}><Icon name="arrow" size={16} /></button></td></tr>)}</tbody></table>
        {!visible.length && <EmptyState title="No feasible transfer candidates" body="There are no same-SKU surplus matches for these filters in the current report. Review replenishment or the donor-stock assumptions instead." action="Clear filters" onAction={() => { setQuery(''); setUrgency('All'); }} />}</div>
      <div className="balance-disclaimer"><Icon name="shield" size={15} /><span>Network-safe rule: donor stock remains at or above the larger of its reorder level or 1.2 days of recent SKU demand. Surplus is allocated once across ranked recipients. These are estimates, not reservations; verify physical counts and donor demand before approval.</span></div>
    </section>
  </div>;
}

function WasteExpiryPage({ wasteData, stores, onSelectStore, onQueueApproval }) {
  const [view, setView] = useState('Combined');
  const [query, setQuery] = useState('');
  const candidates = useMemo(() => (wasteData?.stores || []).filter((item) => {
    const matchesView = view === 'Combined' || (view === 'Wastage' ? item.wastage_problem : item.expiry_problem);
    return matchesView && `${item.store_id} ${item.location || ''} ${(item.expiry_items || []).map((x) => `${x.sku} ${x.category}`).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase());
  }).sort((a, b) => Number(b.estimated_fresh_wastage_cost_change || 0) - Number(a.estimated_fresh_wastage_cost_change || 0)), [wasteData, view, query]);
  const exposure = candidates.reduce((sum, store) => sum + Number(store.estimated_fresh_wastage_cost_current || 0), 0);
  const atRiskUnits = candidates.reduce((sum, store) => sum + (store.expiry_items || []).reduce((itemSum, item) => itemSum + Number(item.estimated_excess_units || 0), 0), 0);
  const reviewAction = (entry) => {
    const store = stores.find((item) => item.store_id === entry.store_id);
    if (!store) return;
    const option = getBestOption(store, 'waste');
    const action = option?.action || splitSemicolon(store.recommended_actions)[0];
    if (action) onQueueApproval(store, action); else onSelectStore(store);
  };
  return <div className="page-stack premium-page">
    <div className="page-intro"><div><span className="eyebrow">FRESH CATEGORY CONTROL</span><h2>Waste &amp; expiry intelligence</h2><p>Spot rising fresh-food losses and slow-moving perishables before they become a bigger write-off.</p></div><div className="intro-counter"><strong>{formatNumber(candidates.length)}</strong><span>stores to inspect</span></div></div>
    <section className="waste-hero"><div><span className="hero-kicker"><Icon name="leaf" size={15} /> PROTECT FRESH MARGIN</span><h2>Sell, rotate or transfer.<br /><em>Don't reorder blindly.</em></h2><p>Use wastage trends, stock cover and product shelf life together. Every markdown estimate is illustrative until the date codes are verified.</p></div><div className="waste-hero-metrics"><div><span>Estimated fresh-waste stock cost*</span><strong>{currencyINR(exposure)}</strong><small>Across the current filtered set</small></div><div><span>Excess units identified</span><strong>{formatNumber(atRiskUnits)}</strong><small>Above estimated demand before shelf-life end</small></div></div></section>
    <section className="panel waste-table-panel"><div className="section-toolbar"><div><h3>Stores &amp; products to inspect</h3><p>Use product-level cover to decide whether to rotate, markdown, transfer or reduce repeat orders.</p></div><div className="waste-filters"><div className="segmented-tabs">{['Combined', 'Wastage', 'Expiry'].map((item) => <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}>{item}</button>)}</div><div className="search-field"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search store or SKU…" /></div></div></div>
      <div className="waste-store-grid">{candidates.slice(0, 36).map((entry) => {
        const store = stores.find((item) => item.store_id === entry.store_id);
        const best = getBestOption(store, 'waste');
        const expires = (entry.expiry_items || []).slice(0, 3);
        return <article className="waste-store-card" key={entry.store_id}><div className="waste-card-top"><span className="waste-store-icon"><Icon name="leaf" size={19} /></span><PriorityBadge priority={entry.priority} /></div><div className="waste-store-title"><div><h3>{entry.store_id}</h3><p>{entry.location || 'Franchise location'}</p></div><button className="quiet-link" onClick={() => store && onSelectStore(store)}>Inspect <Icon name="arrow" size={14} /></button></div><div className="waste-metrics-row"><div><span>Fresh wastage</span><strong className={Number(entry.fresh_wastage_growth_pct) > 0 ? 'negative-value' : ''}>{formatPct(entry.fresh_wastage_growth_pct)}</strong></div><div><span>Expiry SKUs</span><strong>{formatNumber(expires.length || store?.perishable_expiry_risk_count || 0)}</strong></div><div><span>Est. cost*</span><strong>{currencyINR(entry.estimated_fresh_wastage_cost_current)}</strong></div></div>{expires.length > 0 && <div className="expiry-mini-list">{expires.map((item) => <div key={item.sku}><span><strong>{item.sku}</strong><small>{item.category}</small></span><span className={Number(item.days_of_stock) > Number(item.shelf_life_days) ? 'negative-value' : ''}>{Number(item.days_of_stock).toFixed(1)}d cover<small>{item.shelf_life_days}d catalog life</small></span></div>)}</div>}<div className="waste-card-footer"><small>{entry.root_cause || 'Inspect waste reasons and SKU-level stock cover.'}</small>{best?.action && <button onClick={() => store && onQueueApproval(store, best.action)}>Review action</button>}</div></article>;
      })}{!candidates.length && <EmptyState title="No stores match this view" body="Try another filter or refresh the synthetic report to explore a different set of operating signals." />}</div>
      <div className="balance-disclaimer"><Icon name="info" size={15} /><span>*Costs use synthetic unit-cost data and are not finance-approved COGS. Shelf-life values are catalog defaults, not verified remaining expiry dates.</span></div>
    </section>
  </div>;
}

function StorePerformancePage({ stores, onSelectStore }) {
  const [query, setQuery] = useState('');
  const [metric, setMetric] = useState('sales_change_pct');
  const options = [{ value: 'sales_change_pct', label: 'Sales trend', format: formatPct }, { value: 'transactions_change_pct', label: 'Transactions', format: formatPct }, { value: 'footfall_change_pct', label: 'Footfall', format: formatPct }, { value: 'avg_bill_value_change_pct', label: 'Average bill', format: formatPct }, { value: 'complaints_change_pct', label: 'Complaints', format: formatPct }];
  const selectedMetric = options.find((item) => item.value === metric) || options[0];
  const filtered = useMemo(() => stores.filter((store) => `${store.store_id} ${store.location || ''} ${store.detected_problems || ''}`.toLowerCase().includes(query.trim().toLowerCase())), [stores, query]);
  const bottom = [...filtered].sort((a, b) => Number(a[metric] || 0) - Number(b[metric] || 0)).slice(0, 8);
  const average = filtered.length ? filtered.reduce((sum, item) => sum + Number(item[metric] || 0), 0) / filtered.length : 0;
  const downside = filtered.filter((store) => Number(store.sales_change_pct || 0) <= -10 || Number(store.transactions_change_pct || 0) <= -10).length;
  const complaints = filtered.reduce((sum, store) => sum + Number(store.complaints_current || 0), 0);
  return <div className="page-stack premium-page">
    <div className="page-intro"><div><span className="eyebrow">CUSTOMER &amp; COMMERCIAL SIGNALS</span><h2>Store performance</h2><p>Compare traffic, conversion proxies, average basket and customer feedback to see where the sales story needs a closer look.</p></div><div className="intro-counter"><strong>{formatPct(average, true)}</strong><span>mean {selectedMetric.label.toLowerCase()} change</span></div></div>
    <section className="performance-kpi-grid"><MetricCard label="Stores in view" value={formatNumber(filtered.length)} note="Current report scope" icon="store" tone="blue" /><MetricCard label="Commercial decline flags" value={formatNumber(downside)} note="Sales or transactions down ≥10%" icon="trend" tone="red" /><MetricCard label="Complaints recorded" value={formatNumber(complaints)} note="Synthetic current snapshot" icon="alert" tone="amber" /><MetricCard label="Average basket value" value={currencyINR(filtered.length ? filtered.reduce((sum, item) => sum + Number(item.avg_bill_value || 0), 0) / filtered.length : 0)} note="Latest average bill across view" icon="pulse" tone="blue" /></section>
    <section className="panel performance-chart-panel"><div className="section-toolbar"><div><h3>Where the metric is weakening</h3><p>Switch the measure to see the stores with the largest reported decline or increase.</p></div><div className="performance-controls"><select className="sort-select" value={metric} onChange={(event) => setMetric(event.target.value)}>{options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><div className="search-field"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search store or area…" /></div></div></div>
      <div className="performance-bars">{bottom.map((store) => { const value = Number(store[metric] || 0); const width = Math.min(100, Math.abs(value) / Math.max(1, ...bottom.map((item) => Math.abs(Number(item[metric] || 0))) ) * 100); return <button className="performance-bar-row" key={store.store_id} onClick={() => onSelectStore(store)}><span className="performance-bar-name"><strong>{store.store_id}</strong><small>{store.location}</small></span><span className="performance-bar-track"><i className={value < 0 ? 'bar-negative' : 'bar-positive'} style={{ width: `${width}%` }} /></span><strong className={value < 0 ? 'negative-value' : 'positive-value'}>{selectedMetric.format(value)}</strong></button>; })}</div>
    </section>
    <section className="panel performance-table-panel"><PanelHeader title="Commercial context by store" description="Review signals together; one metric alone rarely explains the whole story." /><div className="table-wrap"><table className="data-table"><thead><tr><th>Store</th><th>Sales</th><th>Footfall</th><th>Transactions</th><th>Avg. bill</th><th>Complaints</th><th>Margin movement</th><th /></tr></thead><tbody>{[...filtered].sort((a, b) => Number(a.sales_change_pct || 0) - Number(b.sales_change_pct || 0)).slice(0, 40).map((store) => <tr key={store.store_id}><td><button className="table-text-button" onClick={() => onSelectStore(store)}><strong>{store.store_id}</strong><small>{store.location}</small></button></td><td className={Number(store.sales_change_pct) < 0 ? 'negative-value' : 'positive-value'}>{formatPct(store.sales_change_pct)}</td><td className={Number(store.footfall_change_pct) < 0 ? 'negative-value' : 'positive-value'}>{formatPct(store.footfall_change_pct)}</td><td className={Number(store.transactions_change_pct) < 0 ? 'negative-value' : 'positive-value'}>{formatPct(store.transactions_change_pct)}</td><td className={Number(store.avg_bill_value_change_pct) < 0 ? 'negative-value' : 'positive-value'}>{formatPct(store.avg_bill_value_change_pct)}</td><td><strong>{formatNumber(store.complaints_current)}</strong><small className={Number(store.complaints_change_pct) > 0 ? 'negative-value' : ''}> {formatPct(store.complaints_change_pct)}</small></td><td className={Number(store.gross_margin_change_pp) < 0 ? 'negative-value' : 'positive-value'}>{store.gross_margin_change_pp !== undefined ? `${Number(store.gross_margin_change_pp).toFixed(1)} pp` : '—'}</td><td><button className="row-open" onClick={() => onSelectStore(store)} aria-label={`Inspect ${store.store_id}`}><Icon name="arrow" size={16} /></button></td></tr>)}</tbody></table></div></section>
    <p className="data-note"><Icon name="question" size={14} /> Complaint counts and unit costs are generated demo data. Real deployments should use validated POS, customer-feedback and finance sources.</p>
  </div>;
}

function ScenarioLabPage({ stores, onSelectStore, onQueueApproval, onRefresh }) {
  const scenarios = [
    { id: 'Store_0017', title: 'Shelf gaps + late inbound + waste', intro: 'The main challenge case: sales, transactions, supply, wastage and stock pressure overlap.', lesson: 'Prioritize fast movers, check delayed PO lines, and reduce overstock elsewhere.' },
    { id: 'Store_0008', title: 'Wastage rises while sales hold', intro: 'A store may sell steadily and still lose value through avoidable fresh-food wastage.', lesson: 'Check waste reason codes, product cover and repeat order quantities.' },
    { id: 'Store_0012', title: 'Severe compliance exception', intro: 'A weak checklist and several open issues deserve a clear owner and follow-up.', lesson: 'Assign corrective tasks and schedule an inspection.' },
    { id: 'Store_0021', title: 'Staff coverage and conversion pressure', intro: 'Very low attendance/productivity appears with a sharp transactions decline.', lesson: 'Review peak-hour coverage and front-of-store service before attributing cause.' },
    { id: 'Store_0033', title: 'Perishable cover exceeds shelf life', intro: 'Inventory exists, but estimated time to sell can exceed catalog shelf life.', lesson: 'Inspect date codes, rotate stock and evaluate markdown/transfer.' },
    { id: 'Store_0044', title: 'Average bill value falls', intro: 'Sales can look stable while average basket value drops materially.', lesson: 'Investigate category mix, availability, service and promotion behaviour.' },
  ];
  return <div className="page-stack premium-page">
    <div className="page-intro"><div><span className="eyebrow">REPEATABLE REVIEW DEMO</span><h2>Scenario lab</h2><p>Walk a reviewer through the curated Challenge 04 cases without relying on a random dashboard refresh.</p></div><button className="secondary-button" onClick={() => onRefresh(false, true)}><Icon name="refresh" size={15} /> Generate a new demo batch</button></div>
    <div className="scenario-intro-note"><Icon name="info" size={18} /><div><strong>Test the reasoning, not just the screen.</strong><p>Each card opens the store's current data-derived evidence, signal links and action options. The selected case is not a display-only override.</p></div></div>
    <section className="scenario-grid">{scenarios.map((scenario, index) => {
      const store = stores.find((item) => item.store_id === scenario.id);
      const best = getBestOption(store);
      return <article className={`scenario-card ${scenario.id === 'Store_0017' ? 'scenario-featured' : ''}`} key={scenario.id}><div className="scenario-card-top"><span className="scenario-number">{String(index + 1).padStart(2, '0')}</span><PriorityBadge priority={store?.priority || 'Low'} /></div><h3>{scenario.title}</h3><div className="scenario-store-line"><Icon name="store" size={15} /><strong>{scenario.id}</strong><span>{store?.location || 'Awaiting report'}</span></div><p>{scenario.intro}</p><div className="scenario-lesson"><span className="micro-label">WHAT A STRONG AGENT SHOULD DO</span><small>{scenario.lesson}</small></div><div className="scenario-evidence">{store && <><span>{formatPct(store.sales_change_pct)} sales</span><span>{formatNumber(store.low_stock_count)} low stock</span><span>{formatPct(store.fresh_wastage_growth_pct)} fresh waste</span></>}</div><div className="scenario-actions"><button className="secondary-button" onClick={() => store && onSelectStore(store)} disabled={!store}>Open case evidence</button>{best?.action && <button className="primary-button" onClick={() => store && onQueueApproval(store, best.action)}>Review next move</button>}</div></article>;
    })}</section>
    <p className="data-note"><Icon name="shield" size={14} /> Refreshed demo snapshots keep the scenario labels but regenerate source signals; results may move as the risk engine recalculates them.</p>
  </div>;
}


function App() {
  const [initialRoute] = useState(() => normalizeRoute(readRouteFromLocation()));
  const [initialNavigation] = useState(() => readSavedNavigation(initialRoute));
  const navigationRef = useRef(initialNavigation);
  const [navigationPosition, setNavigationPosition] = useState({ index: initialNavigation.index, length: initialNavigation.entries.length });
  const pendingHistoryTargetRef = useRef(null);
  const [signedIn, setSignedIn] = useState(() => initialRoute.screen === 'workspace');
  const [publicPage, setPublicPage] = useState(() => initialRoute.screen === 'home' ? 'home' : 'login');
  const [managerName, setManagerName] = useState(() => { try { return localStorage.getItem('freshbasket-manager-name') || ''; } catch { return ''; } });
  const [designation, setDesignation] = useState(() => { try { const value = localStorage.getItem('freshbasket-manager-designation') || 'head'; return roleDetails(value).key; } catch { return 'head'; } });
  const [region, setRegion] = useState(() => { try { return storedRegionOrDefault(localStorage.getItem('freshbasket-manager-region')); } catch { return 'Karnataka South'; } });
  const [area, setArea] = useState(() => { try { const savedRegion = storedRegionOrDefault(localStorage.getItem('freshbasket-manager-region')); return storedAreaOrDefault(savedRegion, localStorage.getItem('freshbasket-manager-area')); } catch { return 'Bengaluru Central'; } });
  const [assignedStoreId, setAssignedStoreId] = useState(() => { try { return normalizeStoreId(localStorage.getItem('freshbasket-manager-store')); } catch { return 'Store_0017'; } });
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [workspacePanel, setWorkspacePanel] = useState(null);
  const profileMenuRef = useRef(null);
  const [activePage, setActivePage] = useState(() => initialRoute.screen === 'workspace' ? initialRoute.page : 'overview');
  const [dashboard, setDashboard] = useState(null);
  const [stores, setStores] = useState([]);
  const [problems, setProblems] = useState([]);
  const [actions, setActions] = useState([]);
  const [balancing, setBalancing] = useState({ transfers: [] });
  const [wasteData, setWasteData] = useState({ stores: [] });
  const [health, setHealth] = useState({ status: 'connecting', report_ready: false });
  const [loading, setLoading] = useState(false);
  const [bootError, setBootError] = useState('');
  const [toast, setToast] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const [approvalDraft, setApprovalDraft] = useState(null);
  const [savingAction, setSavingAction] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('freshbasket-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  const applyRoute = useCallback((rawRoute) => {
    const route = normalizeRoute(rawRoute);
    if (route.screen === 'workspace') {
      try { sessionStorage.setItem('freshbasket-demo-session-v2', 'active'); } catch { /* The workspace can still be used in this tab. */ }
      setSignedIn(true);
      setActivePage(route.page);
      setSelectedStore(null);
      setProfileMenuOpen(false);
      setWorkspacePanel(null);
      setMobileNavOpen(false);
      setGlobalSearch('');
    } else {
      try { sessionStorage.removeItem('freshbasket-demo-session-v2'); } catch { /* Public navigation still works. */ }
      setSignedIn(false);
      setPublicPage(route.screen);
      setSelectedStore(null);
      setApprovalDraft(null);
      setProfileMenuOpen(false);
      setWorkspacePanel(null);
      setMobileNavOpen(false);
      setGlobalSearch('');
    }
  }, []);

  const navigateToRoute = useCallback((rawRoute, replace = false) => {
    const route = normalizeRoute(rawRoute);
    const current = navigationRef.current;
    const currentRoute = current.entries[current.index];
    const sameRoute = currentRoute && currentRoute.screen === route.screen && currentRoute.page === route.page;
    if (sameRoute) {
      applyRoute(route);
      return;
    }

    let entries;
    let index;
    if (replace) {
      entries = [...current.entries];
      index = current.index;
      entries[index] = route;
    } else {
      entries = [...current.entries.slice(0, current.index + 1), route];
      index = entries.length - 1;
    }
    navigationRef.current = { entries, index };
    setNavigationPosition({ index, length: entries.length });
    persistNavigation(navigationRef.current);
    const state = { freshBasketRoute: route, freshBasketIndex: index };
    if (replace) window.history.replaceState(state, '', routeUrl(route));
    else window.history.pushState(state, '', routeUrl(route));
    applyRoute(route);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [applyRoute]);

  const handleHistoryPop = useCallback((event) => {
    const route = normalizeRoute(event.state?.freshBasketRoute || readRouteFromLocation());
    let index = Number.isInteger(event.state?.freshBasketIndex) ? event.state.freshBasketIndex : -1;
    const current = navigationRef.current;

    if (pendingHistoryTargetRef.current !== null) {
      const target = pendingHistoryTargetRef.current;
      if (index !== target) {
        const direction = target < current.index ? -1 : 1;
        window.history.go(direction);
        return;
      }
      pendingHistoryTargetRef.current = null;
    }

    let entries = current.entries;
    if (index < 0 || index >= entries.length) {
      entries = [...current.entries.slice(0, current.index + 1), route];
      index = entries.length - 1;
      window.history.replaceState({ freshBasketRoute: route, freshBasketIndex: index }, '', routeUrl(route));
    } else {
      // Keep this index aligned with browser Back/Forward, including refreshed tabs.
      entries = [...entries];
      entries[index] = route;
    }
    navigationRef.current = { entries, index };
    setNavigationPosition({ index, length: entries.length });
    persistNavigation(navigationRef.current);
    applyRoute(route);
  }, [applyRoute]);

  useEffect(() => {
    const route = normalizeRoute(initialRoute);
    const initialIndex = navigationRef.current.index;
    window.history.replaceState({ freshBasketRoute: route, freshBasketIndex: initialIndex }, '', routeUrl(route));
    persistNavigation(navigationRef.current);
    const onPopState = (event) => handleHistoryPop(event);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [handleHistoryPop, initialRoute]);

  const goBack = useCallback(() => {
    const { index } = navigationRef.current;
    if (index <= 0) return;
    pendingHistoryTargetRef.current = index - 1;
    window.history.back();
  }, []);

  const goForward = useCallback(() => {
    const { entries, index } = navigationRef.current;
    if (index >= entries.length - 1) return;
    pendingHistoryTargetRef.current = index + 1;
    window.history.forward();
  }, []);

  const canGoBack = navigationPosition.index > 0;
  const canGoForward = navigationPosition.index < navigationPosition.length - 1;

  useEffect(() => {
    try { localStorage.setItem('freshbasket-theme', theme); } catch { /* Theme still works for this session. */ }
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!profileMenuOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) setProfileMenuOpen(false);
    };
    const closeOnEscape = (event) => { if (event.key === 'Escape') setProfileMenuOpen(false); };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [profileMenuOpen]);

  const refreshData = useCallback(async (quiet = false, regenerateDemo = false) => {
    // Keep the current route and already-rendered report visible while requests are pending.
    if (!quiet) setLoading(true);
    setBootError('');
    try {
      if (regenerateDemo) {
        setSelectedStore(null);
        // The toolbar refresh simulates a fresh source-data batch, then the API
        // recomputes all scores and summaries before the UI fetches the report.
        await api('/api/demo/refresh', { method: 'POST' });
      }
      const results = await Promise.allSettled([
        api('/api/health'), api('/api/dashboard'), api('/api/problem-summary'), api('/api/stores?order=ranked&limit=1000'), api('/api/actions'), api('/api/stock-balancing?limit=1000'), api('/api/waste-expiry?limit=1000'),
      ]);
      if (results[0].status === 'fulfilled') setHealth(results[0].value);
      if (results[1].status === 'fulfilled') setDashboard(results[1].value);
      if (results[2].status === 'fulfilled') setProblems(results[2].value.problems || []);
      if (results[3].status === 'fulfilled') setStores(results[3].value.stores || []);
      if (results[4].status === 'fulfilled') setActions(results[4].value.actions || []);
      if (results[5].status === 'fulfilled') setBalancing(results[5].value || { transfers: [] });
      if (results[6].status === 'fulfilled') setWasteData(results[6].value || { stores: [] });
      const failures = results.filter((item) => item.status === 'rejected');
      if (failures.length) {
        const message = results[1].status === 'rejected' ? results[1].reason?.message || 'Could not load the dashboard API.' : failures[0].reason?.message || 'Some workspace data could not be loaded.';
        setBootError(message);
        setHealth((current) => ({ ...current, status: 'disconnected' }));
        if (regenerateDemo) setToast({ type: 'error', message: `Demo refresh completed, but some dashboard data could not be loaded: ${message}` });
      } else if (regenerateDemo) {
        setToast({ type: 'success', message: 'Fresh synthetic store data generated and re-analyzed. KPIs, charts and store rankings now reflect the new report.' });
      }
    } catch (error) {
      const message = error?.message || 'Could not refresh the dashboard.';
      setBootError(message);
      setHealth((current) => ({ ...current, status: 'disconnected' }));
      if (regenerateDemo) setToast({ type: 'error', message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (signedIn) refreshData(); }, [signedIn, refreshData]);
  useEffect(() => { if (!toast) return undefined; const timeout = window.setTimeout(() => setToast(null), 3600); return () => window.clearTimeout(timeout); }, [toast]);

  const showToast = (type, message) => setToast({ type, message });
  const openStore = (store) => {
    setSelectedStore(store);
    setGlobalSearch('');
  };
  const queueApproval = (store, action, manager_note = '') => {
    if (designation === 'shift') {
      showToast('info', 'Shift Supervisors complete local checks. Business actions must be approved by the designated risk owner.');
      return;
    }
    const ownerKey = PRIORITY_OWNER[store?.priority] || 'store';
    if (ownerKey !== designation) {
      showToast('info', `${store?.priority || 'This'} priority case belongs to ${roleDetails(ownerKey).label}. Your assigned queue is ${roleDetails(designation).priority.toLowerCase()}.`);
      return;
    }
    if (designation === 'regional' && region && String(store?.region || store?.location) !== region) {
      showToast('info', `This store is outside your assigned operating region (${region}).`);
      return;
    }
    if (designation === 'area' && (String(store?.region || store?.location) !== region || String(store?.area || '') !== area)) {
      showToast('info', `This store is outside your assigned area (${area}).`);
      return;
    }
    if (designation === 'store' && assignedStoreId && store?.store_id !== assignedStoreId) {
      showToast('info', `Your assigned store is ${assignedStoreId}. Escalate other stores through the workload hierarchy.`);
      return;
    }
    setApprovalDraft({ store_id: store.store_id, action, manager_note });
    setSelectedStore(null);
    nav('approvals');
    showToast('info', 'Recommendation loaded into your designation-approved queue.');
  };
  const handleActionSubmit = async (payload) => {
    setSavingAction(true);
    try {
      const result = await api('/api/actions', { method: 'POST', body: JSON.stringify({ ...payload, manager_name: managerName || 'Manager', manager_designation: designation, manager_region: region, manager_area: area, manager_store_id: assignedStoreId }) });
      await refreshData(true);
      showToast('success', payload.decision === 'Approved' ? 'Approval recorded. Simulated execution only; no external system was changed.' : 'Rejection recorded. No simulation was run.');
      return Boolean(result);
    } catch (error) {
      showToast('error', error.message || 'Could not record the manager decision.');
      return false;
    } finally {
      setSavingAction(false);
    }
  };
  const signOut = () => {
    sessionStorage.removeItem('freshbasket-demo-session-v2');
    setProfileMenuOpen(false);
    setWorkspacePanel(null);
    navigateToRoute({ screen: 'login' });
  };
  const openWorkspacePanel = (panel) => {
    setWorkspacePanel(panel);
    setProfileMenuOpen(false);
  };
  const saveManagerName = (name) => {
    setManagerName(name);
    try { localStorage.setItem('freshbasket-manager-name', name); } catch { /* Keep the name in app state if storage is unavailable. */ }
    setWorkspacePanel(null);
    showToast('success', 'Profile updated. The morning greeting now uses this name.');
  };
  const handleLogin = ({ name, designation: selectedDesignation, region: selectedRegion, area: selectedArea, storeId }) => {
    const cleanDesignation = DESIGNATIONS.some((item) => item.key === selectedDesignation) ? selectedDesignation : 'head';
    setManagerName(name);
    setDesignation(cleanDesignation);
    setRegion(selectedRegion || 'Karnataka South');
    setArea(selectedArea || 'Bengaluru Central');
    setAssignedStoreId(storeId || 'Store_0017');
    try {
      localStorage.setItem('freshbasket-manager-name', name);
      localStorage.setItem('freshbasket-manager-designation', cleanDesignation);
      localStorage.setItem('freshbasket-manager-region', selectedRegion || 'Karnataka South');
      localStorage.setItem('freshbasket-manager-area', selectedArea || 'Bengaluru Central');
      localStorage.setItem('freshbasket-manager-store', storeId || 'Store_0017');
    } catch { /* Login still works for this session. */ }
    sessionStorage.setItem('freshbasket-demo-session-v2', 'active');
    navigateToRoute({ screen: 'workspace', page: cleanDesignation === 'head' ? 'overview' : 'workforce' });
  };
  const nav = (id) => { navigateToRoute({ screen: 'workspace', page: id }); setMobileNavOpen(false); setGlobalSearch(''); setProfileMenuOpen(false); };
  const pageTitle = NAV_ITEMS.find((item) => item.id === activePage)?.label || 'Overview';
  const currentRole = roleDetails(designation);
  const visibleNavItems = NAV_ITEMS.filter((item) => (ROLE_PAGES[designation] || ROLE_PAGES.head).includes(item.id));
  const scopedStores = useMemo(() => {
    if (designation === 'head') return stores;
    if (designation === 'regional') return stores.filter((store) => String(store.region || store.location || '').toLowerCase() === String(region || '').toLowerCase());
    if (designation === 'area') return stores.filter((store) => String(store.region || store.location || '').toLowerCase() === String(region || '').toLowerCase() && String(store.area || '').toLowerCase() === String(area || '').toLowerCase());
    return stores.filter((store) => String(store.store_id || '').toUpperCase() === String(assignedStoreId || '').toUpperCase());
  }, [stores, designation, region, area, assignedStoreId]);
  const scopedDashboard = useMemo(() => {
    if (designation === 'head') return dashboard;
    const counts = scopedStores.reduce((out, store) => { const level = PRIORITIES.includes(store.priority) ? store.priority.toLowerCase() : 'low'; out[`${level}_stores`] += 1; out.total_stores += 1; out.risk_sum += Number(store.risk_score || 0); return out; }, { total_stores: 0, critical_stores: 0, high_stores: 0, medium_stores: 0, low_stores: 0, risk_sum: 0 });
    return { ...dashboard, ...counts, average_risk_score: counts.total_stores ? Number((counts.risk_sum / counts.total_stores).toFixed(1)) : 0 };
  }, [dashboard, scopedStores, designation]);
  const scopedProblems = useMemo(() => {
    const flags = [
      ['Inventory shortages', 'inventory_problem'], ['Unusual wastage', 'wastage_problem'], ['Supplier delays', 'supplier_problem'],
      ['Compliance', 'compliance_problem'], ['Staffing', 'staffing_problem'], ['Sales performance', 'sales_problem'],
      ['Gross-margin pressure', 'margin_problem'], ['Customer activity', 'customer_problem'], ['Customer complaints', 'complaints_problem'], ['Expiry risk', 'expiry_problem'],
    ];
    const truthy = (value) => value === true || ['true', '1', 'yes'].includes(String(value ?? '').trim().toLowerCase());
    return flags.map(([label, key]) => ({ label, key, count: scopedStores.filter((store) => truthy(store[key])).length }));
  }, [scopedStores]);
  const scopedStoreIds = useMemo(() => new Set(scopedStores.map((store) => store.store_id)), [scopedStores]);
  const scopedActions = useMemo(() => {
    if (designation === 'head') return actions;
    if (designation === 'shift') return [];
    return actions.filter((item) => {
      if (item.manager_designation && item.manager_designation !== designation) return false;
      if (designation === 'store' && item.store_id !== assignedStoreId) return false;
      const store = stores.find((row) => row.store_id === item.store_id);
      return Boolean(store && scopedStoreIds.has(store.store_id));
    });
  }, [actions, designation, assignedStoreId, stores, scopedStoreIds]);
  const scopedBalancing = useMemo(() => {
    if (designation === 'head') return balancing;
    const transfers = (balancing.transfers || []).filter((item) => scopedStoreIds.has(item.to_store) || scopedStoreIds.has(item.from_store));
    return { ...balancing, transfers, count: transfers.length };
  }, [balancing, designation, scopedStoreIds]);
  const scopedWasteData = useMemo(() => ({ ...wasteData, stores: (wasteData.stores || []).filter((item) => scopedStoreIds.has(item.store_id)) }), [wasteData, scopedStoreIds]);
  const searchMatches = useMemo(() => {
    const query = globalSearch.trim().toLowerCase();
    if (!query) return [];
    return scopedStores.filter((store) => `${store.store_id} ${store.location || ''} ${store.detected_problems || ''}`.toLowerCase().includes(query)).slice(0, 6);
  }, [scopedStores, globalSearch]);

  const toggleTheme = () => setTheme((current) => current === 'dark' ? 'light' : 'dark');

  if (!signedIn && publicPage === 'home') return <MainPage theme={theme} onToggleTheme={toggleTheme} canGoBack={canGoBack} canGoForward={canGoForward} onBack={goBack} onForward={goForward} onGoToLogin={() => navigateToRoute({ screen: 'login' })} />;
  if (!signedIn) return <LoginScreen theme={theme} onToggleTheme={toggleTheme} onLogin={handleLogin} canGoBack={canGoBack} canGoForward={canGoForward} onBack={goBack} onForward={goForward} onGoToMainPage={() => navigateToRoute({ screen: 'home' })} />;

  return <div className={`app-shell theme-${theme}`}>
    <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
      <button type="button" className="sidebar-brand sidebar-brand-button" onClick={() => nav('overview')} title="Go to main page" aria-label="Go to main page"><Brand compact /></button>
      <div className="nav-group-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">{visibleNavItems.filter((item) => item.group === 'Workspace').map((item) => <button className={`nav-item ${activePage === item.id ? 'nav-active' : ''}`} key={item.id} onClick={() => nav(item.id)}><Icon name={item.icon} size={19} /><span>{item.label}</span>{item.id === 'stores' && scopedStores.length > 0 && <small className="nav-count">{formatCompact(scopedStores.length)}</small>}</button>)}</nav>
      {visibleNavItems.some((item) => item.group === 'Operations') && <div className="nav-group-label operations-label">OPERATIONS</div>}
      <nav className="side-nav" aria-label="Operations navigation">{visibleNavItems.filter((item) => item.group === 'Operations').map((item) => <button className={`nav-item ${activePage === item.id ? 'nav-active' : ''}`} key={item.id} onClick={() => nav(item.id)}><Icon name={item.icon} size={19} /><span>{item.label}</span>{item.id === 'balancing' && balancing.transfers?.length > 0 && <small className="nav-count">{formatCompact(balancing.transfers.length)}</small>}</button>)}</nav>
      {visibleNavItems.some((item) => item.group === 'Workflow') && <div className="nav-group-label workflow-label">WORKFLOW</div>}
      <nav className="side-nav" aria-label="Workflow navigation">{visibleNavItems.filter((item) => item.group === 'Workflow').map((item) => <button className={`nav-item ${activePage === item.id ? 'nav-active' : ''}`} key={item.id} onClick={() => nav(item.id)}><Icon name={item.icon} size={19} /><span>{item.label}</span>{scopedActions.length > 0 && <small className="nav-count">{formatCompact(scopedActions.length)}</small>}</button>)}</nav>
      <div className="sidebar-bottom"><div className={`system-status ${health.status === 'connected' ? 'status-connected' : 'status-disconnected'}`}><div className="system-status-top"><span className="status-dot" /><strong>System status</strong><span className="status-word">{health.status === 'connected' ? 'Live' : health.status === 'connecting' ? 'Checking' : 'Offline'}</span></div><p>{health.status === 'connected' ? 'Connected to store intelligence API' : health.status === 'connecting' ? 'Connecting to the operations API…' : 'API connection needs attention'}</p><small>{health.status === 'connected' ? 'FastAPI · Risk report available' : 'Check that the backend terminal is running'}</small></div><button className="sidebar-profile" onClick={() => openWorkspacePanel('profile')} title="Open manager profile"><span className="avatar">{initials(managerName)}</span><span className="profile-copy"><strong>{managerName || 'Manager'}</strong><small>{roleDetails(designation).label}</small></span><Icon name="down" size={17} /></button></div>
    </aside>
    {mobileNavOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMobileNavOpen(false)} />}
    <div className="main-shell">
      <header className="topbar"><div className="topbar-left"><HistoryControls canGoBack={canGoBack} canGoForward={canGoForward} onBack={goBack} onForward={goForward} /><button className="mobile-menu-button icon-button" onClick={() => setMobileNavOpen((open) => !open)} aria-label="Toggle navigation"><span className="hamburger" /></button><div className="breadcrumb"><span>FreshBasket</span><b>/</b><span>{activePage === 'overview' ? 'Morning brief' : pageTitle}</span><h1>{activePage === 'overview' ? (designation === 'head' ? 'Network overview' : `${currentRole.label} overview`) : pageTitle}</h1></div></div>
        <div className="topbar-actions"><div className={`api-indicator ${health.status === 'connected' ? 'api-good' : 'api-bad'}`}><span className="status-dot" />{health.status === 'connected' ? 'API connected' : health.status === 'connecting' ? 'Connecting' : 'API offline'}</div><div className="global-search-wrap"><div className="global-search"><Icon name="search" size={17} /><input value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} placeholder="Search stores…" aria-label="Search stores from any page" /></div>{globalSearch && <div className="global-search-results">{searchMatches.length ? searchMatches.map((store) => <button key={store.store_id} onClick={() => { openStore(store); setGlobalSearch(''); }}><span className="search-result-store"><Icon name="store" size={16} /><strong>{store.store_id}</strong><small>{store.location}</small></span><PriorityBadge priority={store.priority} /></button>) : <div className="global-no-results">No matching stores</div>}</div>}</div><ThemeToggle theme={theme} onToggle={toggleTheme} /><button className={`icon-button refresh-button ${loading ? 'is-refreshing' : ''}`} onClick={() => refreshData(false, designation === 'head')} title={designation === 'head' ? "Generate a fresh synthetic demo snapshot" : "Reload the current report without changing demo data"} aria-label={designation === 'head' ? "Generate a fresh synthetic demo snapshot" : "Reload the current report"} disabled={loading}><Icon name="refresh" size={19} /></button><button className="icon-button notification-button" onClick={() => { const target = designation === 'shift' ? 'tasks' : 'approvals'; nav(target); showToast('info', target === 'tasks' ? 'Open your assigned execution queue.' : `${actions.length} manager decision${actions.length === 1 ? '' : 's'} recorded.`); }} title="Decision activity" aria-label="Decision activity"><Icon name="bell" size={19} />{actions.length > 0 && <i />}</button><div className="topbar-divider" /><div className="date-block"><span>{new Date().toLocaleDateString('en-IN', { weekday: 'long' }).toUpperCase()}</span><strong>{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></div><div className="profile-menu-wrap" ref={profileMenuRef}><button className="top-avatar" onClick={() => setProfileMenuOpen((open) => !open)} title="Open manager menu" aria-label="Open manager menu" aria-expanded={profileMenuOpen} aria-haspopup="menu"><span className="top-avatar-initials">{initials(managerName)}</span><Icon name="down" size={14} /></button>{profileMenuOpen && <div className="profile-menu" role="menu"><div className="profile-menu-heading"><span className="profile-menu-avatar">{initials(managerName)}</span><div><strong>{managerName || 'Manager'}</strong><small>{roleDetails(designation).label}</small><small>{DEMO_EMAIL}</small></div></div><div className="profile-menu-divider" /><button role="menuitem" onClick={() => openWorkspacePanel('profile')}><Icon name="user" size={17} /><span><strong>My profile</strong><small>Update the manager name</small></span></button><button role="menuitem" onClick={() => openWorkspacePanel('settings')}><Icon name="settings" size={17} /><span><strong>Workspace preferences</strong><small>Appearance and connection status</small></span></button><button role="menuitem" onClick={() => openWorkspacePanel('help')}><Icon name="question" size={17} /><span><strong>Help &amp; support</strong><small>How to use FreshBasket AI</small></span></button><div className="profile-menu-divider" /><button role="menuitem" className="profile-menu-signout" onClick={signOut}><Icon name="logout" size={17} /><span><strong>Sign out</strong><small>Return to the login screen</small></span></button></div>}</div></div>
      </header>
      <main className="page-content">
        {bootError && <div className="connection-banner"><span className="connection-icon"><Icon name="alert" size={18} /></span><div><strong>{health.report_ready === false && health.status === 'disconnected' ? 'The operations API could not be reached' : 'Some workspace data could not be loaded'}</strong><p>{bootError}. Check that the FreshBasket API service is running, then try again.</p></div><button className="secondary-button" onClick={() => refreshData()}>Retry</button></div>}
        {loading && (dashboard || stores.length > 0) && <div className="data-refresh-banner" role="status"><span className="spinner" /><span><strong>Updating store data</strong><small>Your current page and existing report will stay on screen.</small></span></div>}
        {activePage === 'overview' && <OverviewPage dashboard={scopedDashboard} stores={scopedStores} problems={scopedProblems} actions={scopedActions} managerName={managerName} designation={designation} region={region} area={area} assignedStoreId={assignedStoreId} onSelectStore={openStore} onNavigate={nav} onRefresh={refreshData} loading={loading} />}
        {activePage === 'decisions' && <DecisionCentrePage stores={scopedStores} onSelectStore={openStore} onQueueApproval={queueApproval} />}
        {activePage === 'stores' && <StoresPage stores={scopedStores} onSelectStore={openStore} />}
        {activePage === 'performance' && <StorePerformancePage stores={scopedStores} onSelectStore={openStore} />}
        {activePage === 'analytics' && <AnalyticsPage dashboard={scopedDashboard} problems={scopedProblems} stores={scopedStores} onSelectStore={openStore} />}
        {activePage === 'balancing' && <StockBalancingPage balancing={scopedBalancing} stores={scopedStores} onSelectStore={openStore} onQueueApproval={queueApproval} />}
        {activePage === 'waste' && <WasteExpiryPage wasteData={scopedWasteData} stores={scopedStores} onSelectStore={openStore} onQueueApproval={queueApproval} />}
        {activePage === 'scenarios' && <ScenarioLabPage stores={scopedStores} onSelectStore={openStore} onQueueApproval={queueApproval} onRefresh={refreshData} />}
        {activePage === 'tasks' && <TasksPage stores={scopedStores} onSelectStore={openStore} designation={designation} region={region} area={area} assignedStoreId={assignedStoreId} />}
        {activePage === 'workforce' && <WorkforcePage designation={designation} region={region} area={area} assignedStoreId={assignedStoreId} stores={scopedStores} onSelectStore={openStore} onNavigate={nav} />}
        {activePage === 'approvals' && <ApprovalsPage stores={scopedStores} actions={scopedActions} draft={approvalDraft} onClearDraft={() => setApprovalDraft(null)} onSubmitAction={handleActionSubmit} busy={savingAction} designation={designation} region={region} area={area} assignedStoreId={assignedStoreId} />}
        <footer className="page-footer"><span>FreshBasket AI <i>·</i> Franchise Operations Intelligence</span><span>Demo data · {dashboard?.data_as_of || todayLabel()}</span></footer>
      </main>
    </div>
    <StoreDrawer store={selectedStore} onClose={() => setSelectedStore(null)} onQueueApproval={queueApproval} designation={designation} />
    <WorkspacePanel panel={workspacePanel} managerName={managerName} email={DEMO_EMAIL} designation={designation} region={region} area={area} assignedStoreId={assignedStoreId} theme={theme} onToggleTheme={toggleTheme} health={health} onClose={() => setWorkspacePanel(null)} onSaveName={saveManagerName} />
    {toast && <div className={`toast toast-${toast.type}`} role="status"><span><Icon name={toast.type === 'error' ? 'alert' : toast.type === 'success' ? 'check' : 'question'} size={17} /></span><p>{toast.message}</p><button onClick={() => setToast(null)} aria-label="Dismiss notification"><Icon name="close" size={15} /></button></div>}
  </div>;
}

export default App;
