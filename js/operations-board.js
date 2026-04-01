const INCIDENT_STATUSES = ["ONGOING", "IN_PROGRESS", "ON_SITE", "RESOLVED"];
const CALAMITY_STATUSES = ["ACTIVE", "MONITORING", "RESOLVED", "ENDED"];

const BOARD_MODES = {
    INCIDENTS: "INCIDENTS",
    CALAMITIES: "CALAMITIES"
};

let currentBoardMode = BOARD_MODES.INCIDENTS;

let incidentBoardData = [];
let calamityBoardData = [];

let currentSelection = {
    type: null,
    data: null
};

let draggedCardContext = null;

/* ===================================
   Board Mode / Sections
   =================================== */

function initBoardModeToggle() {
    const incidentBtn = document.getElementById("incidentModeBtn");
    const calamityBtn = document.getElementById("calamityModeBtn");

    incidentBtn?.addEventListener("click", () => setBoardMode(BOARD_MODES.INCIDENTS));
    calamityBtn?.addEventListener("click", () => setBoardMode(BOARD_MODES.CALAMITIES));

    mountBoardModeToggle();
}

function mountBoardModeToggle() {
    const toggle = document.getElementById("boardModeToggle");
    if (!toggle) return;

    ["incidentBoardSection", "calamityBoardSection"].forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (!section) return;

        let topbar = section.querySelector(".board-section-topbar");
        if (!topbar) {
            topbar = document.createElement("div");
            topbar.className = "board-section-topbar";
            section.prepend(topbar);
        }
    });

    const activeSectionId = currentBoardMode === BOARD_MODES.CALAMITIES ? "calamityBoardSection" : "incidentBoardSection";
    document.getElementById(activeSectionId)?.querySelector(".board-section-topbar")?.appendChild(toggle);
}

function setBoardMode(mode) {
    currentBoardMode = mode;

    document.getElementById("incidentModeBtn")?.classList.toggle("active", mode === BOARD_MODES.INCIDENTS);
    document.getElementById("calamityModeBtn")?.classList.toggle("active", mode === BOARD_MODES.CALAMITIES);

    document.getElementById("incidentBoardSection")?.classList.toggle("hidden", mode !== BOARD_MODES.INCIDENTS);
    document.getElementById("calamityBoardSection")?.classList.toggle("hidden", mode !== BOARD_MODES.CALAMITIES);

    document.getElementById("incidentFilters")?.classList.toggle("hidden", mode !== BOARD_MODES.INCIDENTS);
    document.getElementById("calamityFilters")?.classList.toggle("hidden", mode !== BOARD_MODES.CALAMITIES);

    mountBoardModeToggle();
}

/* ===================================
   Data Load
   =================================== */

async function loadIncidentBoard() {
    try {
        const incidents = await apiRequest(`${window.APP_CONFIG.API_BASE}/incidents`);
        incidentBoardData = Array.isArray(incidents) ? incidents : [];
        applyIncidentFilters();
    } catch (error) {
        console.error("Error loading incident board:", error);
        showToastSafe("Failed to load incidents.", "error");
    }
}

async function loadCalamityBoard() {
    try {
        const calamities = await apiRequest(`${window.APP_CONFIG.API_BASE}/calamities`);
        calamityBoardData = Array.isArray(calamities) ? calamities : [];
        applyCalamityFilters();
    } catch (error) {
        console.error("Error loading calamity board:", error);
        showToastSafe("Failed to load calamities.", "error");
    }
}

/* ===================================
   Filters
   =================================== */

function initBoardFilters() {
    const incidentIds = [
        "incidentSearchInput",
        "incidentSeverityFilter",
        "incidentBarangayFilter",
        "incidentResponderFilter"
    ];

    incidentIds.forEach(id => {
        document.getElementById(id)?.addEventListener("input", applyIncidentFilters);
        document.getElementById(id)?.addEventListener("change", applyIncidentFilters);
    });

    const calamityIds = [
        "calamitySearchInput",
        "calamitySeverityFilter",
        "calamityAreaTypeFilter"
    ];

    calamityIds.forEach(id => {
        document.getElementById(id)?.addEventListener("input", applyCalamityFilters);
        document.getElementById(id)?.addEventListener("change", applyCalamityFilters);
    });
}

