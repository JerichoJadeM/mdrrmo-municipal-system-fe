const RESPONDER_API = "http://localhost:8080/api/responders";

function renderDispatchModalIncidentSummary(incident) {
    const summaryBox = document.getElementById("dispatchModalIncidentSummary");
    const summaryContent = document.getElementById("dispatchModalIncidentSummaryContent");

    if (!summaryBox || !summaryContent) return;

    if (!incident) {
        summaryBox.classList.add("hidden");
        summaryContent.innerHTML = "";
        return;
    }

    summaryContent.innerHTML = `
        <div class="dispatch-summary-grid">
            <div class="dispatch-summary-item">
                <strong>Type</strong>
                <span>${incident.type || "-"}</span>
            </div>
            <div class="dispatch-summary-item">
                <strong>Barangay</strong>
                <span>${incident.barangay || "-"}</span>
            </div>
            <div class="dispatch-summary-item">
                <strong>Status</strong>
                <span>${incident.status || "-"}</span>
            </div>
            <div class="dispatch-summary-item">
                <strong>Reported At</strong>
                <span>${formatDateTime(incident.reportedAt)}</span>
            </div>
        </div>
    `;

    summaryBox.classList.remove("hidden");
}

function clearDispatchModalState() {
    const incidentId = document.getElementById("dispatchModalIncidentId");
    const responderSearch = document.getElementById("dispatchResponderSearch");
    const responderId = document.getElementById("dispatchResponderId");
    const suggestions = document.getElementById("dispatchResponderSuggestions");
    const description = document.getElementById("dispatchDescription");
    const title = document.querySelector("#dispatchModal .modal-header h3");
    const confirmBtn = document.getElementById("dispatchModalConfirm");

    if (incidentId) incidentId.value = "";
    if (responderSearch) responderSearch.value = "";
    if (responderId) responderId.value = "";
    if (suggestions) suggestions.innerHTML = "";
    if (description) description.value = "";
    if (title) title.textContent = "Dispatch Responder";
    if (confirmBtn) confirmBtn.textContent = "Dispatch";

    renderDispatchModalIncidentSummary(null);
}

function openDispatchModal(incident) {
    pendingDispatchIncident = {
        ...incident,
        modalMode: incident.modalMode || "DISPATCH"
    };

    const modal = document.getElementById("dispatchModal");
    const modalOverlay = document.getElementById("modalOverlay");
    const incidentId = document.getElementById("dispatchModalIncidentId");
    const description = document.getElementById("dispatchDescription");
    const responderSearch = document.getElementById("dispatchResponderSearch");
    const responderId = document.getElementById("dispatchResponderId");
    const title = document.querySelector("#dispatchModal .modal-header h3");
    const confirmBtn = document.getElementById("dispatchModalConfirm");

    clearDispatchModalState();

    if (incidentId) incidentId.value = incident.id;
    renderDispatchModalIncidentSummary(incident);

    if (description) {
        description.value = (incident?.description || "").trim();
    }

    if (responderSearch) {
        responderSearch.value = incident.assignedResponderName || "";
    }

    if (responderId) {
        responderId.value = incident.assignedResponderId || "";
    }

    if (pendingDispatchIncident.modalMode === "EDIT_ONLY") {
        if (title) title.textContent = "Incident Details";
        if (confirmBtn) confirmBtn.textContent = "Save Changes";
    }

    modal?.classList.add("active");
    modalOverlay?.classList.add("active");
}

function closeDispatchModal() {
    const modal = document.getElementById("dispatchModal");
    const modalOverlay = document.getElementById("modalOverlay");

    modal?.classList.remove("active");
    modalOverlay?.classList.remove("active");

    pendingDispatchIncident = null;
    clearDispatchModalState();
}

async function searchAvailableResponders(keyword = "") {
    try {
        const responders = await apiRequest(
            `${RESPONDER_API}/available?keyword=${encodeURIComponent(keyword)}`
        );

        const suggestions = document.getElementById("dispatchResponderSuggestions");
        if (!suggestions) return;

        suggestions.innerHTML = "";

        if (!responders || responders.length === 0) {
            suggestions.innerHTML = `
                <div class="suggestion-item empty">No available responders found.</div>
            `;
            return;
        }

        responders.forEach(responder => {
            const item = document.createElement("div");
            item.className = "suggestion-item";
            item.textContent = responder.fullName || `${responder.firstName} ${responder.lastName}`;

            item.addEventListener("click", () => {
                const responderSearch = document.getElementById("dispatchResponderSearch");
                const responderId = document.getElementById("dispatchResponderId");

                if (responderSearch) {
                    responderSearch.value = responder.fullName || `${responder.firstName} ${responder.lastName}`;
                }

                if (responderId) {
                    responderId.value = responder.id;
                }

                suggestions.innerHTML = "";
            });

            suggestions.appendChild(item);
        });
    } catch (error) {
        console.error("Error loading responders:", error);
    }
}

