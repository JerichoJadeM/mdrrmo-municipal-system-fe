async function loadOperationalReadiness(type, id) {
    if (!type || !id) {
        showReadinessEmptyState();
        return;
    }

    try {
        resetReadinessView();

        const endpoint = type === "INCIDENT"
            ? `${API_BASE}/operations/forecast/incidents/${id}`
            : `${API_BASE}/operations/forecast/calamities/${id}`;

        const data = await apiRequest(endpoint);
        renderOperationalReadiness(data);
    } catch (error) {
        console.error("Error loading operational readiness:", error);
        showReadinessEmptyState("Unable to load operational readiness.");
        if (typeof showToast === "function") {
            showToast("Failed to load operational readiness.", "error");
        }
    }
}

function resetReadinessView() {
    const warnings = document.getElementById("readinessWarnings");
    const resources = document.getElementById("readinessResources");
    const stockChecks = document.getElementById("readinessStockChecks");
    const relief = document.getElementById("readinessReliefReadiness");
    const evacuation = document.getElementById("readinessEvacuationChecks");
    const costDrivers = document.getElementById("readinessCostDrivers");

    if (warnings) warnings.innerHTML = "";
    if (resources) resources.innerHTML = "";
    if (stockChecks) stockChecks.innerHTML = "";
    if (relief) relief.innerHTML = "";
    if (evacuation) evacuation.innerHTML = "";
    if (costDrivers) costDrivers.innerHTML = "";

    setText("readinessForecastedBudget", "₱0.00");
    setText("readinessActualCost", "₱0.00");
    setText("readinessVariance", "₱0.00");
    setText("readinessEvacuationFlag", "No");
    setText("readinessReliefFlag", "No");
}

function showReadinessEmptyState(message = "Select an incident or calamity to view operational readiness.") {
    const emptyState = document.getElementById("readinessEmptyState");
    const content = document.getElementById("readinessContent");

    if (emptyState) {
        emptyState.classList.remove("hidden");
        emptyState.innerHTML = `<p>${escapeHtml(message)}</p>`;
    }

    if (content) {
        content.classList.add("hidden");
    }

    resetReadinessView();
}

function showReadinessContent() {
    const emptyState = document.getElementById("readinessEmptyState");
    const content = document.getElementById("readinessContent");

    if (emptyState) {
        emptyState.classList.add("hidden");
    }

    if (content) {
        content.classList.remove("hidden");
    }
}

function renderOperationalReadiness(data) {
    if (!data) {
        showReadinessEmptyState("No operational readiness data available.");
        return;
    }

    showReadinessContent();
    renderReadinessSummary(data);
    renderReadinessWarnings(data.warnings || []);
    renderReadinessResources(data.recommendedResources || []);
    renderReadinessStockChecks(data.stockChecks || []);
    renderReadinessRelief(data.reliefReadiness);
    renderReadinessEvacuation(data.evacuationChecks || []);
    renderReadinessCostDrivers(data.costDrivers || []);
}

function renderReadinessSummary(data) {
    setText("readinessForecastedBudget", formatCurrency(data.forecastedBudget));
    setText("readinessActualCost", formatCurrency(data.actualCostToDate));
    setText("readinessVariance", formatCurrency(data.variance));
    setText("readinessEvacuationFlag", data.evacuationRecommended ? "Yes" : "No");
    setText("readinessReliefFlag", data.reliefRecommended ? "Yes" : "No");
}

function renderReadinessWarnings(warnings) {
    const container = document.getElementById("readinessWarnings");
    if (!container) return;

    container.innerHTML = "";

    if (!warnings.length) {
        container.innerHTML = `
            <div class="readiness-empty-card">
                No operational warnings at this time.
            </div>
        `;
        return;
    }

    warnings.forEach(warning => {
        const level = String(warning.level || "INFO").toUpperCase();
        const levelClass = getWarningClass(level);

        const card = document.createElement("div");
        card.className = `readiness-warning-card ${levelClass}`;
        card.innerHTML = `
            <strong>${escapeHtml(level)}</strong><br>
            <span>${escapeHtml(warning.message || "-")}</span>
        `;

        container.appendChild(card);
    });
}

function renderReadinessResources(resources) {
    const container = document.getElementById("readinessResources");
    if (!container) return;

    container.innerHTML = "";

    if (!resources.length) {
        container.innerHTML = `
            <div class="readiness-empty-card">
                No suggested resources available.
            </div>
        `;
        return;
    }

    resources.forEach(resource => {
        const card = document.createElement("div");
        card.className = "readiness-resource-card";
        card.innerHTML = `
            <div class="readiness-item-title">${escapeHtml(resource.itemName || "-")}</div>
            <div class="readiness-item-meta">
                Type: ${escapeHtml(resource.resourceType || "-")}<br>
                Category: ${escapeHtml(resource.category || "-")}<br>
                Quantity: ${escapeHtml(String(resource.suggestedQuantity ?? 0))} ${escapeHtml(resource.unit || "")}<br>
                Reason: ${escapeHtml(resource.reason || "-")}
            </div>
        `;
        container.appendChild(card);
    });
}

function renderReadinessStockChecks(stockChecks) {
    const container = document.getElementById("readinessStockChecks");
    if (!container) return;

    container.innerHTML = "";

    if (!stockChecks.length) {
        container.innerHTML = `
            <div class="readiness-empty-card">
                No stock checks available.
            </div>
        `;
        return;
    }

    stockChecks.forEach(stock => {
        const status = String(stock.status || "").toUpperCase();
        const statusClass = getReadinessStatusClass(status);

        const card = document.createElement("div");
        card.className = "readiness-stock-card";
        card.innerHTML = `
            <div class="readiness-item-title">${escapeHtml(stock.itemName || "-")}</div>
            <div class="readiness-item-meta">
                Category: ${escapeHtml(stock.category || "-")}<br>
                Required: ${escapeHtml(String(stock.requiredQuantity ?? 0))} ${escapeHtml(stock.unit || "")}<br>
                Available: ${escapeHtml(String(stock.availableQuantity ?? 0))} ${escapeHtml(stock.unit || "")}
            </div>
            <span class="readiness-status-badge ${statusClass}">
                ${escapeHtml(status || "-")}
            </span>
        `;
        container.appendChild(card);
    });
}