function applyIncidentFilters() {
    const keyword = (document.getElementById("incidentSearchInput")?.value || "").trim().toLowerCase();
    const severity = (document.getElementById("incidentSeverityFilter")?.value || "").trim().toUpperCase();
    const barangay = (document.getElementById("incidentBarangayFilter")?.value || "").trim().toLowerCase();
    const responder = (document.getElementById("incidentResponderFilter")?.value || "").trim().toLowerCase();

    const filtered = incidentBoardData.filter(incident => {
        const incidentSeverity = String(incident.severity || "").toUpperCase();
        const searchable = [
            incident.type,
            incident.barangay,
            incident.severity,
            incident.status,
            incident.description,
            incident.assignedResponderName
        ].filter(Boolean).join(" ").toLowerCase();

        const matchKeyword = !keyword || searchable.includes(keyword);
        const matchSeverity = !severity || incidentSeverity === severity;
        const matchBarangay = !barangay || String(incident.barangay || "").toLowerCase().includes(barangay);
        const matchResponder = !responder || String(incident.assignedResponderName || "").toLowerCase().includes(responder);

        return matchKeyword && matchSeverity && matchBarangay && matchResponder;
    });

    renderIncidentBoard(filtered);
}

function applyCalamityFilters() {
    const keyword = (document.getElementById("calamitySearchInput")?.value || "").trim().toLowerCase();
    const severity = (document.getElementById("calamitySeverityFilter")?.value || "").trim().toUpperCase();
    const areaType = (document.getElementById("calamityAreaTypeFilter")?.value || "").trim().toUpperCase();

    const filtered = calamityBoardData.filter(calamity => {
        const calamitySeverity = String(calamity.severity || "").toUpperCase();
        const calamityAreaType = String(calamity.affectedAreaType || "").toUpperCase();

        const searchable = [
            calamity.type,
            calamity.eventName,
            calamity.status,
            calamity.description,
            calamity.primaryBarangayName,
            ...(calamity.affectedBarangayNames || [])
        ].filter(Boolean).join(" ").toLowerCase();

        const matchKeyword = !keyword || searchable.includes(keyword);
        const matchSeverity = !severity || calamitySeverity === severity;
        const matchAreaType = !areaType || calamityAreaType === areaType;

        return matchKeyword && matchSeverity && matchAreaType;
    });

    renderCalamityBoard(filtered);
}

/* ===================================
   Render Incident Board
   =================================== */

function renderIncidentBoard(items) {
    clearIncidentColumns();

    const ordered = applyBoardOrdering("INCIDENT", items);

    INCIDENT_STATUSES.forEach(status => {
        const byStatus = ordered.filter(item => String(item.status || "").toUpperCase() === status);
        const visible = filterVisibleBoardCards("INCIDENT", byStatus);

        visible.forEach(incident => {
            const card = createIncidentCard(incident);
            getIncidentColumn(status)?.appendChild(card);
        });

        updateIncidentCount(status, byStatus.length);
    });

    restoreActiveSelectionVisual();
}

function clearIncidentColumns() {
    INCIDENT_STATUSES.forEach(status => {
        const column = getIncidentColumn(status);
        if (column) column.innerHTML = "";
    });
}

function getIncidentColumn(status) {
    switch (status) {
        case "ONGOING": return document.getElementById("incidentOngoingColumn");
        case "IN_PROGRESS": return document.getElementById("incidentInProgressColumn");
        case "ON_SITE": return document.getElementById("incidentOnSiteColumn");
        case "RESOLVED": return document.getElementById("incidentResolvedColumn");
        default: return null;
    }
}

function updateIncidentCount(status, count) {
    switch (status) {
        case "ONGOING":
            setElementText("incidentCountOngoing", count);
            break;
        case "IN_PROGRESS":
            setElementText("incidentCountInProgress", count);
            break;
        case "ON_SITE":
            setElementText("incidentCountOnSite", count);
            break;
        case "RESOLVED":
            setElementText("incidentCountResolved", count);
            break;
    }
}

