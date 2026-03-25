const API_BASE = "http://localhost:8080/api";

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
    try {
        const parsed = JSON.parse(error.message);
        return parsed.message || parsed.error || "Something went wrong.";
    } catch {
        return error.message || "Something went wrong.";
    }
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

function updateSummaryCards() {
    const calamityCount = document.getElementById("calamityCount");
    const incidentCount = document.getElementById("incidentCount");
    const highSeverityCount = document.getElementById("highSeverityCount");
    const openEventCount = document.getElementById("openEventCount");

    const activeCalamities = calamities.filter(c =>
        ["ACTIVE", "MONITORING"].includes((c.status || "").toUpperCase())
    );

    const activeIncidents = incidents.filter(i =>
        ["ONGOING", "IN_PROGRESS", "ON_SITE"].includes((i.status || "").toUpperCase())
    );

    const highSeverityEvents =
        calamities.filter(c => (c.severity || "").toUpperCase() === "HIGH").length +
        incidents.filter(i => (i.severity || "").toUpperCase() === "HIGH").length;

    if (calamityCount) calamityCount.textContent = calamities.length;
    if (incidentCount) incidentCount.textContent = incidents.length;
    if (highSeverityCount) highSeverityCount.textContent = highSeverityEvents;
    if (openEventCount) openEventCount.textContent = activeCalamities.length + activeIncidents.length;

    updateSitRepMetrics(activeCalamities, activeIncidents);
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
    renderCurrentTab();
    updateLastUpdatedText();
}

