let currentDrawerForecast = null;
let pendingTransitionReview = null;
let pendingTransitionSuggestedResources = [];
let pendingTransitionCustomResources = [];
let pendingTransitionStockChecksRaw = [];
let pendingTransitionInventoryCatalog = [];

let pendingTransitionWarnings = [];
let pendingTransitionCostDrivers = [];
let pendingTransitionEvacuationAssignments = [];
let pendingEvacuationCenterCatalog = [];

let transitionEvacuationFormVisible = false;
let transitionEvacuationUpdateTargetId = null;
let transitionEvacuationSearchResults = [];
let transitionSelectedEvacuationCenterId = "";

let pendingTransitionAcknowledgementState = {
    requiresAcknowledgement: false,
    requestStatus: "NONE", // NONE | PENDING | APPROVED | REJECTED | NOT_REQUIRED
    requestId: null,
    reviewedByName: "",
    reviewedAt: "",
    remarks: ""
};

const TRANSITION_RESOURCE_TYPE_OPTIONS = [
    "RELIEF", "MEDICAL", "EQUIPMENT", "TRANSPORT", "COMMUNICATION", "SAFETY", "SHELTER", "FOOD", "WATER", "OTHER"
];
const TRANSITION_RESOURCE_CATEGORY_OPTIONS = [
    "CONSUMABLE", "SUPPLY", "TOOL", "VEHICLE", "PPE", "MEDICINE", "FOOD", "WATER", "SHELTER", "OTHER"
];
const TRANSITION_RESOURCE_UNIT_OPTIONS = [
    "pcs", "box", "pack", "set", "roll", "pair", "bottle", "can", "bag", "sack", "kilo", "kilogram", "gram", "liter", "meter"
];

function resetTransitionAcknowledgementState() {
    pendingTransitionAcknowledgementState = {
        requiresAcknowledgement: false,
        requestStatus: "NONE",
        requestId: null,
        reviewedByName: "",
        reviewedAt: "",
        remarks: ""
    };
}

function getAcknowledgementStateLabel() {
    const status = String(pendingTransitionAcknowledgementState.requestStatus || "NONE").toUpperCase();

    switch (status) {
        case "NOT_REQUIRED":
            return { text: "No acknowledgement required", className: "status-badge neutral" };
        case "PENDING":
            return { text: "Pending acknowledgement", className: "status-badge warning" };
        case "APPROVED":
            return { text: "Acknowledgement approved", className: "status-badge active" };
        case "REJECTED":
            return { text: "Acknowledgement rejected", className: "status-badge danger" };
        default:
            return pendingTransitionAcknowledgementState.requiresAcknowledgement
                ? { text: "Acknowledgement required", className: "status-badge warning" }
                : { text: "No acknowledgement required", className: "status-badge neutral" };
    }
}

function renderTransitionAcknowledgementHeaderStatus() {
    const node = document.getElementById("transitionReviewAckStatus");
    if (!node) return;

    const state = getAcknowledgementStateLabel();
    node.className = state.className;
    node.textContent = state.text;
}

async function loadTransitionAcknowledgementStatus(config) {
    resetTransitionAcknowledgementState();

    const warningItems = (pendingTransitionWarnings || []).filter(w => {
        const level = String(w.level || "").toUpperCase();
        return level === "WARNING" || level === "CRITICAL";
    });

    if (!warningItems.length) {
        pendingTransitionAcknowledgementState.requiresAcknowledgement = false;
        pendingTransitionAcknowledgementState.requestStatus = "NOT_REQUIRED";
        renderTransitionAcknowledgementHeaderStatus();
        syncTransitionReviewButtonLabel(pendingTransitionWarnings || []);
        return;
    }

    pendingTransitionAcknowledgementState.requiresAcknowledgement = true;

    try {
        const requestType = "OPERATION_ACKNOWLEDGEMENT";
        const referenceType = config.type;
        const referenceId = config.data.id;
        const mode = config.mode || "";

        const response = await apiRequest(
            `${API_BASE}/approval-requests/status?requestType=${encodeURIComponent(requestType)}&referenceType=${encodeURIComponent(referenceType)}&referenceId=${encodeURIComponent(referenceId)}&mode=${encodeURIComponent(mode)}`
        );

        if (response) {
            pendingTransitionAcknowledgementState.requestStatus = String(response.status || "NONE").toUpperCase();
            pendingTransitionAcknowledgementState.requestId = response.id || null;
            pendingTransitionAcknowledgementState.reviewedByName = response.reviewedByName || "";
            pendingTransitionAcknowledgementState.reviewedAt = response.reviewedAt || "";
            pendingTransitionAcknowledgementState.remarks = response.reviewRemarks || "";
        }
    } catch (error) {
        console.warn("Unable to load acknowledgement status:", error);
    }

    renderTransitionAcknowledgementHeaderStatus();
    syncTransitionReviewButtonLabel(pendingTransitionWarnings || []);
}

function openOperationsDrawer() {
    document.getElementById("operationsDrawer")?.classList.add("active");
    document.getElementById("operationsDrawerOverlay")?.classList.add("active");
}

function closeOperationsDrawer() {
    document.getElementById("operationsDrawer")?.classList.remove("active");
    document.getElementById("operationsDrawerOverlay")?.classList.remove("active");
}

function resetOperationsDrawer() {
    setDrawerText("operationsDrawerTitle", "Operation Details");
    setDrawerText("operationsDrawerSubtitle", "No selection");
    setDrawerText("drawerEventName", "-");
    setDrawerText("drawerStatus", "-");
    setDrawerText("drawerLocation", "-");
    setDrawerText("drawerAssignedTo", "-");
    setDrawerText("drawerDateTime", "-");
    setDrawerText("drawerDescription", "-");
    setDrawerText("drawerForecastedBudget", "₱0.00");
    setDrawerText("drawerActualCost", "₱0.00");
    setDrawerText("drawerVariance", "₱0.00");

    const severityBadge = document.getElementById("drawerSeverityBadge");
    if (severityBadge) {
        severityBadge.className = "severity-badge severity-default";
        severityBadge.textContent = "-";
    }

    const warnings = document.getElementById("drawerWarnings");
    const quick = document.getElementById("drawerReadinessQuick");
    const timeline = document.getElementById("drawerTimeline");
    const actions = document.getElementById("drawerQuickActions");

    if (warnings) warnings.innerHTML = "";
    if (quick) quick.innerHTML = "";
    if (timeline) timeline.innerHTML = "<p>Select an incident or calamity to view activity.</p>";
    if (actions) actions.innerHTML = "";

    document.getElementById("operationsDrawerEmpty")?.classList.remove("hidden");
    document.getElementById("operationsDrawerContent")?.classList.add("hidden");

    currentDrawerForecast = null;

    if (typeof resetOperationsMap === "function") {
        resetOperationsMap();
    }

    window.loadTransitionAcknowledgementStatus = loadTransitionAcknowledgementStatus;
    window.syncTransitionReviewButtonLabel = syncTransitionReviewButtonLabel;
}

async function loadOperationsDrawer(type, data) {
    if (!type || !data) {
        resetOperationsDrawer();
        closeOperationsDrawer();
        return;
    }

    openOperationsDrawer();
    renderOperationsDrawerSummary(type, data);
    renderOperationsDrawerLoading();

    if (typeof updateOperationsMapSelection === "function") {
        updateOperationsMapSelection(type, data);
    }

    await loadOperationsDrawerTimeline(type, data);
    await loadOperationsDrawerForecast(type, data);
    renderOperationsDrawerQuickActions(type, data);
}

function renderOperationsDrawerLoading() {
    const warnings = document.getElementById("drawerWarnings");
    const quick = document.getElementById("drawerReadinessQuick");

    if (warnings) {
        warnings.innerHTML = `<div class="readiness-empty-card">Loading warnings...</div>`;
    }

    if (quick) {
        quick.innerHTML = `<div class="readiness-empty-card">Loading operational readiness...</div>`;
    }
}

function renderOperationsDrawerSummary(type, data) {
    document.getElementById("operationsDrawerEmpty")?.classList.add("hidden");
    document.getElementById("operationsDrawerContent")?.classList.remove("hidden");

    setDrawerText("operationsDrawerTitle", type === "INCIDENT" ? "Incident Details" : "Calamity Details");
    setDrawerText("operationsDrawerSubtitle", type === "INCIDENT" ? "Operations Drawer" : "Calamity Operations Drawer");

    const title = type === "INCIDENT"
        ? (data.type || "-")
        : (data.type || data.calamityName || "-");

    const location = type === "INCIDENT"
        ? (data.barangay || "-")
        : getSafeCalamityArea(data);

    const assigned = type === "INCIDENT"
        ? (data.assignedResponderName || "-")
        : (data.coordinatorName || "-");

    const dateTime = type === "INCIDENT"
        ? formatDateTimeSafe(data.reportedAt)
        : formatDateTimeSafe(data.date || data.createdAt);

    setDrawerText("drawerEventName", title);
    setDrawerText("drawerStatus", data.status || "-");
    setDrawerText("drawerLocation", location);
    setDrawerText("drawerAssignedTo", assigned);
    setDrawerText("drawerDateTime", dateTime);
    setDrawerText("drawerDescription", (data.description || "").trim() || "-");

    const severityBadge = document.getElementById("drawerSeverityBadge");
    if (severityBadge) {
        severityBadge.className = `severity-badge ${getSeverityClassSafe(data.severity)}`;
        severityBadge.textContent = data.severity || "-";
    }
}