function createIncidentCard(incident) {
    const card = document.createElement("div");
    card.className = "board-card";
    card.draggable = true;
    card.dataset.id = incident.id;
    card.dataset.type = "INCIDENT";
    card.dataset.status = String(incident.status || "").toUpperCase();

    const severityClass = getSeverityClassSafe(incident.severity);

    card.innerHTML = `
        <div class="board-card-header">
            <div class="board-card-title">${escapeHtml(incident.type || "-")}</div>
            ${typeof buildIncidentCardMenu === "function" ? buildIncidentCardMenu(incident) : ""}
        </div>

        <div class="board-card-meta">
            <div class="board-card-meta-row">
                <span class="severity-badge ${severityClass}">${escapeHtml(incident.severity || "-")}</span>
            </div>
            <div class="board-card-meta-row"><strong>Barangay:</strong> ${escapeHtml(incident.barangay || "-")}</div>
            <div class="board-card-meta-row"><strong>Status:</strong> ${escapeHtml(incident.status || "-")}</div>
            <div class="board-card-meta-row"><strong>Responder:</strong> ${escapeHtml(incident.assignedResponderName || "-")}</div>
        </div>
    `;

    card.addEventListener("click", event => {
        const clickedMenu = event.target.closest(".board-card-menu-wrapper");
        if (clickedMenu) return;
        selectIncidentCard(incident, card);
    });

    card.addEventListener("dragstart", event => handleCardDragStart(event, "INCIDENT", incident));
    card.addEventListener("dragend", handleCardDragEnd);

    if (typeof initCardMenuEvents === "function") {
        initCardMenuEvents(card, "INCIDENT", incident);
    }

    if (isCurrentSelection("INCIDENT", incident.id)) {
        card.classList.add("active");
    }

    return card;
}

/* ===================================
   Render Calamity Board
   =================================== */

function renderCalamityBoard(items) {
    clearCalamityColumns();

    const ordered = applyBoardOrdering("CALAMITY", items);

    CALAMITY_STATUSES.forEach(status => {
        const byStatus = ordered.filter(item => String(item.status || "").toUpperCase() === status);
        const visible = filterVisibleBoardCards("CALAMITY", byStatus);

        visible.forEach(calamity => {
            const card = createCalamityCard(calamity);
            getCalamityColumn(status)?.appendChild(card);
        });

        updateCalamityCount(status, byStatus.length);
    });

    restoreActiveSelectionVisual();
}

function clearCalamityColumns() {
    CALAMITY_STATUSES.forEach(status => {
        const column = getCalamityColumn(status);
        if (column) column.innerHTML = "";
    });
}

function getCalamityColumn(status) {
    switch (status) {
        case "ACTIVE": return document.getElementById("calamityActiveColumn");
        case "MONITORING": return document.getElementById("calamityMonitoringColumn");
        case "RESOLVED": return document.getElementById("calamityResolvedColumn");
        case "ENDED": return document.getElementById("calamityEndedColumn");
        default: return null;
    }
}

function updateCalamityCount(status, count) {
    switch (status) {
        case "ACTIVE":
            setElementText("calamityCountActive", count);
            break;
        case "MONITORING":
            setElementText("calamityCountMonitoring", count);
            break;
        case "RESOLVED":
            setElementText("calamityCountResolved", count);
            break;
        case "ENDED":
            setElementText("calamityCountEnded", count);
            break;
    }
}

