function getIncidentColumnId(status) {
    const map = {
        ONGOING: "incidentOngoingColumn",
        IN_PROGRESS: "incidentInProgressColumn",
        ON_SITE: "incidentOnSiteColumn",
        RESOLVED: "incidentResolvedColumn"
    };
    return map[status];
}

function getCalamityColumnId(status) {
    const map = {
        ACTIVE: "calamityActiveColumn",
        MONITORING: "calamityMonitoringColumn",
        RESOLVED: "calamityResolvedColumn",
        ENDED: "calamityEndedColumn"
    };
    return map[status];
}

function getHiddenBoardCards() {
    try {
        return JSON.parse(localStorage.getItem("operationsHiddenBoardCards") || "{}");
    } catch {
        return {};
    }
}

function saveHiddenBoardCards(data) {
    localStorage.setItem("operationsHiddenBoardCards", JSON.stringify(data));
}

function getBoardCardKey(type, id) {
    return `${type}:${id}`;
}

function isBoardCardHidden(type, id) {
    const hidden = getHiddenBoardCards();
    return !!hidden[getBoardCardKey(type, id)];
}

function hideBoardCard(type, id) {
    const hidden = getHiddenBoardCards();
    hidden[getBoardCardKey(type, id)] = true;
    saveHiddenBoardCards(hidden);
}

function getHiddenCardsByType(type) {
    const hidden = getHiddenBoardCards();
    const items = type === "INCIDENT" ? incidentBoardData : calamityBoardData;

    return items.filter(item => hidden[getBoardCardKey(type, item.id)]);
}

function restoreHiddenCardsByType(type) {
    const hidden = getHiddenBoardCards();
    let changed = false;

    Object.keys(hidden).forEach(key => {
        if (key.startsWith(`${type}:`)) {
            delete hidden[key];
            changed = true;
        }
    });

    if (changed) {
        saveHiddenBoardCards(hidden);
    }

    return changed;
}

function clearArchiveByType(type) {
    const hidden = getHiddenBoardCards();
    const orderState = getBoardOrderState();

    let changed = false;

    Object.keys(hidden).forEach(key => {
        if (key.startsWith(`${type}:`)) {
            delete hidden[key];
            changed = true;
        }
    });

    Object.keys(orderState).forEach(key => {
        if (key.startsWith(`${type}:`)) {
            delete orderState[key];
            changed = true;
        }
    });

    if (changed) {
        saveHiddenBoardCards(hidden);
        saveBoardOrderState(orderState);
    }

    return changed;
}

function getBoardOrderState() {
    try {
        return JSON.parse(localStorage.getItem("operationsBoardOrder") || "{}");
    } catch {
        return {};
    }
}

function saveBoardOrderState(data) {
    localStorage.setItem("operationsBoardOrder", JSON.stringify(data));
}

function getOrderKey(type, status) {
    return `${type}:${status}`;
}

function applyColumnOrder(type, status, items) {
    const orderState = getBoardOrderState();
    const orderKey = getOrderKey(type, status);
    const storedOrder = orderState[orderKey] || [];

    const itemMap = new Map(items.map(item => [String(item.id), item]));

    const ordered = [];

    storedOrder.forEach(id => {
        const found = itemMap.get(String(id));
        if (found) {
            ordered.push(found);
            itemMap.delete(String(id));
        }
    });

    const remaining = Array.from(itemMap.values());
    return [...ordered, ...remaining];
}

