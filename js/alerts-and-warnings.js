window.APP_CONFIG.API_BASE

const alertsState = {
    overview: null,
    filteredAlerts: [],
    filters: {
        severity: "",
        type: "",
        status: "",
        keyword: ""
    }
};

document.addEventListener("DOMContentLoaded", async () => {
    bindAlertFilters();

    await loadAlertsWarningsPage();
});

async function loadAlertsWarningsPage() {
    setAlertsLoadingState();

    try {
        const overview = await fetchAlertsOverview();
        alertsState.overview = overview;

        renderAlertsOverview(overview);
        applyAlertFilters();
    } catch (error) {
        console.error("Failed to load alerts and warnings page", error);
        renderAlertsError(extractErrorMessage(error) || "Failed to load alerts and warnings data.");
    }
}

function bindAlertFilters() {
    document.getElementById("alertSeverityFilter")?.addEventListener("change", applyAlertFilters);
    document.getElementById("alertTypeFilter")?.addEventListener("change", applyAlertFilters);
    document.getElementById("alertStatusFilter")?.addEventListener("change", applyAlertFilters);
    document.getElementById("alertKeywordInput")?.addEventListener("input", debounce(applyAlertFilters, 250));
}

function applyAlertFilters() {
    alertsState.filters.severity = (document.getElementById("alertSeverityFilter")?.value || "").trim().toUpperCase();
    alertsState.filters.type = (document.getElementById("alertTypeFilter")?.value || "").trim().toUpperCase();
    alertsState.filters.status = (document.getElementById("alertStatusFilter")?.value || "").trim().toUpperCase();
    alertsState.filters.keyword = (document.getElementById("alertKeywordInput")?.value || "").trim().toLowerCase();

    const allAlerts = Array.isArray(alertsState.overview?.activeAlerts)
        ? alertsState.overview.activeAlerts
        : [];

    alertsState.filteredAlerts = allAlerts.filter(alert => {
        const severity = String(alert.severity || "").trim().toUpperCase();
        const type = String(alert.type || "").trim().toUpperCase();
        const status = String(alert.status || "").trim().toUpperCase();

        const severityOk = !alertsState.filters.severity || severity === alertsState.filters.severity;
        const typeOk = !alertsState.filters.type || type === alertsState.filters.type;
        const statusOk = !alertsState.filters.status || status === alertsState.filters.status;

        const haystack = [
            alert.title,
            alert.message,
            alert.affectedArea,
            alert.type,
            alert.severity,
            alert.status,
            alert.source,
            alert.recommendation
        ]
            .map(value => String(value || "").toLowerCase())
            .join(" ");

        const keywordOk = !alertsState.filters.keyword || haystack.includes(alertsState.filters.keyword);

        return severityOk && typeOk && statusOk && keywordOk;
    });

    renderAlertsFeed(alertsState.filteredAlerts);
}

async function fetchAlertsOverview() {
    const response = await fetchWithAuth(`${API_BASE}/alerts-warnings/overview`);

    if (response.ok) {
        return response.json();
    }

    if (response.status === 404 || response.status === 500) {
        return getMockAlertsOverview();
    }

    let payload = null;
    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    throw new Error(extractErrorMessage(payload) || "Failed to load alerts overview.");
}

function renderAlertsOverview(data) {
    setText("overallReadinessStat", data.summary?.overallReadinessLabel || "--");
    setText("activeWarningsStat", formatNumber(data.summary?.activeWarningsCount));
    setText("criticalGapsStat", formatNumber(data.summary?.criticalGapsCount));
    setText("responseCapacityStat", data.summary?.responseCapacityLabel || "--");

    setText("alertsLastUpdatedText", `Last updated: ${formatDateTime(data.lastUpdated)}`);
    setText("alertsCountText", `${(data.activeAlerts || []).length} items`);

    const readinessLabel = data.summary?.overallReadinessLabel || "--";
    const readinessClass = normalizeReadinessClass(readinessLabel);

    const readinessPill = document.getElementById("readinessPill");
    if (readinessPill) {
        readinessPill.innerHTML = `<i class="fas fa-shield-halved"></i> Readiness: ${escapeHtml(readinessLabel)}`;
    }

    const readinessBadge = document.getElementById("overallReadinessBadge");
    if (readinessBadge) {
        readinessBadge.className = `status-badge ${readinessClass}`;
        readinessBadge.textContent = readinessLabel;
    }

    renderReadinessDomains(data.readinessDomains || []);
    renderReadinessScores(data.readinessDomains || []);
    renderPriorityActions(data.priorityActions || []);
    renderWarningHistory(data.recentHistory || []);
    renderReadinessNotes(data.readinessNotes || []);
}

