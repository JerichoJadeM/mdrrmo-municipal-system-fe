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

function populateBarangaySelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = `<option value="">Select barangay</option>`;

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
    updateSummaryCards();
    renderCurrentTab();
}

async function loadIncidents() {
    incidents = await apiRequest(`${API_BASE}/incidents`);
    updateSummaryCards();
    renderCurrentTab();
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
            calamity.barangayName,
            calamity.coordinatorName,
            calamity.severity,
            calamity.status,
            calamity.description,
            calamity.date
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

    sorted.forEach((calamity) => {
        const severityClass = getSeverityClass(calamity.severity);
        const item = document.createElement("div");
        item.className = "dm-item";

        if (selectedEventType === "calamity" && selectedEvent?.id === calamity.id) {
            item.classList.add("active");
        }

        item.innerHTML = `
            <div class="dm-item-header">
                <h4 class="dm-item-title">${calamity.type || "-"}</h4>
                <span class="severity-badge ${severityClass}">${calamity.severity || "-"}</span>
            </div>

            <div class="dm-item-meta">
                <div>
                    <strong>Barangay</strong>
                    <span>${calamity.barangayName || "-"}</span>
                </div>
                <div>
                    <strong>Status</strong>
                    <span>${calamity.status || "-"}</span>
                </div>
                <div>
                    <strong>Date</strong>
                    <span>${formatDate(calamity.date)}</span>
                </div>
            </div>

            <div class="dm-item-description">
                <strong>Description:</strong> ${calamity.description || "-"}
            </div>
        `;

        item.addEventListener("click", () => {
            selectedEvent = calamity;
            selectedEventType = "calamity";
            renderCurrentTab();
            renderEventProfile();
        });

        container.appendChild(item);
    });
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

    sorted.forEach((incident) => {
        const severityClass = getSeverityClass(incident.severity);
        const item = document.createElement("div");
        item.className = "dm-item";

        if (selectedEventType === "incident" && selectedEvent?.id === incident.id) {
            item.classList.add("active");
        }

        item.innerHTML = `
            <div class="dm-item-header">
                <h4 class="dm-item-title">${incident.type || "-"}</h4>
                <span class="severity-badge ${severityClass}">${incident.severity || "-"}</span>
            </div>

            <div class="dm-item-meta">
                <div>
                    <strong>Barangay</strong>
                    <span>${incident.barangay || "-"}</span>
                </div>
                <div>
                    <strong>Status</strong>
                    <span>${incident.status || "-"}</span>
                </div>
                <div>
                    <strong>Reported At</strong>
                    <span>${formatDateTime(incident.reportedAt)}</span>
                </div>
            </div>

            <div class="dm-item-description">
                <strong>Description:</strong> ${incident.description || "-"}
            </div>
        `;

        item.addEventListener("click", () => {
            selectedEvent = incident;
            selectedEventType = "incident";
            renderCurrentTab();
            renderEventProfile();
        });

        container.appendChild(item);
    });
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
                <strong>Barangay</strong>
                <span>${selectedEvent.barangayName || "-"}</span>
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
                <strong>Assigned Coordinator</strong>
                <span>${selectedEvent.coordinatorName || "-"}</span>
            </div>
            <div class="dm-profile-summary-item">
                <strong>Estimated Damage Cost</strong>
                <span>${formatCurrency(selectedEvent.damageCost)}</span>
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
                <strong>Barangay</strong>
                <span>${selectedEvent.barangayName || "-"}</span>
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
                <strong>Assigned Coordinator</strong>
                <span>${selectedEvent.coordinatorName || "-"}</span>
            </div>
            <div class="dm-profile-summary-item">
                <strong>Estimated Damage Cost</strong>
                <span>${formatCurrency(selectedEvent.damageCost)}</span>
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

    openModal("viewEventModal");
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.remove("active");

    const stillOpenModal = document.querySelector(".modal.active");
    if (!stillOpenModal) {
        document.body.style.overflow = "auto";
    }
}

function resetCalamityForm() {
    document.getElementById("calamityForm")?.reset();
    document.getElementById("calamityTypeOther")?.classList.add("hidden");
    document.getElementById("calamityTypeOther").required = false;
}

