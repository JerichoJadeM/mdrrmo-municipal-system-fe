const API_BASE = window.APP_CONFIG.API_BASE;

const CALAMITY_TYPES = [
    "Flood",
    "Typhoon",
    "Storm Surge",
    "Landslide",
    "Earthquake",
    "Volcanic Eruption",
    "Fire",
    "Drought",
    "Others"
];

const INCIDENT_TYPES = [
    "Vehicular Accident",
    "Medical Emergency",
    "Fire Incident",
    "Missing Person",
    "Rescue Operation",
    "Road Obstruction",
    "Fallen Tree",
    "Drowning Incident",
    "Electrical Hazard",
    "Structural Collapse",
    "Oil Spill / Chemical Spill",
    "Crime / Security Assistance",
    "Evacuation Assistance",
    "Others"
];

const CALAMITY_STATUSES = ["ACTIVE", "MONITORING", "RESOLVED", "ENDED"];
const INCIDENT_STATUSES = ["ONGOING", "IN_PROGRESS", "ON_SITE", "RESOLVED"];
const SEVERITY_LEVELS = ["LOW", "MEDIUM", "HIGH"];
const AFFECTED_AREA_TYPES = ["BARANGAY", "MULTI_BARANGAY", "MUNICIPALITY"];

let barangays = [];
let coordinators = [];
let responders = [];
let calamities = [];
let incidents = [];

let activeTab = "calamities";
let selectedEvent = null;
let selectedEventType = null;
let isDetailsMode = false;

let currentUserRoles = [];

let editMode = false;
let editingEventId = null;
let editingEventType = null;

let selectedPrimaryBarangay = null;
let selectedMultiBarangays = [];
let selectedCoordinator = null;

let selectedIncidentBarangay = null;
let selectedResponder = null;

let activeModalId = null;

let eventPagination = null;

const dmTableState = {
    page: 1,
    pageSize: 5
};

let editingCalamityId = null;
let editingIncidentId = null;

let activeSitrepMarkerKey = null;
let sitrepOutsideClickBound = false;

function showMessage(message, type = "success") {
    const box = document.getElementById("dmMessage");
    if (!box) return;

    box.textContent = message;
    box.className = `dm-message dm-message-${type}`;
    box.classList.remove("hidden");

    setTimeout(() => {
        box.classList.add("hidden");
    }, 3000);
}

function extractErrorMessage(error) {
    const fallback = "Something went wrong.";

    if (!error) return fallback;

    let rawMessage = "";

    if (typeof error === "string") {
        rawMessage = error;
    } else if (error.message) {
        rawMessage = error.message;
    } else if (error.responseText) {
        rawMessage = error.responseText;
    } else {
        rawMessage = String(error);
    }

    let normalizedMessage = rawMessage;

    try {
        const parsed = JSON.parse(rawMessage);
        normalizedMessage = parsed.message || rawMessage;
    } catch {
        try {
            const parsed = JSON.parse(error?.message || "");
            normalizedMessage = parsed.message || rawMessage;
        } catch {
            normalizedMessage = rawMessage;
        }
    }

    const lower = String(normalizedMessage).toLowerCase();

    if (
        lower.includes("foreign key constraint fails") &&
        lower.includes("expenses") &&
        lower.includes("calamity_id")
    ) {
        return "This calamity cannot be deleted because it already has linked expense records.";
    }

    if (
        lower.includes("foreign key constraint fails") &&
        lower.includes("expenses") &&
        lower.includes("incident_id")
    ) {
        return "This incident cannot be deleted because it already has linked expense records.";
    }

    if (
        lower.includes("foreign key constraint fails") &&
        lower.includes("expenses")
    ) {
        return "This event cannot be deleted because it already has linked expense records.";
    }

    return normalizedMessage || fallback;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function truncateText(value, maxLength = 150) {
    const text = String(value || "").trim();
    if (!text) return "No description provided.";
    return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

function getCurrentUserRoles() {
    try {
        const raw = localStorage.getItem("userAuthorities") || sessionStorage.getItem("userAuthorities");
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(role => String(role).toUpperCase()) : [];
    } catch {
        return [];
    }
}

function canManageEvents() {
    return currentUserRoles.includes("ROLE_ADMIN") || currentUserRoles.includes("ROLE_MANAGER");
}

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

function populateSelect(selectId, values, defaultLabel) {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = `<option value="">${defaultLabel}</option>`;

    values.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    });
}

function initStaticSelects() {
    populateSelect("calamityTypeSelect", CALAMITY_TYPES, "Select type");
    populateSelect("incidentTypeSelect", INCIDENT_TYPES, "Select type");
    populateSelect("calamitySeveritySelect", SEVERITY_LEVELS, "Select severity");
    populateSelect("incidentSeveritySelect", SEVERITY_LEVELS, "Select severity");
    populateSelect("calamityStatusSelect", CALAMITY_STATUSES, "Select status");
    populateSelect("incidentStatusSelect", INCIDENT_STATUSES, "Select status");
    populateSelect("affectedAreaTypeSelect", AFFECTED_AREA_TYPES, "Select affected scope");
}

async function loadBarangays() {
    barangays = await apiRequest(`${API_BASE}/barangays`);
}

async function loadCoordinators() {
    try {
        coordinators = await apiRequest(`${API_BASE}/users/coordinators`);
    } catch {
        coordinators = [];
    }
}

async function loadResponders() {
    try {
        responders = await apiRequest(`${API_BASE}/users/responders`);
    } catch {
        responders = [];
    }
}

function getActiveCalamities() {
    return calamities.filter(c =>
        ["ACTIVE", "MONITORING"].includes((c.status || "").toUpperCase())
    );
}

function getActiveIncidents() {
    return incidents.filter(i =>
        ["ONGOING", "IN_PROGRESS", "ON_SITE"].includes((i.status || "").toUpperCase())
    );
}

function syncSitRepMetrics() {
    const activeCalamities = getActiveCalamities();
    const activeIncidents = getActiveIncidents();

    updateSitRepMetrics(activeCalamities, activeIncidents);
    renderSitRepMap(activeCalamities, activeIncidents);
}

function updateSummaryCards() {
    const calamityCount = document.getElementById("totalCalamitiesCount") || document.getElementById("calamityCount");
    const incidentCount = document.getElementById("totalIncidentsCount") || document.getElementById("incidentCount");
    const highSeverityCount = document.getElementById("highSeverityCalamitiesCount") || document.getElementById("highSeverityCount");
    const openEventCount = document.getElementById("ongoingIncidentsCount") || document.getElementById("openEventCount");

    const activeCalamities = getActiveCalamities();
    const activeIncidents = getActiveIncidents();

    const highSeverityEvents =
        calamities.filter(c => (c.severity || "").toUpperCase() === "HIGH").length +
        incidents.filter(i => (i.severity || "").toUpperCase() === "HIGH").length;

    if (calamityCount) calamityCount.textContent = calamities.length;
    if (incidentCount) incidentCount.textContent = incidents.length;
    if (highSeverityCount) highSeverityCount.textContent = highSeverityEvents;
    if (openEventCount) openEventCount.textContent = activeCalamities.length + activeIncidents.length;
}

function updateSitRepMetrics(activeCalamities = [], activeIncidents = []) {
    const metricActiveCalamities = document.getElementById("metricActiveCalamities");
    const metricActiveIncidents = document.getElementById("metricActiveIncidents");
    const metricEventsThisWeek = document.getElementById("metricEventsThisWeek");
    const metricLatestEvent = document.getElementById("metricLatestEvent");
    const metricLatestEventSubtext = document.getElementById("metricLatestEventSubtext");

    if (metricActiveCalamities) metricActiveCalamities.textContent = activeCalamities.length;
    if (metricActiveIncidents) metricActiveIncidents.textContent = activeIncidents.length;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const calamitiesThisWeek = calamities.filter(c => {
        const d = new Date(c.date);
        return !Number.isNaN(d.getTime()) && d >= sevenDaysAgo;
    });

    const incidentsThisWeek = incidents.filter(i => {
        const d = new Date(i.reportedAt || i.date);
        return !Number.isNaN(d.getTime()) && d >= sevenDaysAgo;
    });

    if (metricEventsThisWeek) {
        metricEventsThisWeek.textContent = calamitiesThisWeek.length + incidentsThisWeek.length;
    }

    const combined = [
        ...calamities.map(c => ({
            type: "calamity",
            title: c.eventName || c.type || "Calamity Event",
            status: c.status || "-",
            when: c.date,
            timestamp: new Date(c.date).getTime()
        })),
        ...incidents.map(i => ({
            type: "incident",
            title: i.type || "Incident",
            status: i.status || "-",
            when: i.reportedAt || i.date,
            timestamp: new Date(i.reportedAt || i.date).getTime()
        }))
    ].filter(item => !Number.isNaN(item.timestamp))
        .sort((a, b) => b.timestamp - a.timestamp);

    const latest = combined[0];

    if (metricLatestEvent) {
        metricLatestEvent.textContent = latest ? latest.title : "No recent event";
    }

    if (metricLatestEventSubtext) {
        metricLatestEventSubtext.textContent = latest
            ? `${latest.type === "calamity" ? "Calamity" : "Incident"} • ${latest.status} • ${formatDateTime(latest.when)}`
            : "Waiting for data";
    }
}

function updateLastUpdatedText() {
    const el = document.getElementById("dmLastUpdatedText");
    if (!el) return;

    el.innerHTML = `
        <i class="fas fa-clock"></i>
        Last updated: ${formatDateTime(new Date())}
    `;
}

async function loadCalamities() {
    calamities = await apiRequest(`${API_BASE}/calamities`);

    if (selectedEventType === "calamity" && selectedEvent?.id != null) {
        const latestSelected = calamities.find(c => String(c.id) === String(selectedEvent.id));
        selectedEvent = latestSelected || null;
        if (!latestSelected) selectedEventType = null;
    }

    updateSummaryCards();
    syncSitRepMetrics();
    renderCurrentTab();
    updateLastUpdatedText();
    renderSelectedEventProfile();
}

async function loadIncidents() {
    incidents = await apiRequest(`${API_BASE}/incidents`);

    if (selectedEventType === "incident" && selectedEvent?.id != null) {
        const latestSelected = incidents.find(i => String(i.id) === String(selectedEvent.id));
        selectedEvent = latestSelected || null;
        if (!latestSelected) selectedEventType = null;
    }

    updateSummaryCards();
    syncSitRepMetrics();
    renderCurrentTab();
    updateLastUpdatedText();
    renderSelectedEventProfile();
}

function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

function formatCurrency(value) {
    const numeric = Number(value || 0);
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP"
    }).format(numeric);
}

function getSeverityClass(severity) {
    const normalized = (severity || "").trim().toUpperCase();
    if (normalized === "HIGH") return "severity-high";
    if (normalized === "MEDIUM") return "severity-medium";
    if (normalized === "LOW") return "severity-low";
    return "severity-default";
}

function getStatusClass(status) {
    const normalized = (status || "").trim().toUpperCase();

    if (["ACTIVE", "ONGOING", "IN_PROGRESS", "ON_SITE"].includes(normalized)) {
        return "severity-high";
    }
    if (["MONITORING"].includes(normalized)) {
        return "severity-medium";
    }
    if (["RESOLVED", "ENDED"].includes(normalized)) {
        return "severity-low";
    }
    return "severity-default";
}

function severityRank(severity) {
    const normalized = (severity || "").trim().toUpperCase();
    if (normalized === "HIGH") return 3;
    if (normalized === "MEDIUM") return 2;
    if (normalized === "LOW") return 1;
    return 0;
}