async function loadOperationsDrawerTimeline(type, data) {
    const timeline = document.getElementById("drawerTimeline");
    if (!timeline) return;

    try {
        const history = await apiRequest(`${API_BASE}/operations/history?type=${encodeURIComponent(type)}&id=${encodeURIComponent(data.id)}`);
        timeline.innerHTML = "";

        if (!history || !history.length) {
            timeline.innerHTML = `<div class="readiness-empty-card">No timeline available yet.</div>`;
            return;
        }

        history.forEach(item => {
            const fromStatus = item.fromStatus ? escapeHtml(item.fromStatus) : "";
            const toStatus = item.toStatus ? escapeHtml(item.toStatus) : "";
            const statusLine = (fromStatus || toStatus)
                ? `<div class="feed-status-line">${fromStatus || "-"} → ${toStatus || "-"}</div>`
                : "";

            const feed = document.createElement("div");
            feed.className = "feed-item";
            feed.innerHTML = `
                <strong>${escapeHtml(item.actionType || "-")}</strong>
                <div>${escapeHtml(item.description || "-")}</div>
                ${statusLine}
                <small>${escapeHtml(formatDateTimeSafe(item.performedAt))}</small>
            `;
            timeline.appendChild(feed);
        });
    } catch (error) {
        console.error("Error loading drawer timeline:", error);
        timeline.innerHTML = `<div class="readiness-empty-card">Unable to load timeline.</div>`;
    }
}

async function loadOperationsDrawerForecast(type, data) {
    try {
        const endpoint = type === "INCIDENT"
            ? `${API_BASE}/operations/forecast/incidents/${data.id}`
            : `${API_BASE}/operations/forecast/calamities/${data.id}`;

        const forecast = await apiRequest(endpoint);
        currentDrawerForecast = forecast;

        renderOperationsDrawerWarnings(forecast.warnings || []);
        renderOperationsDrawerReadiness(forecast);
    } catch (error) {
        console.error("Error loading drawer forecast:", error);

        const warnings = document.getElementById("drawerWarnings");
        const quick = document.getElementById("drawerReadinessQuick");

        if (warnings) {
            warnings.innerHTML = `<div class="readiness-empty-card">Unable to load warnings.</div>`;
        }

        if (quick) {
            quick.innerHTML = `<div class="readiness-empty-card">Unable to load operational readiness.</div>`;
        }
    }
}

function renderOperationsDrawerWarnings(warnings) {
    const container = document.getElementById("drawerWarnings");
    if (!container) return;

    container.innerHTML = "";

    if (!warnings.length) {
        container.innerHTML = `<div class="readiness-empty-card">No operational warnings at this time.</div>`;
        return;
    }

    warnings.forEach(warning => {
        const level = String(warning.level || "INFO").toUpperCase();
        const levelClass = getWarningClassSafe(level);

        const card = document.createElement("div");
        card.className = `readiness-warning-card ${levelClass}`;
        card.innerHTML = `
            <strong>${escapeHtml(level)}</strong><br>
            <span>${escapeHtml(warning.message || "-")}</span>
        `;
        container.appendChild(card);
    });
}

function renderOperationsDrawerReadiness(forecast) {
    setDrawerText("drawerForecastedBudget", formatCurrencySafe(forecast.forecastedBudget));
    setDrawerText("drawerActualCost", formatCurrencySafe(forecast.actualCostToDate));
    setDrawerText("drawerVariance", formatCurrencySafe(forecast.variance));

    const quick = document.getElementById("drawerReadinessQuick");
    if (!quick) return;

    const resourceCount = (forecast.recommendedResources || []).length;
    const stockIssues = (forecast.stockChecks || []).filter(stock => {
        const status = String(stock.status || "").toUpperCase();
        return status === "LOW_STOCK" || status === "OUT_OF_STOCK" || status === "NOT_FOUND";
    }).length;

    quick.innerHTML = `
        <div class="readiness-resource-card">
            <div class="readiness-item-title">Suggested Resources</div>
            <div class="readiness-item-meta">${resourceCount} recommended items</div>
        </div>
        <div class="readiness-resource-card">
            <div class="readiness-item-title">Inventory Issues</div>
            <div class="readiness-item-meta">${stockIssues} stock issue(s)</div>
        </div>
        <div class="readiness-resource-card">
            <div class="readiness-item-title">Relief</div>
            <div class="readiness-item-meta">${forecast.reliefRecommended ? "Recommended" : "Not recommended"}</div>
        </div>
        <div class="readiness-resource-card">
            <div class="readiness-item-title">Evacuation</div>
            <div class="readiness-item-meta">${forecast.evacuationRecommended ? "Recommended" : "Not recommended"}</div>
        </div>
    `;
}

function renderOperationsDrawerQuickActions(type, data) {
    const container = document.getElementById("drawerQuickActions");
    if (!container) return;

    container.innerHTML = "";
    const status = String(data.status || "").toUpperCase();

    if (type === "INCIDENT") {
        if (status === "ONGOING") {
            container.appendChild(createDrawerActionButton("Dispatch", () => {
                openTransitionReviewModal({
                    type: "INCIDENT",
                    mode: "DISPATCH_REVIEW",
                    data,
                    title: "Dispatch Incident"
                });
            }));
        }

        if (status === "IN_PROGRESS") {
            container.appendChild(createDrawerActionButton("Mark On-Site", () => {
                openTransitionReviewModal({
                    type: "INCIDENT",
                    mode: "ARRIVE_REVIEW",
                    data,
                    title: "Mark Incident as On-Site"
                });
            }));
        }

        if (status === "ON_SITE") {
            container.appendChild(createDrawerActionButton("Resolve", () => {
                openTransitionReviewModal({
                    type: "INCIDENT",
                    mode: "RESOLVE_REVIEW",
                    data,
                    title: "Resolve Incident"
                });
            }));
        }

        return;
    }

    if (status === "ACTIVE") {
        container.appendChild(createDrawerActionButton("Set Monitoring", () => {
            openTransitionReviewModal({
                type: "CALAMITY",
                mode: "MONITOR_REVIEW",
                data,
                title: "Set Calamity to Monitoring"
            });
        }));
    }

    if (status === "MONITORING") {
        container.appendChild(createDrawerActionButton("Resolve", () => {
            openTransitionReviewModal({
                type: "CALAMITY",
                mode: "RESOLVE_REVIEW",
                data,
                title: "Resolve Calamity"
            });
        }));
    }

    if (status === "RESOLVED") {
        container.appendChild(createDrawerActionButton("End", () => {
            openTransitionReviewModal({
                type: "CALAMITY",
                mode: "END_REVIEW",
                data,
                title: "End Calamity"
            });
        }));
    }
}

function createDrawerActionButton(label, handler) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "drawer-quick-action-btn";
    btn.textContent = label;
    btn.addEventListener("click", handler);
    return btn;
}

/* =========================
   Transition Review Modal
   ========================= */

async function openTransitionReviewModal(config) {
    pendingTransitionReview = config;
    resetTransitionAcknowledgementState();

    setDrawerText("transitionReviewTitle", config.title || "Transition Review");
    renderTransitionReviewSummary(config);
    preloadTransitionReviewForm(config);
    renderTransitionReviewLoading();
    renderTransitionAcknowledgementHeaderStatus();
    syncTransitionReviewButtonLabel([]);

    document.getElementById("transitionReviewModal")?.classList.add("active");
    document.body.style.overflow = "hidden";

    await loadTransitionReviewForecast(config);
}

function closeTransitionReviewModal() {
    document.getElementById("transitionReviewModal")?.classList.remove("active");
    document.body.style.overflow = "auto";
    pendingTransitionReview = null;
    resetTransitionAcknowledgementState();
    renderTransitionAcknowledgementHeaderStatus();
    syncTransitionReviewButtonLabel([]);
    clearTransitionReviewContent();
}

function renderTransitionReviewSummary(config) {
    const box = document.getElementById("transitionReviewSummary");
    const content = document.getElementById("transitionReviewSummaryContent");
    if (!box || !content) return;

    const data = config.data;
    const type = config.type;

    const location = type === "INCIDENT"
        ? (data.barangay || "-")
        : getSafeCalamityArea(data);

    const assigned = type === "INCIDENT"
        ? (data.assignedResponderName || "-")
        : (data.coordinatorName || "-");

    const dateTime = type === "INCIDENT"
        ? formatDateTimeSafe(data.reportedAt)
        : formatDateTimeSafe(data.date || data.createdAt);

    content.innerHTML = `
        <div class="dispatch-summary-grid">
            <div class="dispatch-summary-item">
                <strong>Type</strong>
                <span>${escapeHtml(type === "INCIDENT" ? data.type || "-" : data.type || data.calamityName || "-")}</span>
            </div>
            <div class="dispatch-summary-item">
                <strong>Status</strong>
                <span>${escapeHtml(data.status || "-")}</span>
            </div>
            <div class="dispatch-summary-item">
                <strong>Location</strong>
                <span>${escapeHtml(location)}</span>
            </div>
            <div class="dispatch-summary-item">
                <strong>Assigned</strong>
                <span>${escapeHtml(assigned)}</span>
            </div>
            <div class="dispatch-summary-item">
                <strong>Date/Time</strong>
                <span>${escapeHtml(dateTime)}</span>
            </div>
        </div>
    `;
    syncTransitionReviewButtonLabel(pendingTransitionWarnings || []);
    box.classList.remove("hidden");
}

function preloadTransitionReviewForm(config) {
    const data = config.data;
    const description = document.getElementById("transitionReviewDescription");
    const responderBlock = document.getElementById("transitionResponderBlock");
    const responderSearch = document.getElementById("transitionResponderSearch");
    const responderId = document.getElementById("transitionResponderId");

    if (description) {
        description.value = (data.description || "").trim();
    }

    const showResponder = config.type === "INCIDENT" && config.mode === "DISPATCH_REVIEW";
    responderBlock?.classList.toggle("hidden", !showResponder);

    if (showResponder) {
        if (responderSearch) responderSearch.value = data.assignedResponderName || "";
        if (responderId) responderId.value = data.assignedResponderId || "";
    } else {
        if (responderSearch) responderSearch.value = "";
        if (responderId) responderId.value = "";
    }

    pendingTransitionSuggestedResources = [];
    pendingTransitionCustomResources = [];
    pendingTransitionStockChecksRaw = [];
    pendingTransitionInventoryCatalog = [];
    pendingTransitionWarnings = [];
    pendingTransitionCostDrivers = [];
    pendingTransitionEvacuationAssignments = [];
    pendingEvacuationCenterCatalog = [];

    const overrideBlock = document.getElementById("transitionOverrideReasonBlock");
    const overrideReason = document.getElementById("transitionOverrideReason");
    overrideBlock?.classList.add("hidden");
    if (overrideReason) overrideReason.value = "";

    document.removeEventListener("click", handleTransitionSuggestionOutsideClick, true);
}