function renderReadinessDomains(domains) {
    const container = document.getElementById("readinessDomainGrid");
    if (!container) return;

    if (!Array.isArray(domains) || domains.length === 0) {
        container.innerHTML = `<div class="empty-state-card">No readiness domain data available.</div>`;
        return;
    }

    container.innerHTML = domains.map(domain => `
        <div class="readiness-domain-card">
            <div class="readiness-domain-head">
                <div class="readiness-domain-title">
                    <div class="readiness-domain-icon ${normalizeTypeClass(domain.type)}">
                        <i class="${getDomainIcon(domain.type)}"></i>
                    </div>
                    <div>
                        <h4>${escapeHtml(domain.title || "--")}</h4>
                        <p>${escapeHtml(domain.description || "--")}</p>
                    </div>
                </div>
                <span class="status-badge ${normalizeReadinessClass(domain.status)}">
                    ${escapeHtml(domain.status || "--")}
                </span>
            </div>

            <div class="readiness-metric-grid">
                ${(domain.metrics || []).slice(0, 4).map(metric => `
                    <div class="readiness-metric-box">
                        <span>${escapeHtml(metric.label || "--")}</span>
                        <strong>${escapeHtml(metric.value || "--")}</strong>
                    </div>
                `).join("")}
            </div>

            <div class="readiness-domain-note">
                ${escapeHtml(domain.note || "--")}
            </div>
        </div>
    `).join("");
}

function renderReadinessScores(domains) {
    const container = document.getElementById("readinessScoreList");
    if (!container) return;

    if (!Array.isArray(domains) || domains.length === 0) {
        container.innerHTML = `<div class="empty-state-card">No readiness score data available.</div>`;
        return;
    }

    container.innerHTML = domains.map(domain => {
        const score = clampNumber(domain.score, 0, 100);
        const fillClass = score >= 75 ? "fill-ready" : score >= 45 ? "fill-limited" : "fill-critical";

        return `
            <div class="readiness-score-item">
                <div class="readiness-score-meta">
                    <strong>${escapeHtml(domain.title || "--")}</strong>
                    <span>${score}%</span>
                </div>
                <div class="readiness-score-bar">
                    <div class="readiness-score-fill ${fillClass}" style="width:${score}%"></div>
                </div>
            </div>
        `;
    }).join("");
}

function renderAlertsFeed(alerts) {
    const container = document.getElementById("alertsFeed");
    if (!container) return;

    setText("alertsCountText", `${alerts.length} items`);

    if (!Array.isArray(alerts) || alerts.length === 0) {
        container.innerHTML = `<div class="empty-state-card">No alerts match the selected filters.</div>`;
        return;
    }

    container.innerHTML = alerts.map(alert => `
        <div class="alert-card">
            <div class="alert-card-head">
                <div class="alert-card-title-wrap">
                    <div class="alert-type-icon ${normalizeTypeClass(alert.type)}">
                        <i class="${getDomainIcon(alert.type)}"></i>
                    </div>
                    <div>
                        <h4>${escapeHtml(alert.title || "--")}</h4>
                        <div class="alert-card-meta">
                            ${escapeHtml(alert.affectedArea || "Batad, Iloilo")}
                            ${alert.issuedAt ? ` • ${escapeHtml(formatDateTime(alert.issuedAt))}` : ""}
                            ${alert.source ? ` • ${escapeHtml(alert.source)}` : ""}
                        </div>
                    </div>
                </div>

                <span class="severity-badge ${normalizeSeverityClass(alert.severity)}">
                    ${escapeHtml(alert.severity || "--")}
                </span>
            </div>

            <div class="alert-card-message">
                ${escapeHtml(alert.message || "--")}
            </div>

            <div class="alert-card-tags">
                <span class="info-pill"><i class="fas fa-layer-group"></i> ${escapeHtml(alert.type || "--")}</span>
                <span class="info-pill"><i class="fas fa-circle-dot"></i> ${escapeHtml(alert.status || "--")}</span>
                ${alert.recommendation ? `<span class="info-pill"><i class="fas fa-screwdriver-wrench"></i> ${escapeHtml(alert.recommendation)}</span>` : ""}
            </div>
        </div>
    `).join("");
}