function getFilterKeyword() {
    return (document.getElementById("eventFilter")?.value || "").trim().toLowerCase();
}

function sortEvents(items, type) {
    const sortValue = document.getElementById("eventSort")?.value || "latest";
    const sorted = [...items];

    sorted.sort((a, b) => {
        const aDate = new Date(type === "calamity" ? a.date : (a.reportedAt || a.date)).getTime();
        const bDate = new Date(type === "calamity" ? b.date : (b.reportedAt || b.date)).getTime();

        if (sortValue === "oldest") return aDate - bDate;
        if (sortValue === "severity-high") return severityRank(b.severity) - severityRank(a.severity);
        if (sortValue === "severity-low") return severityRank(a.severity) - severityRank(b.severity);
        if (sortValue === "type-az") return (a.type || "").localeCompare(b.type || "");

        return bDate - aDate;
    });

    return sorted;
}

function getFilteredAndSortedCalamities() {
    const keyword = getFilterKeyword();

    const filtered = calamities.filter((calamity) => {
        if (!keyword) return true;

        const searchableText = [
            calamity.type,
            calamity.eventName,
            calamity.primaryBarangayName,
            ...(calamity.affectedBarangayNames || []),
            calamity.coordinatorName,
            calamity.severity,
            calamity.status,
            calamity.description,
            calamity.date,
            calamity.affectedAreaType
        ].filter(Boolean).join(" ").toLowerCase();

        return searchableText.includes(keyword);
    });

    return sortEvents(filtered, "calamity");
}

function getFilteredAndSortedIncidents() {
    const keyword = getFilterKeyword();

    const filtered = incidents.filter((incident) => {
        if (!keyword) return true;

        const searchableText = [
            incident.type,
            incident.barangay,
            incident.severity,
            incident.status,
            incident.description,
            incident.assignedResponderName,
            incident.reportedAt,
            incident.date
        ].filter(Boolean).join(" ").toLowerCase();

        return searchableText.includes(keyword);
    });

    return sortEvents(filtered, "incident");
}

function isSelectedEvent(eventId, eventType) {
    return selectedEventType === eventType && String(selectedEvent?.id) === String(eventId);
}

async function selectEvent(event, type, openDetails = false) {
    selectedEvent = event;
    selectedEventType = type;
    activeSitrepMarkerKey = null;

    renderSelectedEventProfile();
    renderSitRepMap();

    if (openDetails) {
        await renderEventDetailsView();
        showEventDetailsView();
        return;
    }

    renderCurrentTab();
}

function createMetaPill(iconClass, text) {
    return `
        <span class="meta-pill">
            <i class="${iconClass}"></i>
            ${escapeHtml(text || "-")}
        </span>
    `;
}

function formatAffectedArea(calamity) {
    const areaType = (calamity.affectedAreaType || "").toUpperCase();
    const affectedNames = calamity.affectedBarangayNames || [];

    if (areaType === "MUNICIPALITY") {
        return "Whole Municipality";
    }

    if (areaType === "MULTI_BARANGAY") {
        if (!affectedNames.length) return "-";
        if (affectedNames.length === 1) return affectedNames[0];
        return `${affectedNames.length} barangays`;
    }

    return calamity.primaryBarangayName || "-";
}

function getCalamityCardTitle(calamity) {
    return calamity.eventName || calamity.type || "Calamity Event";
}

function getIncidentCardTitle(incident) {
    return incident.type || "Incident";
}

function createLibraryCard({
    eventId,
    eventType,
    title,
    severity,
    status,
    metaHtml,
    description,
    eventData
}) {
    const card = document.createElement("article");
    card.className = `dm-item-card${isSelectedEvent(eventId, eventType) ? " active" : ""}`;
    card.dataset.eventId = eventId;
    card.dataset.eventType = eventType;

    card.innerHTML = `
        <div class="dm-item-card-header">
            <div class="dm-item-card-title-wrap">
                <h3 class="dm-item-title">${escapeHtml(title || "Untitled Event")}</h3>
                <div class="dm-item-meta">${metaHtml}</div>
            </div>

            <div class="dm-item-badges">
                <span class="status-badge ${getStatusClass(status)}">${escapeHtml(status || "-")}</span>
                <span class="severity-badge ${getSeverityClass(severity)}">${escapeHtml(severity || "-")}</span>
            </div>
        </div>

        <p class="dm-item-description">${escapeHtml(truncateText(description, 165))}</p>

        <div class="dm-card-actions">
            <button type="button" class="btn btn-secondary dm-card-open-btn">
                <i class="fas fa-up-right-from-square"></i>
                Open Details
            </button>
        </div>
    `;

    card.addEventListener("click", (event) => {
        const actionBtn = event.target.closest(".dm-card-open-btn");
        if (actionBtn) return;
        selectEvent(eventData, eventType, false);
    });

    card.querySelector(".dm-card-open-btn")?.addEventListener("click", (event) => {
        event.stopPropagation();
        selectEvent(eventData, eventType, true);
    });

    return card;
}

function getCalamitySubmitMeta() {
    const editing = Boolean(editingCalamityId);
    return {
        editing,
        variant: editing ? "update" : "save",
        title: editing ? "Update Calamity" : "Save Calamity",
        message: editing
            ? "Do you want to apply these calamity updates?"
            : "Do you want to save this calamity record?",
        submessage: editing
            ? "The selected calamity record will be updated in the system."
            : "A new calamity record will be added to the system.",
        confirmText: editing ? "Update Calamity" : "Save Calamity",
        processingText: editing ? "Updating..." : "Saving..."
    };
}

function getIncidentSubmitMeta() {
    const editing = Boolean(editingIncidentId);
    return {
        editing,
        variant: editing ? "update" : "save",
        title: editing ? "Update Incident" : "Save Incident",
        message: editing
            ? "Do you want to apply these incident updates?"
            : "Do you want to save this incident record?",
        submessage: editing
            ? "The selected incident record will be updated in the system."
            : "A new incident record will be added to the system.",
        confirmText: editing ? "Update Incident" : "Save Incident",
        processingText: editing ? "Updating..." : "Saving..."
    };
}

function updateTabButtons() {
    document.getElementById("tabCalamities")?.classList.toggle("active", activeTab === "calamities");
    document.getElementById("tabIncidents")?.classList.toggle("active", activeTab === "incidents");
}

function updateLibraryActionButton() {
    const addBtnText = document.getElementById("libraryAddBtnText");
    const addBtnIcon = document.getElementById("libraryAddBtnIcon");

    if (!addBtnText || !addBtnIcon) return;

    if (activeTab === "calamities") {
        addBtnText.textContent = "Add Calamity";
        addBtnIcon.className = "fas fa-cloud-showers-heavy";
    } else {
        addBtnText.textContent = "Add Incident";
        addBtnIcon.className = "fas fa-helmet-safety";
    }
}

function renderCurrentTab() {
    try {
        if (isDetailsMode) return;

        renderEventTableHead();

        const rows = getCurrentLibraryRows();

        updateEventPageSizeAvailability(rows.length);

        if (eventPagination) {
            eventPagination.setRows(rows);
        } else {
            const pageSize = Number(document.getElementById("eventPageSize")?.value || dmTableState.pageSize || 5);
            renderEventTableRows(rows.slice(0, pageSize));
        }
    } catch (error) {
        console.error("renderCurrentTab failed:", error);
    }
}

function initEventLibraryPagination() {
    ensureEventLibraryPaginationMarkup();

    eventPagination = createPaginationController({
        initialPage: dmTableState.page || 1,
        initialPageSize: dmTableState.pageSize || 5,
        rows: [],
        infoId: "eventPaginationInfo",
        controlsId: "eventPaginationControls",
        pageSizeSelectId: "eventPageSize",
        itemLabel: "events",
        onRenderRows: (pageRows, meta) => {
            dmTableState.page = meta.currentPage;
            dmTableState.pageSize = meta.pageSize;
            renderEventTableRows(pageRows);
        }
    });
}

async function loadIncidentTimeline(incidentId) {
    try {
        return await apiRequest(`${API_BASE}/incidents/${incidentId}/actions`);
    } catch (error) {
        console.error("Error loading incident timeline:", error);
        return [];
    }
}

function renderProfileSummaryItems(items) {
    return items.map(item => `
        <div class="dm-profile-summary-item">
            <strong>${escapeHtml(item.label)}</strong>
            <span>${escapeHtml(item.value ?? "-")}</span>
        </div>
    `).join("");
}

async function renderEventDetailsView() {
    const titleEl = document.getElementById("eventDetailsTitle");
    const subtitleEl = document.getElementById("eventDetailsSubtitle");
    const contentEl = document.getElementById("eventDetailsContent");
    const editBtn = document.getElementById("detailsEditBtn");
    const deleteBtn = document.getElementById("detailsDeleteBtn");

    if (!titleEl || !subtitleEl || !contentEl || !selectedEvent || !selectedEventType) return;

    const isCalamity = selectedEventType === "calamity";

    titleEl.textContent = isCalamity
        ? "Calamity Details"
        : "Incident Details";

    subtitleEl.textContent = isCalamity
        ? "Review the selected calamity record and current situation details."
        : "Review the selected incident record and current operational details.";

    if (editBtn) editBtn.classList.toggle("hidden", !canManageEvents());
    if (deleteBtn) deleteBtn.classList.toggle("hidden", !canManageEvents());

    let timelineHtml = "";

    if (isCalamity) {
        timelineHtml = renderCalamityTimeline(selectedEvent);
    } else {
        const timelineItems = await loadIncidentTimeline(selectedEvent.id);
        timelineHtml = renderIncidentTimelineMarkup(timelineItems);
    }

    contentEl.innerHTML = `
        <div class="dm-profile-card dm-view-card dm-inline-details-card">
            <div class="dm-profile-card-header dm-view-card-header">
                <div class="dm-view-heading-block">
                    <div class="dm-view-title-row dm-view-title-row-inline">
                        <div class="dm-view-type-icon">
                            <i class="${getEventTypeIcon(selectedEvent.type)}"></i>
                        </div>
                        <div class="dm-view-title-main">
                            <div class="dm-view-title-inline-wrap">
                                <h3>${escapeHtml(isCalamity ? (selectedEvent.eventName || selectedEvent.type || "-") : (selectedEvent.type || "-"))}</h3>
                                <div class="dm-item-meta dm-view-pills">
                                    ${createMetaPill(getEventTypeIcon(selectedEvent.type), selectedEvent.type || "-")}
                                    <span class="severity-badge ${getSeverityClass(selectedEvent.severity)}">
                                        ${escapeHtml(selectedEvent.severity || "-")}
                                    </span>
                                    <span class="status-badge ${getStatusClass(selectedEvent.status)}">
                                        ${escapeHtml(selectedEvent.status || "-")}
                                    </span>
                                </div>
                            </div>
                            <p class="dm-view-subtitle">
                                ${escapeHtml(isCalamity ? (formatAffectedArea(selectedEvent) || "No affected area") : (selectedEvent.barangay || "No barangay assigned"))}
                            </p>
                        </div>
                    </div>

                    <div class="dm-event-stepper dm-event-stepper-wide" id="viewEventStepper"></div>
                </div>
            </div>

            <div class="dm-view-summary-grid">
                ${isCalamity ? `
                    <div class="dm-view-summary-card"><span class="dm-view-summary-label">Event Type</span><strong>Calamity</strong></div>
                    <div class="dm-view-summary-card"><span class="dm-view-summary-label">Calamity Type</span><strong>${escapeHtml(selectedEvent.type || "-")}</strong></div>
                    <div class="dm-view-summary-card"><span class="dm-view-summary-label">Affected Area</span><strong>${escapeHtml(formatAffectedArea(selectedEvent) || "-")}</strong></div>
                    <div class="dm-view-summary-card"><span class="dm-view-summary-label">Coordinator</span><strong>${escapeHtml(selectedEvent.coordinatorName || "-")}</strong></div>
                    <div class="dm-view-summary-card"><span class="dm-view-summary-label">Damage Cost</span><strong>${selectedEvent.damageCost ? escapeHtml(formatCurrency(selectedEvent.damageCost)) : "-"}</strong></div>
                    <div class="dm-view-summary-card"><span class="dm-view-summary-label">Casualties</span><strong>${escapeHtml(String(selectedEvent.casualties ?? 0))}</strong></div>
                ` : `
                    <div class="dm-view-summary-card"><span class="dm-view-summary-label">Event Type</span><strong>${escapeHtml(selectedEvent.type || "-")}</strong></div>
                    <div class="dm-view-summary-card"><span class="dm-view-summary-label">Barangay</span><strong>${escapeHtml(selectedEvent.barangay || "-")}</strong></div>
                    <div class="dm-view-summary-card"><span class="dm-view-summary-label">Responder</span><strong>${escapeHtml(selectedEvent.assignedResponderName || "-")}</strong></div>
                    <div class="dm-view-summary-card"><span class="dm-view-summary-label">Severity</span><strong>${escapeHtml(selectedEvent.severity || "-")}</strong></div>
                    <div class="dm-view-summary-card"><span class="dm-view-summary-label">Status</span><strong>${escapeHtml(selectedEvent.status || "-")}</strong></div>
                    <div class="dm-view-summary-card"><span class="dm-view-summary-label">Reported</span><strong>${escapeHtml(formatDateTime(selectedEvent.reportedAt || selectedEvent.date))}</strong></div>
                `}
            </div>

            <div class="dm-profile-grid dm-view-sections">
                <div class="dm-profile-section dm-view-section-card">
                    <h4>Description</h4>
                    <p class="dm-item-description">
                        ${escapeHtml(selectedEvent.description || "No description available.")}
                    </p>
                </div>

                <div class="dm-profile-section dm-view-section-card">
                    <h4>Recent Timeline</h4>
                    <div class="dm-timeline">
                        ${timelineHtml}
                    </div>
                </div>
            </div>
        </div>
    `;

    if (typeof renderEventStepper === "function") {
        renderEventStepper(selectedEvent, selectedEventType);
    }
}

