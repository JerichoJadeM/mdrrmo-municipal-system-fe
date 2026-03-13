let pendingStatusUpdate = null;

function renderStatusUpdateSummary(type, data) {
    const summaryBox = document.getElementById("statusUpdateSummary");
    const summaryContent = document.getElementById("statusUpdateSummaryContent");

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
                    <strong>Reported At</strong>
                    <span>${formatDateTime(data.reportedAt)}</span>
                </div>
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
                    <strong>Date</strong>
                    <span>${formatDateTime(data.startDate || data.createdAt)}</span>
                </div>
            </div>
        `;
    }

    summaryBox.classList.remove("hidden");
}

function clearStatusUpdateModalState() {
    const title = document.getElementById("statusUpdateModalTitle");
    const description = document.getElementById("statusUpdateDescription");

    if (title) title.textContent = "Update Operation Status";
    if (description) description.value = "";

    renderStatusUpdateSummary(null, null);
}

function openStatusUpdateModal(config) {
    pendingStatusUpdate = config;

    const modal = document.getElementById("statusUpdateModal");
    const modalOverlay = document.getElementById("modalOverlay");
    const title = document.getElementById("statusUpdateModalTitle");
    const description = document.getElementById("statusUpdateDescription");

    clearStatusUpdateModalState();

    if (title) {
        title.textContent = config.title || "Update Operation Status";
    }

    renderStatusUpdateSummary(config.type, config.data);

    if (description) {
        description.value = (config.data?.description || "").trim();
    }

    modal?.classList.add("active");
    modalOverlay?.classList.add("active");
}

function closeStatusUpdateModal() {
    const modal = document.getElementById("statusUpdateModal");
    const modalOverlay = document.getElementById("modalOverlay");

    modal?.classList.remove("active");
    modalOverlay?.classList.remove("active");

    pendingStatusUpdate = null;
    clearStatusUpdateModalState();
}

async function updateIncidentDescriptionOnly(incident, newDescription) {
    await apiRequest(`${API_BASE}/incidents/${incident.id}`, {
        method: "PUT",
        body: JSON.stringify({
            type: incident.type,
            barangayId: incident.barangayId,
            assignedResponderId: incident.assignedResponderId || null,
            severity: incident.severity,
            description: newDescription
        })
    });
}

async function updateCalamityDescriptionOnly(calamity, newDescription) {
    await apiRequest(`${API_BASE}/calamities/${calamity.id}`, {
        method: "PUT",
        body: JSON.stringify({
            type: calamity.type,
            eventName: calamity.eventName || null,
            affectedAreaType: calamity.affectedAreaType,
            barangayId: calamity.barangayId ?? calamity.primaryBarangayId ?? null,
            barangayIds: calamity.affectedBarangayIds || [],
            coordinatorId: calamity.coordinatorId || null,
            severity: calamity.severity,
            date: calamity.date || null,
            damageCost: calamity.damageCost ?? 0,
            casualties: calamity.casualties ?? 0,
            description: newDescription
        })
    });
}

async function continueIncidentTransition(action, incidentId) {
    if (action === "ARRIVE") {
        await apiRequest(`${API_BASE}/incidents/${incidentId}/arrive`, {
            method: "PUT"
        });
        return;
    }

    if (action === "RESOLVE") {
        await apiRequest(`${API_BASE}/incidents/${incidentId}/resolve`, {
            method: "PUT"
        });
    }
}

async function continueCalamityTransition(action, calamityId) {
    if (action === "MONITOR") {
        await apiRequest(`${API_BASE}/calamities/${calamityId}/monitor`, {
            method: "PUT"
        });
        return;
    }

    if (action === "RESOLVE") {
        await apiRequest(`${API_BASE}/calamities/${calamityId}/resolve`, {
            method: "PUT"
        });
        return;
    }

    if (action === "END") {
        await apiRequest(`${API_BASE}/calamities/${calamityId}/end`, {
            method: "PUT"
        });
    }
}

async function confirmStatusUpdateModal() {
    const config = pendingStatusUpdate;
    const description = (document.getElementById("statusUpdateDescription")?.value || "").trim();

    if (!config || !config.type || !config.data) {
        alert("No pending status update.");
        return;
    }

    try {
        if (config.type === "INCIDENT") {
            await updateIncidentDescriptionOnly(config.data, description);
            await continueIncidentTransition(config.action, config.data.id);

            closeStatusUpdateModal();
            await loadIncidentBoard();

            if (currentSelection.type === "INCIDENT" && currentSelection.data?.id === config.data.id) {
                const updated = {
                    ...currentSelection.data,
                    status: config.targetStatus,
                    description: description || currentSelection.data.description || ""
                };

                currentSelection.data = updated;
                renderSelectedEventSummary("INCIDENT", updated);
                await loadIncidentActivityFeed(updated.id);
            }

            return;
        }

        if (config.type === "CALAMITY") {
            await updateCalamityDescriptionOnly(config.data, description);
            await continueCalamityTransition(config.action, config.data.id);

            closeStatusUpdateModal();
            await loadCalamityBoard();

            if (currentSelection.type === "CALAMITY" && currentSelection.data?.id === config.data.id) {
                const updated = {
                    ...currentSelection.data,
                    status: config.targetStatus,
                    description: description || currentSelection.data.description || ""
                };

                currentSelection.data = updated;
                renderSelectedEventSummary("CALAMITY", updated);
                await loadCalamityActivityFeed(updated.id);
            }
        }
    } catch (error) {
        console.error("Error updating operation status:", error);
        alert(error.message || "Failed to update operation status.");
    }
}

function initStatusUpdateModal() {
    const closeBtn = document.getElementById("statusUpdateModalClose");
    const cancelBtn = document.getElementById("statusUpdateCancel");
    const confirmBtn = document.getElementById("statusUpdateConfirm");
    const form = document.getElementById("statusUpdateForm");
    const modalOverlay = document.getElementById("modalOverlay");

    closeBtn?.addEventListener("click", closeStatusUpdateModal);
    cancelBtn?.addEventListener("click", closeStatusUpdateModal);

    confirmBtn?.addEventListener("click", async () => {
        await confirmStatusUpdateModal();
    });

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        await confirmStatusUpdateModal();
    });

    modalOverlay?.addEventListener("click", () => {
        const modal = document.getElementById("statusUpdateModal");
        if (modal?.classList.contains("active")) {
            closeStatusUpdateModal();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            const modal = document.getElementById("statusUpdateModal");
            if (modal?.classList.contains("active")) {
                closeStatusUpdateModal();
            }
        }
    });
}