function createCalamityCard(calamity) {
    const card = document.createElement("div");
    card.className = "board-card";
    card.draggable = true;
    card.dataset.id = calamity.id;
    card.dataset.type = "CALAMITY";
    card.dataset.status = String(calamity.status || "").toUpperCase();

    const severityClass = getSeverityClassSafe(calamity.severity);
    const area = getSafeCalamityArea(calamity);

    card.innerHTML = `
        <div class="board-card-header">
            <div class="board-card-title">${escapeHtml(calamity.type || calamity.calamityName || "-")}</div>
            ${typeof buildCalamityCardMenu === "function" ? buildCalamityCardMenu(calamity) : ""}
        </div>

        <div class="board-card-meta">
            <div class="board-card-meta-row">
                <span class="severity-badge ${severityClass}">${escapeHtml(calamity.severity || "-")}</span>
            </div>
            <div class="board-card-meta-row"><strong>Area:</strong> ${escapeHtml(area)}</div>
            <div class="board-card-meta-row"><strong>Status:</strong> ${escapeHtml(calamity.status || "-")}</div>
            <div class="board-card-meta-row"><strong>Coordinator:</strong> ${escapeHtml(calamity.coordinatorName || "-")}</div>
        </div>
    `;

    card.addEventListener("click", event => {
        const clickedMenu = event.target.closest(".board-card-menu-wrapper");
        if (clickedMenu) return;
        selectCalamityCard(calamity, card);
    });

    card.addEventListener("dragstart", event => handleCardDragStart(event, "CALAMITY", calamity));
    card.addEventListener("dragend", handleCardDragEnd);

    if (typeof initCardMenuEvents === "function") {
        initCardMenuEvents(card, "CALAMITY", calamity);
    }

    if (isCurrentSelection("CALAMITY", calamity.id)) {
        card.classList.add("active");
    }

    return card;
}

/* ===================================
   Selection / Drawer
   =================================== */

function selectIncidentCard(incident, cardElement) {
    currentSelection = { type: "INCIDENT", data: incident };
    clearCardSelections();
    cardElement?.classList.add("active");

    if (typeof loadOperationsDrawer === "function") {
        loadOperationsDrawer("INCIDENT", incident);
    }
    if (typeof renderSelectedOperationMap === "function") {
        renderSelectedOperationMap("INCIDENT", incident);
    }
}

function selectCalamityCard(calamity, cardElement) {
    currentSelection = { type: "CALAMITY", data: calamity };
    clearCardSelections();
    cardElement?.classList.add("active");

    if (typeof loadOperationsDrawer === "function") {
        loadOperationsDrawer("CALAMITY", calamity);
    }
    if (typeof renderSelectedOperationMap === "function") {
        renderSelectedOperationMap("CALAMITY", calamity);
    }
}

function clearCurrentSelection() {
    currentSelection = { type: null, data: null };
    clearCardSelections();

    if (typeof resetOperationsDrawer === "function") {
        resetOperationsDrawer();
    }

    if (typeof closeOperationsDrawer === "function") {
        closeOperationsDrawer();
    }

    if (typeof resetOperationsMap === "function") {
        resetOperationsMap();
    }
}

function clearCardSelections() {
    document.querySelectorAll(".board-card.active").forEach(card => {
        card.classList.remove("active");
    });
}

function restoreActiveSelectionVisual() {
    if (!currentSelection.type || !currentSelection.data?.id) return;

    const selector = `.board-card[data-type="${currentSelection.type}"][data-id="${currentSelection.data.id}"]`;
    const card = document.querySelector(selector);
    if (card) {
        card.classList.add("active");
    }
}

function isCurrentSelection(type, id) {
    return currentSelection.type === type && Number(currentSelection.data?.id) === Number(id);
}

/* ===================================
   Drag / Drop
   =================================== */

function initDropzones() {
    document.querySelectorAll(".board-dropzone").forEach(dropzone => {
        dropzone.addEventListener("dragover", handleDropzoneDragOver);
        dropzone.addEventListener("dragleave", handleDropzoneDragLeave);
        dropzone.addEventListener("drop", handleDropzoneDrop);
    });
}

function handleCardDragStart(event, type, data) {
    draggedCardContext = {
        type,
        data
    };

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify({
        type,
        id: data.id,
        status: data.status
    }));

    event.currentTarget.classList.add("dragging");
}

function handleCardDragEnd(event) {
    event.currentTarget.classList.remove("dragging");
    clearDropzoneStates();
    draggedCardContext = null;
}

