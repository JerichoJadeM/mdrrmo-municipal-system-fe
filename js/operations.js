const API_BASE = "http://localhost:8080/api";

const BOARD_MODES = {
    INCIDENTS: "INCIDENTS",
    CALAMITIES: "CALAMITIES"
};

const INCIDENT_STATUS_ORDER = ["ONGOING", "IN_PROGRESS", "ON_SITE", "RESOLVED"];
const CALAMITY_STATUS_ORDER = ["ACTIVE", "MONITORING", "RESOLVED", "ENDED"];

let currentBoardMode = BOARD_MODES.INCIDENTS;

let currentSelection = {
    type: null,
    data: null
};

let dragContext = {
    type: null,
    id: null,
    sourceStatus: null,
    targetStatus: null,
    data: null
};

let pendingDispatchIncident = null;

let incidentBoardData = [];
let calamityBoardData = [];

async function apiRequest(url, options = {}) {
    const token = localStorage.getItem("jwtToken");

    options.headers = {
        ...(options.headers || {}),
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    const response = await fetch(url, options);

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        return await response.json();
    }

    return null;
}

function formatDateTime(dateTime) {
    if (!dateTime) return "-";
    const parsed = new Date(dateTime);
    if (isNaN(parsed.getTime())) return dateTime;
    return parsed.toLocaleString();
}

function getSeverityClass(severity) {
    const normalized = (severity || "").trim().toUpperCase();
    if (normalized === "HIGH") return "severity-high";
    if (normalized === "MEDIUM") return "severity-medium";
    if (normalized === "LOW") return "severity-low";
    return "severity-default";
}

function formatCalamityArea(calamity) {
    const areaType = (calamity.affectedAreaType || "").toUpperCase();
    const affectedNames = calamity.affectedBarangayNames || [];

    if (areaType === "MUNICIPALITY") return "Whole Municipality";
    if (areaType === "MULTI_BARANGAY") {
        if (!affectedNames.length) return "-";
        if (affectedNames.length === 1) return affectedNames[0];
        return `${affectedNames.length} Barangays`;
    }

    return calamity.primaryBarangayName || calamity.barangay || "-";
}

function clearCardSelections() {
    document.querySelectorAll(".board-card").forEach(card => {
        card.classList.remove("active");
    });
}

function clearDropzoneStates() {
    document.querySelectorAll(".board-dropzone").forEach(zone => {
        zone.classList.remove("drag-over", "drop-invalid");
    });
}

function confirmAction(message) {
    return window.confirm(message);
}

function setBoardMode(mode) {
    currentBoardMode = mode;

    const incidentModeBtn = document.getElementById("incidentModeBtn");
    const calamityModeBtn = document.getElementById("calamityModeBtn");
    const incidentBoardSection = document.getElementById("incidentBoardSection");
    const calamityBoardSection = document.getElementById("calamityBoardSection");
    const incidentFilters = document.getElementById("incidentFilters");
    const calamityFilters = document.getElementById("calamityFilters");

    incidentModeBtn?.classList.remove("active");
    calamityModeBtn?.classList.remove("active");

    incidentBoardSection?.classList.add("hidden");
    calamityBoardSection?.classList.add("hidden");
    incidentFilters?.classList.add("hidden");
    calamityFilters?.classList.add("hidden");

    if (mode === BOARD_MODES.INCIDENTS) {
        incidentModeBtn?.classList.add("active");
        incidentBoardSection?.classList.remove("hidden");
        incidentFilters?.classList.remove("hidden");
    } else if (mode === BOARD_MODES.CALAMITIES) {
        calamityModeBtn?.classList.add("active");
        calamityBoardSection?.classList.remove("hidden");
        calamityFilters?.classList.remove("hidden");
    }
}

function initBoardModeToggle() {
    const incidentModeBtn = document.getElementById("incidentModeBtn");
    const calamityModeBtn = document.getElementById("calamityModeBtn");

    incidentModeBtn?.addEventListener("click", () => setBoardMode(BOARD_MODES.INCIDENTS));
    calamityModeBtn?.addEventListener("click", () => setBoardMode(BOARD_MODES.CALAMITIES));
}