function moveBoardItem(type, status, id, mode) {
    const items = type === "INCIDENT" ? incidentBoardData : calamityBoardData;
    const sameColumnIds = items
        .filter(item => !isBoardCardHidden(type, item.id))
        .filter(item => String((item.status || "").toUpperCase()) === String(status))
        .map(item => String(item.id));

    const orderState = getBoardOrderState();
    const orderKey = getOrderKey(type, status);

    let current = orderState[orderKey] || sameColumnIds.slice();

    sameColumnIds.forEach(itemId => {
        if (!current.includes(itemId)) {
            current.push(itemId);
        }
    });

    current = current.filter(itemId => sameColumnIds.includes(itemId));

    const targetId = String(id);
    const currentIndex = current.indexOf(targetId);
    if (currentIndex === -1) return;

    if (mode === "UP" && currentIndex > 0) {
        [current[currentIndex - 1], current[currentIndex]] = [current[currentIndex], current[currentIndex - 1]];
    }

    if (mode === "TOP" && currentIndex > 0) {
        current.splice(currentIndex, 1);
        current.unshift(targetId);
    }

    orderState[orderKey] = current;
    saveBoardOrderState(orderState);

    if (type === "INCIDENT") {
        applyIncidentFilters();
    } else {
        applyCalamityFilters();
    }
}

function updateIncidentCounts(grouped) {
    const ongoing = grouped.ONGOING?.length || 0;
    const inProgress = grouped.IN_PROGRESS?.length || 0;
    const onSite = grouped.ON_SITE?.length || 0;
    const resolved = grouped.RESOLVED?.length || 0;

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setText("incidentCountOngoing", ongoing);
    setText("incidentCountInProgress", inProgress);
    setText("incidentCountOnSite", onSite);
    setText("incidentCountResolved", resolved);
}

function updateCalamityCounts(grouped) {
    const active = grouped.ACTIVE?.length || 0;
    const monitoring = grouped.MONITORING?.length || 0;
    const resolved = grouped.RESOLVED?.length || 0;
    const ended = grouped.ENDED?.length || 0;

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setText("calamityCountActive", active);
    setText("calamityCountMonitoring", monitoring);
    setText("calamityCountResolved", resolved);
    setText("calamityCountEnded", ended);
}

function clearBoardColumns(columnIds) {
    columnIds.forEach(id => {
        const column = document.getElementById(id);
        if (column) column.innerHTML = "";
    });
}

function groupIncidentsByStatus(items) {
    const grouped = {
        ONGOING: [],
        IN_PROGRESS: [],
        ON_SITE: [],
        RESOLVED: []
    };

    items.forEach(incident => {
        if (isBoardCardHidden("INCIDENT", incident.id)) return;

        const status = (incident.status || "ONGOING").toUpperCase();
        if (!grouped[status]) grouped[status] = [];
        grouped[status].push(incident);
    });

    Object.keys(grouped).forEach(status => {
        grouped[status] = applyColumnOrder("INCIDENT", status, grouped[status]);
    });

    return grouped;
}

function groupCalamitiesByStatus(items) {
    const grouped = {
        ACTIVE: [],
        MONITORING: [],
        RESOLVED: [],
        ENDED: []
    };

    items.forEach(calamity => {
        if (isBoardCardHidden("CALAMITY", calamity.id)) return;

        const status = (calamity.status || "ACTIVE").toUpperCase();
        if (!grouped[status]) grouped[status] = [];
        grouped[status].push(calamity);
    });

    Object.keys(grouped).forEach(status => {
        grouped[status] = applyColumnOrder("CALAMITY", status, grouped[status]);
    });

    return grouped;
}

function renderIncidentBoard(items) {
    const grouped = groupIncidentsByStatus(items);

    clearBoardColumns([
        "incidentOngoingColumn",
        "incidentInProgressColumn",
        "incidentOnSiteColumn",
        "incidentResolvedColumn"
    ]);

    Object.entries(grouped).forEach(([status, incidents]) => {
        const columnId = getIncidentColumnId(status);
        const container = document.getElementById(columnId);
        if (!container) return;

        incidents.forEach(incident => {
            const card = createIncidentCard(incident);
            container.appendChild(card);
        });
    });

    updateIncidentCounts(grouped);

    if (currentSelection.type === "INCIDENT" && currentSelection.data?.id) {
        highlightSelectedCard("INCIDENT", currentSelection.data.id);
    }
}

