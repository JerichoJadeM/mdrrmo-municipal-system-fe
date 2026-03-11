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

let selectedMultiBarangays = [];

let activeSingleBarangayResults = [];
let activeMultiBarangayResults = [];
let activeIncidentBarangayResults = [];

let activeSingleBarangayIndex = -1;
let activeMultiBarangayIndex = -1;
let activeIncidentBarangayIndex = -1;

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

function populateTypeSelect(selectId, values) {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = `<option value="">Select type</option>`;

    values.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    });
}

function populateBarangaySelect(selectId, includeDefault = true) {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = includeDefault ? `<option value="">Select barangay</option>` : "";

    barangays.forEach((barangay) => {
        const option = document.createElement("option");
        option.value = barangay.id;
        option.textContent = barangay.name;
        select.appendChild(option);
    });
}

function populateUserSelect(selectId, users, defaultLabel = "Unassigned") {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = `<option value="">${defaultLabel}</option>`;

    users.forEach((user) => {
        const option = document.createElement("option");
        option.value = user.id;
        option.textContent = user.assignmentStatus
            ? `${user.fullName} (${user.assignmentStatus})`
            : user.fullName;
        select.appendChild(option);
    });
}

function setupOtherTypeToggle(selectId, otherInputId) {
    const select = document.getElementById(selectId);
    const otherInput = document.getElementById(otherInputId);

    if (!select || !otherInput) return;

    const toggle = () => {
        if (select.value === "Others") {
            otherInput.classList.remove("hidden");
            otherInput.required = true;
        } else {
            otherInput.classList.add("hidden");
            otherInput.required = false;
            otherInput.value = "";
        }
    };

    select.addEventListener("change", toggle);
    toggle();
}

function getSelectedType(selectId, otherInputId) {
    const select = document.getElementById(selectId);
    const otherInput = document.getElementById(otherInputId);

    if (!select) return "";

    if (select.value === "Others") {
        return (otherInput?.value || "").trim();
    }

    return (select.value || "").trim();
}

async function loadBarangays() {
    barangays = await apiRequest(`${API_BASE}/barangays`);
    populateBarangaySelect("calamityBarangay");
    populateBarangaySelect("incidentBarangay");
}

async function loadCoordinators() {
    coordinators = await apiRequest(`${API_BASE}/users/coordinators`);
    populateUserSelect("calamityCoordinator", coordinators, "Unassigned");
}

async function loadResponders() {
    responders = await apiRequest(`${API_BASE}/users/responders`);
    populateUserSelect("incidentResponder", responders, "Unassigned");
}

async function loadCalamities() {
    calamities = await apiRequest(`${API_BASE}/calamities`);

    if (selectedEventType === "calamity" && selectedEvent?.id != null) {
        const latestSelected = calamities.find(c => String(c.id) === String(selectedEvent.id));
        selectedEvent = latestSelected || null;

        if (!latestSelected) {
            selectedEventType = null;
        }
    }

    updateSummaryCards();
    renderCurrentTab();
    renderEventProfile();

    console.log("Latest calamities from backend:", calamities.map(c => ({
    id: c.id,
    type: c.type,
    date: c.date,
    status: c.status
})));
}

async function loadIncidents() {
    incidents = await apiRequest(`${API_BASE}/incidents`);

    if (selectedEventType === "incident" && selectedEvent?.id != null) {
        const latestSelected = incidents.find(i => String(i.id) === String(selectedEvent.id));
        selectedEvent = latestSelected || null;

        if (!latestSelected) {
            selectedEventType = null;
        }
    }

    updateSummaryCards();
    renderCurrentTab();
    renderEventProfile();
}

function getSeverityClass(severity) {
    const normalized = (severity || "").trim().toUpperCase();
    if (normalized === "HIGH") return "severity-high";
    if (normalized === "MEDIUM") return "severity-medium";
    if (normalized === "LOW") return "severity-low";
    return "severity-default";
}

function severityRank(severity) {
    const normalized = (severity || "").trim().toUpperCase();
    if (normalized === "HIGH") return 3;
    if (normalized === "MEDIUM") return 2;
    if (normalized === "LOW") return 1;
    return 0;
}

function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatCurrency(value) {
    const numeric = Number(value || 0);
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP"
    }).format(numeric);
}

function getFilterKeyword() {
    return (document.getElementById("eventFilter")?.value || "").trim().toLowerCase();
}

function sortEvents(items, type) {
    const sortValue = document.getElementById("eventSort")?.value || "latest";
    const sorted = [...items];

    sorted.sort((a, b) => {
        const aDate = new Date(type === "calamity" ? a.date : a.reportedAt).getTime();
        const bDate = new Date(type === "calamity" ? b.date : b.reportedAt).getTime();

        if (sortValue === "oldest") return aDate - bDate;
        if (sortValue === "severity-high") return severityRank(b.severity) - severityRank(a.severity);
        if (sortValue === "severity-low") return severityRank(a.severity) - severityRank(b.severity);
        if (sortValue === "type-az") return (a.type || "").localeCompare(b.type || "");

        return bDate - aDate;
    });

    return sorted;
}

function updateSummaryCards() {
    document.getElementById("totalCalamitiesCount").textContent = calamities.length;
    document.getElementById("totalIncidentsCount").textContent = incidents.length;
    document.getElementById("highSeverityCalamitiesCount").textContent = calamities.filter(
        (c) => (c.severity || "").toUpperCase() === "HIGH"
    ).length;
    document.getElementById("ongoingIncidentsCount").textContent = incidents.filter(
        (i) => (i.status || "").toUpperCase() === "ONGOING"
    ).length;
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
        addBtnIcon.className = "fas fa-triangle-exclamation";
    }
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
            incident.reportedAt
        ].filter(Boolean).join(" ").toLowerCase();

        return searchableText.includes(keyword);
    });

    return sortEvents(filtered, "incident");
}