function renderSelectedEventProfile() {
    const emptyState = document.getElementById("eventProfileEmpty");
    const content = document.getElementById("eventProfileContent");
    const title = document.getElementById("profileTitle");
    const severityBadge = document.getElementById("profileSeverityBadge");
    const meta = document.getElementById("profileMeta");
    const summary = document.getElementById("profileSummary");
    const description = document.getElementById("profileDescription");
    const timelineSection = document.getElementById("incidentTimelineSection");
    const timeline = document.getElementById("incidentTimeline");
    const actions = document.getElementById("eventProfileActions");

    if (!emptyState || !content || !title || !severityBadge || !meta || !summary || !description || !timelineSection || !timeline || !actions) {
        return;
    }

    if (!selectedEvent || !selectedEventType) {
        emptyState.classList.remove("hidden");
        content.classList.add("hidden");
        actions.classList.add("hidden");
        return;
    }

    emptyState.classList.add("hidden");
    content.classList.remove("hidden");
    actions.classList.remove("hidden");

    const isCalamity = selectedEventType === "calamity";
    title.textContent = isCalamity ? (selectedEvent.eventName || selectedEvent.type || "-") : (selectedEvent.type || "-");
    severityBadge.className = `severity-badge ${getSeverityClass(selectedEvent.severity)}`;
    severityBadge.textContent = selectedEvent.severity || "-";

    if (isCalamity) {
        meta.innerHTML = [
            createMetaPill(getEventTypeIcon(selectedEvent.type), selectedEvent.type || "-"),
            createMetaPill("fas fa-location-dot", formatAffectedArea(selectedEvent)),
            createMetaPill("fas fa-calendar-days", formatDate(selectedEvent.date)),
            selectedEvent.coordinatorName ? createMetaPill("fas fa-user-tie", selectedEvent.coordinatorName) : "",
            createMetaPill("fas fa-wave-square", selectedEvent.status || "-")
        ].join("");

        summary.innerHTML = renderProfileSummaryItems([
            { label: "Event Type", value: "Calamity" },
            { label: "Calamity Type", value: selectedEvent.type || "-" },
            { label: "Affected Area", value: formatAffectedArea(selectedEvent) },
            { label: "Coordinator", value: selectedEvent.coordinatorName || "-" },
            { label: "Status", value: selectedEvent.status || "-" },
            { label: "Damage Cost", value: selectedEvent.damageCost ? formatCurrency(selectedEvent.damageCost) : "-" },
            { label: "Casualties", value: selectedEvent.casualties ?? 0 },
            { label: "Date", value: formatDate(selectedEvent.date) }
        ]);

        description.textContent = selectedEvent.description || "No description available.";
        timelineSection.classList.remove("hidden");
        timeline.previousElementSibling.textContent = "Recent Timeline";
        timeline.innerHTML = renderCalamityTimeline(selectedEvent);
    } else {
        meta.innerHTML = [
            createMetaPill(getEventTypeIcon(selectedEvent.type), selectedEvent.type || "-"),
            createMetaPill("fas fa-location-dot", selectedEvent.barangay || "-"),
            createMetaPill("fas fa-clock", formatDateTime(selectedEvent.reportedAt || selectedEvent.date)),
            selectedEvent.assignedResponderName ? createMetaPill("fas fa-user-shield", selectedEvent.assignedResponderName) : "",
            createMetaPill("fas fa-wave-square", selectedEvent.status || "-")
        ].join("");

        summary.innerHTML = renderProfileSummaryItems([
            { label: "Event Type", value: selectedEvent.type || "-" },
            { label: "Barangay", value: selectedEvent.barangay || "-" },
            { label: "Responder", value: selectedEvent.assignedResponderName || "-" },
            { label: "Severity", value: selectedEvent.severity || "-" },
            { label: "Status", value: selectedEvent.status || "-" },
            { label: "Reported", value: formatDateTime(selectedEvent.reportedAt || selectedEvent.date) }
        ]);

        description.textContent = selectedEvent.description || "No description available.";
        timelineSection.classList.remove("hidden");
        timeline.previousElementSibling.textContent = "Incident Timeline";
        loadIncidentTimeline(selectedEvent.id).then(items => {
            if (selectedEventType === "incident" && selectedEvent?.id === selectedEvent.id) {
                timeline.innerHTML = renderIncidentTimelineMarkup(items);
            }
        });
    }
}

function renderIncidentTimelineMarkup(items = []) {
    if (!Array.isArray(items) || !items.length) {
        return `<div class="dm-empty-state">No timeline actions available.</div>`;
    }

    return items.map(item => `
        <div class="dm-timeline-item">
            <span class="dm-timeline-time">${escapeHtml(formatDateTime(item.actionTime || item.createdAt || item.timestamp))}</span>
            <div class="dm-timeline-text">${escapeHtml(item.description || item.actionType || "-")}</div>
        </div>
    `).join("");
}

async function openViewEventModal() {
    if (!selectedEvent || !selectedEventType) return;

    const title = document.getElementById("viewEventTitle");
    const severityBadge = document.getElementById("viewEventSeverityBadge");
    const meta = document.getElementById("viewEventMeta");
    const summary = document.getElementById("viewEventSummary");
    const description = document.getElementById("viewEventDescription");
    const timelineSection = document.getElementById("viewIncidentTimelineSection");
    const timeline = document.getElementById("viewIncidentTimeline");
    const modalTitle = document.getElementById("viewEventModalTitle");
    const actions = document.getElementById("viewEventModalActions");
    if (!title || !severityBadge || !meta || !summary || !description || !timelineSection || !timeline || !modalTitle || !actions) return;

    const isCalamity = selectedEventType === "calamity";
    modalTitle.textContent = isCalamity ? "Calamity Details" : "Incident Details";
    title.textContent = isCalamity ? (selectedEvent.eventName || selectedEvent.type || "-") : (selectedEvent.type || "-");
    severityBadge.className = `severity-badge ${getSeverityClass(selectedEvent.severity)}`;
    severityBadge.textContent = selectedEvent.severity || "-";

    if (isCalamity) {
        meta.innerHTML = [
            createMetaPill(getEventTypeIcon(selectedEvent.type), selectedEvent.type || "-"),
            createMetaPill("fas fa-location-dot", formatAffectedArea(selectedEvent)),
            createMetaPill("fas fa-calendar-days", formatDate(selectedEvent.date)),
            selectedEvent.coordinatorName ? createMetaPill("fas fa-user-tie", selectedEvent.coordinatorName) : "",
            createMetaPill("fas fa-wave-square", selectedEvent.status || "-")
        ].join("");

        summary.innerHTML = renderProfileSummaryItems([
            { label: "Event Type", value: "Calamity" },
            { label: "Calamity Type", value: selectedEvent.type || "-" },
            { label: "Affected Area", value: formatAffectedArea(selectedEvent) },
            { label: "Coordinator", value: selectedEvent.coordinatorName || "-" },
            { label: "Status", value: selectedEvent.status || "-" },
            { label: "Damage Cost", value: selectedEvent.damageCost ? formatCurrency(selectedEvent.damageCost) : "-" },
            { label: "Casualties", value: selectedEvent.casualties ?? 0 },
            { label: "Date", value: formatDate(selectedEvent.date) }
        ]);

        description.textContent = selectedEvent.description || "No description available.";
        timelineSection.classList.remove("hidden");
        timeline.previousElementSibling.textContent = "Recent Timeline";
        timeline.innerHTML = renderCalamityTimeline(selectedEvent);
    } else {
        meta.innerHTML = [
            createMetaPill(getEventTypeIcon(selectedEvent.type), selectedEvent.type || "-"),
            createMetaPill("fas fa-location-dot", selectedEvent.barangay || "-"),
            createMetaPill("fas fa-clock", formatDateTime(selectedEvent.reportedAt || selectedEvent.date)),
            selectedEvent.assignedResponderName ? createMetaPill("fas fa-user-shield", selectedEvent.assignedResponderName) : "",
            createMetaPill("fas fa-wave-square", selectedEvent.status || "-")
        ].join("");

        summary.innerHTML = renderProfileSummaryItems([
            { label: "Event Type", value: selectedEvent.type || "-" },
            { label: "Barangay", value: selectedEvent.barangay || "-" },
            { label: "Responder", value: selectedEvent.assignedResponderName || "-" },
            { label: "Severity", value: selectedEvent.severity || "-" },
            { label: "Status", value: selectedEvent.status || "-" },
            { label: "Reported", value: formatDateTime(selectedEvent.reportedAt || selectedEvent.date) }
        ]);

        description.textContent = selectedEvent.description || "No description available.";
        const timelineItems = await loadIncidentTimeline(selectedEvent.id);
        timelineSection.classList.remove("hidden");
        timeline.previousElementSibling.textContent = "Incident Timeline";
        timeline.innerHTML = renderIncidentTimelineMarkup(timelineItems);
    }

    const canManage = canManageEvents();
    actions.querySelector("#editEventBtn")?.classList.toggle("hidden", !canManage);
    actions.querySelector("#deleteEventBtn")?.classList.toggle("hidden", !canManage);

    bindViewModalActionButtons();
    openModal("viewEventModal");
}

