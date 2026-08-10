window.loadBudgetSection = async function () {
    try {
        const [budgets, currentSummary, historyRows, forecast, breakdown, previousYears] = await Promise.all([
            apiGet("/budgets"),
            apiGet("/budgets/current-summary"),
            apiGet("/budgets/history"),
            apiGet("/budgets/forecast/next-year"),
            apiGet("/budgets/forecast/next-year/breakdown").catch(() => null),
            apiGet("/budgets/previous-years").catch(() => [])
        ]);

        const mergedHistoryRows = mergeBudgetHistoryRows(historyRows || [], previousYears || [], currentSummary);

        renderBudgetToolbar();
        renderCurrentBudgetSummary(currentSummary);
        renderBudgetHistory(mergedHistoryRows);
        renderNextYearForecast(forecast, breakdown);

        const selectedYear = Number(
            document.getElementById("budgetYearAnalyticsSelect")?.value || currentSummary?.year
        );

        if (selectedYear) {
            const analytics = await apiGet(`/budgets/${selectedYear}/analytics`);
            window.__budgetAnalyticsData = analytics;
            renderBudgetAnalytics(analytics);
        } else {
            window.__budgetAnalyticsData = null;
            renderBudgetAnalytics(null);
        }

        bindBudgetToolbarEvents(currentSummary);
    } catch (error) {
        console.error("Failed to load budget section", error);

        const currentBudgetSummary = document.getElementById("currentBudgetSummary");
        const budgetHistoryContainer = document.getElementById("budgetHistoryContainer");
        const summaryContainer = document.getElementById("nextYearForecastSummaryContainer");
        const breakdownContainer = document.getElementById("nextYearForecastBreakdownContainer");
        const driversContainer = document.getElementById("nextYearForecastDriversContainer");
        const categoriesContainer = document.getElementById("nextYearForecastCategoriesContainer");
        const budgetAnalyticsContainer = document.getElementById("budgetAnalyticsContainer");

        if (currentBudgetSummary) {
            currentBudgetSummary.innerHTML = `<div class="error-state">Failed to load current budget summary.</div>`;
        }
        if (budgetHistoryContainer) {
            budgetHistoryContainer.innerHTML = `<div class="error-state">Failed to load budget history.</div>`;
        }
        if (summaryContainer) {
            summaryContainer.innerHTML = `<div class="error-state">Failed to load forecast summary.</div>`;
        }
        if (breakdownContainer) {
            breakdownContainer.innerHTML = `<div class="error-state">Failed to load forecast breakdown.</div>`;
        }
        if (driversContainer) {
            driversContainer.innerHTML = `<div class="error-state">Failed to load forecast drivers.</div>`;
        }
        if (categoriesContainer) {
            categoriesContainer.innerHTML = `<div class="error-state">Failed to load forecast categories.</div>`;
        }
        if (budgetAnalyticsContainer) {
            budgetAnalyticsContainer.innerHTML = `<div class="error-state">Failed to load budget analytics.</div>`;
        }
    }
};

function renderBudgetToolbar() {
    const toolbar = document.getElementById("budgetToolbarContainer");
    if (!toolbar) return;
    toolbar.innerHTML = "";
}

function bindBudgetToolbarEvents(currentSummary) {
    const analyticsSelect = document.getElementById("budgetYearAnalyticsSelect");
    const sectionFilter = document.getElementById("budgetAnalyticsSectionFilter");
    const categorySearch = document.getElementById("budgetAnalyticsCategorySearch");

    if (analyticsSelect && !analyticsSelect.dataset.bound) {
        analyticsSelect.dataset.bound = "true";
        analyticsSelect.addEventListener("change", async () => {
            try {
                const selectedYear = Number(analyticsSelect.value);
                const analytics = await apiGet(`/budgets/${selectedYear}/analytics`);
                window.__budgetAnalyticsData = analytics;
                renderBudgetAnalytics(analytics);
            } catch (error) {
                console.error("Failed to load analytics", error);
                showToast("Failed to load budget analytics.", "error");
            }
        });
    }

    if (sectionFilter && !sectionFilter.dataset.bound) {
        sectionFilter.dataset.bound = "true";
        sectionFilter.addEventListener("change", () => {
            renderBudgetAnalytics(window.__budgetAnalyticsData);
        });
    }

    if (categorySearch && !categorySearch.dataset.bound) {
        categorySearch.dataset.bound = "true";
        categorySearch.addEventListener("input", () => {
            renderBudgetAnalytics(window.__budgetAnalyticsData);
        });
    }

}