function renderTransitionReviewLoading() {
    const sections = [
        "transitionSuggestedResources",
        "transitionStockChecks",
        "transitionEvacuationChecks",
        "transitionCostDrivers",
        "transitionWarnings",
        "transitionWarningAcknowledgements"
    ];

    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = `<div class="readiness-empty-card">Loading...</div>`;
        }
    });

    const relief = document.getElementById("transitionReliefReadiness");
    if (relief) {
        relief.innerHTML = `<div class="readiness-empty-card">Loading...</div>`;
    }
}

async function loadTransitionReviewForecast(config) {
    try {
        const endpoint = config.type === "INCIDENT"
            ? `${API_BASE}/operations/forecast/incidents/${config.data.id}`
            : `${API_BASE}/operations/forecast/calamities/${config.data.id}`;

        const forecast = await apiRequest(endpoint);

        pendingTransitionStockChecksRaw = Array.isArray(forecast.stockChecks) ? forecast.stockChecks : [];
        pendingTransitionSuggestedResources = normalizeTransitionSuggestedResources(forecast.recommendedResources || []);
        pendingTransitionWarnings = Array.isArray(forecast.warnings) ? forecast.warnings : [];
        pendingTransitionCostDrivers = Array.isArray(forecast.costDrivers) ? forecast.costDrivers : [];

        await preloadTransitionInventoryCatalog();
        await preloadEvacuationCenterCatalog();
        await loadTransitionEvacuationAssignments(config);

        renderTransitionSuggestedResources();
        renderTransitionStockChecks();
        renderTransitionRelief(forecast.reliefReadiness);
        renderTransitionEvacuation(forecast.evacuationChecks || []);
        renderTransitionCostDrivers(pendingTransitionCostDrivers);
        renderTransitionWarnings(pendingTransitionWarnings);

        await loadTransitionAcknowledgementStatus(config);
        renderTransitionAcknowledgements(pendingTransitionWarnings || []);
        syncTransitionReviewButtonLabel(pendingTransitionWarnings || []);
    } catch (error) {
        console.error("Error loading transition review forecast:", error);
        if (typeof showToast === "function") {
            showToast("Failed to load transition review.", "error");
        }
    }
}

// helper functions
async function preloadEvacuationCenterCatalog() {
    if (pendingEvacuationCenterCatalog.length) return;

    try {
        const centers = await apiRequest(`${API_BASE}/evacuation-centers`);
        pendingEvacuationCenterCatalog = Array.isArray(centers) ? centers : [];
    } catch (error) {
        console.error("Error loading evacuation centers:", error);
        pendingEvacuationCenterCatalog = [];
    }
}

async function loadTransitionEvacuationAssignments(config) {
    pendingTransitionEvacuationAssignments = [];

    try {
        const endpoint = config.type === "INCIDENT"
            ? `${API_BASE}/incidents/${config.data.id}/evacuations`
            : `${API_BASE}/calamities/${config.data.id}/evacuations`;

        const response = await apiRequest(endpoint);
        pendingTransitionEvacuationAssignments = Array.isArray(response) ? response : [];
    } catch (error) {
        console.error("Error loading evacuation assignments:", error);
        pendingTransitionEvacuationAssignments = [];
    }
}

function incidentNeedsEvacuationReview(data) {
    const text = `${data?.type || ""} ${data?.description || ""}`.toLowerCase();
    const hazardKeywords = [
        "fire", "flood", "typhoon", "storm surge", "landslide", "collapse",
        "structural", "earthquake", "tsunami", "hazmat", "chemical", "spill",
        "explosion", "eruption", "armed", "conflict"
    ];

    const keywordMatch = hazardKeywords.some(keyword => text.includes(keyword));
    const highSeverity = String(data?.severity || "").toUpperCase() === "HIGH";
    return keywordMatch || highSeverity;
}

function getEvacuationCenterDisplay(center) {
    const barangay = center?.centerBarangayName || center?.barangayName || center?.barangay?.name || "-";
    const capacity = Number(center?.centerCapacity ?? center?.capacity ?? 0) || 0;
    return `${center?.centerName || center?.name || "-"} • ${barangay} • Cap ${capacity}`;
}

function getTransitionSelectedForecastInfo() {
    const resources = getEditableTransitionResources().filter(item => item.included);
    let total = 0;
    let pricedItems = 0;

    resources.forEach(item => {
        const qty = Number(item.quantity ?? 0) || 0;

        const catalogMatch = pendingTransitionInventoryCatalog.find(inv =>
            String(inv.itemName || "").toLowerCase() === String(item.itemName || "").toLowerCase()
        );

        const unitCost = Number(catalogMatch?.unitCost ?? catalogMatch?.estimatedUnitCost ?? catalogMatch?.cost ?? 0) || 0;
        if (unitCost > 0) {
            total += qty * unitCost;
            pricedItems += 1;
        }
    });

    return {
        total,
        pricedItems,
        hasCostData: pricedItems > 0
    };
}

function rerenderTransitionDerivedSections() {
    renderTransitionStockChecks();
    renderTransitionCostDrivers(pendingTransitionCostDrivers);
    renderTransitionWarnings(pendingTransitionWarnings);
    renderTransitionAcknowledgements(pendingTransitionWarnings);
    syncTransitionReviewButtonLabel(pendingTransitionWarnings || []);
}

function filterEvacuationCenterSuggestions(keyword) {
    const q = String(keyword || "").trim().toLowerCase();
    return pendingEvacuationCenterCatalog
        .filter(center => {
            if (!q) return true;
            const hay = `${center.name || center.centerName || ""} ${center.barangayName || center.barangay?.name || ""} ${center.locationDetails || center.centerLocationDetails || ""}`.toLowerCase();
            return hay.includes(q);
        })
        .slice(0, 8);
}

function bindTransitionEvacuationEvents() {
    document.getElementById("transitionActivateEvacBtn")?.addEventListener("click", () => {
        transitionEvacuationFormVisible = true;
        transitionEvacuationUpdateTargetId = null;
        renderTransitionEvacuation([]);
        initTransitionEvacuationCenterSearch();
    });

    document.getElementById("transitionEvacCancelBtn")?.addEventListener("click", () => {
        transitionEvacuationFormVisible = false;
        transitionSelectedEvacuationCenterId = "";
        transitionEvacuationSearchResults = [];
        renderTransitionEvacuation([]);
    });

    document.getElementById("transitionEvacSubmitBtn")?.addEventListener("click", async () => {
        try {
            await activateTransitionEvacuationCenter();
        } catch (error) {
            console.error("Error activating evacuation center:", error);
            showToastSafe("Failed to activate evacuation center.", "error");
        }
    });

    document.querySelectorAll("[data-evac-action='toggle-update']").forEach(btn => {
        btn.addEventListener("click", () => {
            transitionEvacuationFormVisible = false;
            transitionEvacuationUpdateTargetId = Number(btn.dataset.activationId);
            renderTransitionEvacuation([]);
        });
    });

    document.querySelectorAll("[data-evac-action='cancel-update']").forEach(btn => {
        btn.addEventListener("click", () => {
            transitionEvacuationUpdateTargetId = null;
            renderTransitionEvacuation([]);
        });
    });

    document.querySelectorAll("[data-evac-action='submit-update']").forEach(btn => {
        btn.addEventListener("click", async () => {
            try {
                await updateTransitionEvacuees(Number(btn.dataset.activationId));
            } catch (error) {
                console.error("Error updating evacuees:", error);
                showToastSafe("Failed to update evacuees.", "error");
            }
        });
    });

    document.querySelectorAll("[data-evac-action='close']").forEach(btn => {
        btn.addEventListener("click", async () => {
            try {
                await closeTransitionEvacuation(Number(btn.dataset.activationId));
            } catch (error) {
                console.error("Error closing evacuation center:", error);
                showToastSafe("Failed to close evacuation center.", "error");
            }
        });
    });
}

async function activateTransitionEvacuationCenter() {
    if (!pendingTransitionReview) return;

    if (!transitionSelectedEvacuationCenterId) {
        showToastSafe("Select an evacuation center first.", "info");
        return;
    }

    const selectedCenterId = Number(transitionSelectedEvacuationCenterId);
    const evacueesInput = document.getElementById("transitionEvacCurrentEvacuees");
    const currentEvacuees = Number(evacueesInput?.value || 0);

    const existingOpenAssignment = (pendingTransitionEvacuationAssignments || []).find(item =>
        Number(item.centerId) === selectedCenterId &&
        String(item.status || "").toUpperCase() === "OPEN"
    );

    if (existingOpenAssignment) {
        const updateEndpoint = pendingTransitionReview.type === "INCIDENT"
            ? `${API_BASE}/incidents/${pendingTransitionReview.data.id}/evacuations/${existingOpenAssignment.id}/evacuees`
            : `${API_BASE}/calamities/${pendingTransitionReview.data.id}/evacuations/${existingOpenAssignment.id}/evacuees`;

        await apiRequest(updateEndpoint, {
            method: "PUT",
            body: JSON.stringify({
                currentEvacuees
            })
        });

        transitionEvacuationFormVisible = false;
        transitionSelectedEvacuationCenterId = "";
        transitionEvacuationSearchResults = [];

        await loadTransitionEvacuationAssignments(pendingTransitionReview);
        renderTransitionEvacuation([]);
        showToastSafe("Existing evacuation center updated.", "success");
        return;
    }

    const createEndpoint = pendingTransitionReview.type === "INCIDENT"
        ? `${API_BASE}/incidents/${pendingTransitionReview.data.id}/evacuations`
        : `${API_BASE}/calamities/${pendingTransitionReview.data.id}/evacuations`;

    await apiRequest(createEndpoint, {
        method: "POST",
        body: JSON.stringify({
            centerId: selectedCenterId,
            currentEvacuees
        })
    });

    transitionEvacuationFormVisible = false;
    transitionSelectedEvacuationCenterId = "";
    transitionEvacuationSearchResults = [];

    await loadTransitionEvacuationAssignments(pendingTransitionReview);
    renderTransitionEvacuation([]);
    showToastSafe("Evacuation center added.", "success");
}

