const API_BASE = "http://localhost:8080/api";
const token = localStorage.getItem("jwtToken");

let currentIncident = null;

async function apiRequest(url, options = {}) {
    options.headers = {
        ...(options.headers || {}),
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    };

    const response = await fetch(url, options);

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        return response.json();
    }

    return null;
}

async function loadIncidents() {
    const incidents = await apiRequest(`${API_BASE}/incidents`);

    const container = document.getElementById("incidentList");
    container.innerHTML = "";

    incidents
        .filter(i => i.status !== "RESOLVED")
        .forEach(incident => {
            const card = document.createElement("div");
            card.className = "incident-card";
            card.dataset.id = incident.id;

            card.innerHTML = `
                <strong>${incident.type}</strong><br>
                Barangay: ${incident.barangay}<br>
                Severity: ${incident.severity}<br>
                Status: ${incident.status}
            `;

            card.addEventListener("click", () => selectIncident(incident, card));

            container.appendChild(card);
        });
}

async function loadIncidents() {
    const incidents = await apiRequest(`${API_BASE}/incidents`);

    const container = document.getElementById("incidentList");
    container.innerHTML = "";

    incidents
        .filter(i => i.status !== "RESOLVED")
        .forEach(incident => {
            const card = document.createElement("div");
            card.className = "incident-card";
            card.dataset.id = incident.id;

            card.innerHTML = `
                <strong>${incident.type}</strong><br>
                Barangay: ${incident.barangay}<br>
                Severity: ${incident.severity}<br>
                Status: ${incident.status}
            `;

            card.addEventListener("click", () => selectIncident(incident, card));

            container.appendChild(card);
        });
}

async function selectIncident(incident, cardElement) {
    currentIncident = incident;

    document.getElementById("selectedIncidentId").value = incident.id;

    document.querySelectorAll(".incident-card").forEach(card => {
        card.classList.remove("active");
    });
    cardElement.classList.add("active");

    document.getElementById("arriveBtn").disabled =
        incident.status !== "IN_PROGRESS";

    document.getElementById("resolveBtn").disabled =
        !(incident.status === "IN_PROGRESS" || incident.status === "ON_SITE");

    updateStatusStepper(incident.status);
    await loadActivityFeed(incident.id);
}

async function selectIncident(incident, cardElement) {
    currentIncident = incident;

    document.getElementById("selectedIncidentId").value = incident.id;

    document.querySelectorAll(".incident-card").forEach(card => {
        card.classList.remove("active");
    });
    cardElement.classList.add("active");

    document.getElementById("arriveBtn").disabled =
        incident.status !== "IN_PROGRESS";

    document.getElementById("resolveBtn").disabled =
        !(incident.status === "IN_PROGRESS" || incident.status === "ON_SITE");

    updateStatusStepper(incident.status);
    await loadActivityFeed(incident.id);
}

document.getElementById("dispatchForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const incidentId = document.getElementById("selectedIncidentId").value;
    const responderId = document.getElementById("responderId").value;

    if (!incidentId) {
        alert("Select an incident first.");
        return;
    }

    await apiRequest(`${API_BASE}/incidents/${incidentId}/dispatch`, {
        method: "PUT",
        body: JSON.stringify({
            responderId: Number(responderId)
        })
    });

    await refreshSelectedIncident(incidentId);
});

document.getElementById("arriveBtn").addEventListener("click", async () => {
    if (!currentIncident) return;

    await apiRequest(`${API_BASE}/incidents/${currentIncident.id}/arrive`, {
        method: "PUT"
    });

    await refreshSelectedIncident(currentIncident.id);
});

document.getElementById("resolveBtn").addEventListener("click", async () => {
    if (!currentIncident) return;

    await apiRequest(`${API_BASE}/incidents/${currentIncident.id}/resolve`, {
        method: "PUT"
    });

    await refreshSelectedIncident(currentIncident.id);
});

async function refreshSelectedIncident(incidentId) {
    const incidents = await apiRequest(`${API_BASE}/incidents`);
    const updated = incidents.find(i => i.id === Number(incidentId));

    await loadIncidents();

    if (updated) {
        currentIncident = updated;
        updateStatusStepper(updated.status);
        document.getElementById("arriveBtn").disabled =
            updated.status !== "IN_PROGRESS";

        document.getElementById("resolveBtn").disabled =
            !(updated.status === "IN_PROGRESS" || updated.status === "ON_SITE");

        await loadActivityFeed(updated.id);
    }
}

async function loadActivityFeed(incidentId) {
    const actions = await apiRequest(`${API_BASE}/incidents/${incidentId}/actions`);

    const feed = document.getElementById("activityFeed");
    feed.innerHTML = "";

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
}

function updateStatusStepper(status) {
    const order = ["ONGOING", "IN_PROGRESS", "ON_SITE", "RESOLVED"];
    const currentIndex = order.indexOf(status);

    document.querySelectorAll(".step").forEach(step => {
        step.classList.remove("completed", "current");

        const stepStatus = step.dataset.step;
        const stepIndex = order.indexOf(stepStatus);

        if (stepIndex < currentIndex) {
            step.classList.add("completed");
        } else if (stepIndex === currentIndex) {
            step.classList.add("current");
        }
    });
}

async function initOperationsPage() {
    if (!token) {
        window.location.href = "login.html";
        return;
    }

    try {
        await loadIncidents();
    } catch (error) {
        console.error(error);
        alert("Failed to load operations data.");
    }
}

initOperationsPage();