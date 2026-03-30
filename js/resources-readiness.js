async function loadReadinessSummary() {
    try {
        const readiness = await apiGet("/resources/readiness-summary");
        resourcesState.readiness = readiness;
        renderReadinessSummary(readiness);
    } catch (error) {
        console.error("Failed to load readiness summary", error);
        document.getElementById("readinessGrid").innerHTML =
            `<div class="error-state">Failed to load readiness summary.</div>`;

        if (typeof window.renderDismissibleReadinessWarnings === "function") {
            window.renderDismissibleReadinessWarnings([]);
        }
    }
}

function renderReadinessSummary(data) {
    const grid = document.getElementById("readinessGrid");

    grid.innerHTML = `
        <div class="readiness-layout-grid">
            ${renderOverallReadinessCard(
                data.overallReadinessRiskLevel,
                data.overallReadinessScore,
                data
            )}

            ${renderReadinessCard("Inventory Readiness", "fa-boxes-stacked", data.inventoryRiskLevel, `${formatNumber(data.inventoryLowStockCount)} low / ${formatNumber(data.inventoryOutOfStockCount)} out`)}
            ${renderReadinessCard("Relief Readiness", "fa-box-open", data.reliefRiskLevel, `${formatNumber(data.reliefLowStockCount)} low • Coverage ${formatNumber(data.estimatedFamilyCoverage)}`)}
            ${renderReadinessCard("Evacuation Capacity", "fa-warehouse", data.evacuationRiskLevel, `${formatNumber(data.nearFullCentersCount)} near full • ${formatNumber(data.fullCentersCount)} full`)}
            ${renderReadinessCard("Budget Pressure", "fa-wallet", data.budgetRiskLevel, `${formatNumber(data.budgetUtilizationRate)}% utilization`)}
        </div>
    `;

    if (typeof window.renderDismissibleReadinessWarnings === "function") {
        window.renderDismissibleReadinessWarnings(data.warnings || []);
    }
}

function renderReadinessCard(title, icon, level, meta) {
    const css = readinessLevelClass(level);
    return `
        <article class="readiness-card ${css}">
            <div class="readiness-card-head">
                <div class="readiness-card-icon">
                    <i class="fas ${icon}"></i>
                </div>
                <div>
                    <h3>${escapeHtml(title)}</h3>
                    <div class="readiness-value">${escapeHtml(level || "UNKNOWN")}</div>
                </div>
            </div>
            <div class="readiness-meta">${escapeHtml(meta || "-")}</div>
        </article>
    `;
}

function renderOverallReadinessCard(level, score, data) {
    const css = readinessLevelClass(level);
    return `
        <article class="overall-readiness-card ${css}">
            <div class="overall-readiness-main">
                <div class="overall-readiness-icon">
                    <i class="fas fa-shield-heart"></i>
                </div>

                <div class="overall-readiness-copy">
                    <h3>Overall Readiness Risk</h3>
                    <div class="readiness-value">${escapeHtml(level || "UNKNOWN")}</div>
                    <div class="readiness-meta">Score: ${formatNumber(score)} / 100</div>
                </div>
            </div>

            <div class="overall-readiness-context">
                <div class="overall-context-pill">
                    <span>Low Stock Items</span>
                    <strong>${formatNumber(data.inventoryLowStockCount)}</strong>
                </div>
                <div class="overall-context-pill">
                    <span>Relief Coverage</span>
                    <strong>${formatNumber(data.estimatedFamilyCoverage)}</strong>
                </div>
                <div class="overall-context-pill">
                    <span>Near Full Centers</span>
                    <strong>${formatNumber(data.nearFullCentersCount)}</strong>
                </div>
                <div class="overall-context-pill">
                    <span>Budget Utilization</span>
                    <strong>${formatNumber(data.budgetUtilizationRate)}%</strong>
                </div>
            </div>
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