function renderCurrentBudgetSummary(summary) {
    const container = document.getElementById("currentBudgetSummary");
    if (!container) return;

    if (!summary) {
        container.innerHTML = `<div class="empty-state">No current budget found.</div>`;
        return;
    }

    container.innerHTML = `
        <div class="section-toolbar budget-card-head">
            <div>
                <h3>Current Budget</h3>
                <p>Active budget summary for the current financial year.</p>
            </div>

            <div class="toolbar-right">
                ${canManageBudget() ? `
                    <button class="btn btn-primary" id="addBudgetBtn">
                        <i class="fas fa-plus"></i>
                        Add Budget
                    </button>

                    <button class="btn btn-light" id="allocateBudgetCategoryBtn">
                        <i class="fas fa-layer-group"></i>
                        Allocate Category
                    </button>
                ` : ""}

                ${canManagePreviousYearBudget() ? `
                    <button class="btn btn-light" id="addPreviousYearBudgetBtn">
                        <i class="fas fa-history"></i>
                        Add Previous Year
                    </button>
                ` : ""}
            </div>
        </div>

        <div class="metric-row">
            <div class="metric-card">
                <div class="metric-label">Year</div>
                <div class="metric-value">${summary.year}</div>
            </div>

            <div class="metric-card">
                <div class="metric-label">Allotment</div>
                <div class="metric-value">${formatPeso(summary.totalAllotment)}</div>
            </div>

            <div class="metric-card">
                <div class="metric-label">Allocated</div>
                <div class="metric-value">${formatPeso(summary.totalAllocated)}</div>
            </div>

            <div class="metric-card">
                <div class="metric-label">Obligations</div>
                <div class="metric-value">${formatPeso(summary.totalObligations)}</div>
            </div>

            <div class="metric-card">
                <div class="metric-label">Remaining</div>
                <div class="metric-value">${formatPeso(summary.totalRemaining)}</div>
            </div>

            <div class="metric-card">
                <div class="metric-label">Allocation Rate</div>
                <div class="metric-value">${formatPercent(summary.allocationRate)}</div>
            </div>

            <div class="metric-card">
                <div class="metric-label">Utilization</div>
                <div class="metric-value">${formatPercent(summary.utilizationRate)}</div>
            </div>
        </div>

        <div class="budget-description">
            <strong>Description:</strong> ${escapeHtml(summary.description || "-")}
        </div>
    `;

    bindCurrentBudgetActions(summary);
}

function bindCurrentBudgetActions(currentSummary) {
    const addBudgetBtn = document.getElementById("addBudgetBtn");
    const allocateBtn = document.getElementById("allocateBudgetCategoryBtn");
    const addPreviousYearBtn = document.getElementById("addPreviousYearBudgetBtn");

    if (addBudgetBtn && !addBudgetBtn.dataset.bound) {
        addBudgetBtn.dataset.bound = "true";
        addBudgetBtn.addEventListener("click", () => {
            openAddBudgetModal(currentSummary?.year);
        });
    }

    if (allocateBtn && !allocateBtn.dataset.bound) {
        allocateBtn.dataset.bound = "true";
        allocateBtn.addEventListener("click", () => {
            openAllocateBudgetCategoryModal(currentSummary);
        });
    }

    if (addPreviousYearBtn && !addPreviousYearBtn.dataset.bound) {
        addPreviousYearBtn.dataset.bound = "true";
        addPreviousYearBtn.addEventListener("click", () => {
            openAddPreviousYearModal(currentSummary?.year);
        });
    }
}

function mergeBudgetHistoryRows(historyRows = [], previousYears = [], currentSummary = null) {
    const rows = [...historyRows.map(normalizeBudgetHistoryRow)];

    if (currentSummary) {
        const currentYear = Number(currentSummary.year);
        const currentRow = normalizeBudgetHistoryRow({
            year: currentYear,
            allotment: currentSummary.totalAllotment ?? currentSummary.allotment,
            obligations: currentSummary.totalObligations ?? currentSummary.obligations,
            remainingBalance: currentSummary.totalRemaining ?? currentSummary.remainingBalance,
            utilizationRate: currentSummary.utilizationRate ?? currentSummary.utilization
        });

        const hasCurrentYear = rows.some(row => Number(row.year) === currentYear);
        if (!hasCurrentYear && currentRow) {
            rows.unshift(currentRow);
        }
    }

    previousYears.forEach(item => {
        const normalized = normalizeBudgetHistoryRow(item);
        if (!normalized) return;

        const year = Number(normalized.year);
        const alreadyExists = rows.some(row => Number(row.year) === year);
        if (!alreadyExists) {
            rows.push(normalized);
        }
    });

    return rows.sort((a, b) => Number(b.year) - Number(a.year));
}

