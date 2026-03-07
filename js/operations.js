const API_BASE = "http://localhost:8080/api";

let currentIncident = null;

async function apiRequest(url, options = {}) {
    const token = localStorage.getItem("jwtToken");

    options.headers = {
        ...(options.headers || {}),
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
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

function updateActionButtons(status = null) {
    const normalizedStatus = (status || "").toUpperCase();

    const arriveBtn = document.getElementById("arriveBtn");
    const resolveBtn = document.getElementById("resolveBtn");

    if (arriveBtn) {
        arriveBtn.disabled = normalizedStatus !== "IN_PROGRESS";
    }

    if (resolveBtn) {
        resolveBtn.disabled = !(
            normalizedStatus === "IN_PROGRESS" ||
            normalizedStatus === "ON_SITE"
        );
    }
}

async function loadIncidents(selectedIncidentId = null) {
    try {
        const incidents = await apiRequest(`${API_BASE}/incidents`);

        const container = document.getElementById("incidentList");
        const filterInput = document.getElementById("incidentFilter");

        if (!container) {
            console.error("incidentList container not found");
            return [];
        }

        const filterKeyword = (filterInput?.value || "").trim().toLowerCase();

        const activeIncidents = incidents.filter(incident => {
            const status = (incident.status || "").trim().toUpperCase();

            if (status === "RESOLVED") {
                return false;
            }

            if (!filterKeyword) {
                return true;
            }

            const searchableText = [
                incident.type,
                incident.barangay,
                incident.severity,
                incident.status,
                incident.assignedResponderName,
                incident.description
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return searchableText.includes(filterKeyword);
        });

        container.innerHTML = "";

        if (activeIncidents.length === 0) {
            container.innerHTML = "<p>No active incidents found.</p>";
            return incidents;
        }

        activeIncidents.forEach(incident => {
            const card = document.createElement("div");
            card.className = "incident-card";
            card.dataset.id = incident.id;

            if (selectedIncidentId && incident.id === Number(selectedIncidentId)) {
                card.classList.add("active");
            }

            const severityClass = getSeverityClass(incident.severity);

            card.innerHTML = `
                <strong>${incident.type}</strong><br>
                Barangay: ${incident.barangay}<br>
                Severity: <span class="severity-badge ${severityClass}">${incident.severity || "-"}</span><br>
                Status: ${incident.status}
            `;

            card.addEventListener("click", () => selectIncident(incident, card));
            container.appendChild(card);
        });

        return incidents;
    } catch (error) {
        console.error("Error loading incidents:", error);
        return [];
    }
}

function getSeverityClass(severity) {
    const normalized = (severity || "").trim().toUpperCase();

    if (normalized === "HIGH") return "severity-high";
    if (normalized === "MEDIUM") return "severity-medium";
    if (normalized === "LOW") return "severity-low";

    return "severity-default";
}

function initIncidentFilter() {
    const filterInput = document.getElementById("incidentFilter");
    if (!filterInput) return;

    filterInput.addEventListener("input", async () => {
        const selectedIncidentId = document.getElementById("selectedIncidentId")?.value || null;
        await loadIncidents(selectedIncidentId);
    });
}

console.log("Rendered cards:", document.querySelectorAll(".incident-card").length);

async function selectIncident(incident, cardElement) {
    currentIncident = incident;

    const selectedIdInput = document.getElementById("selectedIncidentId");
    if (selectedIdInput) {
        selectedIdInput.value = incident.id;
    }

    document.querySelectorAll(".incident-card").forEach(card => {
        card.classList.remove("active");
    });

    if (cardElement) {
        cardElement.classList.add("active");
    }

    renderDispatchIncidentSummary(incident);
    toggleIncidentStatus(true);
    updateActionButtons(incident.status);
    updateStatusStepper(incident.status);
    await loadActivityFeed(incident.id);
}

// helper for showing the stepper only when active incident is clicked
function toggleIncidentStatus(show) {
    const statusInline = document.getElementById("incidentStatusInline");
    if (!statusInline) return;

    statusInline.classList.toggle("hidden", !show);
}

function hasAssignedResponder(incident) {
    return !!(
        incident &&
        (
            incident.assignedResponderId ||
            incident.assignedResponderName ||
            incident.responderId ||
            incident.responderName
        )
    );
}

function confirmAction(message) {
    return window.confirm(message);
}

async function refreshSelectedIncident(incidentId) {
    try {
        const incidents = await loadIncidents(incidentId);
        const updated = incidents.find(i => i.id === Number(incidentId));

        const selectedIdInput = document.getElementById("selectedIncidentId");
        const activityFeed = document.getElementById("activityFeed");

        if (!updated) {
            currentIncident = null;

            if (selectedIdInput) {
                selectedIdInput.value = "";
            }

            renderDispatchIncidentSummary(null);
            toggleIncidentStatus(false);
            updateActionButtons(null);
            updateStatusStepper(null);

            if (activityFeed) {
                activityFeed.innerHTML = "<p>No incident selected.</p>";
            }

            return;
        }

        const normalizedStatus = (updated.status || "").toUpperCase();

        if (normalizedStatus === "RESOLVED") {
            currentIncident = null;

            if (selectedIdInput) {
                selectedIdInput.value = "";
            }

            renderDispatchIncidentSummary(null);
            toggleIncidentStatus(false);
            updateActionButtons(null);
            updateStatusStepper("RESOLVED");

            if (activityFeed) {
                activityFeed.innerHTML = "<p>This incident has been resolved.</p>";
            }

            return;
        }

        currentIncident = updated;

        if (selectedIdInput) {
            selectedIdInput.value = updated.id;
        }

        renderDispatchIncidentSummary(updated);
        toggleIncidentStatus(true);
        updateActionButtons(updated.status);
        updateStatusStepper(updated.status);
        await loadActivityFeed(updated.id);
    } catch (error) {
        console.error("Error refreshing incident:", error);
    }
}

async function loadActivityFeed(incidentId) {
    try {
        const actions = await apiRequest(`${API_BASE}/incidents/${incidentId}/actions`);

        const feed = document.getElementById("activityFeed");
        if (!feed) {
            console.error("activityFeed container not found");
            return;
        }

        feed.innerHTML = "";

        if (!actions || actions.length === 0) {
            feed.innerHTML = "<p>No activity yet.</p>";
            return;
        }

        actions.forEach(action => {
            const item = document.createElement("div");
            item.className = "feed-item";

            item.innerHTML = `
                <strong>${action.actionType}</strong><br>
                ${action.description}<br>
                <small>${new Date(action.actionTime).toLocaleString()}</small>
            `;

            feed.appendChild(item);
        });
    } catch (error) {
        console.error("Error loading activity feed:", error);
    }
}

function updateStatusStepper(status) {
    const order = ["ONGOING", "IN_PROGRESS", "ON_SITE", "RESOLVED"];
    const normalizedStatus = (status || "").toUpperCase();
    const currentIndex = order.indexOf(normalizedStatus);

    document.querySelectorAll(".step").forEach(step => {
        step.classList.remove("completed", "current");

        const stepStatus = (step.dataset.step || "").toUpperCase();
        const stepIndex = order.indexOf(stepStatus);

        if (currentIndex === -1) {
            return;
        }

        if (stepIndex < currentIndex) {
            step.classList.add("completed");
        } else if (stepIndex === currentIndex) {
            step.classList.add("current");
        }
    });
}

function initFormListeners() {
    const dispatchForm = document.getElementById("dispatchForm");
    if (dispatchForm) {
        dispatchForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const incidentId = document.getElementById("selectedIncidentId")?.value;
            const responderId = document.getElementById("responderId")?.value;
            const responderSearch = document.getElementById("responderSearch")?.value;

            if (!incidentId) {
                alert("Select an incident first.");
                return;
            }

            if (!responderSearch || !responderId) {
                alert("Select a responder from the suggestion list.");
                return;
            }

            const confirmed = confirmAction(
                `Dispatch ${responderSearch} to this incident?`
            );

            if (!confirmed) {
                return;
            }

            try {
                await apiRequest(`${API_BASE}/incidents/${incidentId}/dispatch`, {
                    method: "PUT",
                    body: JSON.stringify({
                        responderId: Number(responderId)
                    })
                });

                const responderSearchInput = document.getElementById("responderSearch");
                const responderIdInput = document.getElementById("responderId");
                const suggestions = document.getElementById("responderSuggestions");

                if (responderSearchInput) responderSearchInput.value = "";
                if (responderIdInput) responderIdInput.value = "";
                if (suggestions) suggestions.innerHTML = "";

                await refreshSelectedIncident(incidentId);
            } catch (error) {
                console.error("Error dispatching responder:", error);
                alert(error.message || "Failed to dispatch responder.");
            }
        });
    }

    const arriveBtn = document.getElementById("arriveBtn");
    if (arriveBtn) {
        arriveBtn.addEventListener("click", async () => {
            if (!currentIncident) {
                alert("Select an incident first.");
                return;
            }

            if (!hasAssignedResponder(currentIncident)) {
                alert("This incident has no assigned responder yet. Dispatch a responder first.");
                return;
            }

            const responderLabel =
                currentIncident.assignedResponderName ||
                currentIncident.responderName ||
                "the assigned responder";

            const confirmed = confirmAction(
                `Mark this incident as arrived for ${responderLabel}?`
            );

            if (!confirmed) {
                return;
            }

            try {
                await apiRequest(`${API_BASE}/incidents/${currentIncident.id}/arrive`, {
                    method: "PUT"
                });

                await refreshSelectedIncident(currentIncident.id);
            } catch (error) {
                console.error("Error marking arrival:", error);
                alert(error.message || "Failed to mark arrival.");
            }
        });
    }

   const resolveBtn = document.getElementById("resolveBtn");
    if (resolveBtn) {
        resolveBtn.addEventListener("click", async () => {
            if (!currentIncident) {
                alert("Select an incident first.");
                return;
            }

            if (!hasAssignedResponder(currentIncident)) {
                alert("This incident has no assigned responder yet. Dispatch a responder first.");
                return;
            }

            const responderLabel =
                currentIncident.assignedResponderName ||
                currentIncident.responderName ||
                "the assigned responder";

            const confirmed = confirmAction(
                `Are you sure you want to resolve this incident handled by ${responderLabel}? This action will finalize the incident.`
            );

            if (!confirmed) {
                return;
            }

            try {
                await apiRequest(`${API_BASE}/incidents/${currentIncident.id}/resolve`, {
                    method: "PUT"
                });

                await refreshSelectedIncident(currentIncident.id);
            } catch (error) {
                console.error("Error resolving incident:", error);
                alert(error.message || "Failed to resolve incident.");
            }
        });
    }
}

async function initOperationsPage() {
    if (!localStorage.getItem("jwtToken")) {
        window.location.href = "login.html";
        return;
    }

    try {
        initFormListeners();

        if (typeof initResponderSearch === "function") {
            initResponderSearch();
        }

        initIncidentFilter();
        toggleIncidentStatus(false);
        updateActionButtons(null);
        updateStatusStepper(null);

        const activityFeed = document.getElementById("activityFeed");
        if (activityFeed) {
            activityFeed.innerHTML = "<p>Select an incident to view details.</p>";
        }

        await loadIncidents();
    } catch (error) {
        console.error("Error initializing operations page:", error);
        alert("Failed to load operations data.");
    }
}

function formatDateTime(dateTime) {
    if (!dateTime) return "-";

    const parsed = new Date(dateTime);
    if (isNaN(parsed.getTime())) return dateTime;

    return parsed.toLocaleString();
}

function renderDispatchIncidentSummary(incident) {
    const summaryBox = document.getElementById("dispatchIncidentSummary");
    const summaryContent = document.getElementById("dispatchIncidentSummaryContent");

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

document.addEventListener("DOMContentLoaded", initOperationsPage);