function renderCalamities() {
    const container = document.getElementById("calamityList");
    if (!container) return;

    const sorted = getFilteredAndSortedCalamities();
    container.innerHTML = "";

    if (sorted.length === 0) {
        container.innerHTML = `<div class="dm-empty">No calamities found.</div>`;
        return;
    }

    const table = document.createElement("table");
    table.className = "dm-library-table";

    table.innerHTML = `
        <thead>
            <tr>
                <th>Severity</th>
                <th>Type</th>
                <th>Status</th>
                <th>Affected Area</th>
                <th>Date</th>
                <th></th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const tbody = table.querySelector("tbody");

    sorted.forEach((calamity) => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td><span class="severity-badge ${getSeverityClass(calamity.severity)}">${calamity.severity || "-"}</span></td>
            <td>${calamity.type || "-"}</td>
            <td>${calamity.status || "-"}</td>
            <td>${formatAffectedArea(calamity)}</td>
            <td>${formatDate(calamity.date)}</td>
            <td class="dm-actions-cell">
                <button type="button" class="dm-row-view-btn">View Full Details</button>
            </td>
        `;

        tr.querySelector(".dm-row-view-btn")?.addEventListener("click", () => {
            selectedEvent = calamity;
            selectedEventType = "calamity";
            renderEventProfile();
            openViewEventModal();
        });

        tbody.appendChild(tr);
    });

    container.appendChild(table);
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
        return `${affectedNames.length} Barangays`;
    }

    return calamity.primaryBarangayName || "-";
}

function renderIncidents() {
    const container = document.getElementById("incidentManagementList");
    if (!container) return;

    const sorted = getFilteredAndSortedIncidents();
    container.innerHTML = "";

    if (sorted.length === 0) {
        container.innerHTML = `<div class="dm-empty">No incidents found.</div>`;
        return;
    }

    const table = document.createElement("table");
    table.className = "dm-library-table";

    table.innerHTML = `
        <thead>
            <tr>
                <th>Severity</th>
                <th>Type</th>
                <th>Status</th>
                <th>Barangay</th>
                <th>Date</th>
                <th></th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const tbody = table.querySelector("tbody");

    sorted.forEach((incident) => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td><span class="severity-badge ${getSeverityClass(incident.severity)}">${incident.severity || "-"}</span></td>
            <td>${incident.type || "-"}</td>
            <td>${incident.status || "-"}</td>
            <td>${incident.barangay || "-"}</td>
            <td>${formatDateTime(incident.reportedAt)}</td>
            <td class="dm-actions-cell">
                <button type="button" class="dm-row-view-btn">View Full Details</button>
            </td>
        `;

        tr.querySelector(".dm-row-view-btn")?.addEventListener("click", () => {
            selectedEvent = incident;
            selectedEventType = "incident";
            renderEventProfile();
            openViewEventModal();
        });

        tbody.appendChild(tr);
    });

    container.appendChild(table);
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
        const actions = await apiRequest(`${API_BASE}/incidents/${incidentId}/actions`);
        const section = document.getElementById("incidentTimelineSection");
        const container = document.getElementById("incidentTimeline");

        if (!section || !container) return;

        container.innerHTML = "";

        if (!actions || actions.length === 0) {
            container.innerHTML = `<div class="dm-empty">No timeline available.</div>`;
            section.classList.remove("hidden");
            return;
        }

        actions.forEach((action) => {
            const item = document.createElement("div");
            item.className = "dm-timeline-item";
            item.innerHTML = `
                <strong>${action.actionType || "-"}</strong>
                <span>${action.description || "-"}</span>
                <small>${formatDateTime(action.actionTime)}</small>
            `;
            container.appendChild(item);
        });

        section.classList.remove("hidden");
    } catch (error) {
        console.error("Error loading incident timeline:", error);
        const section = document.getElementById("incidentTimelineSection");
        const container = document.getElementById("incidentTimeline");
        if (section && container) {
            container.innerHTML = `<div class="dm-empty">Unable to load timeline.</div>`;
            section.classList.remove("hidden");
        }
    }
}

async function loadIncidentTimelineToModal(incidentId) {
    try {
        const actions = await apiRequest(`${API_BASE}/incidents/${incidentId}/actions`);
        const section = document.getElementById("viewIncidentTimelineSection");
        const container = document.getElementById("viewIncidentTimeline");

        if (!section || !container) return;

        container.innerHTML = "";

        if (!actions || actions.length === 0) {
            container.innerHTML = `<div class="dm-empty">No timeline available.</div>`;
            section.classList.remove("hidden");
            return;
        }

        actions.forEach((action) => {
            const item = document.createElement("div");
            item.className = "dm-timeline-item";
            item.innerHTML = `
                <strong>${action.actionType || "-"}</strong>
                <span>${action.description || "-"}</span>
                <small>${formatDateTime(action.actionTime)}</small>
            `;
            container.appendChild(item);
        });

        section.classList.remove("hidden");
    } catch (error) {
        console.error("Error loading incident timeline for modal:", error);
        const section = document.getElementById("viewIncidentTimelineSection");
        const container = document.getElementById("viewIncidentTimeline");
        if (section && container) {
            container.innerHTML = `<div class="dm-empty">Unable to load timeline.</div>`;
            section.classList.remove("hidden");
        }
    }
}