async function updateTransitionEvacuees(activationId) {
    if (!pendingTransitionReview || !activationId) return;

    const input = document.getElementById(`transitionEvacUpdateInput-${activationId}`);
    const currentEvacuees = Number(input?.value || 0);

    const endpoint = pendingTransitionReview.type === "INCIDENT"
        ? `${API_BASE}/incidents/${pendingTransitionReview.data.id}/evacuations/${activationId}/evacuees`
        : `${API_BASE}/calamities/${pendingTransitionReview.data.id}/evacuations/${activationId}/evacuees`;

    await apiRequest(endpoint, {
        method: "PUT",
        body: JSON.stringify({
            currentEvacuees
        })
    });

    transitionEvacuationUpdateTargetId = null;

    await loadTransitionEvacuationAssignments(pendingTransitionReview);
    renderTransitionEvacuation([]);
    showToastSafe("Evacuees updated.", "success");
}

async function closeTransitionEvacuation(activationId) {
    if (!pendingTransitionReview || !activationId) return;

    const endpoint = pendingTransitionReview.type === "INCIDENT"
        ? `${API_BASE}/incidents/${pendingTransitionReview.data.id}/evacuations/${activationId}/close`
        : `${API_BASE}/calamities/${pendingTransitionReview.data.id}/evacuations/${activationId}/close`;

    await apiRequest(endpoint, { method: "PUT" });

    await loadTransitionEvacuationAssignments(pendingTransitionReview);
    renderTransitionEvacuation([]);
    showToastSafe("Evacuation center closed.", "success");
}

async function loadTransitionEvacuationAssignments(config) {
    pendingTransitionEvacuationAssignments = [];

    try {
        const endpoint = config.type === "INCIDENT"
            ? `${API_BASE}/incidents/${config.data.id}/evacuations`
            : `${API_BASE}/calamities/${config.data.id}/evacuations`;

        const response = await apiRequest(endpoint);
        pendingTransitionEvacuationAssignments = Array.isArray(response) ? response : [];
    } catch (error) {
        console.error("Error loading evacuation assignments:", error);
        pendingTransitionEvacuationAssignments = [];
    }
}

//

function renderTransitionSuggestedResources() {
    const container = document.getElementById("transitionSuggestedResources");
    if (!container) return;

    const resources = getEditableTransitionResources();
    const cards = resources.length
        ? resources.map((resource, index) => buildTransitionResourceCard(resource, index)).join("")
        : `<div class="readiness-empty-card">No suggested resources available.</div>`;

    container.innerHTML = `
        <div class="transition-resource-list">${cards}</div>
        <div class="transition-resource-add-wrap">
            <button type="button" class="btn btn-primary transition-add-resource-btn" id="transitionAddResourceBtn">
                <i class="fas fa-plus"></i> Add resource
            </button>
        </div>
    `;

    bindTransitionResourceEvents(container);
}

function renderTransitionStockChecks() {
    const container = document.getElementById("transitionStockChecks");
    if (!container) return;

    const stockChecks = buildEffectiveTransitionStockChecks();
    if (!stockChecks.length) {
        container.innerHTML = `<div class="readiness-empty-card">No stock checks available.</div>`;
        return;
    }

    container.innerHTML = stockChecks.map((stock, index) => `
        <div class="readiness-stock-card">
            <div class="readiness-item-title">${escapeHtml(stock.itemName || "-")}</div>
            <div class="readiness-item-meta">
                Category: ${escapeHtml(stock.category || "-")}<br>
                Required: ${escapeHtml(String(stock.requiredQuantity ?? 0))} ${escapeHtml(stock.unit || "")}<br>
                Available: ${escapeHtml(String(stock.availableQuantity ?? 0))} ${escapeHtml(stock.unit || "")}
            </div>
            <span class="readiness-status-badge ${getReadinessStatusClassSafe(stock.status)}">
                ${escapeHtml(stock.status || "-")}
            </span>
            <div class="transition-inline-actions">
                <button type="button" class="btn btn-primary transition-inline-btn" data-stock-action="open-inventory" data-stock-index="${index}">
                    Open inventory
                </button>
            </div>
        </div>
    `).join("");

    container.querySelectorAll("[data-stock-action='open-inventory']").forEach(btn => {
        btn.addEventListener("click", () => {
            showToastSafe("Resources page is not built yet. Use Inventory module for now.", "info");
        });
    });
}

function normalizeTransitionSuggestedResources(resources) {
    return (resources || [])
        .filter(resource => !isResponderResource(resource))
        .map((resource, index) => ({
            id: resource.id || `suggested-${index}`,
            source: "SUGGESTED",
            included: true,
            itemName: resource.itemName || "",
            resourceType: resource.resourceType || resource.type || "",
            category: resource.category || "",
            suggestedQuantity: Number(resource.suggestedQuantity ?? resource.requiredQuantity ?? 0) || 0,
            quantity: Number(resource.suggestedQuantity ?? resource.requiredQuantity ?? 0) || 0,
            unit: resource.unit || "",
            reason: resource.reason || ""
        }));
}

function isResponderResource(resource) {
    const text = `${resource?.itemName || ""} ${resource?.resourceType || resource?.type || ""} ${resource?.category || ""}`.toLowerCase();
    return text.includes("responder") || text.includes("personnel") || text.includes("team member") || text.includes("manpower");
}

async function preloadTransitionInventoryCatalog() {
    if (pendingTransitionInventoryCatalog.length) return;

    try {
        const inventory = await apiRequest(`${API_BASE}/inventory`);
        if (Array.isArray(inventory)) {
            pendingTransitionInventoryCatalog = inventory.map((item, index) => ({
                id: item.id || `inventory-${index}`,
                itemName: item.itemName || item.name || "",
                resourceType: item.resourceType || item.type || "",
                category: item.category || "",
                unit: item.unit || "",
                availableQuantity: Number(item.availableQuantity ?? item.quantity ?? 0) || 0
            }));
            return;
        }
    } catch {}

    const fallback = [];
    pendingTransitionSuggestedResources.forEach((item, index) => {
        fallback.push({
            id: item.id || `fallback-s-${index}`,
            itemName: item.itemName || "",
            resourceType: item.resourceType || "",
            category: item.category || "",
            unit: item.unit || "",
            availableQuantity: 0
        });
    });
    pendingTransitionStockChecksRaw.forEach((item, index) => {
        fallback.push({
            id: item.id || `fallback-k-${index}`,
            itemName: item.itemName || "",
            resourceType: item.resourceType || item.type || "",
            category: item.category || "",
            unit: item.unit || "",
            availableQuantity: Number(item.availableQuantity ?? 0) || 0
        });
    });
    pendingTransitionInventoryCatalog = fallback;
}

function getEditableTransitionResources() {
    return [...pendingTransitionSuggestedResources, ...pendingTransitionCustomResources];
}

function buildTransitionResourceCard(resource, index) {
    const muted = resource.included ? "" : " transition-resource-card-muted";
    const badge = resource.source === "CUSTOM"
        ? `<span class="transition-resource-badge">Added</span>`
        : `<span class="transition-resource-badge subtle">Suggested</span>`;
    const action = resource.source === "CUSTOM"
        ? `<button type="button" class="btn btn-cancel transition-inline-btn" data-resource-action="remove" data-resource-index="${index}">Remove</button>`
        : (resource.included
            ? `<button type="button" class="btn btn-cancel transition-inline-btn" data-resource-action="reset" data-resource-index="${index}">Reset</button>`
            : "");
    const showInputs = resource.source === "CUSTOM" || resource.included;

    return `
        <div class="readiness-resource-card transition-resource-card${muted}" data-resource-index="${index}">
            <div class="transition-resource-card-top">
                <div class="transition-resource-card-title-wrap">
                    <div class="readiness-item-title">${escapeHtml(resource.itemName || "New resource")}</div>
                    ${badge}
                </div>
                <label class="transition-resource-include-toggle">
                    <input type="checkbox" data-resource-field="included" data-resource-index="${index}" ${resource.included ? "checked" : ""}>
                    <span>Include</span>
                </label>
            </div>

            <div class="transition-resource-compact-meta">
                <span><strong>Type:</strong> ${escapeHtml(resource.resourceType || "-")}</span>
                <span><strong>Category:</strong> ${escapeHtml(resource.category || "-")}</span>
                <span><strong>Qty:</strong> ${escapeHtml(String(resource.quantity ?? 0))} ${escapeHtml(resource.unit || "")}</span>
            </div>

            ${showInputs ? `
                <div class="transition-resource-grid">
                    ${buildTransitionSearchField("Name", "itemName", resource.itemName, index)}
                    ${buildTransitionSelectField("Type", "resourceType", resource.resourceType, index, getTransitionTypeOptions())}
                    ${buildTransitionSelectField("Category", "category", resource.category, index, getTransitionCategoryOptions())}
                    <label class="transition-resource-field">
                        <span>Quantity</span>
                        <input type="number" min="0" step="1" class="transition-resource-input" data-resource-field="quantity" data-resource-index="${index}" value="${escapeHtml(String(resource.quantity ?? 0))}">
                    </label>
                    ${buildTransitionSelectField("Unit", "unit", resource.unit, index, getTransitionUnitOptions())}
                </div>

                <label class="transition-resource-field transition-resource-reason-field">
                    <span>Reason</span>
                    <textarea rows="2" class="transition-resource-input" data-resource-field="reason" data-resource-index="${index}">${escapeHtml(resource.reason || "")}</textarea>
                </label>
            ` : ""}

            <div class="transition-resource-actions">${action}</div>
        </div>
    `;
}

function buildTransitionSearchField(label, field, value, index) {
    return `
        <label class="transition-resource-field transition-resource-search-field">
            <span>${label}</span>
            <input type="text" autocomplete="off" class="transition-resource-input transition-search-input" data-resource-field="${field}" data-resource-index="${index}" value="${escapeHtml(value || "")}">
            <div class="transition-search-suggestions hidden" data-resource-suggestions="${field}" data-resource-index="${index}"></div>
        </label>
    `;
}