function initDispatchModalResponderSearch() {
    const responderSearch = document.getElementById("dispatchResponderSearch");
    const responderId = document.getElementById("dispatchResponderId");
    const suggestions = document.getElementById("dispatchResponderSuggestions");

    if (!responderSearch || !responderId || !suggestions) return;

    responderSearch.addEventListener("focus", async () => {
        await searchAvailableResponders(responderSearch.value.trim());
    });

    responderSearch.addEventListener("input", async () => {
        responderId.value = "";
        await searchAvailableResponders(responderSearch.value.trim());
    });

    document.addEventListener("click", (event) => {
        const clickedInside =
            responderSearch.contains(event.target) ||
            suggestions.contains(event.target);

        if (!clickedInside) {
            suggestions.innerHTML = "";
        }
    });
}

async function updateIncidentOnly(incident, description, newResponderId, newResponderName) {
    await apiRequest(`${API_BASE}/incidents/${incident.id}`, {
        method: "PUT",
        body: JSON.stringify({
            type: incident.type,
            barangayId: incident.barangayId,
            assignedResponderId: newResponderId || null,
            severity: incident.severity,
            description: description
        })
    });

    if (currentSelection.type === "INCIDENT" && currentSelection.data?.id === incident.id) {
        currentSelection.data = {
            ...currentSelection.data,
            description: description,
            assignedResponderId: newResponderId || null,
            assignedResponderName: newResponderName || currentSelection.data.assignedResponderName || "-"
        };
        renderSelectedEventSummary("INCIDENT", currentSelection.data);
        await loadIncidentActivityFeed(incident.id);
    }
}

async function confirmDispatchFromModal() {
    const responderId = document.getElementById("dispatchResponderId")?.value;
    const responderSearch = document.getElementById("dispatchResponderSearch")?.value;
    const description = (document.getElementById("dispatchDescription")?.value || "").trim();
    const incident = pendingDispatchIncident;

    if (!incident) {
        alert("No pending incident selected for dispatch.");
        return;
    }

    if (!responderSearch || !responderId) {
        alert("Select a responder from the suggestion list.");
        return;
    }

    try {
        if (incident.modalMode === "EDIT_ONLY") {
            await updateIncidentOnly(
                incident,
                description,
                Number(responderId),
                responderSearch
            );

            closeDispatchModal();
            await loadIncidentBoard();
            return;
        }

        await apiRequest(`${API_BASE}/incidents/${incident.id}`, {
            method: "PUT",
            body: JSON.stringify({
                type: incident.type,
                barangayId: incident.barangayId,
                assignedResponderId: incident.assignedResponderId || null,
                severity: incident.severity,
                description: description
            })
        });

        await apiRequest(`${API_BASE}/incidents/${incident.id}/dispatch`, {
            method: "PUT",
            body: JSON.stringify({
                responderId: Number(responderId)
            })
        });

        closeDispatchModal();
        await loadIncidentBoard();

        if (currentSelection.type === "INCIDENT" && currentSelection.data?.id === incident.id) {
            const updated = {
                ...currentSelection.data,
                status: "IN_PROGRESS",
                description: description || currentSelection.data.description || "",
                assignedResponderId: Number(responderId),
                assignedResponderName: responderSearch
            };

            currentSelection.data = updated;
            renderSelectedEventSummary("INCIDENT", updated);
            await loadIncidentActivityFeed(updated.id);
        }
    } catch (error) {
        console.error("Error dispatching responder:", error);
        alert(error.message || "Failed to save incident changes.");
    }
}

function initDispatchModal() {
    const dispatchModalClose = document.getElementById("dispatchModalClose");
    const dispatchModalCancel = document.getElementById("dispatchModalCancel");
    const dispatchModalConfirm = document.getElementById("dispatchModalConfirm");
    const dispatchModalForm = document.getElementById("dispatchModalForm");
    const modalOverlay = document.getElementById("modalOverlay");

    dispatchModalClose?.addEventListener("click", closeDispatchModal);
    dispatchModalCancel?.addEventListener("click", closeDispatchModal);

    dispatchModalConfirm?.addEventListener("click", async () => {
        await confirmDispatchFromModal();
    });

    dispatchModalForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        await confirmDispatchFromModal();
    });

    modalOverlay?.addEventListener("click", () => {
        const modal = document.getElementById("dispatchModal");
        if (modal?.classList.contains("active")) {
            closeDispatchModal();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            const modal = document.getElementById("dispatchModal");
            if (modal?.classList.contains("active")) {
                closeDispatchModal();
            }
        }
    });

    initDispatchModalResponderSearch();
}