async function loadIncidents() {
    incidents = await apiRequest(`${API_BASE}/incidents`);

    if (selectedEventType === "incident" && selectedEvent?.id != null) {
        const latestSelected = incidents.find(i => String(i.id) === String(selectedEvent.id));
        selectedEvent = latestSelected || null;
        if (!latestSelected) selectedEventType = null;
    }

    updateSummaryCards();
    renderCurrentTab();
    updateLastUpdatedText();
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

function selectEvent(event, type, openDetails = false) {
    selectedEvent = event;
    selectedEventType = type;
    renderCurrentTab();

    if (openDetails) {
        openViewEventModal();
    }
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

function renderCalamities() {
    const container = document.getElementById("calamityList");
    if (!container) return;

    const items = getFilteredAndSortedCalamities();
    container.innerHTML = "";

    if (!items.length) {
        container.innerHTML = `
            <div class="dm-empty dm-empty-state">
                <div class="dm-empty-icon">
                    <i class="fas fa-cloud-showers-heavy"></i>
                </div>
                <h3>No calamities found</h3>
                <p>Try adjusting your search or sort settings, or add a new calamity record.</p>
            </div>
        `;
        return;
    }

    const fragment = document.createDocumentFragment();

    items.forEach((calamity) => {
        const metaHtml = [
            createMetaPill("fas fa-cloud-showers-heavy", calamity.type || "-"),
            createMetaPill("fas fa-location-dot", formatAffectedArea(calamity)),
            createMetaPill("fas fa-calendar-days", formatDate(calamity.date)),
            calamity.coordinatorName ? createMetaPill("fas fa-user-tie", calamity.coordinatorName) : "",
            calamity.damageCost ? createMetaPill("fas fa-peso-sign", formatCurrency(calamity.damageCost)) : ""
        ].join("");

        fragment.appendChild(createLibraryCard({
            eventId: calamity.id,
            eventType: "calamity",
            title: getCalamityCardTitle(calamity),
            severity: calamity.severity,
            status: calamity.status,
            metaHtml,
            description: calamity.description,
            eventData: calamity
        }));
    });

    container.appendChild(fragment);
}

function renderIncidents() {
    const container = document.getElementById("incidentManagementList");
    if (!container) return;

    const items = getFilteredAndSortedIncidents();
    container.innerHTML = "";

    if (!items.length) {
        container.innerHTML = `
            <div class="dm-empty dm-empty-state">
                <div class="dm-empty-icon">
                    <i class="fas fa-helmet-safety"></i>
                </div>
                <h3>No incidents found</h3>
                <p>Try adjusting your search or sort settings, or add a new incident record.</p>
            </div>
        `;
        return;
    }

    const fragment = document.createDocumentFragment();

    items.forEach((incident) => {
        const metaHtml = [
            createMetaPill("fas fa-helmet-safety", incident.type || "-"),
            createMetaPill("fas fa-location-dot", incident.barangay || "-"),
            createMetaPill("fas fa-clock", formatDateTime(incident.reportedAt || incident.date)),
            incident.assignedResponderName
                ? createMetaPill("fas fa-user-shield", incident.assignedResponderName)
                : ""
        ].join("");

        fragment.appendChild(createLibraryCard({
            eventId: incident.id,
            eventType: "incident",
            title: getIncidentCardTitle(incident),
            severity: incident.severity,
            status: incident.status,
            metaHtml,
            description: incident.description,
            eventData: incident
        }));
    });

    container.appendChild(fragment);
}

function updateTabButtons() {
    document.getElementById("showCalamitiesBtn")?.classList.toggle("active", activeTab === "calamities");
    document.getElementById("showIncidentsBtn")?.classList.toggle("active", activeTab === "incidents");
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
    const calamityList = document.getElementById("calamityList");
    const incidentList = document.getElementById("incidentManagementList");

    if (!calamityList || !incidentList) return;

    if (activeTab === "calamities") {
        calamityList.classList.remove("hidden");
        incidentList.classList.add("hidden");
        renderCalamities();
    } else {
        calamityList.classList.add("hidden");
        incidentList.classList.remove("hidden");
        renderIncidents();
    }

    updateLibraryActionButton();
    updateTabButtons();
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

async function openViewEventModal() {
    if (!selectedEvent || !selectedEventType) return;

    const content = document.getElementById("viewEventContent");
    if (!content) return;

    let html = "";

    if (selectedEventType === "calamity") {
        html = `
            <div class="dm-profile-card">
                <div class="dm-profile-card-header">
                    <div>
                        <h3>${escapeHtml(selectedEvent.eventName || selectedEvent.type || "-")}</h3>
                        <div class="dm-item-meta">
                            ${createMetaPill("fas fa-cloud-showers-heavy", selectedEvent.type || "-")}
                            ${createMetaPill("fas fa-calendar-days", formatDate(selectedEvent.date))}
                            ${createMetaPill("fas fa-wave-square", selectedEvent.status || "-")}
                        </div>
                    </div>
                    <span class="severity-badge ${getSeverityClass(selectedEvent.severity)}">${escapeHtml(selectedEvent.severity || "-")}</span>
                </div>

                <div class="dm-profile-grid">
                    <div class="dm-profile-section">
                        <h4>Summary</h4>
                        <div class="dm-profile-summary">
                            ${renderProfileSummaryItems([
                                { label: "Event Type", value: "Calamity" },
                                { label: "Calamity Type", value: selectedEvent.type || "-" },
                                { label: "Status", value: selectedEvent.status || "-" },
                                { label: "Severity", value: selectedEvent.severity || "-" },
                                { label: "Affected Scope", value: selectedEvent.affectedAreaType || "-" },
                                { label: "Affected Area", value: formatAffectedArea(selectedEvent) },
                                { label: "Coordinator", value: selectedEvent.coordinatorName || "-" },
                                { label: "Estimated Damage Cost", value: selectedEvent.damageCost ? formatCurrency(selectedEvent.damageCost) : "-" },
                                { label: "Casualties", value: selectedEvent.casualties ?? 0 },
                                { label: "Date", value: formatDate(selectedEvent.date) }
                            ])}
                        </div>
                    </div>

                    <div class="dm-profile-section">
                        <h4>Description</h4>
                        <p class="dm-item-description">${escapeHtml(selectedEvent.description || "-")}</p>
                    </div>
                </div>

                ${canManageEvents() ? `
                    <div class="dm-profile-actions">
                        <button class="btn btn-secondary" id="editEventBtn">
                            <i class="fas fa-pen"></i>
                            Edit
                        </button>
                        <button class="btn btn-primary" id="deleteEventBtn">
                            <i class="fas fa-trash"></i>
                            Delete
                        </button>
                    </div>
                ` : ""}
            </div>
        `;
    } else {
        const timelineItems = await loadIncidentTimeline(selectedEvent.id);

        html = `
            <div class="dm-profile-card">
                <div class="dm-profile-card-header">
                    <div>
                        <h3>${escapeHtml(selectedEvent.type || "-")}</h3>
                        <div class="dm-item-meta">
                            ${createMetaPill("fas fa-location-dot", selectedEvent.barangay || "-")}
                            ${createMetaPill("fas fa-clock", formatDateTime(selectedEvent.reportedAt || selectedEvent.date))}
                            ${createMetaPill("fas fa-wave-square", selectedEvent.status || "-")}
                        </div>
                    </div>
                    <span class="severity-badge ${getSeverityClass(selectedEvent.severity)}">${escapeHtml(selectedEvent.severity || "-")}</span>
                </div>

                <div class="dm-profile-grid">
                    <div class="dm-profile-section">
                        <h4>Summary</h4>
                        <div class="dm-profile-summary">
                            ${renderProfileSummaryItems([
                                { label: "Event Type", value: "Incident" },
                                { label: "Incident Type", value: selectedEvent.type || "-" },
                                { label: "Status", value: selectedEvent.status || "-" },
                                { label: "Severity", value: selectedEvent.severity || "-" },
                                { label: "Barangay", value: selectedEvent.barangay || "-" },
                                { label: "Assigned Responder", value: selectedEvent.assignedResponderName || "-" },
                                { label: "Reported Time", value: formatDateTime(selectedEvent.reportedAt || selectedEvent.date) }
                            ])}
                        </div>
                    </div>

                    <div class="dm-profile-section">
                        <h4>Description</h4>
                        <p class="dm-item-description">${escapeHtml(selectedEvent.description || "-")}</p>
                    </div>

                    <div class="dm-profile-section">
                        <h4>Incident Timeline</h4>
                        <div class="dm-timeline">
                            ${
                                timelineItems.length
                                    ? timelineItems.map(action => `
                                        <div class="dm-timeline-item">
                                            <div class="dm-timeline-time">${escapeHtml(formatDateTime(action.actionTime))}</div>
                                            <div class="dm-timeline-text">
                                                <strong>${escapeHtml(action.actionType || "-")}</strong><br>
                                                ${escapeHtml(action.description || "-")}
                                            </div>
                                        </div>
                                    `).join("")
                                    : `<div class="dm-empty">No timeline available.</div>`
                            }
                        </div>
                    </div>
                </div>

                ${canManageEvents() ? `
                    <div class="dm-profile-actions">
                        <button class="btn btn-secondary" id="editEventBtn">
                            <i class="fas fa-pen"></i>
                            Edit
                        </button>
                        <button class="btn btn-primary" id="deleteEventBtn">
                            <i class="fas fa-trash"></i>
                            Delete
                        </button>
                    </div>
                ` : ""}
            </div>
        `;
    }

    content.innerHTML = html;
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
    document.getElementById("calamityForm")?.reset();
    resetEditingState();

    selectedPrimaryBarangay = null;
    selectedMultiBarangays = [];
    selectedCoordinator = null;

    const primaryInput = document.getElementById("primaryBarangayInput");
    const barangaySearchInput = document.getElementById("barangaySearchInput");
    const coordinatorInput = document.getElementById("coordinatorInput");

    if (primaryInput) primaryInput.value = "";
    if (barangaySearchInput) barangaySearchInput.value = "";
    if (coordinatorInput) coordinatorInput.value = "";

    renderSelectedMultiBarangays();
    hideSearchResults("primaryBarangayResults");
    hideSearchResults("barangaySearchResults");
    hideSearchResults("coordinatorResults");

    updateAffectedAreaUI();

    const header = document.querySelector("#calamityModal .modal-header h3");
    if (header) header.textContent = "Add Calamity";
}

function resetIncidentForm() {
    document.getElementById("incidentForm")?.reset();
    resetEditingState();

    selectedIncidentBarangay = null;
    selectedResponder = null;

    const barangayInput = document.getElementById("incidentBarangayInput");
    const responderInput = document.getElementById("incidentResponderInput");

    if (barangayInput) barangayInput.value = "";
    if (responderInput) responderInput.value = "";

    hideSearchResults("incidentBarangayResults");
    hideSearchResults("incidentResponderResults");

    const header = document.querySelector("#incidentModal .modal-header h3");
    if (header) header.textContent = "Add Incident";
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
    if (!input) return;

    const refresh = () => {
        const source = sourceGetter();
        const excludeIds = filterExclude();

        const filtered = filterByKeyword(
            source.filter(item => !excludeIds.includes(item.id)),
            input.value,
            item => labelGetter(item)
        );

        renderSearchResults(resultsId, filtered, labelGetter, onSelect, emptyLabel);
    };

    input.addEventListener("input", refresh);
    input.addEventListener("focus", refresh);
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

            const wrapper = input.closest(".dm-searchable-group");
            if (wrapper && !wrapper.contains(event.target)) {
                hideSearchResults(resultsId);
            }
        });
    });
}