function buildTransitionSelectField(label, field, value, index, options) {
    const optionMarkup = options.map(option => `
        <option value="${escapeHtml(option)}" ${String(value || "").toLowerCase() === String(option).toLowerCase() ? "selected" : ""}>${escapeHtml(option)}</option>
    `).join("");

    return `
        <label class="transition-resource-field">
            <span>${label}</span>
            <select class="transition-resource-input transition-resource-select" data-resource-field="${field}" data-resource-index="${index}">
                <option value="">Select ${label.toLowerCase()}</option>
                ${optionMarkup}
            </select>
        </label>
    `;
}

function getTransitionTypeOptions() {
    const dynamic = pendingTransitionInventoryCatalog.map(item => item.resourceType || "").filter(Boolean);
    return Array.from(new Set([...TRANSITION_RESOURCE_TYPE_OPTIONS, ...dynamic]));
}

function getTransitionCategoryOptions() {
    const dynamic = pendingTransitionInventoryCatalog.map(item => item.category || "").filter(Boolean);
    return Array.from(new Set([...TRANSITION_RESOURCE_CATEGORY_OPTIONS, ...dynamic]));
}

function getTransitionUnitOptions() {
    const dynamic = pendingTransitionInventoryCatalog.map(item => item.unit || "").filter(Boolean);
    return Array.from(new Set([...TRANSITION_RESOURCE_UNIT_OPTIONS, ...dynamic]));
}

function bindTransitionResourceEvents(container) {
    document.getElementById("transitionAddResourceBtn")?.addEventListener("click", () => {
        pendingTransitionCustomResources.push({
            id: `custom-${Date.now()}`,
            source: "CUSTOM",
            included: true,
            itemName: "",
            resourceType: getTransitionTypeOptions()[0] || "OTHER",
            category: getTransitionCategoryOptions()[0] || "OTHER",
            quantity: 1,
            suggestedQuantity: 1,
            unit: getTransitionUnitOptions()[0] || "pcs",
            reason: ""
        });
        renderTransitionSuggestedResources();
        rerenderTransitionDerivedSections();
    });

    container.querySelectorAll("[data-resource-field]").forEach(input => {
        const field = input.dataset.resourceField;
        const index = Number(input.dataset.resourceIndex);
        const eventName = input.type === "checkbox" ? "change" : "input";

        input.addEventListener(eventName, () => {
            const resource = getEditableTransitionResources()[index];
            if (!resource) return;

            resource[field] = input.type === "checkbox"
                ? input.checked
                : (field === "quantity" ? Math.max(0, Number(input.value || 0)) : input.value);

            if (field === "itemName" || field === "resourceType" || field === "category") {
                hydrateResourceFromCatalog(resource, field);
                if (input.classList.contains("transition-search-input")) {
                    showTransitionResourceSuggestions(index, field, input.value || "");
                }
            }

            if (field === "included") {
                renderTransitionSuggestedResources();
                rerenderTransitionDerivedSections();
                return;
            }

            rerenderTransitionDerivedSections();
        });

        if (input.classList.contains("transition-search-input")) {
            input.addEventListener("focus", () => {
                showTransitionResourceSuggestions(index, field, input.value || "");
            });
        }
    });

    container.querySelectorAll("[data-resource-action]").forEach(btn => {
        btn.addEventListener("click", () => {
            const index = Number(btn.dataset.resourceIndex);
            const target = getEditableTransitionResources()[index];
            if (!target) return;

            if (btn.dataset.resourceAction === "remove" && target.source === "CUSTOM") {
                pendingTransitionCustomResources = pendingTransitionCustomResources.filter(item => item.id !== target.id);
            }

            if (btn.dataset.resourceAction === "reset") {
                target.included = true;
                target.quantity = target.suggestedQuantity || 0;
            }

            renderTransitionSuggestedResources();
            rerenderTransitionDerivedSections();
        });
    });

    document.removeEventListener("click", handleTransitionSuggestionOutsideClick, true);
    document.addEventListener("click", handleTransitionSuggestionOutsideClick, true);
}

function handleTransitionSuggestionOutsideClick(event) {
    if (event.target.closest(".transition-resource-search-field")) return;
    document.querySelectorAll(".transition-search-suggestions").forEach(box => box.classList.add("hidden"));
}

function showTransitionResourceSuggestions(index, field, keyword) {
    const box = document.querySelector(`.transition-search-suggestions[data-resource-index="${index}"][data-resource-suggestions="${field}"]`);
    if (!box) return;

    const sourceValues = field === "itemName"
        ? pendingTransitionInventoryCatalog.map(item => item.itemName || "")
        : field === "resourceType"
            ? getTransitionTypeOptions()
            : field === "category"
                ? getTransitionCategoryOptions()
                : getTransitionUnitOptions();

    const values = Array.from(new Set(sourceValues
        .filter(Boolean)
        .filter(value => value.toLowerCase().includes(String(keyword || "").toLowerCase()))
    )).slice(0, 8);

    box.innerHTML = values.length
        ? values.map(value => `<div class="suggestion-item" data-suggestion-value="${escapeHtml(value)}">${escapeHtml(value)}</div>`).join("")
        : `<div class="suggestion-item empty">No matches found.</div>`;
    box.classList.remove("hidden");

    box.querySelectorAll(".suggestion-item[data-suggestion-value]").forEach(item => {
        item.addEventListener("click", () => {
            const resource = getEditableTransitionResources()[index];
            if (!resource) return;
            resource[field] = item.dataset.suggestionValue || "";
            hydrateResourceFromCatalog(resource, field);
            renderTransitionSuggestedResources();
            renderTransitionStockChecks();
        });
    });
}

function hydrateResourceFromCatalog(resource, changedField) {
    const candidate = pendingTransitionInventoryCatalog.find(item => {
        const itemNameMatch = !resource.itemName || (item.itemName || "").toLowerCase() === String(resource.itemName || "").toLowerCase();
        const typeMatch = !resource.resourceType || (item.resourceType || "").toLowerCase() === String(resource.resourceType || "").toLowerCase();
        const categoryMatch = !resource.category || (item.category || "").toLowerCase() === String(resource.category || "").toLowerCase();
        return changedField === "itemName" ? itemNameMatch : changedField === "resourceType" ? typeMatch : categoryMatch;
    });

    if (!candidate) return;
    if (!resource.itemName) resource.itemName = candidate.itemName || resource.itemName;
    if (!resource.resourceType) resource.resourceType = candidate.resourceType || resource.resourceType;
    if (!resource.category) resource.category = candidate.category || resource.category;
    if (!resource.unit) resource.unit = candidate.unit || resource.unit;
}

function buildEffectiveTransitionStockChecks() {
    const baseMap = new Map();

    (pendingTransitionStockChecksRaw || []).forEach(stock => {
        const key = getTransitionResourceKey(stock.itemName, stock.category, stock.unit);
        baseMap.set(key, {
            itemName: stock.itemName || "-",
            category: stock.category || "-",
            requiredQuantity: Number(stock.requiredQuantity ?? 0) || 0,
            availableQuantity: Number(stock.availableQuantity ?? 0) || 0,
            unit: stock.unit || "",
            status: stock.status || deriveTransitionStockStatus(Number(stock.requiredQuantity ?? 0) || 0, Number(stock.availableQuantity ?? 0) || 0)
        });
    });

    getEditableTransitionResources().filter(item => item.included).forEach(resource => {
        const key = getTransitionResourceKey(resource.itemName, resource.category, resource.unit);
        const matchedCatalog = pendingTransitionInventoryCatalog.find(item => (item.itemName || "").toLowerCase() === String(resource.itemName || "").toLowerCase());
        const available = matchedCatalog ? Number(matchedCatalog.availableQuantity ?? 0) || 0 : 0;
        baseMap.set(key, {
            itemName: resource.itemName || "-",
            category: resource.category || "-",
            requiredQuantity: Number(resource.quantity ?? 0) || 0,
            availableQuantity: available,
            unit: resource.unit || (matchedCatalog?.unit || ""),
            status: matchedCatalog ? deriveTransitionStockStatus(Number(resource.quantity ?? 0) || 0, available) : "NOT_FOUND"
        });
    });

    return Array.from(baseMap.values());
}

function getTransitionResourceKey(name, category, unit) {
    return `${String(name || "").toLowerCase()}|${String(category || "").toLowerCase()}|${String(unit || "").toLowerCase()}`;
}

function deriveTransitionStockStatus(required, available) {
    if (!available && required > 0) return "NOT_FOUND";
    if (available <= 0 && required > 0) return "OUT_OF_STOCK";
    if (available < required) return "LOW_STOCK";
    return "AVAILABLE";
}

function renderTransitionRelief(reliefReadiness) {
    const container = document.getElementById("transitionReliefReadiness");
    if (!container) return;

    if (!reliefReadiness) {
        container.innerHTML = `<div class="readiness-empty-card">No relief readiness data available.</div>`;
        return;
    }

    if (!reliefReadiness.recommended) {
        container.innerHTML = `<div class="readiness-empty-card">Relief support is not currently recommended.</div>`;
        return;
    }

    const checks = reliefReadiness.reliefStockChecks || [];
    container.innerHTML = `
        <div class="readiness-relief-meta">
            Projected Beneficiaries: ${escapeHtml(String(reliefReadiness.projectedBeneficiaries ?? 0))}<br>
            Projected Relief Packs: ${escapeHtml(String(reliefReadiness.projectedReliefPacks ?? 0))}
        </div>
        ${
            checks.length
                ? `<div class="readiness-relief-stock-list">
                    ${checks.map(stock => `
                        <div class="readiness-stock-card">
                            <div class="readiness-item-title">${escapeHtml(stock.itemName || "-")}</div>
                            <div class="readiness-item-meta">
                                Required: ${escapeHtml(String(stock.requiredQuantity ?? 0))} ${escapeHtml(stock.unit || "")}<br>
                                Available: ${escapeHtml(String(stock.availableQuantity ?? 0))} ${escapeHtml(stock.unit || "")}
                            </div>
                            <span class="readiness-status-badge ${getReadinessStatusClassSafe(stock.status)}">
                                ${escapeHtml(stock.status || "-")}
                            </span>
                        </div>
                    `).join("")}
                  </div>`
                : `<div class="readiness-empty-card">No relief stock checks available.</div>`
        }
    `;
}