function renderPriorityActions(actions) {
    const container = document.getElementById("priorityActionsList");
    if (!container) return;

    if (!Array.isArray(actions) || actions.length === 0) {
        container.innerHTML = `<div class="empty-state-card">No priority actions available.</div>`;
        return;
    }

    container.innerHTML = actions.map(action => `
        <div class="action-item">
            <div class="action-item-icon">
                <i class="fas fa-bolt"></i>
            </div>
            <div>
                <h4>${escapeHtml(action.title || "--")}</h4>
                <p>${escapeHtml(action.message || "--")}</p>
            </div>
        </div>
    `).join("");
}

function renderWarningHistory(items) {
    const container = document.getElementById("warningHistoryList");
    if (!container) return;

    if (!Array.isArray(items) || items.length === 0) {
        container.innerHTML = `<div class="empty-state-card">No warning history available.</div>`;
        return;
    }

    container.innerHTML = items.map(item => `
        <div class="history-item">
            <h4>${escapeHtml(item.title || "--")}</h4>
            <p>${escapeHtml(item.message || "--")}</p>
            <small>
                ${escapeHtml(item.status || "--")}
                ${item.recordedAt ? ` • ${escapeHtml(formatDateTime(item.recordedAt))}` : ""}
            </small>
        </div>
    `).join("");
}

function renderReadinessNotes(notes) {
    const container = document.getElementById("readinessNotesGrid");
    if (!container) return;

    if (!Array.isArray(notes) || notes.length === 0) {
        container.innerHTML = `<div class="empty-state-card">No readiness notes available.</div>`;
        return;
    }

    container.innerHTML = notes.map(note => `
        <div class="note-card">
            <h4>${escapeHtml(note.title || "--")}</h4>
            <p>${escapeHtml(note.message || "--")}</p>
            <small>${escapeHtml(note.category || "System Note")}</small>
        </div>
    `).join("");
}

function setAlertsLoadingState() {
    setText("overallReadinessStat", "Loading...");
    setText("activeWarningsStat", "Loading...");
    setText("criticalGapsStat", "Loading...");
    setText("responseCapacityStat", "Loading...");
    setText("alertsLastUpdatedText", "Last updated: --");
    setText("alertsCountText", "0 items");

    const readinessBadge = document.getElementById("overallReadinessBadge");
    if (readinessBadge) {
        readinessBadge.className = "status-badge neutral";
        readinessBadge.textContent = "Loading";
    }

    setHTML("readinessDomainGrid", `<div class="empty-state-card">Loading readiness overview...</div>`);
    setHTML("readinessScoreList", `<div class="empty-state-card">Loading readiness breakdown...</div>`);
    setHTML("alertsFeed", `<div class="empty-state-card">Loading alerts...</div>`);
    setHTML("priorityActionsList", `<div class="empty-state-card">Loading recommended actions...</div>`);
    setHTML("warningHistoryList", `<div class="empty-state-card">Loading warning history...</div>`);
    setHTML("readinessNotesGrid", `<div class="empty-state-card">Loading readiness notes...</div>`);
}

function renderAlertsError(message) {
    setText("overallReadinessStat", "Unavailable");
    setText("activeWarningsStat", "--");
    setText("criticalGapsStat", "--");
    setText("responseCapacityStat", "--");
    setText("alertsLastUpdatedText", "Last updated: unavailable");
    setText("alertsCountText", "0 items");

    const readinessBadge = document.getElementById("overallReadinessBadge");
    if (readinessBadge) {
        readinessBadge.className = "status-badge neutral";
        readinessBadge.textContent = "Unavailable";
    }

    const content = `<div class="empty-state-card">${escapeHtml(message || "Failed to load alerts and warnings data.")}</div>`;

    setHTML("readinessDomainGrid", content);
    setHTML("readinessScoreList", content);
    setHTML("alertsFeed", content);
    setHTML("priorityActionsList", content);
    setHTML("warningHistoryList", content);
    setHTML("readinessNotesGrid", content);
}