function normalizeBudgetHistoryRow(row) {
    if (!row || row === null) return null;

    const year = Number(row.year);
    if (!Number.isFinite(year)) return null;

    const allotment = Number(row.allotment ?? row.totalAllotment ?? row.amount ?? 0);
    const obligations = Number(row.obligations ?? row.totalObligations ?? row.totalSpent ?? 0);
    const remainingBalance = Number(row.remainingBalance ?? (Number.isFinite(allotment) ? Math.max(allotment - obligations, 0) : 0));
    const utilizationRate = Number(row.utilizationRate ?? (allotment > 0 ? (obligations / allotment) * 100 : 0));

    return {
        year,
        allotment: Number.isFinite(allotment) ? allotment : 0,
        obligations: Number.isFinite(obligations) ? obligations : 0,
        remainingBalance: Number.isFinite(remainingBalance) ? remainingBalance : 0,
        utilizationRate: Number.isFinite(utilizationRate) ? utilizationRate : 0
    };
}

function renderBudgetHistory(historyRows) {
    const container = document.getElementById("budgetHistoryContainer");
    if (!container) return;

    if (!historyRows || !historyRows.length) {
        container.innerHTML = `<div class="empty-state">No budget history found.</div>`;
        return;
    }

    container.innerHTML = `
        <div class="table-scroll-x">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Year</th>
                        <th>Allotment</th>
                        <th>Obligations</th>
                        <th>Remaining</th>
                        <th>Utilization</th>
                    </tr>
                </thead>
                <tbody>
                    ${historyRows.map(row => `
                        <tr>
                            <td>${row.year}</td>
                            <td>${formatPeso(row.allotment)}</td>
                            <td>${formatPeso(row.obligations)}</td>
                            <td>${formatPeso(row.remainingBalance)}</td>
                            <td>${formatPercent(row.utilizationRate)}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function renderNextYearForecast(forecast, breakdown) {
    const summaryContainer = document.getElementById("nextYearForecastSummaryContainer");
    const breakdownContainer = document.getElementById("nextYearForecastBreakdownContainer");
    const driversContainer = document.getElementById("nextYearForecastDriversContainer");
    const categoriesContainer = document.getElementById("nextYearForecastCategoriesContainer");

    if (!summaryContainer || !breakdownContainer || !driversContainer || !categoriesContainer) {
        return;
    }

    if (!forecast) {
        summaryContainer.innerHTML = `<div class="empty-state">No forecast available.</div>`;
        breakdownContainer.innerHTML = `<div class="empty-state">No breakdown available.</div>`;
        driversContainer.innerHTML = `<div class="empty-state">No forecast drivers available.</div>`;
        categoriesContainer.innerHTML = `<div class="empty-state">No category forecast available.</div>`;
        return;
    }

    summaryContainer.innerHTML = `
        <div class="metric-row forecast-summary-row">
            <div class="metric-card forecast-summary-card forecast-year-card">
                <div class="metric-label">Forecast Year</div>
                <div class="metric-value">${forecast.year}</div>
            </div>

            <div class="metric-card forecast-summary-card forecast-total-card">
                <div class="metric-label">Total Forecast</div>
                <div class="metric-value">${formatPeso(forecast.totalForecast)}</div>
            </div>
        </div>

        ${
            breakdown ? `
                <div class="metric-row forecast-chunk-row" style="margin-top: 14px;">
                    <div class="metric-card forecast-summary-card forecast-incident-card">
                        <div class="metric-label">Incident Forecast Chunk</div>
                        <div class="metric-value">${formatPeso(breakdown.incidentForecastTotal)}</div>
                        <div class="metric-meta">${formatPercent(breakdown.incidentSharePercent)} of total</div>
                    </div>

                    <div class="metric-card forecast-summary-card forecast-calamity-card">
                        <div class="metric-label">Calamity Forecast Chunk</div>
                        <div class="metric-value">${formatPeso(breakdown.calamityForecastTotal)}</div>
                        <div class="metric-meta">${formatPercent(breakdown.calamitySharePercent)} of total</div>
                    </div>
                </div>
            ` : ""
        }

        <div class="budget-description">
            <strong>Assumptions:</strong> ${escapeHtml(forecast.assumptions || "-")}
        </div>
    `;
    if (breakdown) {
        breakdownContainer.innerHTML = `
            <div>
                <div class="section-header compact-head">
                    <div>
                        <h3>Incident Type Forecasts</h3>
                        <p>Forecast planning by incident type.</p>
                    </div>
                </div>
                ${renderOperationTypeForecastTable(
                    breakdown.incidentTypeForecasts,
                    "No incident type forecasts available.",
                    "INCIDENT"
                )}
            </div>

            <div style="margin-top:20px;">
                <div class="section-header compact-head">
                    <div>
                        <h3>Calamity Type Forecasts</h3>
                        <p>Forecast planning by calamity type.</p>
                    </div>
                </div>
                ${renderOperationTypeForecastTable(
                    breakdown.calamityTypeForecasts,
                    "No calamity type forecasts available.",
                    "CALAMITY"
                )}
            </div>
        `;
    } else {
        breakdownContainer.innerHTML = `<div class="empty-state">No operations forecast breakdown available.</div>`;
    }

    driversContainer.innerHTML = (forecast.drivers && forecast.drivers.length)
        ? `
            <div class="table-scroll-x">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Driver</th>
                            <th>Value</th>
                            <th>Note</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${forecast.drivers.map(driver => `
                            <tr>
                                <td>${escapeHtml(driver.driver)}</td>
                                <td>${escapeHtml(driver.value)}</td>
                                <td>${escapeHtml(driver.note)}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `
        : `<div class="empty-state">No forecast drivers available.</div>`;

    categoriesContainer.innerHTML = (forecast.categories && forecast.categories.length)
        ? `
            <div class="table-scroll-x">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Section</th>
                            <th>Category</th>
                            <th>5Y Baseline</th>
                            <th>Trend Adj.</th>
                            <th>Rule-Based</th>
                            <th>Historical Adj.</th>
                            <th>Price Adj.</th>
                            <th>Contingency</th>
                            <th>Final Forecast</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${forecast.categories.map(row => `
                            <tr>
                                <td>${escapeHtml(row.section)}</td>
                                <td>${escapeHtml(row.category)}</td>
                                <td>${formatPeso(row.historicalBaseline)}</td>
                                <td>${formatPeso(row.trendAdjustment)}</td>
                                <td>${formatPeso(row.ruleBasedAmount)}</td>
                                <td>${formatPeso(row.historicalAdjustment)}</td>
                                <td>${formatPeso(row.priceAdjustment)}</td>
                                <td>${formatPeso(row.contingencyAmount)}</td>
                                <td><strong>${formatPeso(row.finalAmount)}</strong></td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `
        : `<div class="empty-state">No category forecast available.</div>`;
}

function getOperationForecastActualValue(row, operationType) {
    const candidates = [
        row?.actualCost,
        row?.actualCostToDate,
        row?.operationsActualCost,
        row?.operationsCost,
        row?.operationalActualCost,
        row?.liveActualCost
    ];

    const backendValue = candidates.find(item => item !== undefined && item !== null && item !== "");
    if (backendValue !== undefined) {
        return Number(backendValue || 0);
    }

    return getPersistedOperationActualCostByType(operationType, row?.type);
}

function getPersistedOperationActualCostByType(operationType, forecastType) {
    if (!forecastType) return 0;

    try {
        const raw = localStorage.getItem("mdrrmoOperationActualCosts");
        const state = raw ? JSON.parse(raw) : {};
        const normalizedType = String(operationType || "").toUpperCase();
        const normalizedForecastType = String(forecastType || "").trim().toLowerCase();

        return Object.values(state || {})
            .filter(entry =>
                String(entry?.type || "").toUpperCase() === normalizedType &&
                String(entry?.eventType || "").trim().toLowerCase() === normalizedForecastType
            )
            .reduce((sum, entry) => sum + Number(entry?.actualCost || 0), 0);
    } catch (error) {
        console.warn("Unable to read persisted operation actual costs:", error);
        return 0;
    }
}

function renderOperationTypeForecastTable(rows, emptyMessage, operationType) {
    if (!rows || !rows.length) {
        return `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
    }

    return `
        <div class="table-scroll-x">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Type</th>
                        <th>Historical Count</th>
                        <th>Historical Cost</th>
                        <th>Avg. Cost</th>
                        <th>Forecast</th>
                        <th>Ops Actual</th>
                        <th>Share</th>
                        <th>Note</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(row => `
                        <tr>
                            <td>${escapeHtml(row.type)}</td>
                            <td>${formatNumber(row.historicalCount)}</td>
                            <td>${formatPeso(row.historicalCost)}</td>
                            <td>${formatPeso(row.historicalAverageCost)}</td>
                            <td><strong>${formatPeso(row.forecastAmount)}</strong></td>
                            <td>${formatPeso(getOperationForecastActualValue(row, operationType))}</td>
                            <td>${formatPercent(row.sharePercent)}</td>
                            <td>${escapeHtml(row.note || "-")}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function renderBudgetAnalytics(analytics) {
    const container = document.getElementById("budgetAnalyticsContainer");
    if (!container) return;

    if (!analytics) {
        container.innerHTML = `<div class="empty-state">No budget analytics found.</div>`;
        return;
    }

    const sectionFilterValue = document.getElementById("budgetAnalyticsSectionFilter")?.value?.trim() || "";
    const categorySearchValue = document.getElementById("budgetAnalyticsCategorySearch")?.value?.trim().toLowerCase() || "";

    const filteredCategoryTotals = (analytics.categoryTotals || []).filter(row => {
        const matchesSection = !sectionFilterValue || row.section === sectionFilterValue;
        const matchesCategory = !categorySearchValue || row.categoryName.toLowerCase().includes(categorySearchValue);
        return matchesSection && matchesCategory;
    });

    const filteredSectionTotals = (analytics.sectionTotals || []).filter(row => {
        return !sectionFilterValue || row.section === sectionFilterValue;
    });

    container.innerHTML = `
        <div class="panel-card budget-analytics-solo">
            <div class="section-header compact-head">
                <div>
                    <h3>Budget Analytics - ${analytics.year}</h3>
                    <p>Section, category, and operation-linked cost visibility.</p>
                </div>
            </div>

            <div class="metric-row">
                <div class="metric-card">
                    <div class="metric-label">Allotment</div>
                    <div class="metric-value">${formatPeso(analytics.totalAllotment)}</div>
                </div>

                <div class="metric-card">
                    <div class="metric-label">Obligations</div>
                    <div class="metric-value">${formatPeso(analytics.totalObligations)}</div>
                </div>

                <div class="metric-card">
                    <div class="metric-label">Remaining</div>
                    <div class="metric-value">${formatPeso(analytics.totalRemaining)}</div>
                </div>

                <div class="metric-card">
                    <div class="metric-label">Utilization</div>
                    <div class="metric-value">${formatPercent(analytics.utilizationRate)}</div>
                </div>
            </div>
        </div>

        <div class="budget-analytics-pair-grid">
            <div class="panel-card">
                <div class="section-header compact-head">
                    <div><h3>Section Totals</h3></div>
                </div>
                <div class="table-scroll-x">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Section</th>
                                <th>Allocated</th>
                                <th>Obligated</th>
                                <th>Remaining</th>
                                <th>Utilization</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredSectionTotals.length ? filteredSectionTotals.map(row => `
                                <tr>
                                    <td>${escapeHtml(row.section)}</td>
                                    <td>${formatPeso(row.allocatedAmount)}</td>
                                    <td>${formatPeso(row.obligatedAmount)}</td>
                                    <td>${formatPeso(row.remainingAmount)}</td>
                                    <td>${formatPercent(row.utilizationRate)}</td>
                                </tr>
                            `).join("") : `
                                <tr><td colspan="5" class="empty-state">No matching section totals found.</td></tr>
                            `}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="panel-card">
                <div class="section-header compact-head">
                    <div><h3>Category Totals</h3></div>
                </div>
                <div class="table-scroll-x">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Section</th>
                                <th>Category</th>
                                <th>Allocated</th>
                                <th>Obligated</th>
                                <th>Remaining</th>
                                <th>Utilization</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredCategoryTotals.length ? filteredCategoryTotals.map(row => `
                                <tr>
                                    <td>${escapeHtml(row.section)}</td>
                                    <td>${escapeHtml(row.categoryName)}</td>
                                    <td>${formatPeso(row.allocatedAmount)}</td>
                                    <td>${formatPeso(row.obligatedAmount)}</td>
                                    <td>${formatPeso(row.remainingAmount)}</td>
                                    <td>${formatPercent(row.utilizationRate)}</td>
                                </tr>
                            `).join("") : `
                                <tr><td colspan="6" class="empty-state">No matching category totals found.</td></tr>
                            `}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <div class="budget-linked-cost-grid" style="margin-top: 18px;">
            <div class="panel-card">
                <div class="section-header compact-head">
                    <div><h3>Incident-Linked Costs</h3></div>
                </div>
                ${renderOperationCostsTable(analytics.incidentCosts, "No incident-linked costs found.")}
            </div>

            <div class="panel-card">
                <div class="section-header compact-head">
                    <div><h3>Calamity-Linked Costs</h3></div>
                </div>
                ${renderOperationCostsTable(analytics.calamityCosts, "No calamity-linked costs found.")}
            </div>
        </div>
    `;
}

function renderOperationCostsTable(rows, emptyMessage) {
    if (!rows || !rows.length) {
        return `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
    }

    return `
        <table class="data-table operation-costs-table compact-inline-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Operation</th>
                    <th>Total Cost</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(row => `
                    <tr>
                        <td>${row.operationId}</td>
                        <td>${escapeHtml(row.operationLabel)}</td>
                        <td>${formatPeso(row.totalCost)}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}

function renderDismissibleReadinessWarnings(items) {
    const container = document.getElementById("readinessWarnings");
    if (!container) return;

    if (!items || !items.length) {
        container.innerHTML = "";
        container.classList.remove("has-content");
        return;
    }

    container.classList.add("has-content");
    container.innerHTML = `
        <div class="resources-warning-shell">
            <div class="resources-warning-head">
                <div class="resources-warning-title">
                    <i class="fas fa-triangle-exclamation"></i>
                    <span>Readiness Warnings</span>
                </div>
                <button type="button" class="resources-warning-close" id="closeReadinessWarningsBtn" aria-label="Close warnings">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div class="resources-warning-list">
                ${items.map(item => `
                    <div class="warning-item">
                        ${escapeHtml(item.message || item.text || item.note || String(item))}
                    </div>
                `).join("")}
            </div>
        </div>
    `;

    document.getElementById("closeReadinessWarningsBtn")?.addEventListener("click", () => {
        container.innerHTML = "";
        container.classList.remove("has-content");
    });
}

function canManageBudget() {
    if (typeof getUserRoles === "function") {
        const roles = getUserRoles();
        return roles.includes("ROLE_ADMIN");
    }

    try {
        const roles = JSON.parse(localStorage.getItem("userAuthorities") || "[]");
        return roles.includes("ROLE_ADMIN");
    } catch (e) {
        return false;
    }
}

function canManagePreviousYearBudget() {
    if (typeof getUserRoles === "function") {
        return getUserRoles().includes("ROLE_ADMIN");
    }

    try {
        const roles = JSON.parse(localStorage.getItem("userAuthorities") || "[]");
        return roles.includes("ROLE_ADMIN");
    } catch (e) {
        return false;
    }
}

function openAddPreviousYearModal(defaultYear) {
    const previousYear = Number(defaultYear || new Date().getFullYear()) - 1;

    openResourcesModal({
        title: "Add Previous Year",
        bodyHtml: `
            <form id="addPreviousYearForm" class="form-grid">
                <div class="form-group">
                    <label>Year</label>
                    <input type="number" id="previousYearInput" name="year" min="2000" step="1" value="${previousYear}" required>
                </div>

                <div class="form-group">
                    <label>Allotment</label>
                    <input type="number" id="previousYearAllotmentInput" name="allotment" min="0" step="0.01" placeholder="1500000" required>
                </div>

                <div class="form-group">
                    <label>Obligations</label>
                    <input type="number" id="previousYearObligationsInput" name="obligations" min="0" step="0.01" placeholder="1350000" required>
                </div>

                <div class="form-group full" style="margin-top: 10px;">
                    <div class="metric-row" style="margin: 0;">
                        <div class="metric-card" style="flex: 1;">
                            <div class="metric-label">Remaining</div>
                            <div class="metric-value" id="previousYearRemainingValue">₱0.00</div>
                        </div>
                        <div class="metric-card" style="flex: 1;">
                            <div class="metric-label">Utilization</div>
                            <div class="metric-value" id="previousYearUtilizationValue">0.00%</div>
                        </div>
                    </div>
                </div>
            </form>
        `,
        footerHtml: `
            <button class="btn btn-light" id="cancelAddPreviousYearBtn">Cancel</button>
            <button class="btn btn-primary" id="submitAddPreviousYearBtn">Save</button>
        `
    });

    const yearInput = document.getElementById("previousYearInput");
    const allotmentInput = document.getElementById("previousYearAllotmentInput");
    const obligationsInput = document.getElementById("previousYearObligationsInput");
    const remainingValue = document.getElementById("previousYearRemainingValue");
    const utilizationValue = document.getElementById("previousYearUtilizationValue");

    const updatePreviousYearSummary = () => {
        const allotment = Number(allotmentInput?.value || 0);
        const obligations = Number(obligationsInput?.value || 0);
        const remaining = Math.max(allotment - obligations, 0);
        const utilization = allotment > 0 ? (obligations / allotment) * 100 : 0;

        if (remainingValue) {
            remainingValue.textContent = formatPeso(remaining);
        }

        if (utilizationValue) {
            utilizationValue.textContent = `${utilization.toFixed(2)}%`;
        }
    };

    [allotmentInput, obligationsInput].forEach(input => {
        input?.addEventListener("input", updatePreviousYearSummary);
    });

    updatePreviousYearSummary();

    document.getElementById("cancelAddPreviousYearBtn")?.addEventListener("click", closeResourcesModal);

    document.getElementById("submitAddPreviousYearBtn")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const originalText = button.textContent;

        const form = document.getElementById("addPreviousYearForm");
        const formData = new FormData(form);

        const payload = {
            year: Number(formData.get("year")),
            allotment: Number(formData.get("allotment")),
            obligations: Number(formData.get("obligations"))
        };

        if (!payload.year || Number.isNaN(payload.year) || payload.year < 2000) {
            showToast("Please enter a valid year.", "error");
            return;
        }

        if (!Number.isFinite(payload.allotment) || payload.allotment < 0) {
            showToast("Please enter a valid allotment amount.", "error");
            return;
        }

        if (!Number.isFinite(payload.obligations) || payload.obligations < 0) {
            showToast("Please enter a valid obligations amount.", "error");
            return;
        }

        try {
            button.disabled = true;
            button.textContent = "Saving...";

            await apiSend("/budgets/previous-years", "POST", payload);

            closeResourcesModal();
            showToast("Previous year budget saved successfully.", "success");
            await window.loadBudgetSection();
            await refreshResourcesHeader();
        } catch (error) {
            console.error("Failed to save previous year budget", error);
            showToast("Failed to save previous year budget.", "error");
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    });
}

function openAddBudgetModal(defaultYear) {
    openResourcesModal({
        title: "Add Budget",
        bodyHtml: `
            <form id="addBudgetForm" class="form-grid">
                <div class="form-group">
                    <label>Year</label>
                    <input type="number" name="year" min="${new Date().getFullYear()}" value="${defaultYear || new Date().getFullYear()}" required>
                </div>

                <div class="form-group">
                    <label>Amount</label>
                    <input type="number" name="totalAmount" min="1" step="0.01" required>
                </div>

                <div class="form-group full">
                    <label>Description</label>
                    <textarea name="description" rows="3" placeholder="Annual budget description"></textarea>
                </div>
            </form>
        `,
        footerHtml: `
            <button class="btn btn-light" id="cancelAddBudgetBtn">Cancel</button>
            <button class="btn btn-primary" id="submitAddBudgetBtn">Save Budget</button>
        `
    });

    document.getElementById("cancelAddBudgetBtn")?.addEventListener("click", closeResourcesModal);

    document.getElementById("submitAddBudgetBtn")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const originalText = button.textContent;

        const form = document.getElementById("addBudgetForm");
        const formData = new FormData(form);

        const payload = {
            year: Number(formData.get("year")),
            totalAmount: Number(formData.get("totalAmount")),
            description: formData.get("description")?.toString().trim()
        };

        try {
            button.disabled = true;
            button.textContent = "Saving...";

            await apiSend("/budgets", "POST", payload);

            closeResourcesModal();
            showToast("Budget saved successfully.", "success");
            await window.loadBudgetSection();
            await refreshResourcesHeader();
        } catch (error) {
            console.error("Failed to save budget", error);
            showToast("Failed to save budget.", "error");
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    });
}