function renderSelectedEventSummary(type, data) {
    const summaryBox = document.getElementById("selectedEventSummary");
    const summaryContent = document.getElementById("selectedEventSummaryContent");

    if (!summaryBox || !summaryContent) return;

    if (!type || !data) {
        summaryBox.classList.add("hidden");
        summaryContent.innerHTML = "";
        return;
    }

    if (type === "INCIDENT") {
        summaryContent.innerHTML = `
            <div class="dispatch-summary-grid">
                <div class="dispatch-summary-item">
                    <strong>Type</strong>
                    <span>${data.type || "-"}</span>
                </div>
                <div class="dispatch-summary-item">
                    <strong>Barangay</strong>
                    <span>${data.barangay || "-"}</span>
                </div>
                <div class="dispatch-summary-item">
                    <strong>Status</strong>
                    <span>${data.status || "-"}</span>
                </div>
                <div class="dispatch-summary-item">
                    <strong>Assigned Responder</strong>
                    <span>${data.assignedResponderName || data.responderName || "-"}</span>
                </div>
                <div class="dispatch-summary-item">
                    <strong>Reported At</strong>
                    <span>${formatDateTime(data.reportedAt)}</span>
                </div>
                <div class="dispatch-summary-item">
                    <strong>Severity</strong>
                    <span>${data.severity || "-"}</span>
                </div>
            </div>
            <div class="dispatch-description-block">
                <strong>Description</strong>
                <p>${data.description || "-"}</p>
            </div>
        `;
    } else if (type === "CALAMITY") {
        summaryContent.innerHTML = `
            <div class="dispatch-summary-grid">
                <div class="dispatch-summary-item">
                    <strong>Type</strong>
                    <span>${data.type || data.calamityName || "-"}</span>
                </div>
                <div class="dispatch-summary-item">
                    <strong>Affected Area</strong>
                    <span>${formatCalamityArea(data)}</span>
                </div>
                <div class="dispatch-summary-item">
                    <strong>Status</strong>
                    <span>${data.status || "-"}</span>
                </div>
                <div class="dispatch-summary-item">
                    <strong>Start Date</strong>
                    <span>${formatDateTime(data.startDate || data.createdAt)}</span>
                </div>
                <div class="dispatch-summary-item">
                    <strong>Severity</strong>
                    <span>${data.severity || "-"}</span>
                </div>
            </div>
            <div class="dispatch-description-block">
                <strong>Description</strong>
                <p>${data.description || "-"}</p>
            </div>
        `;
    }

    summaryBox.classList.remove("hidden");
}

async function loadIncidentActivityFeed(incidentId) {
    const feed = document.getElementById("activityFeed");
    if (!feed) return;

    try {
        const actions = await apiRequest(`${API_BASE}/incidents/${incidentId}/actions`);
        feed.innerHTML = "";

        if (!actions || actions.length === 0) {
            feed.innerHTML = "<p>No activity yet.</p>";
            return;
        }

        actions.forEach(action => {
            const item = document.createElement("div");
            item.className = "feed-item";
            item.innerHTML = `
                <strong>${action.actionType || "-"}</strong>
                ${action.description || "-"}
                <small>${formatDateTime(action.actionTime)}</small>
            `;
            feed.appendChild(item);
        });
    } catch (error) {
        console.error("Error loading incident activity feed:", error);
        feed.innerHTML = "<p>Failed to load incident activity.</p>";
    }
}

async function loadCalamityActivityFeed(calamityId) {
    const feed = document.getElementById("activityFeed");
    if (!feed) return;

    try {
        const actions = await apiRequest(`${API_BASE}/calamities/${calamityId}/actions`);
        feed.innerHTML = "";

        if (!actions || actions.length === 0) {
            feed.innerHTML = "<p>No calamity activity yet.</p>";
            return;
        }

        actions.forEach(action => {
            const item = document.createElement("div");
            item.className = "feed-item";
            item.innerHTML = `
                <strong>${action.actionType || "-"}</strong>
                ${action.description || "-"}
                <small>${formatDateTime(action.actionTime)}</small>
            `;
            feed.appendChild(item);
        });
    } catch (error) {
        console.error("Error loading calamity activity feed:", error);
        feed.innerHTML = "<p>No calamity activity yet.</p>";
    }
}

function renderModulePlaceholders(type, data) {
    const evacuationContent = document.getElementById("evacuationContent");
    const reliefContent = document.getElementById("reliefContent");
    const inventoryContent = document.getElementById("inventoryContent");
    const budgetContent = document.getElementById("budgetContent");

    const label = `${type} #${data?.id ?? "-"}`;

    if (evacuationContent) {
        evacuationContent.innerHTML = `<p>No evacuation details loaded yet for ${label}.</p>`;
    }
    if (reliefContent) {
        reliefContent.innerHTML = `<p>No relief distribution details loaded yet for ${label}.</p>`;
    }
    if (inventoryContent) {
        inventoryContent.innerHTML = `<p>No inventory usage details loaded yet for ${label}.</p>`;
    }
    if (budgetContent) {
        budgetContent.innerHTML = `<p>No budget usage details loaded yet for ${label}.</p>`;
    }
}