function renderEventProfile() {
    const empty = document.getElementById("eventProfileEmpty");
    const content = document.getElementById("eventProfileContent");
    const title = document.getElementById("profileTitle");
    const severityBadge = document.getElementById("profileSeverityBadge");
    const meta = document.getElementById("profileMeta");
    const summary = document.getElementById("profileSummary");
    const description = document.getElementById("profileDescription");
    const timelineSection = document.getElementById("incidentTimelineSection");
    const timelineContainer = document.getElementById("incidentTimeline");
    const profileActions = document.getElementById("eventProfileActions");

    if (!empty || !content || !title || !severityBadge || !meta || !summary || !description) return;

    if (!selectedEvent || !selectedEventType) {
        empty.classList.remove("hidden");
        content.classList.add("hidden");
        if (profileActions) profileActions.classList.add("hidden");
        if (timelineSection) timelineSection.classList.add("hidden");
        if (timelineContainer) timelineContainer.innerHTML = "";
        return;
    }

    empty.classList.add("hidden");
    content.classList.remove("hidden");
    if (profileActions) profileActions.classList.remove("hidden");

    title.textContent = selectedEvent.type || "-";
    severityBadge.className = `severity-badge ${getSeverityClass(selectedEvent.severity)}`;
    severityBadge.textContent = selectedEvent.severity || "-";

    if (selectedEventType === "calamity") {
        meta.innerHTML = `
            <div>
                <strong>Affected Area</strong>
                <span>${selectedEvent.affectedAreaType || "-"}</span>
            </div>
            <div>
                <strong>Status</strong>
                <span>${selectedEvent.status || "-"}</span>
            </div>
            <div>
                <strong>Date</strong>
                <span>${formatDate(selectedEvent.date)}</span>
            </div>
        `;

        summary.innerHTML = `
            <div class="dm-profile-summary-item">
                <strong>Event Type</strong>
                <span>Calamity</span>
            </div>
            <div class="dm-profile-summary-item">
                <strong>Typhoon Name</strong>
                <span>${selectedEvent.eventName || "-"}</span>
            </div>
            <div class="dm-profile-summary-item">
                <strong>Assigned Coordinator</strong>
                <span>${selectedEvent.coordinatorName || "-"}</span>
            </div>
            <div class="dm-profile-summary-item">
                <strong>Estimated Damage Cost</strong>
                <span>${formatCurrency(selectedEvent.damageCost)}</span>
            </div>
            <div class="dm-profile-summary-item">
                <strong>Affected Barangays</strong>
                <span>${selectedEvent.affectedBarangayNames?.length ? selectedEvent.affectedBarangayNames.join(", ") : "-"}</span>
            </div>
            <div class="dm-profile-summary-item">
                <strong>Severity</strong>
                <span>${selectedEvent.severity || "-"}</span>
            </div>
        `;

        description.textContent = selectedEvent.description || "-";

        if (timelineSection) timelineSection.classList.add("hidden");
        if (timelineContainer) timelineContainer.innerHTML = "";
    } else {
        meta.innerHTML = `
            <div>
                <strong>Barangay</strong>
                <span>${selectedEvent.barangay || "-"}</span>
            </div>
            <div>
                <strong>Status</strong>
                <span>${selectedEvent.status || "-"}</span>
            </div>
            <div>
                <strong>Reported At</strong>
                <span>${formatDateTime(selectedEvent.reportedAt)}</span>
            </div>
        `;

        summary.innerHTML = `
            <div class="dm-profile-summary-item">
                <strong>Event Type</strong>
                <span>Incident</span>
            </div>
            <div class="dm-profile-summary-item">
                <strong>Assigned Responder</strong>
                <span>${selectedEvent.assignedResponderName || "-"}</span>
            </div>
            <div class="dm-profile-summary-item">
                <strong>Status</strong>
                <span>${selectedEvent.status || "-"}</span>
            </div>
            <div class="dm-profile-summary-item">
                <strong>Severity</strong>
                <span>${selectedEvent.severity || "-"}</span>
            </div>
        `;

        description.textContent = selectedEvent.description || "-";
        loadIncidentTimeline(selectedEvent.id);
    }
}

function updateViewModalActionsVisibility() {
    const editBtn = document.getElementById("editEventBtn");
    const deleteBtn = document.getElementById("deleteEventBtn");

    if (!editBtn || !deleteBtn) return;

    const allowed = canManageEvents();
    editBtn.classList.toggle("hidden", !allowed);
    deleteBtn.classList.toggle("hidden", !allowed);
}

function openViewEventModal() {
    if (!selectedEvent || !selectedEventType) return;

    const modalTitle = document.getElementById("viewEventModalTitle");
    const title = document.getElementById("viewEventTitle");
    const severityBadge = document.getElementById("viewEventSeverityBadge");
    const meta = document.getElementById("viewEventMeta");
    const summary = document.getElementById("viewEventSummary");
    const description = document.getElementById("viewEventDescription");
    const timelineSection = document.getElementById("viewIncidentTimelineSection");
    const timelineContainer = document.getElementById("viewIncidentTimeline");

    if (!modalTitle || !title || !severityBadge || !meta || !summary || !description) return;

    modalTitle.textContent = selectedEventType === "calamity" ? "Calamity Details" : "Incident Details";
    title.textContent = selectedEvent.type || "-";
    severityBadge.className = `severity-badge ${getSeverityClass(selectedEvent.severity)}`;
    severityBadge.textContent = selectedEvent.severity || "-";

    if (selectedEventType === "calamity") {
        meta.innerHTML = `
            <div>
                <strong>Affected Area</strong>
                <span>${selectedEvent.affectedAreaType || "-"}</span>
            </div>
            <div>
                <strong>Status</strong>
                <span>${selectedEvent.status || "-"}</span>
            </div>
            <div>
                <strong>Date</strong>
                <span>${formatDate(selectedEvent.date)}</span>
            </div>
        `;

        summary.innerHTML = `
            <div class="dm-profile-summary-item">
                <strong>Event Type</strong>
                <span>Calamity</span>
            </div>
            <div class="dm-profile-summary-item">
                <strong>Typhoon Name</strong>
                <span>${selectedEvent.eventName || "-"}</span>
            </div>
            <div class="dm-profile-summary-item">
                <strong>Assigned Coordinator</strong>
                <span>${selectedEvent.coordinatorName || "-"}</span>
            </div>
            <div class="dm-profile-summary-item">
                <strong>Estimated Damage Cost</strong>
                <span>${formatCurrency(selectedEvent.damageCost)}</span>
            </div>
            <div class="dm-profile-summary-item">
                <strong>Affected Barangays</strong>
                <span>${selectedEvent.affectedBarangayNames?.length ? selectedEvent.affectedBarangayNames.join(", ") : "-"}</span>
            </div>
            <div class="dm-profile-summary-item">
                <strong>Severity</strong>
                <span>${selectedEvent.severity || "-"}</span>
            </div>
        `;

        description.textContent = selectedEvent.description || "-";

        if (timelineSection) timelineSection.classList.add("hidden");
        if (timelineContainer) timelineContainer.innerHTML = "";
    } else {
        meta.innerHTML = `
            <div>
                <strong>Barangay</strong>
                <span>${selectedEvent.barangay || "-"}</span>
            </div>
            <div>
                <strong>Status</strong>
                <span>${selectedEvent.status || "-"}</span>
            </div>
            <div>
                <strong>Reported At</strong>
                <span>${formatDateTime(selectedEvent.reportedAt)}</span>
            </div>
        `;

        summary.innerHTML = `
            <div class="dm-profile-summary-item">
                <strong>Event Type</strong>
                <span>Incident</span>
            </div>
            <div class="dm-profile-summary-item">
                <strong>Assigned Responder</strong>
                <span>${selectedEvent.assignedResponderName || "-"}</span>
            </div>
            <div class="dm-profile-summary-item">
                <strong>Status</strong>
                <span>${selectedEvent.status || "-"}</span>
            </div>
            <div class="dm-profile-summary-item">
                <strong>Severity</strong>
                <span>${selectedEvent.severity || "-"}</span>
            </div>
        `;

        description.textContent = selectedEvent.description || "-";

        if (timelineSection) timelineSection.classList.remove("hidden");
        loadIncidentTimelineToModal(selectedEvent.id);
    }

    updateViewModalActionsVisibility();
    openModal("viewEventModal");
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.add("active");
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.remove("active");
    modal.style.display = "none";

    const stillOpenModal = document.querySelector(".modal.active");
    if (!stillOpenModal) {
        document.body.style.overflow = "auto";
    }
}