function openAllocateBudgetCategoryModal(currentSummary) {
    if (!currentSummary?.budgetId) {
        showToast("Current year budget not found.", "error");
        return;
    }

    const categoryOptionsBySection = getBudgetCategoryOptionsBySection();

    openResourcesModal({
        title: "Allocate Budget Category",
        bodyHtml: `
            <form id="allocateBudgetCategoryForm" class="form-grid">
                <div class="form-group">
                    <label>Section</label>
                    <select name="section" id="budgetCategorySectionSelect" required>
                        <option value="DISASTER PREPAREDNESS">DISASTER PREPAREDNESS</option>
                        <option value="DISASTER PREVENTION AND MITIGATION">DISASTER PREVENTION AND MITIGATION</option>
                        <option value="DISASTER RESPONSE">DISASTER RESPONSE</option>
                        <option value="DISASTER REHABILITATION AND RECOVERY">DISASTER REHABILITATION AND RECOVERY</option>
                    </select>
                </div>

                <div class="form-group searchable-group">
                    <label>Category Name</label>
                    <input type="text" id="budgetCategoryNameInput" autocomplete="off" placeholder="Search category name" required>
                    <input type="hidden" id="budgetCategoryNameHiddenInput">
                    <div class="searchable-dropdown" id="budgetCategoryNameDropdown"></div>
                </div>

                <div class="form-group">
                    <label>Allocated Amount</label>
                    <input type="number" name="allocatedAmount" min="1" step="0.01" required>
                </div>
            </form>
        `,
        footerHtml: `
            <button class="btn btn-light" id="cancelAllocateCategoryBtn">Cancel</button>
            <button class="btn btn-primary" id="submitAllocateCategoryBtn">Allocate Category</button>
        `
    });

    const sectionSelect = document.getElementById("budgetCategorySectionSelect");

    const bindCategoryDropdown = () => {
        const section = sectionSelect?.value || "DISASTER PREPAREDNESS";
        const options = (categoryOptionsBySection[section] || []).map(name => ({
            label: name,
            value: name
        }));

        const input = document.getElementById("budgetCategoryNameInput");
        const hidden = document.getElementById("budgetCategoryNameHiddenInput");
        const dropdown = document.getElementById("budgetCategoryNameDropdown");

        if (input) input.value = "";
        if (hidden) hidden.value = "";
        if (dropdown) dropdown.innerHTML = "";

        bindSearchableDropdown({
            inputId: "budgetCategoryNameInput",
            dropdownId: "budgetCategoryNameDropdown",
            hiddenInputId: "budgetCategoryNameHiddenInput",
            options,
            getLabel: option => option.label,
            getValue: option => option.value
        });
    };

    bindCategoryDropdown();

    if (sectionSelect) {
        sectionSelect.addEventListener("change", bindCategoryDropdown);
    }

    document.getElementById("cancelAllocateCategoryBtn")?.addEventListener("click", closeResourcesModal);

    document.getElementById("submitAllocateCategoryBtn")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const originalText = button.textContent;

        const form = document.getElementById("allocateBudgetCategoryForm");
        const formData = new FormData(form);

        const section = formData.get("section")?.toString().trim();
        const categoryName = document.getElementById("budgetCategoryNameHiddenInput")?.value?.trim()
            || document.getElementById("budgetCategoryNameInput")?.value?.trim();

        const payload = {
            section,
            name: categoryName,
            allocatedAmount: Number(formData.get("allocatedAmount"))
        };

        if (!payload.name) {
            showToast("Please select or enter a category name.", "error");
            return;
        }

        try {
            button.disabled = true;
            button.textContent = "Allocating...";

            await apiSend(`/budgets/${currentSummary.budgetId}/categories`, "POST", payload);

            closeResourcesModal();
            showToast("Budget category allocated successfully.", "success");
            await window.loadBudgetSection();
            await refreshResourcesHeader();
        } catch (error) {
            console.error("Failed to allocate category", error);
            showToast("Failed to allocate category.", "error");
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    });
}

function getBudgetCategoryOptionsBySection() {
    return {
        "DISASTER PREPAREDNESS": [
            "Training Expenses",
            "Traveling Expenses",
            "Rescue Equipment"
        ],
        "DISASTER PREVENTION AND MITIGATION": [
            "Other Supplies and Materials",
            "Capital Outlay"
        ],
        "DISASTER RESPONSE": [
            "Food and Water",
            "Medical Supplies",
            "Drugs and Medicines Expenses",
            "Evacuation Support",
            "Maintenance and Other Operating Expenses"
        ],
        "DISASTER REHABILITATION AND RECOVERY": [
            "Subsidy to Other Funds",
            "Other Supplies and Materials"
        ]
    };
}

function formatPercent(value) {
    if (value == null || Number.isNaN(Number(value))) return "--";
    return `${Number(value).toFixed(2)}%`;
}