function showOverlayLock() {
    const overlay = document.getElementById("overlay");
    if (!overlay) return;

    overlay.classList.add("modal-overlay-active");
    overlay.style.display = "block";
}

function hideOverlayLock() {
    const overlay = document.getElementById("overlay");
    if (!overlay) return;

    overlay.classList.remove("modal-overlay-active");
    overlay.style.display = "";
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    activeModalId = modalId;
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");

    showOverlayLock();
    document.body.classList.add("modal-open");
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");

    const stillOpen = document.querySelector(".modal.active");
    if (!stillOpen) {
        activeModalId = null;
        hideOverlayLock();
        document.body.classList.remove("modal-open");
    }
}

function closeAllModals() {
    document.querySelectorAll(".modal.active").forEach((modal) => {
        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");
    });

    activeModalId = null;
    hideOverlayLock();
    document.body.classList.remove("modal-open");
}

function filterByKeyword(items, keyword, mapper) {
    const normalized = (keyword || "").trim().toLowerCase();
    if (!normalized) return items;

    return items.filter((item) => mapper(item).toLowerCase().includes(normalized));
}

function renderSearchResults(containerId, items, renderText, onSelect, emptyLabel) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = "";
    container.classList.add("active");

    if (!items.length) {
        container.innerHTML = `<div class="dm-search-option">${escapeHtml(emptyLabel)}</div>`;
        return;
    }

    items.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dm-search-option";
        button.textContent = renderText(item);
        button.addEventListener("click", () => onSelect(item));
        container.appendChild(button);
    });
}

function hideSearchResults(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = "";
    container.classList.remove("active");
}

function renderSelectedMultiBarangays() {
    const container = document.getElementById("selectedBarangays");
    if (!container) return;

    container.innerHTML = "";

    selectedMultiBarangays.forEach((barangay) => {
        const chip = document.createElement("div");
        chip.className = "dm-selected-tag";
        chip.innerHTML = `
            <span>${escapeHtml(barangay.name)}</span>
            <button type="button" aria-label="Remove ${escapeHtml(barangay.name)}">&times;</button>
        `;

        chip.querySelector("button")?.addEventListener("click", () => {
            selectedMultiBarangays = selectedMultiBarangays.filter((b) => b.id !== barangay.id);
            renderSelectedMultiBarangays();
        });

        container.appendChild(chip);
    });
}

function resetEditingState() {
    editMode = false;
    editingEventId = null;
    editingEventType = null;
}

function resetCalamityForm() {
    editingCalamityId = null;
    editMode = false;
    editingEventId = null;
    editingEventType = null;

    document.getElementById("calamityForm")?.reset();
    document.getElementById("calamityModalTitle").textContent = "Add Calamity";
    document.getElementById("saveCalamityBtn").textContent = "Save Calamity";

    selectedCoordinator = null;
    selectedPrimaryBarangay = null;
    selectedMultiBarangays = [];

    const primaryInput = document.getElementById("primaryBarangayInput");
    const barangaySearchInput = document.getElementById("barangaySearchInput");
    const coordinatorInput = document.getElementById("coordinatorInput");
    const eventNameInput = document.getElementById("eventNameInput");
    const primarySelected = document.getElementById("primaryBarangaySelected");
    const selectedBarangaysBox = document.getElementById("selectedBarangays");

    if (primaryInput) primaryInput.value = "";
    if (barangaySearchInput) barangaySearchInput.value = "";
    if (coordinatorInput) coordinatorInput.value = "";
    if (eventNameInput) eventNameInput.value = "";

    if (primarySelected) {
        primarySelected.classList.add("hidden");
        primarySelected.innerHTML = "";
    }

    if (selectedBarangaysBox) {
        selectedBarangaysBox.innerHTML = "";
    }

    hideSearchResults("primaryBarangayResults");
    hideSearchResults("barangaySearchResults");
    hideSearchResults("coordinatorResults");

    updateAffectedAreaUI();
    updateEventNameVisibility();
    applyDateInputLimits();
}

function resetIncidentForm() {
    editingIncidentId = null;
    editMode = false;
    editingEventId = null;
    editingEventType = null;

    document.getElementById("incidentForm")?.reset();
    document.getElementById("incidentModalTitle").textContent = "Add Incident";
    document.getElementById("saveIncidentBtn").textContent = "Save Incident";

    selectedIncidentBarangay = null;
    selectedResponder = null;

    const barangayInput = document.getElementById("incidentBarangayInput");
    const responderInput = document.getElementById("incidentResponderInput");

    if (barangayInput) barangayInput.value = "";
    if (responderInput) responderInput.value = "";

    hideSearchResults("incidentBarangayResults");
    hideSearchResults("incidentResponderResults");
    applyDateInputLimits();
}

function updateAffectedAreaUI() {
    const areaType = document.getElementById("affectedAreaTypeSelect")?.value || "";
    const primaryGroup = document.getElementById("primaryBarangayGroup");
    const multiGroup = document.getElementById("multiBarangayGroup");

    if (!primaryGroup || !multiGroup) return;

    if (areaType === "BARANGAY") {
        primaryGroup.classList.remove("hidden");
        multiGroup.classList.add("hidden");
    } else if (areaType === "MULTI_BARANGAY") {
        primaryGroup.classList.add("hidden");
        multiGroup.classList.remove("hidden");
    } else {
        primaryGroup.classList.add("hidden");
        multiGroup.classList.add("hidden");
    }
}

function bindSearchableInput({
    inputId,
    resultsId,
    sourceGetter,
    labelGetter,
    onSelect,
    emptyLabel,
    filterExclude = () => []
}) {
    const input = document.getElementById(inputId);
    const results = document.getElementById(resultsId);
    if (!input || !results) return;

    const refresh = () => {
        const source = sourceGetter();
        const excludeIds = filterExclude();

        const filtered = filterByKeyword(
            source.filter(item => !excludeIds.includes(item.id)),
            input.value,
            item => labelGetter(item)
        );

        renderSearchResults(resultsId, filtered, labelGetter, onSelect, emptyLabel);
        results.classList.remove("hidden");
    };

    input.addEventListener("input", refresh);
    input.addEventListener("focus", refresh);

    input.addEventListener("click", (event) => {
        event.stopPropagation();
        refresh();
    });

    results.addEventListener("click", (event) => {
        event.stopPropagation();
    });
}

function bindDetailsViewActions() {
    document.getElementById("backToLibraryBtn")?.addEventListener("click", () => {
        sselectedEvent = null;
        selectedEventType = null;
        activeSitrepMarkerKey = null;
        showLibraryView();
        renderCurrentTab();
        renderSitRepMap();
    });

    document.getElementById("detailsEditBtn")?.addEventListener("click", () => {
        if (!selectedEvent || !selectedEventType || !canManageEvents()) return;

        if (selectedEventType === "calamity") {
            populateCalamityFormForEdit(selectedEvent);
            openModal("calamityModal");
        } else {
            populateIncidentFormForEdit(selectedEvent);
            openModal("incidentModal");
        }
    });

    document.getElementById("detailsDeleteBtn")?.addEventListener("click", () => {
        confirmDeleteSelectedEvent();
    });
}

function initSearchPickers() {
    bindSearchableInput({
        inputId: "primaryBarangayInput",
        resultsId: "primaryBarangayResults",
        sourceGetter: () => barangays,
        labelGetter: (item) => item.name,
        onSelect: (item) => {
            selectedPrimaryBarangay = item;
            const input = document.getElementById("primaryBarangayInput");
            if (input) input.value = item.name;
            hideSearchResults("primaryBarangayResults");
        },
        emptyLabel: "No barangay found."
    });

    bindSearchableInput({
        inputId: "barangaySearchInput",
        resultsId: "barangaySearchResults",
        sourceGetter: () => barangays,
        labelGetter: (item) => item.name,
        onSelect: (item) => {
            if (!selectedMultiBarangays.some(b => b.id === item.id)) {
                selectedMultiBarangays.push(item);
                renderSelectedMultiBarangays();
            }
            const input = document.getElementById("barangaySearchInput");
            if (input) input.value = "";
            hideSearchResults("barangaySearchResults");
        },
        emptyLabel: "No barangay found.",
        filterExclude: () => selectedMultiBarangays.map(b => b.id)
    });

    bindSearchableInput({
        inputId: "coordinatorInput",
        resultsId: "coordinatorResults",
        sourceGetter: () => coordinators,
        labelGetter: (item) => item.fullName || item.name || "-",
        onSelect: (item) => {
            selectedCoordinator = item;
            const input = document.getElementById("coordinatorInput");
            if (input) input.value = item.fullName || item.name || "";
            hideSearchResults("coordinatorResults");
        },
        emptyLabel: "No coordinator found."
    });

    bindSearchableInput({
        inputId: "incidentBarangayInput",
        resultsId: "incidentBarangayResults",
        sourceGetter: () => barangays,
        labelGetter: (item) => item.name,
        onSelect: (item) => {
            selectedIncidentBarangay = item;
            const input = document.getElementById("incidentBarangayInput");
            if (input) input.value = item.name;
            hideSearchResults("incidentBarangayResults");
        },
        emptyLabel: "No barangay found."
    });

    bindSearchableInput({
        inputId: "incidentResponderInput",
        resultsId: "incidentResponderResults",
        sourceGetter: () => responders,
        labelGetter: (item) => item.fullName || item.name || "-",
        onSelect: (item) => {
            selectedResponder = item;
            const input = document.getElementById("incidentResponderInput");
            if (input) input.value = item.fullName || item.name || "";
            hideSearchResults("incidentResponderResults");
        },
        emptyLabel: "No responder found."
    });

    document.addEventListener("click", (event) => {
        const mappings = [
            ["primaryBarangayInput", "primaryBarangayResults"],
            ["barangaySearchInput", "barangaySearchResults"],
            ["coordinatorInput", "coordinatorResults"],
            ["incidentBarangayInput", "incidentBarangayResults"],
            ["incidentResponderInput", "incidentResponderResults"]
        ];

        mappings.forEach(([inputId, resultsId]) => {
            const input = document.getElementById(inputId);
            const results = document.getElementById(resultsId);
            if (!input || !results) return;

            const wrapper =
                input.closest(".dm-searchable-group") ||
                input.closest(".dm-picker-input-wrap") ||
                input.parentElement;

            const clickedInsideWrapper = wrapper && wrapper.contains(event.target);
            const clickedInsideResults = results.contains(event.target);

            if (!clickedInsideWrapper && !clickedInsideResults) {
                hideSearchResults(resultsId);
            }
        });
    });
}

function buildCalamityPayload() {
    const affectedAreaType = document.getElementById("affectedAreaTypeSelect")?.value || "";
    const calamityType = (document.getElementById("calamityTypeSelect")?.value || "").trim();
    const rawEventName = (document.getElementById("eventNameInput")?.value || "").trim();
    const isTyphoon = calamityType.toLowerCase() === "typhoon";

    return {
        type: calamityType,
        eventName: isTyphoon ? rawEventName : null,
        affectedAreaType,
        barangayId:
            affectedAreaType === "BARANGAY" && selectedPrimaryBarangay
                ? Number(selectedPrimaryBarangay.id)
                : null,
        barangayIds:
            affectedAreaType === "MULTI_BARANGAY"
                ? selectedMultiBarangays.map(b => Number(b.id))
                : [],
        coordinatorId: selectedCoordinator ? Number(selectedCoordinator.id) : null,
        severity: document.getElementById("calamitySeveritySelect")?.value || "",
        status: document.getElementById("calamityStatusSelect")?.value || "",
        date: document.getElementById("calamityDateInput")?.value || "",
        damageCost: Number(document.getElementById("damageCostInput")?.value || 0),
        casualties: Number(document.getElementById("casualtiesInput")?.value || 0),
        description: (document.getElementById("calamityDescriptionInput")?.value || "").trim()
    };
}