function renderTransitionEvacuation(evacuationChecks) {
    const container = document.getElementById("transitionEvacuationChecks");
    if (!container) return;

    const assignments = Array.isArray(pendingTransitionEvacuationAssignments)
        ? pendingTransitionEvacuationAssignments.filter(item =>
            String(item.status || "").toUpperCase() === "OPEN"
        )
        : [];

    const cardsHtml = assignments.length
        ? assignments.map(item => {
            const capacity = Number(item.centerCapacity ?? 0) || 0;
            const currentEvacuees = Number(item.currentEvacuees ?? 0) || 0;
            const availableSlots = Math.max(0, capacity - currentEvacuees);
            const showUpdateForm = transitionEvacuationUpdateTargetId === item.id;

            return `
                <div class="readiness-evacuation-card transition-evacuation-assignment-card">
                    <div class="readiness-item-title">${escapeHtml(item.centerName || "-")}</div>
                    <div class="readiness-item-meta">
                        Barangay: ${escapeHtml(item.centerBarangayName || "-")}<br>
                        Capacity: ${escapeHtml(String(capacity))}<br>
                        Current Evacuees: ${escapeHtml(String(currentEvacuees))}<br>
                        Available Slots: ${escapeHtml(String(availableSlots))}<br>
                        Status: ${escapeHtml(item.status || "-")}
                    </div>

                    <div class="transition-inline-actions transition-evacuation-actions-row">
                        <button type="button" class="btn btn-primary transition-inline-btn" data-evac-action="toggle-update" data-activation-id="${item.id}">
                            Update Evacuees
                        </button>
                        <button type="button" class="btn btn-cancel transition-inline-btn" data-evac-action="close" data-activation-id="${item.id}">
                            Close Center
                        </button>
                    </div>

                    ${showUpdateForm ? `
                        <div class="transition-evacuation-inline-form">
                            <label class="transition-resource-field">
                                <span>Current Evacuees</span>
                                <input
                                    type="number"
                                    min="0"
                                    id="transitionEvacUpdateInput-${item.id}"
                                    class="transition-resource-input"
                                    value="${escapeHtml(String(currentEvacuees))}"
                                >
                            </label>

                            <div class="transition-inline-actions">
                                <button type="button" class="btn btn-primary transition-inline-btn" data-evac-action="submit-update" data-activation-id="${item.id}">
                                    Update
                                </button>
                                <button type="button" class="btn btn-cancel transition-inline-btn" data-evac-action="cancel-update">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ` : ""}
                </div>
            `;
        }).join("")
        : `<div class="readiness-empty-card">No active evacuation centers for this operation.</div>`;

    const addFormHtml = transitionEvacuationFormVisible ? `
        <div class="readiness-evacuation-card transition-evacuation-assignment-card">
            <label class="transition-resource-field transition-resource-search-field">
                <span>Evacuation Center</span>
                <input
                    type="text"
                    id="transitionEvacCenterSearch"
                    class="transition-resource-input"
                    autocomplete="off"
                    placeholder="Search evacuation center..."
                >
                <div id="transitionEvacCenterSuggestions" class="transition-search-suggestions hidden"></div>
            </label>

            <label class="transition-resource-field">
                <span>Current Evacuees</span>
                <input
                    type="number"
                    min="0"
                    id="transitionEvacCurrentEvacuees"
                    class="transition-resource-input"
                    value="0"
                >
            </label>

            <div class="transition-inline-actions">
                <button type="button" class="btn btn-primary transition-inline-btn" id="transitionEvacSubmitBtn">
                    Add Evacuation Center
                </button>
                <button type="button" class="btn btn-cancel transition-inline-btn" id="transitionEvacCancelBtn">
                    Cancel
                </button>
            </div>
        </div>
    ` : "";

    container.innerHTML = `
        ${cardsHtml}
        <div class="transition-inline-actions transition-evacuation-actions-row">
            <button type="button" class="btn btn-primary transition-inline-btn" id="transitionActivateEvacBtn">
                Add Evacuation Center
            </button>
        </div>
        ${addFormHtml}
    `;

    bindTransitionEvacuationEvents();
}

function renderTransitionCostDrivers(costDrivers) {
    const container = document.getElementById("transitionCostDrivers");
    if (!container) return;

    const selectedForecast = getTransitionSelectedForecastInfo();

    const summaryValue = selectedForecast.hasCostData
        ? formatCurrencySafe(selectedForecast.total)
        : "No cost data";

    const summaryHelper = selectedForecast.hasCostData
        ? "Included resources only"
        : "Add unit cost fields in inventory/resources to compute this";

    const summaryCard = `
        <div class="readiness-cost-driver-card transition-forecast-summary-card">
            <div class="readiness-item-title">Selected Plan Forecast</div>
            <div class="readiness-item-meta">${escapeHtml(summaryValue)}<br>${escapeHtml(summaryHelper)}</div>
        </div>
    `;

    if (!costDrivers.length) {
        container.innerHTML = `
            ${summaryCard}
            <div class="readiness-empty-card">No cost drivers available.</div>
        `;
        return;
    }

    container.innerHTML = `
        ${summaryCard}
        ${costDrivers.map(driver => `
            <div class="readiness-cost-driver-card">
                <div class="readiness-item-title">${escapeHtml(driver.name || "-")}</div>
                <div class="readiness-item-meta">${escapeHtml(formatCurrencySafe(driver.amount))}</div>
            </div>
        `).join("")}
    `;
}

function renderTransitionWarnings(warnings) {
    const container = document.getElementById("transitionWarnings");
    if (!container) return;

    if (!warnings.length) {
        container.innerHTML = `<div class="readiness-empty-card">No operational warnings at this time.</div>`;
        return;
    }

    container.innerHTML = warnings.map((warning) => {
        const level = String(warning.level || "INFO").toUpperCase();
        const message = String(warning.message || "").toLowerCase();

        const actions = [];

        if (message.includes("responder")) {
            actions.push(`<button type="button" class="btn btn-primary transition-inline-btn" data-warning-action="assign-responder">Assign responder</button>`);
        }

        // if (message.includes("stock") || message.includes("resource") || message.includes("inventory")) {
        //     actions.push(`<button type="button" class="btn btn-primary transition-inline-btn" data-warning-action="add-resource">Add resource</button>`);
        //     actions.push(`<button type="button" class="btn btn-cancel transition-inline-btn" data-warning-action="open-inventory">Open inventory</button>`);
        // }

        if (message.includes("evac") || message.includes("capacity") || message.includes("evacuee")) {
            actions.push(`<button type="button" class="btn btn-primary transition-inline-btn" data-warning-action="review-evacuation">Review evacuation</button>`);
        }

        return `
            <div class="readiness-warning-card ${getWarningClassSafe(level)}">
                <strong>${escapeHtml(level)}</strong><br>
                <span>${escapeHtml(warning.message || "-")}</span>
                ${actions.length ? `<div class="transition-inline-actions warning-action-row">${actions.join("")}</div>` : ""}
            </div>
        `;
    }).join("");

    container.querySelectorAll("[data-warning-action]").forEach(btn => {
        btn.addEventListener("click", () => {
            const action = btn.dataset.warningAction;

            if (action === "assign-responder") {
                document.getElementById("transitionResponderBlock")?.classList.remove("hidden");
                document.getElementById("transitionResponderSearch")?.focus();
                return;
            }

            // if (action === "add-resource") {
            //     document.getElementById("transitionAddResourceBtn")?.click();
            //     return;
            // }

            // if (action === "open-inventory") {
            //     showToastSafe("Resources page is not built yet. Use Inventory module for now.", "info");
            //     return;
            // }

            if (action === "review-evacuation") {
                document.getElementById("transitionEvacuationChecks")?.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
            }
        });
    });
}