function renderCalamityBoard(items) {
    const grouped = groupCalamitiesByStatus(items);

    clearBoardColumns([
        "calamityActiveColumn",
        "calamityMonitoringColumn",
        "calamityResolvedColumn",
        "calamityEndedColumn"
    ]);

    Object.entries(grouped).forEach(([status, calamities]) => {
        const columnId = getCalamityColumnId(status);
        const container = document.getElementById(columnId);
        if (!container) return;

        calamities.forEach(calamity => {
            const card = createCalamityCard(calamity);
            container.appendChild(card);
        });
    });

    updateCalamityCounts(grouped);

    if (currentSelection.type === "CALAMITY" && currentSelection.data?.id) {
        highlightSelectedCard("CALAMITY", currentSelection.data.id);
    }
}

async function loadIncidentBoard() {
    try {
        incidentBoardData = await apiRequest(`${API_BASE}/incidents`);
        applyIncidentFilters();
    } catch (error) {
        console.error("Error loading incident board:", error);
    }
}

async function loadCalamityBoard() {
    try {
        calamityBoardData = await apiRequest(`${API_BASE}/calamities`);
        applyCalamityFilters();
    } catch (error) {
        console.error("Error loading calamity board:", error);
    }
}

function applyIncidentFilters() {
    const search = (document.getElementById("incidentSearchInput")?.value || "").trim().toLowerCase();
    const severity = (document.getElementById("incidentSeverityFilter")?.value || "").trim().toUpperCase();
    const barangay = (document.getElementById("incidentBarangayFilter")?.value || "").trim().toLowerCase();
    const responder = (document.getElementById("incidentResponderFilter")?.value || "").trim().toLowerCase();

    const filtered = incidentBoardData.filter(incident => {
        const text = [
            incident.type,
            incident.barangay,
            incident.description,
            incident.status,
            incident.assignedResponderName
        ].filter(Boolean).join(" ").toLowerCase();

        const matchesSearch = !search || text.includes(search);
        const matchesSeverity = !severity || (incident.severity || "").toUpperCase() === severity;
        const matchesBarangay = !barangay || (incident.barangay || "").toLowerCase().includes(barangay);
        const matchesResponder = !responder || (incident.assignedResponderName || "").toLowerCase().includes(responder);

        return matchesSearch && matchesSeverity && matchesBarangay && matchesResponder;
    });

    renderIncidentBoard(filtered);
}

function applyCalamityFilters() {
    const search = (document.getElementById("calamitySearchInput")?.value || "").trim().toLowerCase();
    const severity = (document.getElementById("calamitySeverityFilter")?.value || "").trim().toUpperCase();
    const areaType = (document.getElementById("calamityAreaTypeFilter")?.value || "").trim().toUpperCase();

    const filtered = calamityBoardData.filter(calamity => {
        const text = [
            calamity.type,
            calamity.calamityName,
            calamity.description,
            calamity.status,
            formatCalamityArea(calamity)
        ].filter(Boolean).join(" ").toLowerCase();

        const matchesSearch = !search || text.includes(search);
        const matchesSeverity = !severity || (calamity.severity || "").toUpperCase() === severity;
        const matchesAreaType = !areaType || (calamity.affectedAreaType || "").toUpperCase() === areaType;

        return matchesSearch && matchesSeverity && matchesAreaType;
    });

    renderCalamityBoard(filtered);
}

function highlightSelectedCard(type, id) {
    clearCardSelections();
    const selector = `.board-card[data-type="${type}"][data-id="${id}"]`;
    document.querySelector(selector)?.classList.add("active");
}