function buildIncidentPayload() {
    return {
        type: (document.getElementById("incidentTypeSelect")?.value || "").trim(),
        barangayId: selectedIncidentBarangay ? Number(selectedIncidentBarangay.id) : null,
        assignedResponderId: selectedResponder ? Number(selectedResponder.id) : null,
        severity: document.getElementById("incidentSeveritySelect")?.value || "",
        status: document.getElementById("incidentStatusSelect")?.value || "",
        date: document.getElementById("incidentDateInput")?.value || "",
        description: (document.getElementById("incidentDescriptionInput")?.value || "").trim()
    };
}

function validateCalamityPayload(payload) {
    if (!payload.type) throw new Error("Please select a calamity type.");
    if (!payload.severity) throw new Error("Please select severity.");
    if (!payload.status) throw new Error("Please select status.");
    if (!payload.date) throw new Error("Please select the date.");
    if (!payload.affectedAreaType) throw new Error("Please select the affected scope.");

    if (payload.affectedAreaType === "BARANGAY" && !payload.barangayId) {
        throw new Error("Please select the primary barangay.");
    }

    const multiBarangayIds =
        Array.isArray(payload.barangayIds) ? payload.barangayIds :
        Array.isArray(payload.affectedBarangayIds) ? payload.affectedBarangayIds :
        [];

    if (payload.affectedAreaType === "MULTI_BARANGAY" && multiBarangayIds.length === 0) {
        throw new Error("Please add at least one affected barangay.");
    }

    const type = String(payload.type || "").trim().toLowerCase();
    const eventName = String(payload.eventName || "").trim();

    if (type === "typhoon" && !eventName) {
        throw new Error("Event name is required when calamity type is Typhoon.");
    }
}

function validateIncidentPayload(payload) {
    if (!payload.type) throw new Error("Please select an incident type.");
    if (!payload.barangayId) throw new Error("Please select the barangay.");
    if (!payload.severity) throw new Error("Please select severity.");
    if (!payload.status) throw new Error("Please select status.");
    if (!payload.date) throw new Error("Please select the date.");
}

function populateCalamityFormForEdit(calamity) {
    editingCalamityId = calamity.id;
    editMode = true;
    editingEventId = calamity.id;
    editingEventType = "calamity";

    document.getElementById("calamityModalTitle").textContent = "Edit Calamity";
    document.getElementById("saveCalamityBtn").textContent = "Update Calamity";

    document.getElementById("calamityTypeSelect").value = calamity.type || "";
    document.getElementById("calamitySeveritySelect").value = calamity.severity || "";
    document.getElementById("calamityStatusSelect").value = calamity.status || "";
    document.getElementById("calamityDateInput").value = toDateInputValue(calamity.date);
    document.getElementById("affectedAreaTypeSelect").value = calamity.affectedAreaType || "";
    document.getElementById("damageCostInput").value = calamity.damageCost ?? "";
    document.getElementById("casualtiesInput").value = calamity.casualties ?? "";
    document.getElementById("calamityDescriptionInput").value = calamity.description || "";

    updateEventNameVisibility();

    const eventNameInput = document.getElementById("eventNameInput");
    if (eventNameInput) {
        eventNameInput.value = String(calamity.type || "").toLowerCase() === "typhoon"
            ? (calamity.eventName || "")
            : (calamity.eventName || "");
    }

    selectedPrimaryBarangay = null;
    selectedMultiBarangays = [];
    selectedCoordinator = null;

    const primaryBarangayId = calamity.primaryBarangayId || calamity.barangayId || null;
    if (primaryBarangayId != null) {
        const found = barangays.find(b => String(b.id) === String(primaryBarangayId));
        if (found) {
            selectedPrimaryBarangay = found;
            const primaryInput = document.getElementById("primaryBarangayInput");
            if (primaryInput) primaryInput.value = found.name || "";
        }
    }

    const affectedIds = Array.isArray(calamity.affectedBarangayIds)
        ? calamity.affectedBarangayIds
        : Array.isArray(calamity.barangayIds)
            ? calamity.barangayIds
            : [];

    if (affectedIds.length) {
        selectedMultiBarangays = barangays.filter(b =>
            affectedIds.some(id => String(id) === String(b.id))
        );
        renderSelectedMultiBarangays();
    }

    if (calamity.coordinatorId != null) {
        const found = coordinators.find(c => String(c.id) === String(calamity.coordinatorId));
        if (found) {
            selectedCoordinator = found;
            const coordinatorInput = document.getElementById("coordinatorInput");
            if (coordinatorInput) {
                coordinatorInput.value = found.fullName || found.name || "";
            }
        }
    } else if (calamity.coordinatorName) {
        const coordinatorInput = document.getElementById("coordinatorInput");
        if (coordinatorInput) coordinatorInput.value = calamity.coordinatorName;
    }

    updateAffectedAreaUI();
    applyDateInputLimits();
}

function populateIncidentFormForEdit(incident) {
    editingIncidentId = incident.id;
    editMode = true;
    editingEventId = incident.id;
    editingEventType = "incident";

    document.getElementById("incidentModalTitle").textContent = "Edit Incident";
    document.getElementById("saveIncidentBtn").textContent = "Update Incident";

    document.getElementById("incidentTypeSelect").value = incident.type || "";
    document.getElementById("incidentSeveritySelect").value = incident.severity || "";
    document.getElementById("incidentStatusSelect").value = incident.status || "";
    document.getElementById("incidentDateInput").value = toDateInputValue(incident.reportedAt || incident.date);
    document.getElementById("incidentDescriptionInput").value = incident.description || "";

    selectedIncidentBarangay = null;
    selectedResponder = null;

    if (incident.barangayId != null) {
        const found = barangays.find(b => String(b.id) === String(incident.barangayId));
        if (found) {
            selectedIncidentBarangay = found;
            const input = document.getElementById("incidentBarangayInput");
            if (input) input.value = found.name || "";
        }
    } else if (incident.barangay) {
        const input = document.getElementById("incidentBarangayInput");
        if (input) input.value = incident.barangay;
    }

    if (incident.assignedResponderId != null) {
        const found = responders.find(r => String(r.id) === String(incident.assignedResponderId));
        if (found) {
            selectedResponder = found;
            const input = document.getElementById("incidentResponderInput");
            if (input) input.value = found.fullName || found.name || "";
        }
    } else if (incident.assignedResponderName) {
        const input = document.getElementById("incidentResponderInput");
        if (input) input.value = incident.assignedResponderName;
    }

    applyDateInputLimits();
}

function confirmDeleteSelectedEvent() {
    if (!selectedEvent || !selectedEventType || !canManageEvents()) return;

    const eventLabel = selectedEventType === "calamity"
        ? (selectedEvent.eventName || selectedEvent.type || "this calamity")
        : (selectedEvent.type || selectedEvent.eventName || "this incident");

    confirmDeleteAction({
        title: "Delete Event",
        message: `Are you sure you want to delete ${eventLabel}?`,
        submessage: "This action permanently removes the selected event from the system.",
        confirmText: "Delete",
        processingText: "Deleting...",
        onConfirm: async () => {
            await handleDeleteSelectedEvent();
        }
    });
}

async function handleDeleteSelectedEvent() {
    if (!selectedEvent || !selectedEventType || !canManageEvents()) return;

    const deletedType = selectedEventType;

    try {
        if (selectedEventType === "calamity") {
            await apiRequest(`${API_BASE}/calamities/${selectedEvent.id}`, { method: "DELETE" });
        } else {
            await apiRequest(`${API_BASE}/incidents/${selectedEvent.id}`, { method: "DELETE" });
        }

        selectedEvent = null;
        selectedEventType = null;

        closeModal("viewEventModal");
        showLibraryView();
        await refreshEventViewsAfterMutation(deletedType, null);
        showMessage("Event deleted successfully.");
    } catch (error) {
        console.error("Error deleting event:", error);
        showMessage(extractErrorMessage(error), "error");
        throw error;
    }
}

function bindViewModalActionButtons() {
    const editBtn = document.getElementById("editEventBtn");
    const deleteBtn = document.getElementById("deleteEventBtn");

    if (editBtn) {
        const fresh = editBtn.cloneNode(true);
        editBtn.replaceWith(fresh);
        fresh.addEventListener("click", () => {
            if (!selectedEvent || !selectedEventType || !canManageEvents()) return;

            closeModal("viewEventModal");

            if (selectedEventType === "calamity") {
                populateCalamityFormForEdit(selectedEvent);
                openModal("calamityModal");
            } else {
                populateIncidentFormForEdit(selectedEvent);
                openModal("incidentModal");
            }
        });
    }

    const deleteNode = document.getElementById("deleteEventBtn");
    if (deleteNode) {
        const freshDelete = deleteNode.cloneNode(true);
        deleteNode.replaceWith(freshDelete);
        freshDelete.addEventListener("click", confirmDeleteSelectedEvent);
    }
}

function initModalButtons() {
    document.getElementById("closeCalamityModalBtn")?.addEventListener("click", () => {
        closeModal("calamityModal");
        resetCalamityForm();
    });

    document.getElementById("cancelCalamityBtn")?.addEventListener("click", () => {
        closeModal("calamityModal");
        resetCalamityForm();
    });

    document.getElementById("closeIncidentModalBtn")?.addEventListener("click", () => {
        closeModal("incidentModal");
        resetIncidentForm();
    });

    document.getElementById("cancelIncidentBtn")?.addEventListener("click", () => {
        closeModal("incidentModal");
        resetIncidentForm();
    });

    document.getElementById("closeViewEventModalBtn")?.addEventListener("click", () => {
        closeModal("viewEventModal");
    });

    document.getElementById("closeViewEventFooterBtn")?.addEventListener("click", () => {
        closeModal("viewEventModal");
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && activeModalId) {
            closeModal(activeModalId);
        }
    });
}

function initLibraryAddButtons() {
    const openCurrentForm = () => {
        resetEditingState();

        if (activeTab === "calamities") {
            resetCalamityForm();
            openModal("calamityModal");
        } else {
            resetIncidentForm();
            openModal("incidentModal");
        }
    };

    document.getElementById("openLibraryModalBtn")?.addEventListener("click", openCurrentForm);
    document.getElementById("openLibraryModalBtnHero")?.addEventListener("click", openCurrentForm);
}

function initTabHandlers() {
    document.getElementById("tabCalamities")?.addEventListener("click", () => {
        activeTab = "calamities";
        updateTabButtons();

        const addBtnText = document.getElementById("libraryAddBtnText");
        const addBtnIcon = document.getElementById("libraryAddBtnIcon");
        if (addBtnText) addBtnText.textContent = "Add Calamity";
        if (addBtnIcon) addBtnIcon.className = "fas fa-cloud-showers-heavy";

        renderCurrentTab();
    });

    document.getElementById("tabIncidents")?.addEventListener("click", () => {
        activeTab = "incidents";
        updateTabButtons();

        const addBtnText = document.getElementById("libraryAddBtnText");
        const addBtnIcon = document.getElementById("libraryAddBtnIcon");
        if (addBtnText) addBtnText.textContent = "Add Incident";
        if (addBtnIcon) addBtnIcon.className = "fas fa-helmet-safety";

        renderCurrentTab();
    });
}