function getMockAlertsOverview() {
    return {
        lastUpdated: new Date().toISOString(),
        summary: {
            overallReadinessLabel: "Partially Ready",
            activeWarningsCount: 6,
            criticalGapsCount: 2,
            responseCapacityLabel: "8 / 12 Available"
        },
        readinessDomains: [
            {
                type: "PERSONNEL",
                title: "Personnel Readiness",
                description: "Responder availability and deployable field capacity",
                status: "READY",
                score: 82,
                note: "Majority of responders are available, but night-shift reserve is limited.",
                metrics: [
                    { label: "Available Responders", value: "8 / 12" },
                    { label: "Teams Ready", value: "3 Teams" },
                    { label: "On Assignment", value: "4 Personnel" },
                    { label: "Standby Level", value: "Moderate" }
                ]
            },
            {
                type: "RESOURCE",
                title: "Equipment & Relief Readiness",
                description: "Inventory, rescue tools, fuel, and relief stock condition",
                status: "LIMITED",
                score: 61,
                note: "Medical kits and rescue boat fuel are below preferred threshold.",
                metrics: [
                    { label: "Low Stock Items", value: "5" },
                    { label: "Critical Shortages", value: "2" },
                    { label: "Relief Packs Ready", value: "146" },
                    { label: "Fuel Reserve", value: "Low" }
                ]
            },
            {
                type: "EVACUATION",
                title: "Evacuation Readiness",
                description: "Center availability, occupancy, and receiving capacity",
                status: "READY",
                score: 86,
                note: "Active centers can still accommodate projected short-term displacement.",
                metrics: [
                    { label: "Centers Ready", value: "4" },
                    { label: "Active Centers", value: "2" },
                    { label: "Occupancy", value: "54%" },
                    { label: "Available Slots", value: "312" }
                ]
            },
            {
                type: "BUDGET",
                title: "Budget Readiness",
                description: "Operational funding flexibility for immediate response activity",
                status: "LIMITED",
                score: 58,
                note: "Current budget remains usable, but utilization pressure is increasing.",
                metrics: [
                    { label: "Remaining Budget", value: "₱ 428,000" },
                    { label: "Utilization", value: "67%" },
                    { label: "Current Year", value: "2026" },
                    { label: "Pressure Level", value: "Elevated" }
                ]
            }
        ],
        activeAlerts: [
            {
                type: "WEATHER",
                severity: "HIGH",
                status: "ACTIVE",
                title: "Heavy rainfall may elevate flood risk",
                message: "Forecast conditions indicate increased rainfall probability across low-lying barangays within the next operational window.",
                affectedArea: "Batad low-lying barangays",
                issuedAt: new Date().toISOString(),
                source: "Weather Forecast",
                recommendation: "Prepare flood-prone barangays"
            },
            {
                type: "RESOURCE",
                severity: "CRITICAL",
                status: "ACTIVE",
                title: "Medical kit stock below minimum threshold",
                message: "Available emergency medical kits are below the required minimum for concurrent multi-site response.",
                affectedArea: "Municipal stockroom",
                issuedAt: new Date().toISOString(),
                source: "Resources",
                recommendation: "Restock emergency medical kits"
            },
            {
                type: "PERSONNEL",
                severity: "MEDIUM",
                status: "WATCH",
                title: "Limited reserve responder coverage",
                message: "Responder reserve depth is reduced due to current deployments and scheduled availability gaps.",
                affectedArea: "Operations manpower pool",
                issuedAt: new Date().toISOString(),
                source: "Operations",
                recommendation: "Review standby roster"
            },
            {
                type: "EVACUATION",
                severity: "LOW",
                status: "WATCH",
                title: "Center 2 nearing moderate occupancy band",
                message: "One evacuation center has crossed the preferred occupancy comfort threshold and should be monitored.",
                affectedArea: "Evacuation Center 2",
                issuedAt: new Date().toISOString(),
                source: "Evacuation Centers",
                recommendation: "Prepare alternate center allocation"
            },
            {
                type: "BUDGET",
                severity: "MEDIUM",
                status: "ACTIVE",
                title: "Operational expense pressure rising",
                message: "Current spending pace suggests tighter flexibility if multiple incidents escalate in the same budget period.",
                affectedArea: "Current response budget",
                issuedAt: new Date().toISOString(),
                source: "Budget",
                recommendation: "Review non-critical expense timing"
            },
            {
                type: "OPERATIONAL",
                severity: "HIGH",
                status: "ACTIVE",
                title: "Boat fuel reserve may constrain water response",
                message: "Fuel reserve for rescue boat operations is below preferred readiness level for prolonged deployment.",
                affectedArea: "Rescue transport unit",
                issuedAt: new Date().toISOString(),
                source: "Resources",
                recommendation: "Refuel rescue unit"
            }
        ],
        priorityActions: [
            {
                title: "Restock emergency medical kits",
                message: "Critical shortage detected in medical response supplies."
            },
            {
                title: "Refuel rescue boat and transport support",
                message: "Low fuel reserve may affect prolonged emergency deployment."
            },
            {
                title: "Prepare flood-prone barangays for possible activation",
                message: "Weather risk indicators suggest elevated short-term monitoring."
            },
            {
                title: "Review responder standby roster",
                message: "Reserve capacity is thinner than preferred operational baseline."
            }
        ],
        recentHistory: [
            {
                title: "Relief goods low-stock warning",
                message: "Rice family-pack component dropped below preferred threshold.",
                status: "RESOLVED",
                recordedAt: new Date().toISOString()
            },
            {
                title: "Evacuation center sanitation note",
                message: "Minor readiness issue flagged and endorsed for action.",
                status: "WATCH",
                recordedAt: new Date().toISOString()
            }
        ],
        readinessNotes: [
            {
                title: "System Observation",
                message: "Overall readiness remains operational, but supply-side resilience is weaker than personnel and evacuation readiness.",
                category: "Readiness Summary"
            },
            {
                title: "Resource Observation",
                message: "Resource and budget signals are the main contributors to the current partially ready status.",
                category: "Support Capacity"
            }
        ]
    };
}