function handleDropzoneDragOver(event) {
    event.preventDefault();

    const dropzone = event.currentTarget;
    const boardType = String(dropzone.closest(".board-column")?.dataset.boardType || "").toUpperCase();
    const targetStatus = String(dropzone.closest(".board-column")?.dataset.status || "").toUpperCase();

    if (!draggedCardContext) return;

    const valid = isValidTransition(draggedCardContext.type, draggedCardContext.data.status, boardType, targetStatus);

    dropzone.classList.remove("drag-over", "drop-invalid");
    dropzone.classList.add(valid ? "drag-over" : "drop-invalid");
    event.dataTransfer.dropEffect = valid ? "move" : "none";
}

function handleDropzoneDragLeave(event) {
    event.currentTarget.classList.remove("drag-over", "drop-invalid");
}

function handleDropzoneDrop(event) {
    event.preventDefault();

    const dropzone = event.currentTarget;
    const boardType = String(dropzone.closest(".board-column")?.dataset.boardType || "").toUpperCase();
    const targetStatus = String(dropzone.closest(".board-column")?.dataset.status || "").toUpperCase();

    clearDropzoneStates();

    if (!draggedCardContext) return;

    const sourceType = draggedCardContext.type;
    const sourceData = draggedCardContext.data;
    const sourceStatus = String(sourceData.status || "").toUpperCase();

    const valid = isValidTransition(sourceType, sourceStatus, boardType, targetStatus);
    if (!valid) {
        showToastSafe("That move is not allowed.", "info");
        return;
    }

    openTransitionForDrop(sourceType, sourceData, targetStatus);
}

function clearDropzoneStates() {
    document.querySelectorAll(".board-dropzone").forEach(zone => {
        zone.classList.remove("drag-over", "drop-invalid");
    });
}

function isValidTransition(sourceType, sourceStatus, targetBoardType, targetStatus) {
    if (String(sourceType || "").toUpperCase() !== String(targetBoardType || "").toUpperCase()) {
        return false;
    }

    if (sourceType === "INCIDENT") {
        return (
            (sourceStatus === "ONGOING" && targetStatus === "IN_PROGRESS") ||
            (sourceStatus === "IN_PROGRESS" && targetStatus === "ON_SITE") ||
            (sourceStatus === "ON_SITE" && targetStatus === "RESOLVED")
        );
    }

    if (sourceType === "CALAMITY") {
        return (
            (sourceStatus === "ACTIVE" && targetStatus === "MONITORING") ||
            (sourceStatus === "MONITORING" && targetStatus === "RESOLVED") ||
            (sourceStatus === "RESOLVED" && targetStatus === "ENDED")
        );
    }

    return false;
}

function openTransitionForDrop(type, data, targetStatus) {
    if (typeof openTransitionReviewModal !== "function") {
        showToastSafe("Transition review modal is not available.", "error");
        return;
    }

    if (type === "INCIDENT") {
        if (targetStatus === "IN_PROGRESS") {
            openTransitionReviewModal({
                type: "INCIDENT",
                mode: "DISPATCH_REVIEW",
                data,
                title: "Dispatch Incident"
            });
            return;
        }

        if (targetStatus === "ON_SITE") {
            openTransitionReviewModal({
                type: "INCIDENT",
                mode: "ARRIVE_REVIEW",
                data,
                title: "Mark Incident as On-Site"
            });
            return;
        }

        if (targetStatus === "RESOLVED") {
            openTransitionReviewModal({
                type: "INCIDENT",
                mode: "RESOLVE_REVIEW",
                data,
                title: "Resolve Incident"
            });
            return;
        }
    }

    if (type === "CALAMITY") {
        if (targetStatus === "MONITORING") {
            openTransitionReviewModal({
                type: "CALAMITY",
                mode: "MONITOR_REVIEW",
                data,
                title: "Set Calamity to Monitoring"
            });
            return;
        }

        if (targetStatus === "RESOLVED") {
            openTransitionReviewModal({
                type: "CALAMITY",
                mode: "RESOLVE_REVIEW",
                data,
                title: "Resolve Calamity"
            });
            return;
        }

        if (targetStatus === "ENDED") {
            openTransitionReviewModal({
                type: "CALAMITY",
                mode: "END_REVIEW",
                data,
                title: "End Calamity"
            });
        }
    }
}