function filterBarangays(keyword, excludeIds = []) {
    const normalizedKeyword = (keyword || "").trim().toLowerCase();

    return barangays.filter((barangay) => {
        const notExcluded = !excludeIds.includes(barangay.id);
        const matchesKeyword =
            !normalizedKeyword || (barangay.name || "").toLowerCase().includes(normalizedKeyword);

        return notExcluded && matchesKeyword;
    });
}

function hideSearchResults(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = "";
    container.classList.add("hidden");
}

function renderSingleSelectedBarangay(barangay) {
    const selectedBox = document.getElementById("calamityBarangaySelected");
    const input = document.getElementById("calamityBarangayInput");
    const select = document.getElementById("calamityBarangay");

    if (!selectedBox || !input || !select) return;

    if (!barangay) {
        selectedBox.innerHTML = "";
        selectedBox.classList.add("hidden");
        return;
    }

    select.value = String(barangay.id);
    input.value = barangay.name;
    selectedBox.innerHTML = `<strong>Selected:</strong> ${barangay.name}`;
    selectedBox.classList.remove("hidden");
}

function renderSelectedMultiBarangays() {
    const container = document.getElementById("calamityBarangaysSelected");
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

function clearEditingState() {
    editMode = false;
    editingEventId = null;
    editingEventType = null;
}

function resetCalamityForm() {
    document.getElementById("calamityForm")?.reset();

    clearEditingState();

    const calamityTypeOther = document.getElementById("calamityTypeOther");
    const typhoonWrapper = document.getElementById("typhoonNameWrapper");
    const calamityEventName = document.getElementById("calamityEventName");
    const singleInput = document.getElementById("calamityBarangayInput");
    const singleSelected = document.getElementById("calamityBarangaySelected");
    const singleResults = document.getElementById("calamityBarangayResults");
    const multiInput = document.getElementById("calamityBarangaysInput");
    const multiSelected = document.getElementById("calamityBarangaysSelected");
    const multiResults = document.getElementById("calamityBarangaysResults");
    const singleSelect = document.getElementById("calamityBarangay");
    const areaType = document.getElementById("calamityAffectedAreaType");
    const singleWrapper = document.getElementById("singleBarangayWrapper");
    const multiWrapper = document.getElementById("multiBarangayWrapper");
    const coordinator = document.getElementById("calamityCoordinator");
    const severity = document.getElementById("calamitySeverity");
    const date = document.getElementById("calamityDate");
    const damageCost = document.getElementById("calamityDamageCost");
    const casualties = document.getElementById("calamityCasualties");
    const description = document.getElementById("calamityDescription");
    const typeSelect = document.getElementById("calamityTypeSelect");

    if (typeSelect) typeSelect.value = "";
    if (severity) severity.value = "";
    if (date) date.value = "";
    if (damageCost) damageCost.value = "";
    if (casualties) casualties.value = "";
    if (description) description.value = "";
    if (coordinator) coordinator.value = "";

    calamityTypeOther?.classList.add("hidden");
    if (calamityTypeOther) {
        calamityTypeOther.required = false;
        calamityTypeOther.value = "";
    }

    typhoonWrapper?.classList.add("hidden");
    if (calamityEventName) {
        calamityEventName.required = false;
        calamityEventName.value = "";
    }

    if (singleInput) singleInput.value = "";
    if (singleSelect) singleSelect.value = "";

    if (singleSelected) {
        singleSelected.innerHTML = "";
        singleSelected.classList.add("hidden");
    }

    if (multiInput) multiInput.value = "";
    if (multiSelected) multiSelected.innerHTML = "";

    hideSearchResults("calamityBarangayResults");
    hideSearchResults("calamityBarangaysResults");

    selectedMultiBarangays = [];
    activeSingleBarangayResults = [];
    activeMultiBarangayResults = [];
    activeSingleBarangayIndex = -1;
    activeMultiBarangayIndex = -1;

    if (areaType) areaType.value = "";
    singleWrapper?.classList.remove("hidden");
    multiWrapper?.classList.add("hidden");

    const header = document.querySelector("#calamityModal .modal-header h3");
    if (header) header.textContent = "Add Calamity";
}

function resetIncidentForm() {
    document.getElementById("incidentForm")?.reset();

    clearEditingState();

    const incidentTypeOther = document.getElementById("incidentTypeOther");
    const incidentInput = document.getElementById("incidentBarangayInput");
    const incidentResults = document.getElementById("incidentBarangayResults");
    const incidentSelect = document.getElementById("incidentBarangay");
    const responder = document.getElementById("incidentResponder");
    const severity = document.getElementById("incidentSeverity");
    const description = document.getElementById("incidentDescription");
    const typeSelect = document.getElementById("incidentTypeSelect");

    if (typeSelect) typeSelect.value = "";
    if (severity) severity.value = "";
    if (description) description.value = "";
    if (incidentInput) incidentInput.value = "";
    if (incidentSelect) incidentSelect.value = "";
    if (responder) responder.value = "";

    incidentTypeOther?.classList.add("hidden");
    if (incidentTypeOther) {
        incidentTypeOther.required = false;
        incidentTypeOther.value = "";
    }

    hideSearchResults("incidentBarangayResults");

    activeIncidentBarangayResults = [];
    activeIncidentBarangayIndex = -1;

    const header = document.querySelector("#incidentModal .modal-header h3");
    if (header) header.textContent = "Add Incident";
}


function selectSingleBarangay(barangay) {
    renderSingleSelectedBarangay(barangay);
    hideSearchResults("calamityBarangayResults");
    activeSingleBarangayResults = [];
    activeSingleBarangayIndex = -1;
}

function addMultiBarangay(barangay) {
    const exists = selectedMultiBarangays.some((b) => b.id === barangay.id);
    if (exists) return;

    selectedMultiBarangays.push(barangay);
    renderSelectedMultiBarangays();

    const input = document.getElementById("calamityBarangaysInput");
    if (input) input.value = "";

    hideSearchResults("calamityBarangaysResults");
    activeMultiBarangayResults = [];
    activeMultiBarangayIndex = -1;
}

function selectIncidentBarangay(barangay) {
    const input = document.getElementById("incidentBarangayInput");
    const select = document.getElementById("incidentBarangay");

    if (input) input.value = barangay.name;
    if (select) select.value = String(barangay.id);

    hideSearchResults("incidentBarangayResults");
    activeIncidentBarangayResults = [];
    activeIncidentBarangayIndex = -1;
}

function initPickerInput(inputId, resultsId, stateName, onSelect, toggleId, excludeIdsGetter = () => []) {
    const input = document.getElementById(inputId);
    const toggle = document.getElementById(toggleId);
    if (!input) return;

    const getState = () => {
        if (stateName === "single") {
            return { results: activeSingleBarangayResults, index: activeSingleBarangayIndex };
        }
        if (stateName === "multi") {
            return { results: activeMultiBarangayResults, index: activeMultiBarangayIndex };
        }
        return { results: activeIncidentBarangayResults, index: activeIncidentBarangayIndex };
    };

    const setState = (results, index) => {
        if (stateName === "single") {
            activeSingleBarangayResults = results;
            activeSingleBarangayIndex = index;
        } else if (stateName === "multi") {
            activeMultiBarangayResults = results;
            activeMultiBarangayIndex = index;
        } else {
            activeIncidentBarangayResults = results;
            activeIncidentBarangayIndex = index;
        }
    };

    const refresh = (showAll = false) => {
        const keyword = showAll ? "" : input.value;
        const results = filterBarangays(keyword, excludeIdsGetter());
        setState(results, -1);
        renderSearchResults(resultsId, results, onSelect, -1);
    };

    input.addEventListener("input", () => refresh(false));
    input.addEventListener("focus", () => refresh(false));

    toggle?.addEventListener("click", () => {
        input.focus();
        refresh(true);
    });

    input.addEventListener("keydown", (e) => {
        const state = getState();
        if (!state.results.length) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            const newIndex = Math.min(state.index + 1, state.results.length - 1);
            setState(state.results, newIndex);
            renderSearchResults(resultsId, state.results, onSelect, newIndex);
        }

        if (e.key === "ArrowUp") {
            e.preventDefault();
            const newIndex = Math.max(state.index - 1, 0);
            setState(state.results, newIndex);
            renderSearchResults(resultsId, state.results, onSelect, newIndex);
        }

        if (e.key === "Enter") {
            e.preventDefault();
            const selected = state.results[state.index] || state.results[0];
            if (selected) onSelect(selected);
        }
    });
}