function renderTransitionAcknowledgements(warnings) {
    const container = document.getElementById("transitionWarningAcknowledgements");
    const overrideBlock = document.getElementById("transitionOverrideReasonBlock");
    if (!container || !overrideBlock) return;

    const roles = getCurrentUserRolesSafe();
    const isElevated = roles.includes("ROLE_ADMIN") || roles.includes("ROLE_MANAGER");

    const warningItems = warnings.filter(w => {
        const level = String(w.level || "").toUpperCase();
        return level === "WARNING" || level === "CRITICAL";
    });

    if (!warningItems.length) {
        container.innerHTML = `<div class="readiness-empty-card">No acknowledgement required.</div>`;
        overrideBlock.classList.add("hidden");
        pendingTransitionAcknowledgementState.requiresAcknowledgement = false;
        pendingTransitionAcknowledgementState.requestStatus = "NOT_REQUIRED";
        renderTransitionAcknowledgementHeaderStatus();
        syncTransitionReviewButtonLabel([]);
        return;
    }

    pendingTransitionAcknowledgementState.requiresAcknowledgement = true;

    if (isElevated) {
        let hasCritical = false;

        container.innerHTML = warningItems.map((warning) => {
            const level = String(warning.level || "").toUpperCase();
            if (level === "CRITICAL") hasCritical = true;

            return `
                <div class="transition-ack-item">
                    <label>
                        <input
                            type="checkbox"
                            class="transition-ack-checkbox"
                            data-warning-level="${escapeHtml(level)}"
                        >
                        <span>
                            I acknowledge this ${escapeHtml(level.toLowerCase())} warning.<br>
                            <strong>${escapeHtml(warning.message || "-")}</strong>
                        </span>
                    </label>
                </div>
            `;
        }).join("");

        overrideBlock.classList.toggle("hidden", !hasCritical);
        renderTransitionAcknowledgementHeaderStatus();
        syncTransitionReviewButtonLabel(warnings);
        return;
    }

    const status = String(pendingTransitionAcknowledgementState.requestStatus || "NONE").toUpperCase();
    const reviewedBy = pendingTransitionAcknowledgementState.reviewedByName || "Manager/Admin";
    const remarks = pendingTransitionAcknowledgementState.remarks || "";

    let helperText = "Manager/Admin acknowledgement is required before this transition can proceed.";
    let buttonText = "Request Acknowledgement";
    let buttonDisabled = false;

    if (status === "PENDING") {
        helperText = "Your acknowledgement request is pending review.";
        buttonText = "Pending Acknowledgement";
        buttonDisabled = true;
    } else if (status === "APPROVED") {
        helperText = `Acknowledgement approved by ${reviewedBy}.`;
        buttonText = "Acknowledgement Approved";
        buttonDisabled = true;
    } else if (status === "REJECTED") {
        helperText = remarks
            ? `Acknowledgement was rejected by ${reviewedBy}. Remarks: ${remarks}`
            : `Acknowledgement was rejected by ${reviewedBy}.`;
        buttonText = "Request Acknowledgement Again";
        buttonDisabled = false;
    }

    container.innerHTML = `
        <div class="transition-ack-request-card">
            <div class="readiness-item-title">Acknowledgement Required</div>
            <div class="readiness-item-meta">${escapeHtml(helperText)}</div>

            <div class="transition-ack-warning-list">
                ${warningItems.map((warning) => `
                    <div class="transition-ack-warning-preview">
                        <strong>${escapeHtml(String(warning.level || "").toUpperCase())}</strong><br>
                        <span>${escapeHtml(warning.message || "-")}</span>
                    </div>
                `).join("")}
            </div>

            <div class="transition-inline-actions">
                <button
                    type="button"
                    class="btn btn-primary transition-inline-btn"
                    id="transitionRequestAcknowledgementBtn"
                    ${buttonDisabled ? "disabled" : ""}
                >
                    ${escapeHtml(buttonText)}
                </button>
            </div>
        </div>
    `;

    overrideBlock.classList.add("hidden");

    const ackBtn = document.getElementById("transitionRequestAcknowledgementBtn");
    if (ackBtn) {
        // Clone and replace to remove all existing event listeners
        const newBtn = ackBtn.cloneNode(true);
        ackBtn.parentNode.replaceChild(newBtn, ackBtn);

        newBtn.addEventListener("click", async () => {
            if (!pendingTransitionReview) return;

            const config = pendingTransitionReview;
            const data = config.data;
            const description = (document.getElementById("transitionReviewDescription")?.value || "").trim();
            const responderId = document.getElementById("transitionResponderId")?.value || "";
            const overrideReason = (document.getElementById("transitionOverrideReason")?.value || "").trim();

            try {
                const created = await apiRequest(`${API_BASE}/approval-requests`, {
                    method: "POST",
                    body: JSON.stringify({
                        requestType: "OPERATION_ACKNOWLEDGEMENT",
                        title: config.type === "INCIDENT"
                            ? `Acknowledgement request for incident #${data.id}`
                            : `Acknowledgement request for calamity #${data.id}`,
                        description: [
                            `Acknowledgement required before proceeding with ${config.mode}.`,
                            description ? `Update: ${description}` : ""
                        ].filter(Boolean).join(" "),
                        referenceType: config.type,
                        referenceId: data.id,
                        payloadJson: JSON.stringify({
                            mode: config.mode,
                            type: config.type,
                            eventId: data.id,
                            description,
                            responderId: responderId ? Number(responderId) : null,
                            overrideReason,
                            warnings: warningItems
                        })
                    })
                });

                pendingTransitionAcknowledgementState.requestStatus = "PENDING";
                pendingTransitionAcknowledgementState.requestId = created?.id || null;

                renderTransitionAcknowledgementHeaderStatus();
                renderTransitionAcknowledgements(warnings);
                syncTransitionReviewButtonLabel(pendingTransitionWarnings || []);

                showToastSafe("Acknowledgement request submitted.", "info");
                await refreshGlobalAdminBadgesIfAvailable();
            } catch (error) {
                console.error("Failed to request acknowledgement:", error);
                showToastSafe(error.message || "Failed to request acknowledgement.", "error");
            }
        });
    }

    renderTransitionAcknowledgementHeaderStatus();
    syncTransitionReviewButtonLabel(warnings);
}

async function confirmTransitionReview() {
    if (!pendingTransitionReview) return;

    const config = pendingTransitionReview;
    const data = config.data;
    config.selectedResources = getEditableTransitionResources()
        .filter(item => item.included && Number(item.quantity || 0) > 0)
        .map(item => ({
            source: item.source,
            itemName: item.itemName,
            resourceType: item.resourceType,
            category: item.category,
            quantity: Number(item.quantity || 0),
            unit: item.unit || "",
            reason: item.reason || ""
        }));

    const description = (document.getElementById("transitionReviewDescription")?.value || "").trim();
    const responderId = document.getElementById("transitionResponderId")?.value || "";
    const responderName = document.getElementById("transitionResponderSearch")?.value || "";
    const overrideReason = (document.getElementById("transitionOverrideReason")?.value || "").trim();

    const roles = getCurrentUserRolesSafe();
    const isElevated = roles.includes("ROLE_ADMIN") || roles.includes("ROLE_MANAGER");

    const warningItems = (pendingTransitionWarnings || []).filter(w => {
        const level = String(w.level || "").toUpperCase();
        return level === "WARNING" || level === "CRITICAL";
    });

    const requiresAcknowledgement = warningItems.length > 0;
    const ackStatus = String(pendingTransitionAcknowledgementState.requestStatus || "NONE").toUpperCase();

    if (requiresAcknowledgement && !isElevated && ackStatus !== "APPROVED") {
        showToastSafe("Manager/Admin acknowledgement is required before continuing.", "info");
        return;
    }

    const ackBoxes = Array.from(document.querySelectorAll(".transition-ack-checkbox"));

    if (isElevated && warningItems.length) {
        const uncheckedWarnings = ackBoxes.filter(box => !box.checked);
        if (uncheckedWarnings.length) {
            showToastSafe("Please acknowledge required warnings before continuing.", "info");
            return;
        }

        const criticalCount = ackBoxes.filter(box =>
            String(box.dataset.warningLevel || "").toUpperCase() === "CRITICAL"
        ).length;

        if (criticalCount > 0 && !overrideReason) {
            showToastSafe("Override reason is required for critical issues.", "info");
            return;
        }
    }

    try {
        if (config.type === "INCIDENT") {
            if (config.mode === "DISPATCH_REVIEW") {
                if (!responderId || !responderName) {
                    showToastSafe("Select a responder from the suggestion list.", "info");
                    return;
                }

                await apiRequest(`${API_BASE}/incidents/${data.id}/dispatch`, {
                    method: "PUT",
                    body: JSON.stringify({
                        responderId: Number(responderId),
                        description: description || null,
                        overrideReason: overrideReason || null
                    })
                });
            }

            if (config.mode === "ARRIVE_REVIEW") {
                await apiRequest(`${API_BASE}/incidents/${data.id}/arrive`, {
                    method: "PUT",
                    body: JSON.stringify({
                        description: description || null,
                        overrideReason: overrideReason || null
                    })
                });
            }

            if (config.mode === "RESOLVE_REVIEW") {
                await apiRequest(`${API_BASE}/incidents/${data.id}/resolve`, {
                    method: "PUT",
                    body: JSON.stringify({
                        description: description || null,
                        overrideReason: overrideReason || null
                    })
                });
            }
        }

        if (config.type === "CALAMITY") {
            if (config.mode === "MONITOR_REVIEW") {
                await apiRequest(`${API_BASE}/calamities/${data.id}/monitor`, {
                    method: "PUT",
                    body: JSON.stringify({
                        description: description || null,
                        overrideReason: overrideReason || null
                    })
                });
            }

            if (config.mode === "RESOLVE_REVIEW") {
                await apiRequest(`${API_BASE}/calamities/${data.id}/resolve`, {
                    method: "PUT",
                    body: JSON.stringify({
                        description: description || null,
                        overrideReason: overrideReason || null
                    })
                });
            }

            if (config.mode === "END_REVIEW") {
                await apiRequest(`${API_BASE}/calamities/${data.id}/end`, {
                    method: "PUT",
                    body: JSON.stringify({
                        description: description || null,
                        overrideReason: overrideReason || null
                    })
                });
            }
        }

        closeTransitionReviewModal();

        if (typeof loadIncidentBoard === "function") {
            await loadIncidentBoard();
        }
        if (typeof loadCalamityBoard === "function") {
            await loadCalamityBoard();
        }

        if (config.type === "INCIDENT") {
            const refreshed = await apiRequest(`${API_BASE}/incidents`);
            const latest = (refreshed || []).find(item => Number(item.id) === Number(data.id));
            if (latest) {
                currentSelection = { type: "INCIDENT", data: latest };
                await loadOperationsDrawer("INCIDENT", latest);
            } else {
                resetOperationsDrawer();
                closeOperationsDrawer();
            }
        }

        if (config.type === "CALAMITY") {
            const refreshed = await apiRequest(`${API_BASE}/calamities`);
            const latest = (refreshed || []).find(item => Number(item.id) === Number(data.id));
            if (latest) {
                currentSelection = { type: "CALAMITY", data: latest };
                await loadOperationsDrawer("CALAMITY", latest);
            } else {
                resetOperationsDrawer();
                closeOperationsDrawer();
            }
        }

        showToastSafe("Operation updated successfully.", "success");
    } catch (error) {
        console.error("Error confirming transition review:", error);

        const message = String(error.message || "").toLowerCase();

        const approvalRequired =
            message.includes("approval required") ||
            message.includes("acknowledgement approval required");

        if (approvalRequired) {
            showToastSafe("This transition still requires manager/admin acknowledgement.", "error");
            await loadTransitionAcknowledgementStatus(config);
            renderTransitionAcknowledgements(pendingTransitionWarnings || []);
            syncTransitionReviewButtonLabel(pendingTransitionWarnings || []);
            return;
        }

        showToastSafe(error.message || "Failed to update operation.", "error");
    }
}

