async function loadReadinessSummary() {
    try {
        const readiness = await apiGet("/resources/readiness-summary");
        resourcesState.readiness = readiness;
        renderReadinessSummary(readiness);
    } catch (error) {
        console.error("Failed to load readiness summary", error);
        document.getElementById("readinessGrid").innerHTML =
            `<div class="error-state">Failed to load readiness summary.</div>`;
    }
}

function renderReadinessSummary(data) {
    const grid = document.getElementById("readinessGrid");
    const warnings = document.getElementById("readinessWarnings");

    grid.innerHTML = `
        ${renderReadinessCard("Inventory Readiness", data.inventoryRiskLevel, `${formatNumber(data.inventoryLowStockCount)} low / ${formatNumber(data.inventoryOutOfStockCount)} out`)}
        ${renderReadinessCard("Relief Readiness", data.reliefRiskLevel, `${formatNumber(data.reliefLowStockCount)} low • Coverage ${formatNumber(data.estimatedFamilyCoverage)}`)}
        ${renderReadinessCard("Evacuation Capacity", data.evacuationRiskLevel, `${formatNumber(data.nearFullCentersCount)} near full • ${formatNumber(data.fullCentersCount)} full`)}
        ${renderReadinessCard("Budget Pressure", data.budgetRiskLevel, `${formatNumber(data.budgetUtilizationRate)}% utilization`)}
        ${renderOverallReadinessCard(data.overallReadinessRiskLevel, data.overallReadinessScore)}
    `;

    if (!data.warnings || !data.warnings.length) {
        warnings.innerHTML = `<div class="empty-state">No readiness warnings right now.</div>`;
        return;
    }

    warnings.innerHTML = data.warnings
        .map(item => `<div class="warning-item">${escapeHtml(item)}</div>`)
        .join("");
}

function renderReadinessCard(title, level, meta) {
    const css = readinessLevelClass(level);
    return `
        <article class="readiness-card ${css}">
            <h3>${escapeHtml(title)}</h3>
            <div class="readiness-value">${escapeHtml(level || "UNKNOWN")}</div>
            <div class="readiness-meta">${escapeHtml(meta || "-")}</div>
        </article>
    `;
}

function renderOverallReadinessCard(level, score) {
    const css = readinessLevelClass(level);
    return `
        <article class="overall-readiness-card ${css}">
            <h3>Overall Readiness Risk</h3>
            <div class="readiness-value">${escapeHtml(level || "UNKNOWN")}</div>
            <div class="readiness-meta">Score: ${formatNumber(score)} / 100</div>
        </article>
    `;
}

function readinessLevelClass(level) {
    switch ((level || "").toUpperCase()) {
        case "CRITICAL": return "readiness-critical";
        case "HIGH": return "readiness-high";
        case "MODERATE": return "readiness-moderate";
        default: return "readiness-low";
    }
}