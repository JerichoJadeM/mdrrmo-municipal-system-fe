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

    if (incidentId) incidentId.value = "";
    if (responderSearch) responderSearch.value = "";
    if (responderId) responderId.value = "";
    if (suggestions) suggestions.innerHTML = "";

    renderDispatchModalIncidentSummary(null);
}

function openDispatchModal(incident) {
    pendingDispatchIncident = incident;

    const modal = document.getElementById("dispatchModal");
    const modalOverlay = document.getElementById("modalOverlay");
    const incidentId = document.getElementById("dispatchModalIncidentId");

    clearDispatchModalState();

    if (incidentId) incidentId.value = incident.id;
    renderDispatchModalIncidentSummary(incident);

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

function normalizeResponderLabel(responder) {
    if (responder.fullName) return responder.fullName;

    const firstName = responder.firstName || "";
    const lastName = responder.lastName || "";
    const full = `${firstName} ${lastName}`.trim();

    return full || responder.name || `Responder #${responder.id}`;
}

async function searchAvailableResponders(keyword) {
    if (!keyword || !keyword.trim()) return [];

    try {
        const response = await apiRequest(`${RESPONDER_SEARCH_URL}${encodeURIComponent(keyword.trim())}`);
        if (Array.isArray(response)) return response;
        if (Array.isArray(response?.data)) return response.data;
        return [];
    } catch (error) {
        console.error("Error searching responders:", error);
        return [];
    }
}

function renderResponderSuggestions(items) {
    const suggestions = document.getElementById("dispatchResponderSuggestions");
    const responderSearch = document.getElementById("dispatchResponderSearch");
    const responderId = document.getElementById("dispatchResponderId");

    if (!suggestions) return;

    suggestions.innerHTML = "";

    if (!items || items.length === 0) {
        suggestions.innerHTML = `<div class="suggestion-item empty">No responders found.</div>`;
        return;
    }

    items.forEach(item => {
        const div = document.createElement("div");
        div.className = "suggestion-item";
        div.textContent = normalizeResponderLabel(item);

        div.addEventListener("click", () => {
            if (responderSearch) responderSearch.value = normalizeResponderLabel(item);
            if (responderId) responderId.value = item.id;
            suggestions.innerHTML = "";
        });

        suggestions.appendChild(div);
    });
}

function initDispatchModalResponderSearch() {
    const responderSearch = document.getElementById("dispatchResponderSearch");
    const responderId = document.getElementById("dispatchResponderId");
    const suggestions = document.getElementById("dispatchResponderSuggestions");

    if (!responderSearch || !responderId || !suggestions) return;

    let debounceTimer = null;

    responderSearch.addEventListener("input", () => {
        responderId.value = "";

        const keyword = responderSearch.value.trim();
        clearTimeout(debounceTimer);

        if (!keyword) {
            suggestions.innerHTML = "";
            return;
        }

        debounceTimer = setTimeout(async () => {
            const responders = await searchAvailableResponders(keyword);
            renderResponderSuggestions(responders);
        }, 250);
    });

    document.addEventListener("click", (event) => {
        const wrapper = responderSearch.closest(".responder-autocomplete");
        if (!wrapper?.contains(event.target)) {
            suggestions.innerHTML = "";
        }
    });
}

async function confirmDispatchFromModal() {
    const responderId = document.getElementById("dispatchResponderId")?.value;
    const responderSearch = document.getElementById("dispatchResponderSearch")?.value;
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
        await apiRequest(`${API_BASE}/incidents/${incident.id}/dispatch`, {
            method: "PUT",
            body: JSON.stringify({
                responderId: Number(responderId)
            })
        });

        closeDispatchModal();
        await loadIncidentBoard();

        if (currentSelection.type === "INCIDENT" && currentSelection.data?.id === incident.id) {
            const updated = { ...currentSelection.data, status: "IN_PROGRESS" };
            currentSelection.data = updated;
            renderSelectedEventSummary("INCIDENT", updated);
            await loadIncidentActivityFeed(updated.id);
        }
    } catch (error) {
        console.error("Error dispatching responder:", error);
        alert(error.message || "Failed to dispatch responder.");
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

    modalOverlay?.addEventListener("click", closeDispatchModal);

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