function buildCalamityPayload() {
    const affectedAreaType = document.getElementById("affectedAreaTypeSelect")?.value || "";

    return {
        type: (document.getElementById("calamityTypeSelect")?.value || "").trim(),
        eventName: (document.getElementById("eventNameInput")?.value || "").trim() || null,
        affectedAreaType,
        barangayId: affectedAreaType === "BARANGAY" && selectedPrimaryBarangay ? Number(selectedPrimaryBarangay.id) : null,
        barangayIds: affectedAreaType === "MULTI_BARANGAY" ? selectedMultiBarangays.map(b => Number(b.id)) : [],
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

    if (payload.affectedAreaType === "MULTI_BARANGAY" && !payload.barangayIds.length) {
        throw new Error("Please add at least one affected barangay.");
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
    resetCalamityForm();

    editMode = true;
    editingEventId = calamity.id;
    editingEventType = "calamity";

    const header = document.querySelector("#calamityModal .modal-header h3");
    if (header) header.textContent = "Edit Calamity";

    document.getElementById("calamityTypeSelect").value = calamity.type || "";
    document.getElementById("calamitySeveritySelect").value = calamity.severity || "";
    document.getElementById("calamityStatusSelect").value = calamity.status || "";
    document.getElementById("calamityDateInput").value = calamity.date || "";
    document.getElementById("eventNameInput").value = calamity.eventName || "";
    document.getElementById("affectedAreaTypeSelect").value = calamity.affectedAreaType || "";
    document.getElementById("damageCostInput").value = calamity.damageCost ?? "";
    document.getElementById("casualtiesInput").value = calamity.casualties ?? "";
    document.getElementById("calamityDescriptionInput").value = calamity.description || "";

    if (calamity.primaryBarangayId || calamity.barangayId) {
        const found = barangays.find(b => String(b.id) === String(calamity.primaryBarangayId || calamity.barangayId));
        if (found) {
            selectedPrimaryBarangay = found;
            document.getElementById("primaryBarangayInput").value = found.name;
        }
    }

    if (Array.isArray(calamity.affectedBarangayIds)) {
        selectedMultiBarangays = barangays.filter(b =>
            calamity.affectedBarangayIds.some(id => String(id) === String(b.id))
        );
        renderSelectedMultiBarangays();
    }

    if (calamity.coordinatorId) {
        const found = coordinators.find(c => String(c.id) === String(calamity.coordinatorId));
        if (found) {
            selectedCoordinator = found;
            document.getElementById("coordinatorInput").value = found.fullName || found.name || "";
        }
    }

    updateAffectedAreaUI();
}

function populateIncidentFormForEdit(incident) {
    resetIncidentForm();

    editMode = true;
    editingEventId = incident.id;
    editingEventType = "incident";

    const header = document.querySelector("#incidentModal .modal-header h3");
    if (header) header.textContent = "Edit Incident";

    document.getElementById("incidentTypeSelect").value = incident.type || "";
    document.getElementById("incidentSeveritySelect").value = incident.severity || "";
    document.getElementById("incidentStatusSelect").value = incident.status || "";
    document.getElementById("incidentDateInput").value = incident.date || "";
    document.getElementById("incidentDescriptionInput").value = incident.description || "";

    if (incident.barangayId) {
        const found = barangays.find(b => String(b.id) === String(incident.barangayId));
        if (found) {
            selectedIncidentBarangay = found;
            document.getElementById("incidentBarangayInput").value = found.name;
        }
    }

    if (incident.assignedResponderId) {
        const found = responders.find(r => String(r.id) === String(incident.assignedResponderId));
        if (found) {
            selectedResponder = found;
            document.getElementById("incidentResponderInput").value = found.fullName || found.name || "";
        }
    }
}

async function handleDeleteSelectedEvent() {
    if (!selectedEvent || !selectedEventType || !canManageEvents()) return;

    const confirmed = window.confirm("Are you sure you want to delete this event?");
    if (!confirmed) return;

    try {
        if (selectedEventType === "calamity") {
            await apiRequest(`${API_BASE}/calamities/${selectedEvent.id}`, { method: "DELETE" });
            await loadCalamities();
        } else {
            await apiRequest(`${API_BASE}/incidents/${selectedEvent.id}`, { method: "DELETE" });
            await loadIncidents();
        }

        selectedEvent = null;
        selectedEventType = null;

        renderCurrentTab();
        closeModal("viewEventModal");
        showMessage("Event deleted successfully.");
    } catch (error) {
        console.error("Error deleting event:", error);
        showMessage(extractErrorMessage(error), "error");
    }
}

function bindViewModalActionButtons() {
    document.getElementById("editEventBtn")?.addEventListener("click", () => {
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

    document.getElementById("deleteEventBtn")?.addEventListener("click", handleDeleteSelectedEvent);
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
    document.getElementById("showCalamitiesBtn")?.addEventListener("click", () => {
        activeTab = "calamities";
        renderCurrentTab();

        if (selectedEventType !== "calamity") {
            selectedEvent = null;
            selectedEventType = null;
        }
    });

    document.getElementById("showIncidentsBtn")?.addEventListener("click", () => {
        activeTab = "incidents";
        renderCurrentTab();

        if (selectedEventType !== "incident") {
            selectedEvent = null;
            selectedEventType = null;
        }
    });
}

function initFilterHandler() {
    document.getElementById("eventFilter")?.addEventListener("input", () => renderCurrentTab());
}

function initSortHandler() {
    document.getElementById("eventSort")?.addEventListener("change", () => renderCurrentTab());
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
    if (calamityForm) {
        calamityForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            try {
                const payload = buildCalamityPayload();
                validateCalamityPayload(payload);

                const isEdit = editMode && editingEventType === "calamity" && Number(editingEventId) > 0;
                const endpoint = isEdit
                    ? `${API_BASE}/calamities/${Number(editingEventId)}`
                    : `${API_BASE}/calamities`;

                const method = isEdit ? "PUT" : "POST";

                const saved = await apiRequest(endpoint, {
                    method,
                    body: JSON.stringify(payload)
                });

                closeModal("calamityModal");
                resetCalamityForm();
                await loadCalamities();

                activeTab = "calamities";
                selectedEventType = "calamity";
                selectedEvent = calamities.find(c => String(c.id) === String(saved?.id)) || null;

                renderCurrentTab();
                showMessage(isEdit ? "Calamity updated successfully." : "Calamity saved successfully.");
            } catch (error) {
                console.error("Error saving calamity:", error);
                showMessage(extractErrorMessage(error), "error");
            }
        });
    }

    const incidentForm = document.getElementById("incidentForm");
    if (incidentForm) {
        incidentForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            try {
                const payload = buildIncidentPayload();
                validateIncidentPayload(payload);

                const isEdit = editMode && editingEventType === "incident" && Number(editingEventId) > 0;
                const endpoint = isEdit
                    ? `${API_BASE}/incidents/${Number(editingEventId)}`
                    : `${API_BASE}/incidents`;

                const method = isEdit ? "PUT" : "POST";

                const saved = await apiRequest(endpoint, {
                    method,
                    body: JSON.stringify(payload)
                });

                closeModal("incidentModal");
                resetIncidentForm();
                await loadIncidents();

                activeTab = "incidents";
                selectedEventType = "incident";
                selectedEvent = incidents.find(i => String(i.id) === String(saved?.id)) || null;

                renderCurrentTab();
                showMessage(isEdit ? "Incident updated successfully." : "Incident saved successfully.");
            } catch (error) {
                console.error("Error saving incident:", error);
                showMessage(extractErrorMessage(error), "error");
            }
        });
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

async function initDisasterManagementPage() {
    if (!localStorage.getItem("jwtToken")) {
        window.location.href = "login.html";
        return;
    }

    try {
        currentUserRoles = getCurrentUserRoles();

        initStaticSelects();
        initModalButtons();
        initLibraryAddButtons();
        initTabHandlers();
        initFilterHandler();
        initSortHandler();
        initAffectedAreaTypeToggle();
        initRefreshButton();
        initSearchPickers();
        initFormHandlers();

        await loadBarangays();
        await loadCoordinators();
        await loadResponders();
        await loadCalamities();
        await loadIncidents();

        renderCurrentTab();
        updateSummaryCards();
    } catch (error) {
        console.error("Error initializing disaster management page:", error);
        alert("Failed to load disaster management data.");
    }
}

document.addEventListener("DOMContentLoaded", initDisasterManagementPage);