async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem("jwtToken");
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    return fetch(url, {
        ...options,
        headers
    });
}

function extractErrorMessage(payload) {
    if (!payload) return "Request failed.";
    if (typeof payload === "string") return payload;
    if (payload.message) return payload.message;
    if (payload.error) return payload.error;
    return "Request failed.";
}

function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
}

function normalizeSeverityClass(value) {
    const normalized = normalizeText(value);
    if (normalized === "low") return "low";
    if (normalized === "medium") return "medium";
    if (normalized === "high") return "high";
    if (normalized === "critical") return "critical";
    return "neutral";
}

function normalizeReadinessClass(value) {
    const normalized = normalizeText(value);
    if (normalized === "ready" || normalized === "fully ready") return "ready";
    if (normalized === "partially ready" || normalized === "limited") return "limited";
    if (normalized === "not ready" || normalized === "critical") return "critical";
    return "neutral";
}

function normalizeTypeClass(value) {
    const normalized = normalizeText(value);
    if (normalized === "weather") return "weather";
    if (normalized === "resource") return "resource";
    if (normalized === "personnel") return "personnel";
    if (normalized === "evacuation") return "evacuation";
    if (normalized === "budget") return "budget";
    return "operational";
}

function getDomainIcon(type) {
    const normalized = normalizeText(type);
    if (normalized === "weather") return "fas fa-cloud-rain";
    if (normalized === "resource") return "fas fa-box-open";
    if (normalized === "personnel") return "fas fa-people-group";
    if (normalized === "evacuation") return "fas fa-house-user";
    if (normalized === "budget") return "fas fa-wallet";
    return "fas fa-triangle-exclamation";
}

function formatDateTime(value) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
}

function formatNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num.toLocaleString("en-PH") : "--";
}

function clampNumber(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? "--";
}

function setHTML(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = value;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function debounce(fn, delay = 250) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}