function renderReadinessRelief(reliefReadiness) {
    const container = document.getElementById("readinessReliefReadiness");
    if (!container) return;

    container.innerHTML = "";

    if (!reliefReadiness) {
        container.innerHTML = `
            <div class="readiness-empty-card">
                No relief readiness information available.
            </div>
        `;
        return;
    }

    if (!reliefReadiness.recommended) {
        container.innerHTML = `
            <div class="readiness-empty-card">
                Relief support is not currently recommended.
            </div>
        `;
        return;
    }

    const reliefStockChecks = reliefReadiness.reliefStockChecks || [];

    const reliefMeta = document.createElement("div");
    reliefMeta.className = "readiness-relief-meta";
    reliefMeta.innerHTML = `
        Projected Beneficiaries: ${escapeHtml(String(reliefReadiness.projectedBeneficiaries ?? 0))}<br>
        Projected Relief Packs: ${escapeHtml(String(reliefReadiness.projectedReliefPacks ?? 0))}
    `;

    container.appendChild(reliefMeta);

    if (!reliefStockChecks.length) {
        const empty = document.createElement("div");
        empty.className = "readiness-empty-card";
        empty.textContent = "No relief stock checks available.";
        container.appendChild(empty);
        return;
    }

    const stockList = document.createElement("div");
    stockList.className = "readiness-relief-stock-list";

    reliefStockChecks.forEach(stock => {
        const status = String(stock.status || "").toUpperCase();
        const statusClass = getReadinessStatusClass(status);

        const card = document.createElement("div");
        card.className = "readiness-stock-card";
        card.innerHTML = `
            <div class="readiness-item-title">${escapeHtml(stock.itemName || "-")}</div>
            <div class="readiness-item-meta">
                Category: ${escapeHtml(stock.category || "-")}<br>
                Required: ${escapeHtml(String(stock.requiredQuantity ?? 0))} ${escapeHtml(stock.unit || "")}<br>
                Available: ${escapeHtml(String(stock.availableQuantity ?? 0))} ${escapeHtml(stock.unit || "")}
            </div>
            <span class="readiness-status-badge ${statusClass}">
                ${escapeHtml(status || "-")}
            </span>
        `;

        stockList.appendChild(card);
    });

    container.appendChild(stockList);
}

function renderReadinessEvacuation(evacuationChecks) {
    const container = document.getElementById("readinessEvacuationChecks");
    if (!container) return;

    container.innerHTML = "";

    if (!evacuationChecks.length) {
        container.innerHTML = `
            <div class="readiness-empty-card">
                No evacuation action currently recommended.
            </div>
        `;
        return;
    }

    evacuationChecks.forEach(check => {
        const status = String(check.status || "").toUpperCase();
        const statusClass = getReadinessStatusClass(status);

        const card = document.createElement("div");
        card.className = "readiness-evacuation-card";
        card.innerHTML = `
            <div class="readiness-item-title">${escapeHtml(check.centerName || "-")}</div>
            <div class="readiness-item-meta">
                Barangay: ${escapeHtml(check.barangayName || "-")}<br>
                Capacity: ${escapeHtml(String(check.capacity ?? 0))}<br>
                Current Evacuees: ${escapeHtml(String(check.currentEvacuees ?? 0))}<br>
                Available Slots: ${escapeHtml(String(check.availableSlots ?? 0))}
            </div>
            <span class="readiness-status-badge ${statusClass}">
                ${escapeHtml(status || "-")}
            </span>
        `;
        container.appendChild(card);
    });
}

function renderReadinessCostDrivers(costDrivers) {
    const container = document.getElementById("readinessCostDrivers");
    if (!container) return;

    container.innerHTML = "";

    if (!costDrivers.length) {
        container.innerHTML = `
            <div class="readiness-empty-card">
                No cost drivers available.
            </div>
        `;
        return;
    }

    costDrivers.forEach(driver => {
        const card = document.createElement("div");
        card.className = "readiness-cost-driver-card";
        card.innerHTML = `
            <div class="readiness-cost-driver-row">
                <strong>${escapeHtml(driver.name || "-")}</strong>
                <span>${formatCurrency(driver.amount)}</span>
            </div>
        `;
        container.appendChild(card);
    });
}

function getWarningClass(level) {
    switch (String(level || "").toUpperCase()) {
        case "CRITICAL":
            return "readiness-warning-critical";
        case "WARNING":
            return "readiness-warning-warning";
        default:
            return "readiness-warning-info";
    }
}

function getReadinessStatusClass(status) {
    switch (String(status || "").toUpperCase()) {
        case "AVAILABLE":
            return "readiness-status-available";
        case "LOW_STOCK":
            return "readiness-status-low_stock";
        case "OUT_OF_STOCK":
            return "readiness-status-out_of_stock";
        case "NOT_FOUND":
            return "readiness-status-not_found";
        case "NEAR_CAPACITY":
            return "readiness-status-near_capacity";
        case "FULL":
            return "readiness-status-full";
        default:
            return "readiness-status-warning";
    }
}

function formatCurrency(value) {
    const numeric = Number(value || 0);
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP"
    }).format(numeric);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = value;
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