function initFilterHandler() {
    document.getElementById("eventFilter")?.addEventListener("input", renderCurrentTab);
}

function initSortHandler() {
    document.getElementById("eventSort")?.addEventListener("change", renderCurrentTab);
}

function initAffectedAreaTypeToggle() {
    document.getElementById("affectedAreaTypeSelect")?.addEventListener("change", updateAffectedAreaUI);
    updateAffectedAreaUI();
}

function initRefreshButton() {
    document.getElementById("refreshDisasterManagementBtn")?.addEventListener("click", async () => {
        await loadCalamities();
        await loadIncidents();
        renderCurrentTab();
    });
}

function initFormHandlers() {
    const calamityForm = document.getElementById("calamityForm");
    const incidentForm = document.getElementById("incidentForm");

    if (calamityForm) {
        const freshCalamityForm = calamityForm.cloneNode(true);
        calamityForm.replaceWith(freshCalamityForm);
        freshCalamityForm.addEventListener("submit", handleCalamityFormSubmit);
    }

    if (incidentForm) {
        const freshIncidentForm = incidentForm.cloneNode(true);
        incidentForm.replaceWith(freshIncidentForm);
        freshIncidentForm.addEventListener("submit", handleIncidentFormSubmit);
    }

    document.getElementById("cancelCalamityBtn")?.addEventListener("click", () => {
        closeModal("calamityModal");
        resetCalamityForm();
    });

    document.getElementById("cancelIncidentBtn")?.addEventListener("click", () => {
        closeModal("incidentModal");
        resetIncidentForm();
    });

    document.getElementById("closeCalamityModalBtn")?.addEventListener("click", () => {
        closeModal("calamityModal");
        resetCalamityForm();
    });

    document.getElementById("closeIncidentModalBtn")?.addEventListener("click", () => {
        closeModal("incidentModal");
        resetIncidentForm();
    });

    applyDateInputLimits();
    initSearchPickers();
}

function getCalamitySubmitMeta() {
    const editing = Boolean(editingCalamityId);

    return {
        editing,
        variant: editing ? "update" : "save",
        title: editing ? "Update Calamity" : "Save Calamity",
        message: editing
            ? "Do you want to apply these calamity updates?"
            : "Do you want to save this calamity record?",
        submessage: editing
            ? "The selected calamity record will be updated in the system."
            : "A new calamity record will be added to the system.",
        confirmText: editing ? "Update Calamity" : "Save Calamity",
        processingText: editing ? "Updating..." : "Saving..."
    };
}

function getIncidentSubmitMeta() {
    const editing = Boolean(editingIncidentId);

    return {
        editing,
        variant: editing ? "update" : "save",
        title: editing ? "Update Incident" : "Save Incident",
        message: editing
            ? "Do you want to apply these incident updates?"
            : "Do you want to save this incident record?",
        submessage: editing
            ? "The selected incident record will be updated in the system."
            : "A new incident record will be added to the system.",
        confirmText: editing ? "Update Incident" : "Save Incident",
        processingText: editing ? "Updating..." : "Saving..."
    };
}

function handleCalamityFormSubmit(event) {
    event.preventDefault();
    event.stopPropagation();

    try {
        const payload = buildCalamityPayload();
        validateCalamityPayload(payload);

        const meta = getCalamitySubmitMeta();

        openActionConfirmModal({
            variant: meta.variant,
            title: meta.title,
            message: meta.message,
            submessage: meta.submessage,
            confirmText: meta.confirmText,
            processingText: meta.processingText,
            onConfirm: async () => {
                await submitCalamityFormConfirmed(payload);
            }
        });
    } catch (error) {
        showMessage(extractErrorMessage(error), "error");
    }

    return false;
}

function handleIncidentFormSubmit(event) {
    event.preventDefault();
    event.stopPropagation();

    try {
        const payload = buildIncidentPayload();
        validateIncidentPayload(payload);

        const meta = getIncidentSubmitMeta();

        openActionConfirmModal({
            variant: meta.variant,
            title: meta.title,
            message: meta.message,
            submessage: meta.submessage,
            confirmText: meta.confirmText,
            processingText: meta.processingText,
            onConfirm: async () => {
                await submitIncidentFormConfirmed(payload);
            }
        });
    } catch (error) {
        showMessage(extractErrorMessage(error), "error");
    }

    return false;
}

async function submitCalamityFormConfirmed(payload) {
    try {
        const requestPayload = payload || buildCalamityPayload();
        let saved;

        if (editingCalamityId) {
            saved = await apiRequest(`${API_BASE}/calamities/${editingCalamityId}`, {
                method: "PUT",
                body: JSON.stringify(requestPayload)
            });
            showMessage("Calamity updated successfully.");
        } else {
            saved = await apiRequest(`${API_BASE}/calamities`, {
                method: "POST",
                body: JSON.stringify(requestPayload)
            });
            showMessage("Calamity saved successfully.");
        }

        closeModal("calamityModal");
        resetCalamityForm();

        activeTab = "calamities";
        selectedEventType = "calamity";
        await refreshEventViewsAfterMutation("calamity", saved?.id ?? null);
    } catch (error) {
        console.error("Error saving calamity:", error);
        showMessage(extractErrorMessage(error), "error");
        throw error;
    }
}

async function submitIncidentFormConfirmed(payload) {
    try {
        const requestPayload = payload || buildIncidentPayload();

        let saved;
        if (editingIncidentId) {
            saved = await apiRequest(`${API_BASE}/incidents/${editingIncidentId}`, {
                method: "PUT",
                body: JSON.stringify(requestPayload)
            });
            showMessage("Incident updated successfully.");
        } else {
            saved = await apiRequest(`${API_BASE}/incidents`, {
                method: "POST",
                body: JSON.stringify(requestPayload)
            });
            showMessage("Incident saved successfully.");
        }

        closeModal("incidentModal");
        resetIncidentForm();
        await loadIncidents();

        activeTab = "incidents";
        selectedEventType = "incident";
        selectedEvent = incidents.find(i => String(i.id) === String(saved?.id)) || null;

        syncSitRepMetrics();
        renderCurrentTab();
        renderSelectedEventProfile();
    } catch (error) {
        console.error("Error saving incident:", error);
        showMessage(extractErrorMessage(error), "error");
        throw error;
    }
}

function renderSingleSelectedBarangay(barangay) {
    const selectedBox = document.getElementById("primaryBarangaySelected") || document.getElementById("calamityBarangaySelected");
    const input = document.getElementById("primaryBarangayInput");
    if (!selectedBox || !input) return;

    if (!barangay) {
        selectedBox.innerHTML = "";
        selectedBox.classList.add("hidden");
        return;
    }

    input.value = barangay.name;
    selectedBox.innerHTML = `<strong>Selected:</strong> ${barangay.name}`;
    selectedBox.classList.remove("hidden");
}

function renderSelectedMultiBarangays() {
    const container = document.getElementById("selectedBarangays");
    if (!container) return;

    container.innerHTML = "";

    selectedMultiBarangays.forEach((barangay) => {
        const chip = document.createElement("div");
        chip.className = "dm-chip";
        chip.innerHTML = `
            <span>${barangay.name}</span>
            <button type="button" class="dm-chip-remove" aria-label="Remove ${barangay.name}">&times;</button>
        `;

        chip.querySelector(".dm-chip-remove")?.addEventListener("click", () => {
            selectedMultiBarangays = selectedMultiBarangays.filter((b) => b.id !== barangay.id);
            renderSelectedMultiBarangays();
        });

        container.appendChild(chip);
    });
}

function toDateInputValue(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value).slice(0, 10);
    }
    return date.toISOString().slice(0, 10);
}

function applyDateInputLimits() {
    const today = new Date().toISOString().slice(0, 10);
    ["calamityDateInput", "incidentDateInput"].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.max = today;
    });
}

function getCurrentLibraryRows() {
    return activeTab === "calamities"
        ? getFilteredAndSortedCalamities()
        : getFilteredAndSortedIncidents();
}

function updateEventPageSizeAvailability(totalRows = 0) {
    const select = document.getElementById("eventPageSize");
    if (!select) return;

    const shouldDisable = totalRows <= 5;
    select.disabled = shouldDisable;

    if (shouldDisable) {
        select.value = "5";
        dmTableState.pageSize = 5;
        if (eventPagination) {
            eventPagination.setPageSize(5);
        }
    }
}

async function refreshEventViewsAfterMutation(preferredType = selectedEventType, preferredId = selectedEvent?.id ?? null) {
    await loadCalamities();
    await loadIncidents();

    if (preferredType && preferredId != null) {
        if (preferredType === "calamity") {
            selectedEvent = calamities.find(item => String(item.id) === String(preferredId)) || null;
        } else {
            selectedEvent = incidents.find(item => String(item.id) === String(preferredId)) || null;
        }

        selectedEventType = selectedEvent ? preferredType : null;
    }

    renderCurrentTab();
    renderSelectedEventProfile();

    if (isDetailsMode && selectedEvent && selectedEventType) {
        await renderEventDetailsView();
    } else if (isDetailsMode && !selectedEvent) {
        showLibraryView();
    }
}

async function initDisasterManagementPage() {
    if (!localStorage.getItem("jwtToken")) {
        window.location.href = "login.html";
        return;
    }

    try {
        currentUserRoles = getCurrentUserRoles();

        initStaticSelects();
        initActionConfirmModal();
        initModalButtons();
        initLibraryAddButtons();
        initTabHandlers();
        initFilterHandler();
        initSortHandler();
        initAffectedAreaTypeToggle();
        initRefreshButton();
        initSearchPickers();
        initFormHandlers();
        bindDetailsViewActions();
        showLibraryView();
        initEventLibraryPagination();

        await loadBarangays();
        await loadCoordinators();
        await loadResponders();
        await loadCalamities();
        await loadIncidents();
        syncSitRepMetrics();

        applyDateInputLimits();

        const calamityTypeSelect = document.getElementById("calamityTypeSelect");
        if (calamityTypeSelect) {
            calamityTypeSelect.addEventListener("change", updateEventNameVisibility);
        }

        const affectedAreaTypeSelect = document.getElementById("affectedAreaTypeSelect");
        if (affectedAreaTypeSelect) {
            affectedAreaTypeSelect.addEventListener("change", updateAffectedAreaUI);
        }

        updateAffectedAreaUI();
        updateEventNameVisibility();
        syncSitRepMetrics();
        renderCurrentTab();
        updateSummaryCards();
        renderSelectedEventProfile();
    } catch (error) {
        console.error("Error initializing disaster management page:", error);
        alert("Failed to load disaster management data.");
    }
}

function buildPageNumbers(totalPages, currentPage) {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages = [1];

    if (currentPage > 3) pages.push("...");

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
        pages.push(i);
    }

    if (currentPage < totalPages - 2) pages.push("...");

    pages.push(totalPages);
    return pages;
}