function renderSearchResults(containerId, items, onSelect, activeIndex = -1) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = "";
    container.classList.remove("hidden");

    if (!items.length) {
        container.innerHTML = `<div class="dm-search-result-empty">No barangay found.</div>`;
        return;
    }

    items.forEach((item, index) => {
        const row = document.createElement("div");
        row.className = `dm-search-result-item ${index === activeIndex ? "active" : ""}`;
        row.textContent = item.name;
        row.addEventListener("click", () => onSelect(item));
        container.appendChild(row);
    });
}

function initDropdownSync() {
    const calamitySingle = document.getElementById("calamityBarangay");
    const incident = document.getElementById("incidentBarangay");

    calamitySingle?.addEventListener("change", () => {
        const barangay = barangays.find((b) => String(b.id) === calamitySingle.value);
        if (barangay) renderSingleSelectedBarangay(barangay);
    });

    incident?.addEventListener("change", () => {
        const barangay = barangays.find((b) => String(b.id) === incident.value);
        if (barangay) {
            const input = document.getElementById("incidentBarangayInput");
            if (input) input.value = barangay.name;
        }
    });
}

function initGlobalSearchPickerClose() {
    document.addEventListener("click", (e) => {
        const singleWrapper = document.getElementById("singleBarangayWrapper");
        const multiWrapper = document.getElementById("multiBarangayWrapper");
        const incidentWrapper = document.querySelector("#incidentModal .dm-picker-block");

        if (singleWrapper && !singleWrapper.contains(e.target)) {
            hideSearchResults("calamityBarangayResults");
        }

        if (multiWrapper && !multiWrapper.contains(e.target)) {
            hideSearchResults("calamityBarangaysResults");
        }

        if (incidentWrapper && !incidentWrapper.contains(e.target)) {
            hideSearchResults("incidentBarangayResults");
        }
    });
}