function createIncidentCard(incident) {
    const card = document.createElement("div");
    card.className = "board-card";
    card.draggable = true;
    card.dataset.id = incident.id;
    card.dataset.type = "INCIDENT";
    card.dataset.status = incident.status || "ONGOING";

    const menuHtml = typeof buildIncidentCardMenu === "function"
        ? buildIncidentCardMenu(incident)
        : "";

    card.innerHTML = `
        <div class="board-card-header">
            <div class="board-card-title">${incident.type || "-"}</div>
            ${menuHtml}
        </div>
        <div class="board-card-meta">
            <div class="board-card-meta-row">Barangay: ${incident.barangay || "-"}</div>
            <div class="board-card-meta-row">
                Severity:
                <span class="severity-badge ${getSeverityClass(incident.severity)}">${incident.severity || "-"}</span>
            </div>
            <div class="board-card-meta-row">Responder: ${incident.assignedResponderName || "-"}</div>
            <div class="board-card-meta-row">Reported: ${formatDateTime(incident.reportedAt)}</div>
        </div>
    `;

    card.addEventListener("click", () => selectIncidentCard(incident, card));
    card.addEventListener("dragstart", (event) => handleCardDragStart(event, "INCIDENT", incident));
    card.addEventListener("dragend", handleCardDragEnd);

    if (typeof initCardMenuEvents === "function") {
        initCardMenuEvents(card, "INCIDENT", incident);
    }

    return card;
}

function createCalamityCard(calamity) {
    const card = document.createElement("div");
    card.className = "board-card";
    card.draggable = true;
    card.dataset.id = calamity.id;
    card.dataset.type = "CALAMITY";
    card.dataset.status = calamity.status || "ACTIVE";

    const menuHtml = typeof buildCalamityCardMenu === "function"
        ? buildCalamityCardMenu(calamity)
        : "";

    card.innerHTML = `
        <div class="board-card-header">
            <div class="board-card-title">${calamity.type || calamity.calamityName || "-"}</div>
            ${menuHtml}
        </div>
        <div class="board-card-meta">
            <div class="board-card-meta-row">Area: ${formatCalamityArea(calamity)}</div>
            <div class="board-card-meta-row">
                Severity:
                <span class="severity-badge ${getSeverityClass(calamity.severity)}">${calamity.severity || "-"}</span>
            </div>
            <div class="board-card-meta-row">Status: ${calamity.status || "-"}</div>
            <div class="board-card-meta-row">Start: ${formatDateTime(calamity.startDate || calamity.createdAt)}</div>
        </div>
    `;

    card.addEventListener("click", () => selectCalamityCard(calamity, card));
    card.addEventListener("dragstart", (event) => handleCardDragStart(event, "CALAMITY", calamity));
    card.addEventListener("dragend", handleCardDragEnd);

    if (typeof initCardMenuEvents === "function") {
        initCardMenuEvents(card, "CALAMITY", calamity);
    }

    return card;
}

function selectIncidentCard(incident, cardElement) {
    currentSelection = { type: "INCIDENT", data: incident };
    clearCardSelections();
    cardElement?.classList.add("active");
    renderSelectedEventSummary("INCIDENT", incident);
    loadIncidentActivityFeed(incident.id);
    renderModulePlaceholders("INCIDENT", incident);
}

function selectCalamityCard(calamity, cardElement) {
    currentSelection = { type: "CALAMITY", data: calamity };
    clearCardSelections();
    cardElement?.classList.add("active");
    renderSelectedEventSummary("CALAMITY", calamity);
    loadCalamityActivityFeed(calamity.id);
    renderModulePlaceholders("CALAMITY", calamity);
}

function handleCardDragStart(event, type, data) {
    dragContext = {
        type,
        id: data.id,
        sourceStatus: (data.status || "").toUpperCase(),
        targetStatus: null,
        data
    };

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(data.id));

    const card = event.currentTarget;
    card.classList.add("dragging");
}

function handleCardDragEnd(event) {
    event.currentTarget.classList.remove("dragging");
    clearDropzoneStates();
    dragContext.targetStatus = null;
}