function createPaginationController(config) {
    const state = {
        page: config.initialPage || 1,
        pageSize: config.initialPageSize || 5,
        rows: Array.isArray(config.rows) ? config.rows : []
    };

    function getTotalPages() {
        return Math.max(1, Math.ceil(state.rows.length / state.pageSize));
    }

    function getPageSlice() {
        const total = state.rows.length;
        const startIndex = (state.page - 1) * state.pageSize;
        const endIndex = Math.min(startIndex + state.pageSize, total);

        return {
            total,
            startIndex,
            endIndex,
            pageRows: state.rows.slice(startIndex, endIndex)
        };
    }

    function renderInfo(total, startIndex, endIndex) {
        const info = document.getElementById(config.infoId);
        if (!info) return;

        const itemLabel = config.itemLabel || "items";

        if (total === 0) {
            info.textContent = `Showing 0 to 0 of 0 ${itemLabel}`;
            return;
        }

        info.textContent = `Showing ${startIndex + 1} to ${endIndex} of ${total} ${itemLabel}`;
    }

    function renderControls(total) {
        const controls = document.getElementById(config.controlsId);
        if (!controls) return;

        if (total === 0) {
            controls.innerHTML = "";
            return;
        }

        const totalPages = getTotalPages();
        const currentPage = state.page;
        const pages = buildPageNumbers(totalPages, currentPage);

        controls.innerHTML = `
            <button class="app-page-btn" ${currentPage === 1 ? "disabled" : ""} data-page="${currentPage - 1}">
                Prev
            </button>

            ${pages.map(page =>
                page === "..."
                    ? `<span class="app-page-btn app-page-btn-ellipsis">...</span>`
                    : `<button class="app-page-btn ${page === currentPage ? "active" : ""}" data-page="${page}">${page}</button>`
            ).join("")}

            <button class="app-page-btn" ${currentPage === totalPages ? "disabled" : ""} data-page="${currentPage + 1}">
                Next
            </button>
        `;

        controls.querySelectorAll("[data-page]").forEach(button => {
            button.addEventListener("click", () => {
                const page = Number(button.dataset.page);
                setPage(page);
            });
        });
    }

    function render() {
        const { total, startIndex, endIndex, pageRows } = getPageSlice();

        if (typeof config.onRenderRows === "function") {
            config.onRenderRows(pageRows, {
                total,
                startIndex,
                endIndex,
                currentPage: state.page,
                pageSize: state.pageSize,
                totalPages: getTotalPages()
            });
        }

        renderInfo(total, startIndex, endIndex);
        renderControls(total);
    }

function setRows(rows) {
    state.rows = Array.isArray(rows) ? rows : [];
    const totalPages = getTotalPages();

    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;

    // Force row rendering immediately
    const { total, startIndex, endIndex, pageRows } = getPageSlice();

    if (typeof config.onRenderRows === "function") {
        config.onRenderRows(pageRows, {
            total,
            startIndex,
            endIndex,
            currentPage: state.page,
            pageSize: state.pageSize,
            totalPages: getTotalPages()
        });
    }

    renderInfo(total, startIndex, endIndex);
    renderControls(total);
}

    function setPage(page) {
        const totalPages = getTotalPages();
        if (!page || page < 1 || page > totalPages) return;
        state.page = page;
        render();
    }

    function setPageSize(size) {
        state.pageSize = Number(size) || 5;
        state.page = 1;
        render();
    }

    function bindPageSizeSelect() {
        if (!config.pageSizeSelectId) return;
        const select = document.getElementById(config.pageSizeSelectId);
        if (!select) return;

        select.value = String(state.pageSize);
        select.addEventListener("change", (event) => {
            setPageSize(event.target.value);
        });
    }

    bindPageSizeSelect();

    return {
        setRows,
        setPage,
        setPageSize,
        render,
        getState: () => ({ ...state })
    };
}

function ensureEventLibraryPaginationMarkup() {
    const libraryPanel = document.querySelector(".dm-library-panel");
    if (!libraryPanel) return;

    let tableContainer = document.querySelector("#eventTableBody")?.closest(".table-container");
    if (!tableContainer) {
        const existingList =
            document.getElementById("calamityLibraryList") ||
            document.getElementById("incidentLibraryList") ||
            document.querySelector(".dm-list");

        if (existingList) {
            existingList.innerHTML = `
                <div class="table-container">
                    <table class="app-table">
                        <thead id="eventTableHead"></thead>
                        <tbody id="eventTableBody">
                            <tr>
                                <td colspan="7" class="empty-state">No events available.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div class="app-pagination-bar">
                    <div class="app-pagination-left">
                        <div class="app-pagination-info" id="eventPaginationInfo">Showing 0 to 0 of 0 events</div>
                        <div class="app-page-size-wrap">
                            <label for="eventPageSize">Rows per page</label>
                            <select id="eventPageSize">
                                <option value="5" selected>5</option>
                                <option value="8">8</option>
                                <option value="10">10</option>
                            </select>
                        </div>
                    </div>
                    <div class="app-pagination-controls" id="eventPaginationControls"></div>
                </div>
            `;
        }
    }
}

function updateEventNameVisibility() {
    const typeSelect = document.getElementById("calamityTypeSelect");
    const eventNameInput = document.getElementById("eventNameInput");
    if (!typeSelect || !eventNameInput) return;

    const wrapper = eventNameInput.closest(".form-group");
    if (!wrapper) return;

    const selectedType = String(typeSelect.value || "").trim().toLowerCase();
    const isTyphoon = selectedType === "typhoon";

    wrapper.classList.toggle("hidden", !isTyphoon);

    if (!isTyphoon) {
        eventNameInput.value = "";
    }
}

function renderEventTableHead() {
    const thead = document.getElementById("eventTableHead");
    if (!thead) return;

    if (activeTab === "calamities") {
        thead.innerHTML = `
            <tr>
                <th>Event</th>
                <th>Type</th>
                <th>Affected Area</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
            </tr>
        `;
        return;
    }

    thead.innerHTML = `
        <tr>
            <th>Incident</th>
            <th>Barangay</th>
            <th>Responder</th>
            <th>Severity</th>
            <th>Status</th>
            <th>Reported</th>
            <th>Actions</th>
        </tr>
    `;
}