function openEditCalamityModal(calamity) {
    const latestCalamity = calamities.find(c => c.id === calamity.id);
    if (!latestCalamity) {
        showMessage("This calamity no longer exists.", "error");
        closeModal("viewEventModal");
        clearEditingState();
        return;
    }

    editMode = true;
    editingEventId = latestCalamity.id;
    editingEventType = "calamity";

    const header = document.querySelector("#calamityModal .modal-header h3");
    if (header) header.textContent = "Edit Calamity";

    const typeSelect = document.getElementById("calamityTypeSelect");
    const typeOther = document.getElementById("calamityTypeOther");
    const eventName = document.getElementById("calamityEventName");
    const areaType = document.getElementById("calamityAffectedAreaType");

    if (typeSelect) {
        typeSelect.value = CALAMITY_TYPES.includes(latestCalamity.type) ? latestCalamity.type : "Others";
    }

    if (!CALAMITY_TYPES.includes(latestCalamity.type)) {
        typeOther?.classList.remove("hidden");
        if (typeOther) typeOther.value = latestCalamity.type || "";
    } else {
        typeOther?.classList.add("hidden");
        if (typeOther) typeOther.value = "";
    }

    if (eventName) eventName.value = latestCalamity.eventName || "";
    if (areaType) areaType.value = latestCalamity.affectedAreaType || "BARANGAY";
    document.getElementById("calamitySeverity").value = latestCalamity.severity || "";
    document.getElementById("calamityDate").value = latestCalamity.date || "";
    document.getElementById("calamityDamageCost").value = latestCalamity.damageCost ?? "";
    document.getElementById("calamityCasualties").value = latestCalamity.casualties ?? "";
    document.getElementById("calamityDescription").value = latestCalamity.description || "";
    document.getElementById("calamityCoordinator").value = latestCalamity.coordinatorId || "";

    areaType?.dispatchEvent(new Event("change"));

    const singleBarangayId =
        latestCalamity.barangayId ??
        latestCalamity.primaryBarangayId ??
        null;

    if (latestCalamity.affectedAreaType === "BARANGAY" && singleBarangayId) {
        const barangay = barangays.find(b => String(b.id) === String(singleBarangayId));
        if (barangay) {
            renderSingleSelectedBarangay(barangay);
        }
    } else {
        renderSingleSelectedBarangay(null);
    }

    if (latestCalamity.affectedAreaType === "MULTI_BARANGAY" && Array.isArray(latestCalamity.affectedBarangayIds)) {
        selectedMultiBarangays = barangays.filter(b =>
            latestCalamity.affectedBarangayIds.some(id => String(id) === String(b.id))
        );
        renderSelectedMultiBarangays();
    } else {
        selectedMultiBarangays = [];
        renderSelectedMultiBarangays();
    }

    closeModal("viewEventModal");
    openModal("calamityModal");
}

function openEditIncidentModal(incident) {
    const latestIncident = incidents.find(i => i.id === incident.id);
    if (!latestIncident) {
        showMessage("This incident no longer exists.", "error");
        closeModal("viewEventModal");
        clearEditingState();
        return;
    }

    editMode = true;
    editingEventId = latestIncident.id;
    editingEventType = "incident";

    const header = document.querySelector("#incidentModal .modal-header h3");
    if (header) header.textContent = "Edit Incident";

    const typeSelect = document.getElementById("incidentTypeSelect");
    const typeOther = document.getElementById("incidentTypeOther");

    if (typeSelect) {
        typeSelect.value = INCIDENT_TYPES.includes(latestIncident.type) ? latestIncident.type : "Others";
    }

    if (!INCIDENT_TYPES.includes(latestIncident.type)) {
        typeOther?.classList.remove("hidden");
        if (typeOther) typeOther.value = latestIncident.type || "";
    } else {
        typeOther?.classList.add("hidden");
        if (typeOther) typeOther.value = "";
    }

    document.getElementById("incidentSeverity").value = latestIncident.severity || "";
    document.getElementById("incidentDescription").value = latestIncident.description || "";
    document.getElementById("incidentResponder").value = latestIncident.assignedResponderId || "";

    if (latestIncident.barangayId) {
        const barangay = barangays.find(b => String(b.id) === String(latestIncident.barangayId));
        if (barangay) {
            document.getElementById("incidentBarangay").value = String(barangay.id);
            document.getElementById("incidentBarangayInput").value = barangay.name;
        }
    } else {
        document.getElementById("incidentBarangay").value = "";
        document.getElementById("incidentBarangayInput").value = "";
    }

    closeModal("viewEventModal");
    openModal("incidentModal");
}

