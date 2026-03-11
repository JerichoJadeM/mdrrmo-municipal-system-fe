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

async function loadIncidentBoard() {
    try {
        const incidents = await apiRequest(`${API_BASE}/incidents`);
        const grouped = {
            ONGOING: [],
            IN_PROGRESS: [],
            ON_SITE: [],
            RESOLVED: []
        };

        incidents.forEach(incident => {
            const status = (incident.status || "ONGOING").toUpperCase();
            if (!grouped[status]) grouped[status] = [];
            grouped[status].push(incident);
        });

        clearBoardColumns([
            "incidentOngoingColumn",
            "incidentInProgressColumn",
            "incidentOnSiteColumn",
            "incidentResolvedColumn"
        ]);

        Object.entries(grouped).forEach(([status, items]) => {
            const columnId = getIncidentColumnId(status);
            const container = document.getElementById(columnId);
            if (!container) return;

            items.forEach(incident => {
                const card = createIncidentCard(incident);
                container.appendChild(card);
            });
        });

        updateIncidentCounts(grouped);

        if (currentSelection.type === "INCIDENT" && currentSelection.data?.id) {
            highlightSelectedCard("INCIDENT", currentSelection.data.id);
        }
    } catch (error) {
        console.error("Error loading incident board:", error);
    }
}

async function loadCalamityBoard() {
    try {
        const calamities = await apiRequest(`${API_BASE}/calamities`);
        const grouped = {
            ACTIVE: [],
            MONITORING: [],
            RESOLVED: [],
            ENDED: []
        };

        calamities.forEach(calamity => {
            const status = (calamity.status || "ACTIVE").toUpperCase();
            if (!grouped[status]) grouped[status] = [];
            grouped[status].push(calamity);
        });

        clearBoardColumns([
            "calamityActiveColumn",
            "calamityMonitoringColumn",
            "calamityResolvedColumn",
            "calamityEndedColumn"
        ]);

        Object.entries(grouped).forEach(([status, items]) => {
            const columnId = getCalamityColumnId(status);
            const container = document.getElementById(columnId);
            if (!container) return;

            items.forEach(calamity => {
                const card = createCalamityCard(calamity);
                container.appendChild(card);
            });
        });

        updateCalamityCounts(grouped);

        if (currentSelection.type === "CALAMITY" && currentSelection.data?.id) {
            highlightSelectedCard("CALAMITY", currentSelection.data.id);
        }
    } catch (error) {
        console.error("Error loading calamity board:", error);
    }
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

    card.innerHTML = `
        <div class="board-card-title">${incident.type || "-"}</div>
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

    return card;
}

function createCalamityCard(calamity) {
    const card = document.createElement("div");
    card.className = "board-card";
    card.draggable = true;
    card.dataset.id = calamity.id;
    card.dataset.type = "CALAMITY";
    card.dataset.status = calamity.status || "ACTIVE";

    card.innerHTML = `
        <div class="board-card-title">${calamity.type || calamity.calamityName || "-"}</div>
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
            const confirmed = confirmAction("Mark this incident as On-Site?");
            if (!confirmed) return;

            try {
                await apiRequest(`${API_BASE}/incidents/${data.id}/arrive`, {
                    method: "PUT"
                });

                await loadIncidentBoard();

                if (currentSelection.type === "INCIDENT" && currentSelection.data?.id === data.id) {
                    const updated = { ...data, status: "ON_SITE" };
                    currentSelection.data = updated;
                    renderSelectedEventSummary("INCIDENT", updated);
                    await loadIncidentActivityFeed(data.id);
                }
            } catch (error) {
                console.error("Error marking incident On-Site:", error);
                alert(error.message || "Failed to mark incident as On-Site.");
            }

            return;
        }

        if (sourceStatus === "ON_SITE" && targetStatus === "RESOLVED") {
            const confirmed = confirmAction("Resolve this incident?");
            if (!confirmed) return;

            try {
                await apiRequest(`${API_BASE}/incidents/${data.id}/resolve`, {
                    method: "PUT"
                });

                await loadIncidentBoard();

                if (currentSelection.type === "INCIDENT" && currentSelection.data?.id === data.id) {
                    const updated = { ...data, status: "RESOLVED" };
                    currentSelection.data = updated;
                    renderSelectedEventSummary("INCIDENT", updated);
                    await loadIncidentActivityFeed(data.id);
                }
            } catch (error) {
                console.error("Error resolving incident:", error);
                alert(error.message || "Failed to resolve incident.");
            }
        }

        return;
    }

    if (type === "CALAMITY") {
        try {
            if (sourceStatus === "ACTIVE" && targetStatus === "MONITORING") {
                const confirmed = confirmAction("Set this calamity to Monitoring?");
                if (!confirmed) return;

                await apiRequest(`${API_BASE}/calamities/${data.id}/monitor`, { method: "PUT" });
            } else if (sourceStatus === "MONITORING" && targetStatus === "RESOLVED") {
                const confirmed = confirmAction("Mark this calamity as Resolved?");
                if (!confirmed) return;

                await apiRequest(`${API_BASE}/calamities/${data.id}/resolve`, { method: "PUT" });
            } else if (sourceStatus === "RESOLVED" && targetStatus === "ENDED") {
                const confirmed = confirmAction("End this calamity?");
                if (!confirmed) return;

                await apiRequest(`${API_BASE}/calamities/${data.id}/end`, { method: "PUT" });
            }

            await loadCalamityBoard();

            if (currentSelection.type === "CALAMITY" && currentSelection.data?.id === data.id) {
                const updated = { ...data, status: targetStatus };
                currentSelection.data = updated;
                renderSelectedEventSummary("CALAMITY", updated);
                await loadCalamityActivityFeed(data.id);
            }
        } catch (error) {
            console.error("Error updating calamity board transition:", error);
            alert(error.message || "Failed to update calamity status.");
        }
    }
}