/* ===================================
   Local Order / Archive
   =================================== */

function getBoardOrderState() {
    try {
        return JSON.parse(localStorage.getItem("operationsBoardOrderState") || "{}");
    } catch {
        return {};
    }
}

function saveBoardOrderState(state) {
    localStorage.setItem("operationsBoardOrderState", JSON.stringify(state));
}

function moveBoardItem(type, status, id, mode) {
    const key = `${type}:${status}`;
    const state = getBoardOrderState();
    const current = Array.isArray(state[key]) ? [...state[key]] : [];

    const normalizedId = Number(id);
    const existing = current.filter(itemId => Number(itemId) !== normalizedId);

    if (mode === "TOP") {
        state[key] = [normalizedId, ...existing];
    } else if (mode === "UP") {
        const sourceItems = getCurrentBoardItemsByTypeAndStatus(type, status);
        const orderedIds = sourceItems.map(item => Number(item.id));

        if (!existing.length) {
            state[key] = orderedIds;
        }

        const base = Array.isArray(state[key]) ? [...state[key]] : [...orderedIds];
        const currentIndex = base.findIndex(itemId => Number(itemId) === normalizedId);

        if (currentIndex > 0) {
            [base[currentIndex - 1], base[currentIndex]] = [base[currentIndex], base[currentIndex - 1]];
        }

        state[key] = base;
    }

    saveBoardOrderState(state);

    if (type === "INCIDENT") {
        applyIncidentFilters();
    } else {
        applyCalamityFilters();
    }
}

function applyBoardOrdering(type, items) {
    const grouped = new Map();
    items.forEach(item => {
        const status = String(item.status || "").toUpperCase();
        if (!grouped.has(status)) grouped.set(status, []);
        grouped.get(status).push(item);
    });

    const state = getBoardOrderState();
    const result = [];

    grouped.forEach((groupItems, status) => {
        const key = `${type}:${status}`;
        const savedOrder = Array.isArray(state[key]) ? state[key].map(Number) : [];

        const itemMap = new Map(groupItems.map(item => [Number(item.id), item]));
        const orderedGroup = [];

        savedOrder.forEach(id => {
            if (itemMap.has(id)) {
                orderedGroup.push(itemMap.get(id));
                itemMap.delete(id);
            }
        });

        groupItems.forEach(item => {
            if (itemMap.has(Number(item.id))) {
                orderedGroup.push(item);
                itemMap.delete(Number(item.id));
            }
        });

        result.push(...orderedGroup);
    });

    return result;
}

function getCurrentBoardItemsByTypeAndStatus(type, status) {
    const source = type === "INCIDENT" ? incidentBoardData : calamityBoardData;
    return source.filter(item => String(item.status || "").toUpperCase() === String(status || "").toUpperCase());
}

function hideBoardCard(type, id) {
    const hidden = getHiddenBoardCardsSafe();
    hidden[`${type}:${id}`] = true;
    saveHiddenBoardCardsSafe(hidden);
}

function filterVisibleBoardCards(type, items) {
    const hidden = getHiddenBoardCardsSafe();
    return items.filter(item => !hidden[`${type}:${item.id}`]);
}

function getHiddenBoardCardsSafe() {
    if (typeof getHiddenBoardCards === "function") {
        return getHiddenBoardCards();
    }

    try {
        return JSON.parse(localStorage.getItem("operationsHiddenBoardCards") || "{}");
    } catch {
        return {};
    }
}

function saveHiddenBoardCardsSafe(hidden) {
    if (typeof saveHiddenBoardCards === "function") {
        saveHiddenBoardCards(hidden);
        return;
    }
    localStorage.setItem("operationsHiddenBoardCards", JSON.stringify(hidden));
}

/* ===================================
   Helpers
   =================================== */

function setElementText(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = value;
    }
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

function showToastSafe(message, type = "info") {
    if (typeof showToast === "function") {
        showToast(message, type);
    } else {
        console.log(`[${type}] ${message}`);
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