function initManageEventButtons() {
    document.getElementById("editEventBtn")?.addEventListener("click", async () => {
        if (!selectedEvent || !selectedEventType || !canManageEvents()) return;

        try {
            if (selectedEventType === "calamity") {
                await loadCalamities();

                const latestCalamity = calamities.find(
                    c => String(c.id) === String(selectedEvent.id)
                );

                if (!latestCalamity) {
                    showMessage("This calamity no longer exists.", "error");
                    closeModal("viewEventModal");
                    selectedEvent = null;
                    selectedEventType = null;
                    renderEventProfile();
                    return;
                }

                selectedEvent = latestCalamity;
                openEditCalamityModal(latestCalamity);
            } else {
                await loadIncidents();

                const latestIncident = incidents.find(
                    i => String(i.id) === String(selectedEvent.id)
                );

                if (!latestIncident) {
                    showMessage("This incident no longer exists.", "error");
                    closeModal("viewEventModal");
                    selectedEvent = null;
                    selectedEventType = null;
                    renderEventProfile();
                    return;
                }

                selectedEvent = latestIncident;
                openEditIncidentModal(latestIncident);
            }
        } catch (error) {
            console.error("Error preparing edit event:", error);
            showMessage(extractErrorMessage(error), "error");
        }
    });

    document.getElementById("deleteEventBtn")?.addEventListener("click", async () => {
        if (!selectedEvent || !selectedEventType || !canManageEvents()) return;

        const confirmed = window.confirm("Are you sure you want to delete this event?");
        if (!confirmed) return;

        try {
            if (selectedEventType === "calamity") {
                await loadCalamities();

                const latestCalamity = calamities.find(
                    c => String(c.id) === String(selectedEvent.id)
                );

                if (!latestCalamity) {
                    showMessage("This calamity no longer exists.", "error");
                    closeModal("viewEventModal");
                    selectedEvent = null;
                    selectedEventType = null;
                    renderEventProfile();
                    return;
                }

                await apiRequest(`${API_BASE}/calamities/${latestCalamity.id}`, {
                    method: "DELETE"
                });

                await loadCalamities();
            } else {
                await loadIncidents();

                const latestIncident = incidents.find(
                    i => String(i.id) === String(selectedEvent.id)
                );

                if (!latestIncident) {
                    showMessage("This incident no longer exists.", "error");
                    closeModal("viewEventModal");
                    selectedEvent = null;
                    selectedEventType = null;
                    renderEventProfile();
                    return;
                }

                await apiRequest(`${API_BASE}/incidents/${latestIncident.id}`, {
                    method: "DELETE"
                });

                await loadIncidents();
            }

            closeModal("viewEventModal");
            selectedEvent = null;
            selectedEventType = null;

            renderEventProfile();
            renderCurrentTab();

            showMessage("Event deleted successfully.", "success");
        } catch (error) {
            console.error("Error deleting event:", error);
            showMessage(extractErrorMessage(error), "error");
        }
    });
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

    document.getElementById("calamityModal")?.addEventListener("click", (e) => {
        if (e.target.id === "calamityModal") {
            closeModal("calamityModal");
            resetCalamityForm();
        }
    });

    document.getElementById("incidentModal")?.addEventListener("click", (e) => {
        if (e.target.id === "incidentModal") {
            closeModal("incidentModal");
            resetIncidentForm();
        }
    });

    document.getElementById("viewEventModal")?.addEventListener("click", (e) => {
        if (e.target.id === "viewEventModal") {
            closeModal("viewEventModal");
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;

        const calamityModal = document.getElementById("calamityModal");
        const incidentModal = document.getElementById("incidentModal");
        const viewEventModal = document.getElementById("viewEventModal");

        if (calamityModal?.classList.contains("active")) {
            closeModal("calamityModal");
            resetCalamityForm();
        }

        if (incidentModal?.classList.contains("active")) {
            closeModal("incidentModal");
            resetIncidentForm();
        }

        if (viewEventModal?.classList.contains("active")) {
            closeModal("viewEventModal");
        }
    });
}


function initLibraryAddButton() {
    const addBtn = document.getElementById("openLibraryModalBtn");
    if (!addBtn) return;

    addBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        clearEditingState();

        if (activeTab === "calamities") {
            resetCalamityForm();
            openModal("calamityModal");
        } else {
            resetIncidentForm();
            openModal("incidentModal");
        }
    });
}


function initViewModalButtons() {
    document.getElementById("openViewEventModalBtn")?.addEventListener("click", () => {
        openViewEventModal();
    });
}

function initTabHandlers() {
    document.getElementById("tabCalamities")?.addEventListener("click", () => {
        activeTab = "calamities";
        renderCurrentTab();

        if (selectedEventType !== "calamity") {
            selectedEvent = null;
            selectedEventType = null;
            renderEventProfile();
        }
    });

    document.getElementById("tabIncidents")?.addEventListener("click", () => {
        activeTab = "incidents";
        renderCurrentTab();

        if (selectedEventType !== "incident") {
            selectedEvent = null;
            selectedEventType = null;
            renderEventProfile();
        }
    });
}

function initFilterHandler() {
    document.getElementById("eventFilter")?.addEventListener("input", () => {
        renderCurrentTab();
    });
}

function initSortHandler() {
    document.getElementById("eventSort")?.addEventListener("change", () => {
        renderCurrentTab();
    });
}

function initTypeControls() {
    populateTypeSelect("calamityTypeSelect", CALAMITY_TYPES);
    populateTypeSelect("incidentTypeSelect", INCIDENT_TYPES);

    setupOtherTypeToggle("calamityTypeSelect", "calamityTypeOther");
    setupOtherTypeToggle("incidentTypeSelect", "incidentTypeOther");
}

function initTyphoonFieldToggle() {
    const typeSelect = document.getElementById("calamityTypeSelect");
    const wrapper = document.getElementById("typhoonNameWrapper");
    const input = document.getElementById("calamityEventName");

    if (!typeSelect || !wrapper || !input) return;

    const toggle = () => {
        const selectedType = getSelectedType("calamityTypeSelect", "calamityTypeOther");
        if (selectedType.toUpperCase() === "TYPHOON") {
            wrapper.classList.remove("hidden");
            input.required = true;
        } else {
            wrapper.classList.add("hidden");
            input.required = false;
            input.value = "";
        }
    };

    typeSelect.addEventListener("change", toggle);
    document.getElementById("calamityTypeOther")?.addEventListener("input", toggle);
    toggle();
}

function initAffectedAreaTypeToggle() {
    const areaTypeSelect = document.getElementById("calamityAffectedAreaType");
    const singleWrapper = document.getElementById("singleBarangayWrapper");
    const multiWrapper = document.getElementById("multiBarangayWrapper");

    if (!areaTypeSelect || !singleWrapper || !multiWrapper) return;

    const toggle = () => {
        const value = areaTypeSelect.value;

        if (value === "BARANGAY") {
            singleWrapper.classList.remove("hidden");
            multiWrapper.classList.add("hidden");
        } else if (value === "MULTI_BARANGAY") {
            singleWrapper.classList.add("hidden");
            multiWrapper.classList.remove("hidden");
        } else if (value === "MUNICIPALITY") {
            singleWrapper.classList.add("hidden");
            multiWrapper.classList.add("hidden");
            selectedMultiBarangays = [];
            renderSelectedMultiBarangays();
        } else {
            singleWrapper.classList.remove("hidden");
            multiWrapper.classList.add("hidden");
        }
    };

    areaTypeSelect.addEventListener("change", toggle);
    toggle();
}

function getSelectedMultiBarangayIds() {
    return selectedMultiBarangays.map((barangay) => barangay.id);
}