function renderEventTableRows(rows) {
    const tbody = document.getElementById("eventTableBody");
    if (!tbody) return;

    if (!Array.isArray(rows) || rows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">No events found.</td>
            </tr>
        `;
        return;
    }

    if (activeTab === "calamities") {
        tbody.innerHTML = rows.map(calamity => `
            <tr class="${isSelectedEvent(calamity.id, "calamity") ? "is-selected" : ""}">
                <td>${escapeHtml(getCalamityCardTitle(calamity))}</td>
                <td>${escapeHtml(calamity.type || "-")}</td>
                <td>${escapeHtml(formatAffectedArea(calamity))}</td>
                <td><span class="severity-badge ${getSeverityClass(calamity.severity)}">${escapeHtml(calamity.severity || "-")}</span></td>
                <td><span class="status-badge ${getStatusClass(calamity.status)}">${escapeHtml(calamity.status || "-")}</span></td>
                <td>${escapeHtml(formatDate(calamity.date))}</td>
                <td>
                    <button type="button" class="btn btn-secondary dm-open-row-btn" data-type="calamity" data-id="${calamity.id}">
                        Open Details
                    </button>
                </td>
            </tr>
        `).join("");
    } else {
        tbody.innerHTML = rows.map(incident => `
            <tr class="${isSelectedEvent(incident.id, "incident") ? "is-selected" : ""}">
                <td>${escapeHtml(getIncidentCardTitle(incident))}</td>
                <td>${escapeHtml(incident.barangay || "-")}</td>
                <td>${escapeHtml(incident.assignedResponderName || "-")}</td>
                <td><span class="severity-badge ${getSeverityClass(incident.severity)}">${escapeHtml(incident.severity || "-")}</span></td>
                <td><span class="status-badge ${getStatusClass(incident.status)}">${escapeHtml(incident.status || "-")}</span></td>
                <td>${escapeHtml(formatDateTime(incident.reportedAt || incident.date))}</td>
                <td>
                    <button type="button" class="btn btn-secondary dm-open-row-btn" data-type="incident" data-id="${incident.id}">
                        Open Details
                    </button>
                </td>
            </tr>
        `).join("");
    }

    bindEventTableRowActions();
}

function bindEventTableRowActions() {
    document.querySelectorAll(".dm-open-row-btn").forEach(button => {
        button.addEventListener("click", () => {
            const id = String(button.dataset.id || "");
            const type = button.dataset.type;

            let found = null;

            if (type === "calamity") {
                found = calamities.find(item => String(item.id) === id);
            } else {
                found = incidents.find(item => String(item.id) === id);
            }

            if (!found) return;
            selectEvent(found, type, true);
        });
    });
}

function getEventTypeIcon(type) {
    const normalized = String(type || "").toLowerCase();

    if (normalized.includes("typhoon")) return "fas fa-wind";
    if (normalized.includes("earthquake")) return "fas fa-house-crack";
    if (normalized.includes("flood")) return "fas fa-water";
    if (normalized.includes("fire")) return "fas fa-fire";
    if (normalized.includes("landslide")) return "fas fa-mountain";
    if (normalized.includes("accident")) return "fas fa-car-burst";
    if (normalized.includes("rescue")) return "fas fa-life-ring";
    if (normalized.includes("missing")) return "fas fa-person-circle-question";
    if (normalized.includes("collapse")) return "fas fa-building-circle-xmark";

    return "fas fa-triangle-exclamation";
}

function renderEventStepper(event, type) {
    const container = document.getElementById("viewEventStepper");
    if (!container) return;

    const normalizedType = String(type || "").toLowerCase();
    const status = String(event?.status || "").toUpperCase();

    let steps = [];
    let currentIndex = 0;

    if (normalizedType === "incident") {
        steps = [
            { key: "ONGOING", label: "Reported", value: "Initial report logged" },
            { key: "IN_PROGRESS", label: "Dispatched", value: "Response team assigned" },
            { key: "ON_SITE", label: "On Site", value: "Field response active" },
            { key: "RESOLVED", label: "Resolved", value: "Incident closed" }
        ];
    } else {
        steps = [
            { key: "ACTIVE", label: "Active", value: "Disaster event ongoing" },
            { key: "MONITORING", label: "Monitoring", value: "Situation under watch" },
            { key: "RESOLVED", label: "Resolved", value: "Contained and stabilized" },
            { key: "ENDED", label: "Ended", value: "Event formally closed" }
        ];
    }

    currentIndex = steps.findIndex(step => step.key === status);
    if (currentIndex < 0) currentIndex = 0;

    container.innerHTML = steps.map((step, index) => {
        let stateClass = "";

        if (index < currentIndex) {
            stateClass = "is-complete";
        } else if (index === currentIndex) {
            stateClass = "is-active";
        }

        return `
            <div class="dm-step ${stateClass}">
                <div class="dm-step-dot">
                    ${index < currentIndex ? '<i class="fas fa-check"></i>' : index + 1}
                </div>
                <span class="dm-step-label">${step.label}</span>
                <span class="dm-step-value">${step.value}</span>
            </div>
        `;
    }).join("");
}

function syncLibraryPanelMode() {
    const panel = document.querySelector(".dm-library-panel");
    if (!panel) return;

    const header = panel.querySelector(".dm-section-header");
    const toolbar = panel.querySelector(".dm-library-toolbar");
    const libraryView = document.getElementById("eventLibraryView");
    const detailsView = document.getElementById("eventDetailsView");

    header?.classList.toggle("hidden", isDetailsMode);
    toolbar?.classList.toggle("hidden", isDetailsMode);
    libraryView?.classList.toggle("hidden", isDetailsMode);
    detailsView?.classList.toggle("hidden", !isDetailsMode);
}

function showLibraryView() {
    isDetailsMode = false;
    syncLibraryPanelMode();
}

function showEventDetailsView() {
    isDetailsMode = true;
    syncLibraryPanelMode();
}

function renderCalamityTimeline(calamity) {
    const items = [];

    if (calamity.date) {
        items.push({
            time: calamity.date,
            text: `${getCalamityCardTitle(calamity)} was recorded.`
        });
    }

    if (calamity.status) {
        items.push({
            time: calamity.date,
            text: `Status updated to ${calamity.status}.`
        });
    }

    if (calamity.coordinatorName) {
        items.push({
            time: calamity.date,
            text: `${calamity.coordinatorName} assigned as coordinator.`
        });
    }

    if (!items.length) {
        return `<div class="dm-empty-state">No timeline actions available.</div>`;
    }

    return items.map(item => `
        <div class="dm-timeline-item">
            <span class="dm-timeline-time">${escapeHtml(formatDate(item.time))}</span>
            <div class="dm-timeline-text">${escapeHtml(item.text)}</div>
        </div>
    `).join("");
}

// sitrep map

function closeSitrepMarkerTooltip() {
    if (!activeSitrepMarkerKey) return;
    activeSitrepMarkerKey = null;
    renderSitRepMap();
}

function bindSitrepOutsideClick() {
    if (sitrepOutsideClickBound) return;

    document.addEventListener("click", (event) => {
        const clickedMarker = event.target.closest(".dm-map-event-marker");
        if (clickedMarker) return;

        if (activeSitrepMarkerKey) {
            activeSitrepMarkerKey = null;
            renderSitRepMap();
        }
    });

    sitrepOutsideClickBound = true;
}

function adjustSitrepTooltipPlacement(markerButton, stage) {
    if (!markerButton || !stage) return;

    const tooltip = markerButton.querySelector(".dm-map-event-tooltip");
    if (!tooltip) return;

    markerButton.classList.remove("tooltip-left", "tooltip-right", "tooltip-bottom");

    const stageRect = stage.getBoundingClientRect();
    const markerRect = markerButton.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    const projectedLeft = markerRect.left + (markerRect.width / 2) - (tooltipRect.width / 2);
    const projectedRight = markerRect.left + (markerRect.width / 2) + (tooltipRect.width / 2);
    const projectedTop = markerRect.top - tooltipRect.height - 12;

    const overflowLeft = projectedLeft < stageRect.left + 8;
    const overflowRight = projectedRight > stageRect.right - 8;
    const overflowTop = projectedTop < stageRect.top + 8;

    if (overflowLeft) {
        markerButton.classList.add("tooltip-right");
    } else if (overflowRight) {
        markerButton.classList.add("tooltip-left");
    }

    if (overflowTop) {
        markerButton.classList.add("tooltip-bottom");
    }
}

function normalizeBarangayKey(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/barangay\s+/g, "")
        .replace(/[^a-z0-9]/g, "");
}

function hashStringToNumber(value) {
    const text = String(value || "");
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function buildBarangayAnchorMap() {
    const map = {};
    const items = [...barangays]
        .filter(item => item && (item.name || item.barangayName))
        .sort((a, b) => String(a.name || a.barangayName).localeCompare(String(b.name || b.barangayName)));

    if (!items.length) return map;

    const rings = [18, 28, 38];
    const total = items.length;

    items.forEach((item, index) => {
        const name = item.name || item.barangayName || "";
        const angle = ((Math.PI * 2) / total) * index - (Math.PI / 2);
        const ringIndex = index % rings.length;
        const radius = rings[ringIndex];

        const x = 50 + (Math.cos(angle) * radius);
        const y = 50 + (Math.sin(angle) * radius * 0.72);

        map[normalizeBarangayKey(name)] = {
            x: Math.max(12, Math.min(88, x)),
            y: Math.max(14, Math.min(86, y))
        };
    });

    return map;
}

function getFallbackAnchor(seed) {
    const hash = hashStringToNumber(seed || "municipality");
    const angle = (hash % 360) * (Math.PI / 180);
    const radius = 18 + (hash % 22);

    return {
        x: Math.max(16, Math.min(84, 50 + Math.cos(angle) * radius)),
        y: Math.max(18, Math.min(82, 50 + Math.sin(angle) * radius * 0.72))
    };
}

function getEventAnchorLabel(eventRecord) {
    if (eventRecord.type === "calamity") {
        if ((eventRecord.areaType || "").toUpperCase() === "MUNICIPALITY") return "municipality";
        if (eventRecord.primaryBarangayName) return eventRecord.primaryBarangayName;
        if (eventRecord.affectedBarangayNames?.length) return eventRecord.affectedBarangayNames[0];
        return eventRecord.locationLabel || "municipality";
    }

    return eventRecord.barangay || eventRecord.locationLabel || "municipality";
}

function resolveSitRepAnchor(eventRecord, anchorMap, indexInGroup = 0, groupSize = 1) {
    const rawLabel = getEventAnchorLabel(eventRecord);
    const normalized = normalizeBarangayKey(rawLabel);

    let baseAnchor;
    if (normalized === "municipality" || !normalized) {
        baseAnchor = { x: 50, y: 50 };
    } else {
        baseAnchor = anchorMap[normalized] || getFallbackAnchor(normalized);
    }

    if (groupSize <= 1) return baseAnchor;

    const angle = ((Math.PI * 2) / groupSize) * indexInGroup;
    const offsetRadius = Math.min(10, 4 + groupSize * 1.6);

    return {
        x: Math.max(10, Math.min(90, baseAnchor.x + Math.cos(angle) * offsetRadius)),
        y: Math.max(12, Math.min(88, baseAnchor.y + Math.sin(angle) * offsetRadius))
    };
}

function buildSitRepEventRecords(activeCalamities = [], activeIncidents = []) {
    const calamityRecords = activeCalamities.map(item => ({
        id: item.id,
        type: "calamity",
        title: item.eventName || item.type || "Calamity Event",
        eventTypeLabel: item.type || "Calamity",
        severity: item.severity || "LOW",
        status: item.status || "-",
        when: item.date,
        locationLabel: formatAffectedArea(item),
        primaryBarangayName: item.primaryBarangayName || "",
        affectedBarangayNames: item.affectedBarangayNames || [],
        areaType: item.affectedAreaType || "",
        raw: item
    }));

    const incidentRecords = activeIncidents.map(item => ({
        id: item.id,
        type: "incident",
        title: item.type || "Incident",
        eventTypeLabel: item.type || "Incident",
        severity: item.severity || "LOW",
        status: item.status || "-",
        when: item.reportedAt || item.date,
        locationLabel: item.barangay || "No barangay assigned",
        barangay: item.barangay || "",
        raw: item
    }));

    return [...calamityRecords, ...incidentRecords]
        .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function renderSitRepMap(activeCalamities = getActiveCalamities(), activeIncidents = getActiveIncidents()) {
    const layer = document.getElementById("sitrepMapLayer");
    const emptyState = document.getElementById("sitrepMapEmpty");
    const highCountEl = document.getElementById("sitrepHighCount");
    const mediumCountEl = document.getElementById("sitrepMediumCount");
    const lowCountEl = document.getElementById("sitrepLowCount");
    const markerCountPill = document.getElementById("sitrepMarkerCountPill");
    const coveragePill = document.getElementById("sitrepCoveragePill");
    const stage = document.getElementById("sitrepMapStage");

    if (!layer || !stage) return;

    bindSitrepOutsideClick();

    const records = buildSitRepEventRecords(activeCalamities, activeIncidents);
    const anchorMap = buildBarangayAnchorMap();

    const severityCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    const groupedByAnchor = records.reduce((acc, record) => {
        const key = normalizeBarangayKey(getEventAnchorLabel(record) || "municipality");
        if (!acc[key]) acc[key] = [];
        acc[key].push(record);
        return acc;
    }, {});

    layer.innerHTML = "";

    Object.entries(groupedByAnchor).forEach(([anchorKey, items]) => {
        const anchorBase = resolveSitRepAnchor(items[0], anchorMap, 0, 1);

        const anchorDot = document.createElement("span");
        anchorDot.className = "dm-map-anchor";
        anchorDot.style.left = `${anchorBase.x}%`;
        anchorDot.style.top = `${anchorBase.y}%`;
        layer.appendChild(anchorDot);

        items.forEach((record, index) => {
            const severity = String(record.severity || "LOW").toUpperCase();
            if (severityCounts[severity] != null) severityCounts[severity] += 1;

            const anchor = resolveSitRepAnchor(record, anchorMap, index, items.length);
            const markerKey = `${record.type}-${record.id}`;
            const isActiveMarker =
                activeSitrepMarkerKey === markerKey ||
                (selectedEvent && String(selectedEvent.id) === String(record.id) && selectedEventType === record.type && activeSitrepMarkerKey === markerKey);

            const button = document.createElement("button");
            button.type = "button";
            button.dataset.markerKey = markerKey;
            button.className = `dm-map-event-marker event-${record.type} severity-${String(record.severity || "default").toLowerCase()}${isActiveMarker ? " active" : ""}`;
            button.style.left = `${anchor.x}%`;
            button.style.top = `${anchor.y}%`;

            button.innerHTML = `
                <span class="dm-map-event-pin"></span>
                <span class="dm-map-event-tooltip">
                    <strong>${escapeHtml(record.title)}</strong>
                    <span>${escapeHtml(record.locationLabel || "Municipal coverage")}</span>
                    <span>${escapeHtml(record.status || "-")} • ${escapeHtml(record.severity || "-")}</span>
                </span>
            `;

            button.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();

                activeSitrepMarkerKey = markerKey;
                selectedEvent = record.raw;
                selectedEventType = record.type;

                renderSelectedEventProfile();
                await renderEventDetailsView();
                showEventDetailsView();
                renderSitRepMap();

                const freshButton = document.querySelector(`.dm-map-event-marker[data-marker-key="${markerKey}"]`);
                if (freshButton) {
                    adjustSitrepTooltipPlacement(freshButton, stage);
                }
            });

            layer.appendChild(button);

            if (isActiveMarker) {
                requestAnimationFrame(() => {
                    const freshButton = document.querySelector(`.dm-map-event-marker[data-marker-key="${markerKey}"]`);
                    if (freshButton) {
                        adjustSitrepTooltipPlacement(freshButton, stage);
                    }
                });
            }
        });
    });

    const coverageCount = Object.keys(groupedByAnchor).length;

    if (emptyState) emptyState.classList.toggle("hidden", records.length > 0);
    if (highCountEl) highCountEl.textContent = `${severityCounts.HIGH} active marker${severityCounts.HIGH === 1 ? "" : "s"}`;
    if (mediumCountEl) mediumCountEl.textContent = `${severityCounts.MEDIUM} active marker${severityCounts.MEDIUM === 1 ? "" : "s"}`;
    if (lowCountEl) lowCountEl.textContent = `${severityCounts.LOW} active marker${severityCounts.LOW === 1 ? "" : "s"}`;

    if (markerCountPill) {
        markerCountPill.innerHTML = `<i class="fas fa-circle-dot"></i> ${records.length} live marker${records.length === 1 ? "" : "s"}`;
    }

    if (coveragePill) {
        coveragePill.innerHTML = `<i class="fas fa-layer-group"></i> ${coverageCount} coverage zone${coverageCount === 1 ? "" : "s"}`;
    }
}

document.addEventListener("DOMContentLoaded", initDisasterManagementPage);