function clearCurrentSelection() {
    currentSelection = { type: null, data: null };
    clearCardSelections();
    renderSelectedEventSummary(null, null);

    const activityFeed = document.getElementById("activityFeed");
    if (activityFeed) {
        activityFeed.innerHTML = "<p>Select an incident or calamity to view details.</p>";
    }

    renderModulePlaceholders("OPERATION", { id: "-" });
}

function initOperationsTabs() {
    const tabButtons = document.querySelectorAll(".operations-tab-btn");
    const tabContents = document.querySelectorAll(".operations-tab-content");

    tabButtons.forEach(button => {
        button.addEventListener("click", () => {
            const targetTabId = button.dataset.tab;

            tabButtons.forEach(btn => btn.classList.remove("active"));
            tabContents.forEach(content => content.classList.add("hidden"));

            button.classList.add("active");
            document.getElementById(targetTabId)?.classList.remove("hidden");
        });
    });
}

function initBoardFilters() {
    const incidentSearchInput = document.getElementById("incidentSearchInput");
    const incidentSeverityFilter = document.getElementById("incidentSeverityFilter");
    const incidentBarangayFilter = document.getElementById("incidentBarangayFilter");
    const incidentResponderFilter = document.getElementById("incidentResponderFilter");

    const calamitySearchInput = document.getElementById("calamitySearchInput");
    const calamitySeverityFilter = document.getElementById("calamitySeverityFilter");
    const calamityAreaTypeFilter = document.getElementById("calamityAreaTypeFilter");

    [incidentSearchInput, incidentSeverityFilter, incidentBarangayFilter, incidentResponderFilter]
        .forEach(el => el?.addEventListener("input", applyIncidentFilters));
    incidentSeverityFilter?.addEventListener("change", applyIncidentFilters);

    [calamitySearchInput, calamitySeverityFilter, calamityAreaTypeFilter]
        .forEach(el => el?.addEventListener("input", applyCalamityFilters));
    calamitySeverityFilter?.addEventListener("change", applyCalamityFilters);
    calamityAreaTypeFilter?.addEventListener("change", applyCalamityFilters);
}

async function initOperationsPage() {
    if (!localStorage.getItem("jwtToken")) {
        window.location.href = "login.html";
        return;
    }

    try {
        initBoardModeToggle();
        initOperationsTabs();
        initBoardFilters();
        initArchiveControls();
        initDispatchModal();
        initStatusUpdateModal();
        initDropzones();
        clearCurrentSelection();

        await loadIncidentBoard();
        await loadCalamityBoard();

        setBoardMode(BOARD_MODES.INCIDENTS);
    } catch (error) {
        console.error("Error initializing operations page:", error);
        alert("Failed to load operations board.");
    }
}


// additional helpers
function getCurrentUserRoles() {
    try {
        const raw = localStorage.getItem("userAuthorities") || sessionStorage.getItem("userAuthorities");
        if (!raw) return [];

        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.map(role => String(role).toUpperCase());
        }

        return [];
    } catch {
        return [];
    }
}

function canManageHiddenStorage() {
    const roles = getCurrentUserRoles();
    return roles.includes("ROLE_ADMIN") || roles.includes("ROLE_MANAGER");
}

function initHiddenCardsControls() {
    const restoreBtn = document.getElementById("restoreHiddenCardsBtn");
    const clearBtn = document.getElementById("clearHiddenCardsBtn");

    if (canManageHiddenStorage()) {
        clearBtn?.classList.remove("hidden");
    }

    restoreBtn?.addEventListener("click", async () => {
        localStorage.removeItem("operationsHiddenBoardCards");
        await loadIncidentBoard();
        await loadCalamityBoard();
    });

    clearBtn?.addEventListener("click", async () => {
        localStorage.removeItem("operationsHiddenBoardCards");
        localStorage.removeItem("operationsBoardOrder");
        await loadIncidentBoard();
        await loadCalamityBoard();
    });
}

function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 2800);
}

function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 2800);
}

function canManageArchiveClear() {
    const roles = getCurrentUserRoles();
    return roles.includes("ROLE_ADMIN") || roles.includes("ROLE_MANAGER");
}

function initArchiveControls() {
    if (canManageArchiveClear()) {
        document.getElementById("incidentArchiveClearBtn")?.classList.remove("hidden");
        document.getElementById("calamityArchiveClearBtn")?.classList.remove("hidden");
    }

    if (typeof initArchiveMenus === "function") {
        initArchiveMenus();
    }
}

document.addEventListener("DOMContentLoaded", initOperationsPage);