function initFormHandlers() {
    const calamityForm = document.getElementById("calamityForm");
    if (calamityForm) {
        calamityForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            try {
                const wasEditMode = editMode;
                const currentEditingId = editingEventId;
                const currentEditingType = editingEventType;

                const affectedAreaType = document.getElementById("calamityAffectedAreaType").value;
                const type = getSelectedType("calamityTypeSelect", "calamityTypeOther");
                const eventName = document.getElementById("calamityEventName").value.trim();
                const barangayIdValue = document.getElementById("calamityBarangay")?.value || "";

                const payload = {
                    type,
                    eventName: type.toUpperCase() === "TYPHOON" ? eventName : null,
                    affectedAreaType,
                    barangayId: affectedAreaType === "BARANGAY" && barangayIdValue
                        ? Number(barangayIdValue)
                        : null,
                    barangayIds: affectedAreaType === "MULTI_BARANGAY"
                        ? getSelectedMultiBarangayIds()
                        : [],
                    coordinatorId: document.getElementById("calamityCoordinator").value
                        ? Number(document.getElementById("calamityCoordinator").value)
                        : null,
                    severity: document.getElementById("calamitySeverity").value,
                    date: document.getElementById("calamityDate").value,
                    damageCost: Number(document.getElementById("calamityDamageCost").value),
                    casualties: Number(document.getElementById("calamityCasualties").value),
                    description: document.getElementById("calamityDescription").value.trim()
                };

                const validEditId =
                    wasEditMode &&
                    currentEditingType === "calamity" &&
                    Number.isInteger(Number(currentEditingId)) &&
                    Number(currentEditingId) > 0;

                const endpoint = validEditId
                    ? `${API_BASE}/calamities/${Number(currentEditingId)}`
                    : `${API_BASE}/calamities`;

                const method = validEditId ? "PUT" : "POST";

                console.log("Calamity save mode", {
                    editMode: wasEditMode,
                    editingEventId: currentEditingId,
                    editingEventType: currentEditingType,
                    validEditId,
                    endpoint,
                    method
                });

                const savedCalamity = await apiRequest(endpoint, {
                    method,
                    body: JSON.stringify(payload)
                });

                closeModal("calamityModal");
                resetCalamityForm();
                await loadCalamities();

                activeTab = "calamities";
                selectedEventType = "calamity";

                if (savedCalamity?.id) {
                    selectedEvent = calamities.find(c => String(c.id) === String(savedCalamity.id)) || savedCalamity;
                } else {
                    selectedEvent = sortEvents(calamities, "calamity")[0] || null;
                }

                renderCurrentTab();
                renderEventProfile();
                showMessage(validEditId ? "Calamity updated successfully." : "Calamity record saved successfully.", "success");
            } catch (error) {
                console.error("Error saving calamity:", error);
                showMessage(extractErrorMessage(error), "error");
            }
        });
    }

    const incidentForm = document.getElementById("incidentForm");
    if (incidentForm) {
        incidentForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            try {
                const wasEditMode = editMode;
                const currentEditingId = editingEventId;
                const currentEditingType = editingEventType;

                const payload = {
                    type: getSelectedType("incidentTypeSelect", "incidentTypeOther"),
                    barangayId: Number(document.getElementById("incidentBarangay").value),
                    assignedResponderId: document.getElementById("incidentResponder").value
                        ? Number(document.getElementById("incidentResponder").value)
                        : null,
                    severity: document.getElementById("incidentSeverity").value,
                    description: document.getElementById("incidentDescription").value.trim()
                };

                const validEditId =
                    wasEditMode &&
                    currentEditingType === "incident" &&
                    Number.isInteger(Number(currentEditingId)) &&
                    Number(currentEditingId) > 0;

                const endpoint = validEditId
                    ? `${API_BASE}/incidents/${Number(currentEditingId)}`
                    : `${API_BASE}/incidents`;

                const method = validEditId ? "PUT" : "POST";

                console.log("Incident save mode", {
                    editMode: wasEditMode,
                    editingEventId: currentEditingId,
                    editingEventType: currentEditingType,
                    validEditId,
                    endpoint,
                    method
                });

                const savedIncident = await apiRequest(endpoint, {
                    method,
                    body: JSON.stringify(payload)
                });

                closeModal("incidentModal");
                resetIncidentForm();
                await loadIncidents();

                activeTab = "incidents";
                selectedEventType = "incident";

                if (savedIncident?.id) {
                    selectedEvent = incidents.find(i => String(i.id) === String(savedIncident.id)) || savedIncident;
                } else {
                    selectedEvent = sortEvents(incidents, "incident")[0] || null;
                }

                renderCurrentTab();
                renderEventProfile();
                showMessage(validEditId ? "Incident updated successfully." : "Incident record saved successfully.", "success");
            } catch (error) {
                console.error("Error saving incident:", error);
                showMessage(extractErrorMessage(error), "error");
            }
        });
    }
}

async function initDisasterManagementPage() {
    if (!localStorage.getItem("jwtToken")) {
        window.location.href = "login.html";
        return;
    }

    try {
        currentUserRoles = getCurrentUserRoles();

        initModalButtons();
        initLibraryAddButton();
        initViewModalButtons();
        initManageEventButtons();
        initTabHandlers();
        initFilterHandler();
        initSortHandler();
        initTypeControls();
        initTyphoonFieldToggle();
        initAffectedAreaTypeToggle();

        initPickerInput(
            "calamityBarangayInput",
            "calamityBarangayResults",
            "single",
            selectSingleBarangay,
            "calamityBarangayToggle"
        );

        initPickerInput(
            "calamityBarangaysInput",
            "calamityBarangaysResults",
            "multi",
            addMultiBarangay,
            "calamityBarangaysToggle",
            () => selectedMultiBarangays.map((b) => b.id)
        );

        initPickerInput(
            "incidentBarangayInput",
            "incidentBarangayResults",
            "incident",
            selectIncidentBarangay,
            "incidentBarangayToggle"
        );

        initDropdownSync();
        initGlobalSearchPickerClose();
        initFormHandlers();

        await loadBarangays();
        await loadCoordinators();
        await loadResponders();
        await loadCalamities();
        await loadIncidents();

        renderCurrentTab();
        renderEventProfile();
    } catch (error) {
        console.error("Error initializing disaster management page:", error);
        alert("Failed to load disaster management data.");
    }
}

document.addEventListener("DOMContentLoaded", initDisasterManagementPage);