function syncTransitionReviewButtonLabel(warnings = []) {
    const confirmBtn = document.getElementById("transitionReviewConfirm");
    if (!confirmBtn) return;

    const warningItems = (warnings || []).filter(w => {
        const level = String(w.level || "").toUpperCase();
        return level === "WARNING" || level === "CRITICAL";
    });

    const requiresAcknowledgement = warningItems.length > 0;
    const roles = getCurrentUserRolesSafe();
    const isElevated = roles.includes("ROLE_ADMIN") || roles.includes("ROLE_MANAGER");
    const ackStatus = String(pendingTransitionAcknowledgementState?.requestStatus || "NONE").toUpperCase();

    if (!requiresAcknowledgement) {
        confirmBtn.textContent = "Confirm Transition";
        confirmBtn.disabled = false;
        return;
    }

    if (isElevated) {
        confirmBtn.textContent = "Confirm Transition";
        confirmBtn.disabled = false;
        return;
    }

    confirmBtn.textContent = "Confirm Transition";
    confirmBtn.disabled = ackStatus !== "APPROVED";
}

async function updateIncidentForTransition(data, description, responderId) {
    await apiRequest(`${API_BASE}/incidents/${data.id}`, {
        method: "PUT",
        body: JSON.stringify({
            type: data.type,
            barangayId: data.barangayId,
            assignedResponderId: responderId ? Number(responderId) : (data.assignedResponderId || null),
            severity: data.severity,
            description: description
        })
    });
}

async function updateCalamityForTransition(data, description) {
    await apiRequest(`${API_BASE}/calamities/${data.id}`, {
        method: "PUT",
        body: JSON.stringify({
            type: data.type,
            eventName: data.eventName || null,
            affectedAreaType: data.affectedAreaType,
            barangayId: data.barangayId ?? data.primaryBarangayId ?? null,
            barangayIds: data.affectedBarangayIds || [],
            coordinatorId: data.coordinatorId || null,
            severity: data.severity,
            date: data.date || null,
            damageCost: data.damageCost ?? 0,
            casualties: data.casualties ?? 0,
            description: description
        })
    });
}

function clearTransitionReviewContent() {
    const ids = [
        "transitionReviewSummaryContent",
        "transitionSuggestedResources",
        "transitionStockChecks",
        "transitionReliefReadiness",
        "transitionEvacuationChecks",
        "transitionCostDrivers",
        "transitionWarnings",
        "transitionWarningAcknowledgements"
    ];

    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = "";
    });

    const description = document.getElementById("transitionReviewDescription");
    const responderSearch = document.getElementById("transitionResponderSearch");
    const responderId = document.getElementById("transitionResponderId");
    const overrideReason = document.getElementById("transitionOverrideReason");

    if (description) description.value = "";
    if (responderSearch) responderSearch.value = "";
    if (responderId) responderId.value = "";
    if (overrideReason) overrideReason.value = "";

    pendingTransitionSuggestedResources = [];
    pendingTransitionCustomResources = [];
    pendingTransitionStockChecksRaw = [];
    pendingTransitionInventoryCatalog = [];
    pendingTransitionWarnings = [];
    pendingTransitionCostDrivers = [];
    pendingTransitionEvacuationAssignments = [];
    pendingEvacuationCenterCatalog = [];

    document.removeEventListener("click", handleTransitionSuggestionOutsideClick, true);
}

function initTransitionResponderSearch() {
    const responderSearch = document.getElementById("transitionResponderSearch");
    const responderId = document.getElementById("transitionResponderId");
    const suggestions = document.getElementById("transitionResponderSuggestions");

    if (!responderSearch || !responderId || !suggestions) return;

    responderSearch.addEventListener("focus", async () => {
        await searchTransitionResponders(responderSearch.value.trim());
    });

    responderSearch.addEventListener("input", async () => {
        responderId.value = "";
        await searchTransitionResponders(responderSearch.value.trim());
    });

    document.addEventListener("click", event => {
        const clickedInside =
            responderSearch.contains(event.target) ||
            suggestions.contains(event.target);

        if (!clickedInside) {
            suggestions.innerHTML = "";
        }
    });
}

async function searchTransitionResponders(keyword = "") {
    const suggestions = document.getElementById("transitionResponderSuggestions");
    const responderSearch = document.getElementById("transitionResponderSearch");
    const responderId = document.getElementById("transitionResponderId");
    if (!suggestions || !responderSearch || !responderId) return;

    try {
        const responders = await apiRequest(`${RESPONDER_API}/available?keyword=${encodeURIComponent(keyword)}`);
        suggestions.innerHTML = "";

        if (!responders || !responders.length) {
            suggestions.innerHTML = `<div class="suggestion-item empty">No available responders found.</div>`;
            return;
        }

        responders.forEach(responder => {
            const item = document.createElement("div");
            item.className = "suggestion-item";
            item.textContent = responder.fullName || `${responder.firstName} ${responder.lastName}`;

            item.addEventListener("click", () => {
                responderSearch.value = responder.fullName || `${responder.firstName} ${responder.lastName}`;
                responderId.value = responder.id;
                suggestions.innerHTML = "";
            });

            suggestions.appendChild(item);
        });
    } catch (error) {
        console.error("Error searching transition responders:", error);
    }
}

async function initTransitionEvacuationCenterSearch() {
    const input = document.getElementById("transitionEvacCenterSearch");
    const suggestions = document.getElementById("transitionEvacCenterSuggestions");
    if (!input || !suggestions) return;

    input.addEventListener("focus", async () => {
        await searchTransitionEvacuationCenters(input.value.trim());
    });

    input.addEventListener("input", async () => {
        transitionSelectedEvacuationCenterId = "";
        await searchTransitionEvacuationCenters(input.value.trim());
    });
}

async function searchTransitionEvacuationCenters(keyword = "") {
    const input = document.getElementById("transitionEvacCenterSearch");
    const suggestions = document.getElementById("transitionEvacCenterSuggestions");
    if (!input || !suggestions) return;

    const filtered = filterEvacuationCenterSuggestions(keyword);

    suggestions.innerHTML = filtered.length
        ? filtered.map(center => {
            const alreadyActive = pendingTransitionEvacuationAssignments.some(item =>
                Number(item.centerId) === Number(center.id) &&
                String(item.status || "").toUpperCase() === "OPEN"
            );

            return `
                <div
                    class="suggestion-item"
                    data-center-id="${center.id}"
                    data-center-name="${escapeHtml(center.name || center.centerName || "")}"
                >
                    <div>${escapeHtml(center.name || center.centerName || "-")}</div>
                    ${alreadyActive ? `<div class="readiness-item-meta">Already active in this operation — selecting it will update evacuees</div>` : ""}
                </div>
            `;
        }).join("")
        : `<div class="suggestion-item empty">No evacuation centers found.</div>`;

    suggestions.classList.remove("hidden");

    suggestions.querySelectorAll("[data-center-id]").forEach(item => {
        item.addEventListener("click", () => {
            input.value = item.dataset.centerName || "";
            transitionSelectedEvacuationCenterId = item.dataset.centerId || "";
            suggestions.classList.add("hidden");
        });
    });
}

/* =========================
   Init
   ========================= */

function initOperationsDrawer() {
    document.getElementById("operationsDrawerClose")?.addEventListener("click", closeOperationsDrawer);
    document.getElementById("operationsDrawerOverlay")?.addEventListener("click", closeOperationsDrawer);

    document.getElementById("transitionReviewClose")?.addEventListener("click", closeTransitionReviewModal);
    document.getElementById("transitionReviewCancel")?.addEventListener("click", closeTransitionReviewModal);
    document.getElementById("transitionReviewConfirm")?.addEventListener("click", confirmTransitionReview);

    document.getElementById("transitionReviewModal")?.addEventListener("click", event => {
        if (event.target.id === "transitionReviewModal") {
            closeTransitionReviewModal();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;

        if (document.getElementById("transitionReviewModal")?.classList.contains("active")) {
            closeTransitionReviewModal();
            return;
        }

        if (document.getElementById("operationsDrawer")?.classList.contains("active")) {
            closeOperationsDrawer();
        }
    });

    initTransitionResponderSearch();
}

/* =========================
   Helpers
   ========================= */

function setDrawerText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function formatCurrencySafe(value) {
    const numeric = Number(value || 0);
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP"
    }).format(numeric);
}

function formatDateTimeSafe(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function getSafeCalamityArea(calamity) {
    if (typeof formatCalamityArea === "function") {
        return formatCalamityArea(calamity);
    }

    const areaType = String(calamity?.affectedAreaType || "").toUpperCase();
    const affectedNames = calamity?.affectedBarangayNames || [];

    if (areaType === "MUNICIPALITY") return "Whole Municipality";
    if (areaType === "MULTI_BARANGAY") {
        if (!affectedNames.length) return "-";
        if (affectedNames.length === 1) return affectedNames[0];
        return `${affectedNames.length} Barangays`;
    }

    return calamity?.primaryBarangayName || "-";
}

function getSeverityClassSafe(severity) {
    if (typeof getSeverityClass === "function") {
        return getSeverityClass(severity);
    }

    const normalized = String(severity || "").trim().toUpperCase();
    if (normalized === "HIGH") return "severity-high";
    if (normalized === "MEDIUM") return "severity-medium";
    if (normalized === "LOW") return "severity-low";
    return "severity-default";
}

function getWarningClassSafe(level) {
    const normalized = String(level || "").toUpperCase();
    if (normalized === "CRITICAL") return "readiness-warning-critical";
    if (normalized === "WARNING") return "readiness-warning-warning";
    return "readiness-warning-info";
}

function getReadinessStatusClassSafe(status) {
    const normalized = String(status || "").toUpperCase();

    if (normalized === "AVAILABLE") return "readiness-status-available";
    if (normalized === "LOW_STOCK") return "readiness-status-low_stock";
    if (normalized === "OUT_OF_STOCK") return "readiness-status-out_of_stock";
    if (normalized === "NOT_FOUND") return "readiness-status-not_found";
    if (normalized === "NEAR_CAPACITY") return "readiness-status-near_capacity";
    if (normalized === "FULL") return "readiness-status-full";
    return "readiness-status-warning";
}

function getCurrentUserRolesSafe() {
    try {
        const raw = localStorage.getItem("userAuthorities") || sessionStorage.getItem("userAuthorities");
        if (!raw) return [];

        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(role => String(role).toUpperCase()) : [];
    } catch {
        return [];
    }
}

function showToastSafe(message, type = "info") {
    if (typeof showToast === "function") {
        showToast(message, type);
        return;
    }
    console.log(`[${type}] ${message}`);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

document.addEventListener("DOMContentLoaded", initOperationsDrawer);