function resetIncidentForm() {
    document.getElementById("incidentForm")?.reset();
    document.getElementById("incidentTypeOther")?.classList.add("hidden");
    document.getElementById("incidentTypeOther").required = false;
}

function initModalButtons() {
    document.getElementById("closeCalamityModalBtn")?.addEventListener("click", () => closeModal("calamityModal"));
    document.getElementById("cancelCalamityBtn")?.addEventListener("click", () => closeModal("calamityModal"));

    document.getElementById("closeIncidentModalBtn")?.addEventListener("click", () => closeModal("incidentModal"));
    document.getElementById("cancelIncidentBtn")?.addEventListener("click", () => closeModal("incidentModal"));

    document.getElementById("closeViewEventModalBtn")?.addEventListener("click", () => closeModal("viewEventModal"));

    document.getElementById("calamityModal")?.addEventListener("click", (e) => {
        if (e.target.id === "calamityModal") closeModal("calamityModal");
    });

    document.getElementById("incidentModal")?.addEventListener("click", (e) => {
        if (e.target.id === "incidentModal") closeModal("incidentModal");
    });

    document.getElementById("viewEventModal")?.addEventListener("click", (e) => {
        if (e.target.id === "viewEventModal") closeModal("viewEventModal");
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeModal("calamityModal");
            closeModal("incidentModal");
            closeModal("viewEventModal");
        }
    });
}

function initLibraryAddButton() {
    document.getElementById("openLibraryModalBtn")?.addEventListener("click", () => {
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

function initFormHandlers() {
    const calamityForm = document.getElementById("calamityForm");
    if (calamityForm) {
        calamityForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            try {
                const payload = {
                    type: getSelectedType("calamityTypeSelect", "calamityTypeOther"),
                    barangayId: Number(document.getElementById("calamityBarangay").value),
                    coordinatorId: document.getElementById("calamityCoordinator").value
                        ? Number(document.getElementById("calamityCoordinator").value)
                        : null,
                    severity: document.getElementById("calamitySeverity").value,
                    date: document.getElementById("calamityDate").value,
                    damageCost: Number(document.getElementById("calamityDamageCost").value),
                    casualties: Number(document.getElementById("calamityCasualties").value),
                    description: document.getElementById("calamityDescription").value.trim()
                };

                const savedCalamity = await apiRequest(`${API_BASE}/calamities`, {
                    method: "POST",
                    body: JSON.stringify(payload)
                });

                closeModal("calamityModal");
                resetCalamityForm();
                await loadCalamities();

                activeTab = "calamities";
                selectedEventType = "calamity";
                selectedEvent = savedCalamity || sortEvents(calamities, "calamity")[0] || null;

                renderCurrentTab();
                renderEventProfile();
            } catch (error) {
                console.error("Error saving calamity:", error);
                alert(error.message || "Failed to save calamity.");
            }
        });
    }

    const incidentForm = document.getElementById("incidentForm");
    if (incidentForm) {
        incidentForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            try {
                const payload = {
                    type: getSelectedType("incidentTypeSelect", "incidentTypeOther"),
                    barangayId: Number(document.getElementById("incidentBarangay").value),
                    assignedResponderId: document.getElementById("incidentResponder").value
                        ? Number(document.getElementById("incidentResponder").value)
                        : null,
                    severity: document.getElementById("incidentSeverity").value,
                    description: document.getElementById("incidentDescription").value.trim()
                };

                const savedIncident = await apiRequest(`${API_BASE}/incidents`, {
                    method: "POST",
                    body: JSON.stringify(payload)
                });

                closeModal("incidentModal");
                resetIncidentForm();
                await loadIncidents();

                activeTab = "incidents";
                selectedEventType = "incident";
                selectedEvent = savedIncident || sortEvents(incidents, "incident")[0] || null;

                renderCurrentTab();
                renderEventProfile();
            } catch (error) {
                console.error("Error saving incident:", error);
                alert(error.message || "Failed to save incident.");
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
        initModalButtons();
        initLibraryAddButton();
        initViewModalButtons();
        initTabHandlers();
        initFilterHandler();
        initSortHandler();
        initTypeControls();
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