function isValidMove(type, sourceStatus, targetStatus) {
    if (!type || !sourceStatus || !targetStatus) return false;
    if (sourceStatus === targetStatus) return false;

    if (type === "INCIDENT") {
        const sourceIndex = INCIDENT_STATUS_ORDER.indexOf(sourceStatus);
        const targetIndex = INCIDENT_STATUS_ORDER.indexOf(targetStatus);
        return sourceIndex !== -1 && targetIndex === sourceIndex + 1;
    }

    if (type === "CALAMITY") {
        const sourceIndex = CALAMITY_STATUS_ORDER.indexOf(sourceStatus);
        const targetIndex = CALAMITY_STATUS_ORDER.indexOf(targetStatus);
        return sourceIndex !== -1 && targetIndex === sourceIndex + 1;
    }

    return false;
}

function initDropzones() {
    document.querySelectorAll(".board-dropzone").forEach(zone => {
        zone.addEventListener("dragover", handleDropzoneDragOver);
        zone.addEventListener("dragleave", handleDropzoneDragLeave);
        zone.addEventListener("drop", handleDropzoneDrop);
    });
}

function getDropzoneContext(zone) {
    const column = zone.closest(".board-column");
    if (!column) return null;

    return {
        boardType: column.dataset.boardType,
        targetStatus: column.dataset.status
    };
}

function handleDropzoneDragOver(event) {
    event.preventDefault();

    const zone = event.currentTarget;
    const context = getDropzoneContext(zone);
    if (!context) return;

    clearDropzoneStates();

    const valid =
        dragContext.type === context.boardType &&
        isValidMove(dragContext.type, dragContext.sourceStatus, context.targetStatus);

    if (valid) {
        zone.classList.add("drag-over");
        dragContext.targetStatus = context.targetStatus;
        event.dataTransfer.dropEffect = "move";
    } else {
        zone.classList.add("drop-invalid");
        event.dataTransfer.dropEffect = "none";
    }
}

function handleDropzoneDragLeave(event) {
    event.currentTarget.classList.remove("drag-over", "drop-invalid");
}

async function handleDropzoneDrop(event) {
    event.preventDefault();

    const zone = event.currentTarget;
    const context = getDropzoneContext(zone);
    clearDropzoneStates();

    if (!context) return;

    const valid =
        dragContext.type === context.boardType &&
        isValidMove(dragContext.type, dragContext.sourceStatus, context.targetStatus);

    if (!valid) return;

    await handleBoardTransition(
        dragContext.type,
        dragContext.data,
        dragContext.sourceStatus,
        context.targetStatus
    );
}

async function handleBoardTransition(type, data, sourceStatus, targetStatus) {
    if (type === "INCIDENT") {
        if (sourceStatus === "ONGOING" && targetStatus === "IN_PROGRESS") {
            openDispatchModal(data);
            return;
        }

        if (sourceStatus === "IN_PROGRESS" && targetStatus === "ON_SITE") {
            openStatusUpdateModal({
                type: "INCIDENT",
                data,
                action: "ARRIVE",
                targetStatus: "ON_SITE",
                title: "Mark Incident as On-Site"
            });
            return;
        }

        if (sourceStatus === "ON_SITE" && targetStatus === "RESOLVED") {
            openStatusUpdateModal({
                type: "INCIDENT",
                data,
                action: "RESOLVE",
                targetStatus: "RESOLVED",
                title: "Resolve Incident"
            });
            return;
        }

        return;
    }

    if (type === "CALAMITY") {
        if (sourceStatus === "ACTIVE" && targetStatus === "MONITORING") {
            openStatusUpdateModal({
                type: "CALAMITY",
                data,
                action: "MONITOR",
                targetStatus: "MONITORING",
                title: "Set Calamity to Monitoring"
            });
            return;
        }

        if (sourceStatus === "MONITORING" && targetStatus === "RESOLVED") {
            openStatusUpdateModal({
                type: "CALAMITY",
                data,
                action: "RESOLVE",
                targetStatus: "RESOLVED",
                title: "Resolve Calamity"
            });
            return;
        }

        if (sourceStatus === "RESOLVED" && targetStatus === "ENDED") {
            openStatusUpdateModal({
                type: "CALAMITY",
                data,
                action: "END",
                targetStatus: "ENDED",
                title: "End Calamity"
            });
            return;
        }
    }
}