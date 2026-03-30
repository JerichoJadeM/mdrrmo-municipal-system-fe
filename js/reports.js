// ===================================
// Reports Page Script
// Uses shared apiRequest() from loginUserInfo.js
// ===================================

const REPORTS_API_BASE = "http://localhost:8080/api/reports";

const reportsState = {
    activeTab: "summaryTab",
    summary: null,
    financial: null,
    auditTrail: [],
    lastLoadedAt: null,
    searchable: {
        years: [],
        actionTypes: [],
        performedBy: [],
        modules: []
    },
    incidentReport: null,
    calamityReport: null,
    resourceReport: null,
};

function ensureReportsPageScroll() {
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";

    const main = document.querySelector(".reports-main-content");
    if (main) {
        main.style.overflow = "visible";
        main.style.height = "auto";
        main.style.maxHeight = "none";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    ensureReportsPageScroll();

    if (!enforceManagementAccess()) return;
    initializeReportsPage();

    window.addEventListener("load", ensureReportsPageScroll);
    setTimeout(ensureReportsPageScroll, 0);
    setTimeout(ensureReportsPageScroll, 300);
});

function getCurrentUserInfo() {
    try {
        const raw = localStorage.getItem("loginUserInfo");
        if (raw) {
            return JSON.parse(raw);
        }

        const authoritiesRaw = localStorage.getItem("userAuthorities");
        const authorities = authoritiesRaw ? JSON.parse(authoritiesRaw) : [];

        return {
            fullName: localStorage.getItem("userName"),
            email: localStorage.getItem("userEmail"),
            number: localStorage.getItem("userNumber"),
            authorities
        };
    } catch (error) {
        console.error("Failed to parse login user info:", error);
        return null;
    }
}
function hasAuthority(user, role) {
    return Array.isArray(user?.authorities) && user.authorities.includes(role);
}

function canAccessManagementPages(user) {
    return hasAuthority(user, "ROLE_ADMIN") || hasAuthority(user, "ROLE_MANAGER");
}

function enforceManagementAccess() {
    const currentUser = getCurrentUserInfo();

    if (!currentUser || !canAccessManagementPages(currentUser)) {
        showMessage("Unauthorized access.", "error");
        setTimeout(() => {
            window.location.href = "dashboard.html";
        }, 1200);
        return false;
    }

    return true;
}

function initializeReportsPage() {
    ensureReportsPageScroll();

    applyFrontendRbac();
    bindReportTabs();
    bindGlobalFilters();
    bindAuditFilters();
    bindRefreshActions();
    bindAuditModal();
    populateYearSelect();
    applyDefaultDateRange();
    loadInitialReports();
    initializeSearchableFilters();
}

async function loadInitialReports() {
    await Promise.allSettled([
        loadSummaryReport(),
        loadFinancialReport(),
        loadAuditTrail(),
        loadIncidentReport(),
        loadCalamityReport(),
        loadResourceReport()
    ]);

    reportsState.lastLoadedAt = new Date();
    updateLastRefreshed();
    ensureReportsPageScroll();
}

function bindReportTabs() {
    const tabButtons = document.querySelectorAll(".report-tab");
    const panels = document.querySelectorAll(".report-panel");

    tabButtons.forEach(button => {
        button.addEventListener("click", () => {
            const targetTab = button.dataset.tab;

            tabButtons.forEach(tab => tab.classList.remove("active"));
            panels.forEach(panel => panel.classList.remove("active"));

            button.classList.add("active");

            const targetPanel = document.getElementById(targetTab);
            if (targetPanel) {
                targetPanel.classList.add("active");
            }

            reportsState.activeTab = targetTab;

            if (targetTab === "incidentTab" && !reportsState.incidentReport) {
                loadIncidentReport();
            } else if (targetTab === "calamityTab" && !reportsState.calamityReport) {
                loadCalamityReport();
            } else if (targetTab === "resourcesTab" && !reportsState.resourceReport) {
                loadResourceReport();
            }
        });
    });
}

function bindGlobalFilters() {
    const applyBtn = document.getElementById("applyFiltersBtn");
    const resetBtn = document.getElementById("resetFiltersBtn");
    const frequencySelect = document.getElementById("reportFrequency");
    const yearInput = document.getElementById("financialYearInput");

    if (frequencySelect) {
        frequencySelect.addEventListener("change", handleFrequencyChange);
    }

    if (yearInput) {
        yearInput.addEventListener("change", async () => {
            await Promise.allSettled([
                loadSummaryReport(),
                loadFinancialReport()
            ]);
        });
    }

    if (applyBtn) {
        applyBtn.addEventListener("click", async () => {
            await reloadActiveData();
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener("click", async () => {
            resetGlobalFilters();
            await reloadActiveData();
        });
    }
}

function bindAuditFilters() {
    const applyAuditBtn = document.getElementById("applyAuditFiltersBtn");
    const resetAuditBtn = document.getElementById("resetAuditFiltersBtn");

    if (applyAuditBtn) {
        applyAuditBtn.addEventListener("click", async () => {
            await loadAuditTrail();
        });
    }

    if (resetAuditBtn) {
        resetAuditBtn.addEventListener("click", async () => {
            resetAuditFilters();
            await loadAuditTrail();
        });
    }
}

function bindRefreshActions() {
    const refreshBtn = document.getElementById("refreshReportsBtn");
    const exportBtn = document.getElementById("exportPdfBtn");

    if (refreshBtn) {
        refreshBtn.addEventListener("click", async () => {
            await reloadActiveData(true);
        });
    }

    if (exportBtn) {
        exportBtn.disabled = false;
        exportBtn.addEventListener("click", async () => {
            await exportActiveReportPdf();
        });
    }
}

function bindAuditModal() {
    const modal = document.getElementById("auditDetailsModal");
    const closeBtn = document.getElementById("auditDetailsModalClose");
    const footerCloseBtn = document.getElementById("auditDetailsCloseBtn");

    if (closeBtn) {
        closeBtn.addEventListener("click", closeAuditDetailsModal);
    }

    if (footerCloseBtn) {
        footerCloseBtn.addEventListener("click", closeAuditDetailsModal);
    }

    if (modal) {
        modal.addEventListener("click", (event) => {
            if (event.target === modal) {
                closeAuditDetailsModal();
            }
        });
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeAuditDetailsModal();
        }
    });
}

async function reloadActiveData(forceAll = false) {
    if (forceAll) {
        await Promise.allSettled([
            loadSummaryReport(true),
            loadFinancialReport(true),
            loadAuditTrail(true),
            loadIncidentReport(true),
            loadCalamityReport(true),
            loadResourceReport(true)
        ]);
    } else {
        if (reportsState.activeTab === "summaryTab") {
            await loadSummaryReport(true);
        } else if (reportsState.activeTab === "financialTab") {
            await loadFinancialReport(true);
        } else if (reportsState.activeTab === "auditTab") {
            await loadAuditTrail(true);
        } else if (reportsState.activeTab === "incidentTab") {
            await loadIncidentReport(true);
        } else if (reportsState.activeTab === "calamityTab") {
            await loadCalamityReport(true);
        } else if (reportsState.activeTab === "resourcesTab") {
            await loadResourceReport(true);
        } else {
            await Promise.allSettled([
                loadSummaryReport(true),
                loadFinancialReport(true),
                loadAuditTrail(true),
                loadIncidentReport(true),
                loadCalamityReport(true),
                loadResourceReport(true)
            ]);
        }
    }

    reportsState.lastLoadedAt = new Date();
    updateLastRefreshed();
}

function resetGlobalFilters() {
    const fromInput = document.getElementById("reportFromDate");
    const toInput = document.getElementById("reportToDate");
    const frequencySelect = document.getElementById("reportFrequency");
    const yearInput = document.getElementById("financialYearInput");

    if (frequencySelect) {
        frequencySelect.value = "monthly";
    }

    applyDefaultDateRange();

    if (yearInput) {
        yearInput.value = "";
    }
}

function resetAuditFilters() {
    const ids = [
        "auditModuleFilter",
        "auditRecordType",
        "auditActionType",
        "auditPerformedBy",
        "auditOperationId"
    ];

    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = "";
    });
}

function populateYearSelect() {
    const currentYear = new Date().getFullYear();
    reportsState.searchable.years = [];

    for (let year = currentYear + 1; year >= currentYear - 7; year--) {
        reportsState.searchable.years.push(String(year));
    }
}

function applyDefaultDateRange() {
    const fromInput = document.getElementById("reportFromDate");
    const toInput = document.getElementById("reportToDate");
    const frequencySelect = document.getElementById("reportFrequency");

    if (!fromInput || !toInput) return;

    const now = new Date();
    let startDate = new Date(now);
    let endDate = new Date(now);

    const frequency = frequencySelect ? frequencySelect.value : "monthly";

    if (frequency === "weekly") {
        startDate.setDate(now.getDate() - 6);
    } else if (frequency === "monthly") {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (frequency === "quarterly") {
        const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
        startDate = new Date(now.getFullYear(), quarterStartMonth, 1);
    } else if (frequency === "annually") {
        startDate = new Date(now.getFullYear(), 0, 1);
    } else {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    fromInput.value = formatDateInputValue(startDate);
    toInput.value = formatDateInputValue(endDate);
    updateCoveredPeriodLabels();
}

function handleFrequencyChange() {
    applyDefaultDateRange();
}

async function loadSummaryReport(showSuccessMessage = false) {
    try {
        const params = buildGlobalDateParams();
        const url = `${REPORTS_API_BASE}/summary${params ? `?${params}` : ""}`;
        const data = await apiRequest(url);

        reportsState.summary = data;
        renderSummaryReport(data);

        if (showSuccessMessage) {
            showMessage("Operational summary updated successfully.", "success");
        }
    } catch (error) {
        console.error("Failed to load summary report:", error);
        renderSummaryErrorState();
        showMessage(extractErrorMessage(error, "Unable to load summary report."), "error");
    }
}

async function loadFinancialReport(showSuccessMessage = false) {
    const yearInput = document.getElementById("financialYearInput");
    const selectedYear = yearInput && yearInput.value ? yearInput.value.trim() : "";

    if (selectedYear && !/^\d{4}$/.test(selectedYear)) {
        showMessage("Please enter a valid 4-digit financial year.", "error");
        return;
    }

    try {
        const params = new URLSearchParams();
        if (selectedYear) {
            params.append("year", selectedYear);
        }

        const url = `${REPORTS_API_BASE}/financial${params.toString() ? `?${params.toString()}` : ""}`;
        const data = await apiRequest(url);

        // handle APIs that return error JSON instead of throwing
        if (data && typeof data === "object" && data.message && data.status) {
            renderFinancialErrorState();
            showMessage(data.message, "error");
            return;
        }

        reportsState.financial = data;
        renderFinancialReport(data);

        if (showSuccessMessage) {
            showMessage("Financial report updated successfully.", "success");
        }
    } catch (error) {
        console.error("Failed to load financial report:", error);
        renderFinancialErrorState();
        showMessage(extractErrorMessage(error, "Unable to load financial report."), "error");
    }
}

async function loadAuditTrail(showSuccessMessage = false) {
    try {
        const params = buildAuditTrailParams();

        const auditRequests = [
            { module: "OPERATIONS", url: `${REPORTS_API_BASE}/audit-trail${params ? `?${params}` : ""}` },
            { module: "DISASTER_MANAGEMENT", url: `${REPORTS_API_BASE}/audit-trail/disaster-management${params ? `?${params}` : ""}` },
            { module: "RESOURCES", url: `${REPORTS_API_BASE}/audit-trail/resources${params ? `?${params}` : ""}` },
            { module: "BUDGET", url: `${REPORTS_API_BASE}/audit-trail/budget${params ? `?${params}` : ""}` },
            { module: "ADMINISTRATION", url: `${REPORTS_API_BASE}/audit-trail/administration${params ? `?${params}` : ""}` }
        ];

        const results = await Promise.allSettled(
            auditRequests.map(async request => {
                const data = await apiRequest(request.url);
                const rows = Array.isArray(data) ? data : [];
                return rows.map(item => normalizeAuditItem(item, request.module));
            })
        );

        const mergedAuditTrail = results
            .filter(result => result.status === "fulfilled")
            .flatMap(result => result.value);

        reportsState.auditTrail = sortAuditTrailDescending(
            deduplicateAuditTrail(mergedAuditTrail)
        );

        renderAuditTrail(reportsState.auditTrail);

        reportsState.searchable.actionTypes = [...new Set(
            reportsState.auditTrail
                .map(item => readValue(item, ["actionType"]))
                .filter(Boolean)
        )].sort((a, b) => String(a).localeCompare(String(b)));

        reportsState.searchable.performedBy = [...new Set(
            reportsState.auditTrail
                .map(item => readValue(item, ["performedBy"]))
                .filter(Boolean)
        )].sort((a, b) => String(a).localeCompare(String(b)));

        reportsState.searchable.modules = [...new Set(
            reportsState.auditTrail
                .map(item => readValue(item, ["module"]))
                .filter(Boolean)
        )].sort((a, b) => String(a).localeCompare(String(b)));

        if (showSuccessMessage) {
            showMessage("Audit trail updated successfully.", "success");
        }
    } catch (error) {
        console.error("Failed to load audit trail:", error);
        renderAuditTrailErrorState();
        showMessage(extractErrorMessage(error, "Unable to load audit trail."), "error");
    }
}

function buildGlobalDateParams() {
    const fromInput = document.getElementById("reportFromDate");
    const toInput = document.getElementById("reportToDate");
    const yearInput = document.getElementById("financialYearInput");

    const params = new URLSearchParams();

    if (fromInput && fromInput.value) {
        params.append("from", fromInput.value);
    }

    if (toInput && toInput.value) {
        params.append("to", toInput.value);
    }

    if (yearInput && yearInput.value && /^\d{4}$/.test(yearInput.value.trim())) {
        params.append("year", yearInput.value.trim());
    }

    updateCoveredPeriodLabels();

    return params.toString();
}

function buildAuditTrailParams() {
    const params = new URLSearchParams();

    const fromInput = document.getElementById("reportFromDate");
    const toInput = document.getElementById("reportToDate");
    const moduleFilter = document.getElementById("auditModuleFilter");
    const recordType = document.getElementById("auditRecordType");
    const actionType = document.getElementById("auditActionType");
    const performedBy = document.getElementById("auditPerformedBy");
    const operationId = document.getElementById("auditOperationId");

    if (fromInput && fromInput.value) {
        params.append("from", fromInput.value);
    }

    if (toInput && toInput.value) {
        params.append("to", toInput.value);
    }

    if (moduleFilter && moduleFilter.value.trim()) {
        params.append("module", moduleFilter.value.trim());
    }

    if (recordType && recordType.value.trim()) {
        params.append("recordType", recordType.value.trim());
    }

    if (actionType && actionType.value.trim()) {
        params.append("actionType", actionType.value.trim());
    }

    if (performedBy && performedBy.value.trim()) {
        params.append("performedBy", performedBy.value.trim());
    }

    if (operationId && operationId.value.trim()) {
        params.append("recordId", operationId.value.trim());
    }

    return params.toString();
}

function normalizeAuditModuleName(value) {
    const raw = String(value || "").trim();
    if (!raw) return "OPERATIONS";

    const normalized = raw
        .replaceAll("-", "_")
        .replaceAll(" ", "_")
        .toUpperCase();

    const aliasMap = {
        INCIDENT: "OPERATIONS",
        CALAMITY: "OPERATIONS",
        DISASTERMANAGEMENT: "DISASTER_MANAGEMENT",
        DISASTER_MANAGEMENT: "DISASTER_MANAGEMENT",
        RESOURCE: "RESOURCES",
        RESOURCES: "RESOURCES",
        INVENTORY: "RESOURCES",
        BUDGETS: "BUDGET",
        ADMIN: "ADMINISTRATION",
        ADMINISTRATION: "ADMINISTRATION",
        AUTHENTICATION: "AUTH",
        WEATHER_FORECAST: "WEATHER"
    };

    return aliasMap[normalized] || normalized;
}

function normalizeAuditItem(item, moduleOverride = "") {
    const normalizedModule = normalizeAuditModuleName(
        moduleOverride || readValue(item, ["module", "moduleName", "sourceModule", "domain"])
    );

    return {
        ...item,
        module: normalizedModule,
        recordType: readValue(item, ["recordType", "operationType", "entityType", "type"]) || "--",
        recordId: readValue(item, ["recordId", "operationId", "entityId", "id"]) ?? "--",
        actionType: readValue(item, ["actionType", "action", "activity", "eventType"]) || "--",
        fromStatus: readValue(item, ["fromStatus", "previousStatus", "oldValue"]) || "--",
        toStatus: readValue(item, ["toStatus", "newStatus", "newValue"]) || "--",
        performedBy: readValue(item, ["performedBy", "actorName", "username", "userFullName"]) || "--",
        performedAt: readValue(item, ["performedAt", "createdAt", "timestamp", "loggedAt", "updatedAt"]) || null,
        description: readValue(item, ["description", "details", "message", "summary"]) || "--",
        metadataJson: readValue(item, ["metadataJson", "metadata", "extraData"]) || null
    };
}

function deduplicateAuditTrail(items) {
    const seen = new Set();

    return items.filter(item => {
        const key = [
            item.module,
            item.recordType,
            item.recordId,
            item.actionType,
            item.performedBy,
            item.performedAt
        ].join("|");

        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function sortAuditTrailDescending(items) {
    return [...items].sort((a, b) => {
        const aTime = new Date(a.performedAt || 0).getTime();
        const bTime = new Date(b.performedAt || 0).getTime();
        return bTime - aTime;
    });
}

function renderSummaryReport(data) {
    updateSummaryFinancialLabels();

    setText("summaryTotalIncidents", formatWholeNumber(readValue(data, ["totalIncidents"])));
    setText("summaryActiveIncidents", formatWholeNumber(readValue(data, ["activeIncidents"])));
    setText("summaryResolvedIncidents", formatWholeNumber(readValue(data, ["resolvedIncidents"])));
    setText("summaryTotalCalamities", formatWholeNumber(readValue(data, ["totalCalamities"])));
    setText("summaryActiveCalamities", formatWholeNumber(readValue(data, ["activeCalamities"])));
    setText("summaryResolvedCalamities", formatWholeNumber(readValue(data, ["resolvedCalamities"])));
    setText("summaryInventoryItems", formatWholeNumber(readValue(data, ["totalInventoryItems"])));
    setText("summaryLowStockItems", formatWholeNumber(readValue(data, ["lowStockItems"])));
    setText("summaryOpenCenters", formatWholeNumber(readValue(data, ["openEvacuationCenters"])));
    setText("summaryAuditEvents", formatWholeNumber(readValue(data, ["totalAuditEvents"])));

    setText("summaryCurrentBudget", formatCurrency(readValue(data, ["currentYearBudget"])));
    setText("summaryCurrentSpent", formatCurrency(readValue(data, ["currentYearSpent"])));
    setText("summaryCurrentRemaining", formatCurrency(readValue(data, ["currentYearRemaining"])));

    const snapshotBody = document.getElementById("summarySnapshotTableBody");
    if (snapshotBody) {
        snapshotBody.innerHTML = `
            <tr><td>Total Incidents</td><td>${escapeHtml(formatWholeNumber(readValue(data, ["totalIncidents"])))}</td></tr>
            <tr><td>Active Incidents</td><td>${escapeHtml(formatWholeNumber(readValue(data, ["activeIncidents"])))}</td></tr>
            <tr><td>Resolved Incidents</td><td>${escapeHtml(formatWholeNumber(readValue(data, ["resolvedIncidents"])))}</td></tr>
            <tr><td>Total Calamities</td><td>${escapeHtml(formatWholeNumber(readValue(data, ["totalCalamities"])))}</td></tr>
            <tr><td>Current Budget</td><td>${escapeHtml(formatCurrency(readValue(data, ["currentYearBudget"])))}</td></tr>
        `;
    }
}

function renderSummaryErrorState() {
    updateSummaryFinancialLabels();

    [
        "summaryTotalIncidents",
        "summaryActiveIncidents",
        "summaryResolvedIncidents",
        "summaryTotalCalamities",
        "summaryActiveCalamities",
        "summaryResolvedCalamities",
        "summaryInventoryItems",
        "summaryLowStockItems",
        "summaryOpenCenters",
        "summaryAuditEvents"
    ].forEach(id => setText(id, "0"));

    [
        "summaryCurrentBudget",
        "summaryCurrentSpent",
        "summaryCurrentRemaining"
    ].forEach(id => setText(id, "₱0.00"));
}

function renderFinancialReport(data) {
    const currentSummary = readValue(data, ["currentSummary"]) || {};
    const history = readValue(data, ["history"]) || [];
    const nextYearForecast = readValue(data, ["nextYearForecast"]) || {};
    const analytics = readValue(data, ["analytics"]) || {};

    const summaryBudgetId = readValue(currentSummary, ["id"]);
    const summaryYear = readValue(currentSummary, ["year"]);
    const summaryDescription = readValue(currentSummary, ["description"]);

    const totalAllotment = readValue(currentSummary, ["totalAllotment", "allotment", "totalBudget"]);
    const totalAllocated = readValue(currentSummary, ["totalAllocated", "allocated"]);
    const totalObligations = readValue(currentSummary, ["totalObligations", "obligations", "totalSpent"]);
    const totalRemaining = readValue(currentSummary, ["totalRemaining", "remainingBalance", "remainingBudget"]);
    const allocationRate = readValue(currentSummary, ["allocationRate"]);
    const utilizationRate = readValue(currentSummary, ["utilizationRate"]);

    setText("financialTotalAllotment", formatCurrency(totalAllotment));
    setText("financialTotalAllocated", formatCurrency(totalAllocated));
    setText("financialTotalObligations", formatCurrency(totalObligations));
    setText("financialTotalRemaining", formatCurrency(totalRemaining));
    setText("financialAllocationRate", formatPercent(allocationRate));
    setText("financialUtilizationRate", formatPercent(utilizationRate));

    setText("financialBudgetId", summaryBudgetId ?? "--");
    setText("financialBudgetYear", summaryYear ?? readValue(data, ["year"]) ?? "--");
    setText("financialDescription", summaryDescription || "--");

    const forecastYear = readValue(nextYearForecast, ["nextYear", "year", "forecastYear"]);
    const forecastProjectedBudget = readValue(nextYearForecast, ["totalForecast"]);
    const forecastNotes = readValue(nextYearForecast, ["assumptions"]);

    setText("forecastYear", forecastYear ?? "--");
    setText("forecastProjectedBudget", formatCurrency(forecastProjectedBudget));
    setText("forecastNotes", forecastNotes || "--");

    renderFinancialHistory(history, analytics);
}

function renderFinancialHistory(history, analytics) {
    const tbody = document.getElementById("financialHistoryTableBody");
    if (!tbody) return;

    if (!Array.isArray(history) || history.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state-cell">No financial history available.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = history.map(item => {
        const year = readValue(item, ["year"]);
        const allotment = readValue(item, ["allotment", "totalAllotment"]);
        const obligations = readValue(item, ["obligations", "totalObligations"]);
        const remainingBalance = readValue(item, ["remainingBalance", "totalRemaining"]);
        const utilizationRate = readValue(item, ["utilizationRate"]);

        return `
            <tr>
                <td>${escapeHtml(String(year ?? "--"))}</td>
                <td>${escapeHtml(formatCurrency(allotment))}</td>
                <td>${escapeHtml(formatCurrency(obligations))}</td>
                <td>${escapeHtml(formatCurrency(remainingBalance))}</td>
                <td>${escapeHtml(formatPercent(utilizationRate))}</td>
            </tr>
        `;
    }).join("");
}

function renderFinancialErrorState() {
    [
        "financialTotalAllotment",
        "financialTotalAllocated",
        "financialTotalObligations",
        "financialTotalRemaining"
    ].forEach(id => setText(id, "₱0.00"));

    ["financialAllocationRate", "financialUtilizationRate"].forEach(id => setText(id, "0%"));

    ["financialBudgetId", "financialBudgetYear", "financialDescription", "forecastYear", "forecastNotes"]
        .forEach(id => setText(id, "--"));

    setText("forecastProjectedBudget", "₱0.00");

    const tbody = document.getElementById("financialHistoryTableBody");
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state-cell">Unable to load financial report.</td>
            </tr>
        `;
    }
}

function renderAuditTrail(data) {
    const tbody = document.getElementById("auditTrailTableBody");
    if (!tbody) return;

    const moduleFilter = document.getElementById("auditModuleFilter")?.value?.trim().toUpperCase() || "";
    const recordTypeFilter = document.getElementById("auditRecordType")?.value?.trim().toUpperCase() || "";

    let rows = Array.isArray(data) ? [...data] : [];

    if (moduleFilter) {
        rows = rows.filter(item =>
            normalizeAuditModuleName(readValue(item, ["module"])) === moduleFilter
        );
    }

    if (recordTypeFilter) {
        rows = rows.filter(item =>
            String(readValue(item, ["recordType", "operationType"]) || "").trim().toUpperCase() === recordTypeFilter
        );
    }

    if (!rows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="empty-state-cell">No audit events found.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = rows.map((item, index) => {
        const moduleValue = normalizeAuditModuleName(readValue(item, ["module"]));
        const recordType = readValue(item, ["recordType", "operationType"]);
        const recordId = readValue(item, ["recordId", "operationId"]);
        const actionType = readValue(item, ["actionType"]);
        const fromStatus = readValue(item, ["fromStatus"]);
        const toStatus = readValue(item, ["toStatus"]);
        const performedBy = readValue(item, ["performedBy"]);
        const performedAt = readValue(item, ["performedAt"]);

        return `
            <tr>
                <td>${escapeHtml(formatDateTime(performedAt))}</td>
                <td>${escapeHtml(moduleValue || "--")}</td>
                <td>${escapeHtml(recordType || "--")}</td>
                <td>${escapeHtml(String(recordId ?? "--"))}</td>
                <td>${escapeHtml(actionType || "--")}</td>
                <td>${escapeHtml(fromStatus || "--")}</td>
                <td>${escapeHtml(toStatus || "--")}</td>
                <td>${escapeHtml(performedBy || "--")}</td>
                <td>
                    <button class="audit-view-btn" type="button" data-audit-index="${index}">
                        View
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    tbody.querySelectorAll(".audit-view-btn").forEach(button => {
        button.addEventListener("click", () => {
            const index = Number(button.dataset.auditIndex);
            const filteredRows = rows;
            const auditItem = filteredRows[index];
            openAuditDetailsModal(auditItem);
        });
    });
}

function renderAuditTrailErrorState() {
    const tbody = document.getElementById("auditTrailTableBody");
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="9" class="empty-state-cell">Unable to load audit trail.</td>
        </tr>
    `;
}

function openAuditDetailsModal(item) {
    if (!item) return;

    setText("auditDetailModule", normalizeAuditModuleName(readValue(item, ["module"])) || "OPERATIONS");
    setText("auditDetailRecordType", readValue(item, ["recordType", "operationType"]) || "--");
    setText("auditDetailRecordId", readValue(item, ["recordId", "operationId"]) ?? "--");
    setText("auditDetailActionType", readValue(item, ["actionType"]) || "--");
    setText("auditDetailFromStatus", readValue(item, ["fromStatus"]) || "--");
    setText("auditDetailToStatus", readValue(item, ["toStatus"]) || "--");
    setText("auditDetailPerformedBy", readValue(item, ["performedBy"]) || "--");
    setText("auditDetailPerformedAt", formatDateTime(readValue(item, ["performedAt"])));

    setPreText("auditDetailDescription", readValue(item, ["description"]) || "--");
    setPreText("auditDetailMetadata", formatMetadata(readValue(item, ["metadataJson"])) || "--");

    const modal = document.getElementById("auditDetailsModal");
    if (modal) {
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
    }
}

function closeAuditDetailsModal() {
    const modal = document.getElementById("auditDetailsModal");
    if (modal) {
        modal.classList.remove("active");
    }

    ensureReportsPageScroll();
}

function updateCoveredPeriodLabels() {
    const fromInput = document.getElementById("reportFromDate");
    const toInput = document.getElementById("reportToDate");
    const frequencySelect = document.getElementById("reportFrequency");

    setText("summaryCoveredFrom", fromInput && fromInput.value ? formatDateLong(fromInput.value) : "Not set");
    setText("summaryCoveredTo", toInput && toInput.value ? formatDateLong(toInput.value) : "Not set");

    const selectedOption = frequencySelect ? frequencySelect.options[frequencySelect.selectedIndex] : null;
    setText("summaryFrequencyLabel", selectedOption ? selectedOption.textContent : "Custom Range");
}

function updateLastRefreshed() {
    setText(
        "summaryLastRefreshed",
        reportsState.lastLoadedAt ? formatDateTime(reportsState.lastLoadedAt) : "--"
    );
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = value != null ? String(value) : "";
    }
}

function setPreText(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = value != null ? String(value) : "";
    }
}

function readValue(obj, keys) {
    if (!obj || !Array.isArray(keys)) return null;

    for (const key of keys) {
        if (obj[key] !== undefined && obj[key] !== null) {
            return obj[key];
        }
    }

    return null;
}

function formatWholeNumber(value) {
    const num = Number(value ?? 0);
    if (Number.isNaN(num)) return "0";
    return new Intl.NumberFormat("en-PH", {
        maximumFractionDigits: 0
    }).format(num);
}

function formatCurrency(value) {
    const num = Number(value ?? 0);
    if (Number.isNaN(num)) return "₱0.00";

    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
}

function formatPercent(value) {
    const num = Number(value ?? 0);
    if (Number.isNaN(num)) return "0%";

    return `${num.toFixed(2)}%`;
}

function formatDateInputValue(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatDateLong(value) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return new Intl.DateTimeFormat("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric"
    }).format(date);
}

function formatDateTime(value) {
    if (!value) return "--";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return new Intl.DateTimeFormat("en-PH", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}

function formatMetadata(metadata) {
    if (!metadata) return "--";

    if (typeof metadata === "string") {
        const trimmed = metadata.trim();

        if (!trimmed) return "--";

        try {
            const parsed = JSON.parse(trimmed);
            return JSON.stringify(parsed, null, 2);
        } catch {
            return trimmed;
        }
    }

    try {
        return JSON.stringify(metadata, null, 2);
    } catch {
        return String(metadata);
    }
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function showToastLikeMessage(message) {
    // Reuse error modal if available, otherwise fallback
    if (typeof showErrorModal === "function") {
        showErrorModal(message);
    } else {
        alert(message);
    }
}

function showMessage(message, type = "success") {
    const container = document.getElementById("reportsMessageContainer");
    if (!container) {
        alert(message);
        return;
    }

    const msg = document.createElement("div");
    msg.className = `dm-message ${type === "error" ? "dm-message-error" : "dm-message-success"}`;
    msg.textContent = message;

    container.appendChild(msg);

    setTimeout(() => {
        msg.remove();
    }, 3500);
}

function extractErrorMessage(error, fallbackMessage) {
    if (!error) return fallbackMessage;

    if (typeof error === "string") {
        try {
            const parsed = JSON.parse(error);
            if (parsed && typeof parsed === "object" && parsed.message) {
                return parsed.message;
            }
        } catch {
            return error;
        }
    }

    if (error.message) {
        if (typeof error.message === "string") {
            try {
                const parsed = JSON.parse(error.message);
                if (parsed && typeof parsed === "object" && parsed.message) {
                    return parsed.message;
                }
            } catch {
                return error.message;
            }
            return error.message;
        }
    }

    if (error.responseJSON?.message) return error.responseJSON.message;

    if (error.responseText) {
        try {
            const parsed = JSON.parse(error.responseText);
            if (parsed.message) return parsed.message;
        } catch {
            return error.responseText;
        }
    }

    return fallbackMessage;
}

function setupSearchableInput({ inputId, dropdownId, getOptions, onSelect }) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    function closeDropdown() {
        dropdown.classList.remove("active");
    }

    function openDropdown() {
        dropdown.classList.add("active");
    }

    function renderOptions() {
        const keyword = input.value.trim().toLowerCase();
        const options = (getOptions() || []).filter(Boolean);

        const filtered = options.filter(option =>
            String(option).toLowerCase().includes(keyword)
        );

        if (!filtered.length) {
            dropdown.innerHTML = `<div class="searchable-empty">No matches found.</div>`;
            openDropdown();
            return;
        }

        dropdown.innerHTML = filtered.map(option => `
            <button type="button" class="searchable-option" data-value="${escapeHtml(String(option))}">
                ${escapeHtml(String(option))}
            </button>
        `).join("");

        [...dropdown.querySelectorAll(".searchable-option")].forEach(btn => {
            btn.addEventListener("click", () => {
                const value = btn.dataset.value || "";
                input.value = value;
                if (typeof onSelect === "function") {
                    onSelect(value);
                }
                closeDropdown();
            });
        });

        openDropdown();
    }

    input.addEventListener("focus", renderOptions);
    input.addEventListener("input", renderOptions);

    document.addEventListener("click", (event) => {
        if (!input.parentElement.contains(event.target)) {
            closeDropdown();
        }
    });
}

function initializeSearchableFilters() {
    setupSearchableInput({
        inputId: "financialYearInput",
        dropdownId: "financialYearDropdown",
        getOptions: () => reportsState.searchable.years,
        onSelect: () => {}
    });

    setupSearchableInput({
        inputId: "auditActionType",
        dropdownId: "auditActionTypeDropdown",
        getOptions: () => reportsState.searchable.actionTypes,
        onSelect: () => {}
    });

    setupSearchableInput({
        inputId: "auditPerformedBy",
        dropdownId: "auditPerformedByDropdown",
        getOptions: () => reportsState.searchable.performedBy,
        onSelect: () => {}
    });
}

function updateSummaryFinancialLabels() {
    const yearInput = document.getElementById("financialYearInput");
    const selectedYear = yearInput && yearInput.value ? yearInput.value.trim() : "";
    const currentYear = String(new Date().getFullYear());

    if (!selectedYear || selectedYear === currentYear) {
        setText("summaryCurrentBudgetLabel", "Current Budget");
        setText("summaryCurrentSpentLabel", "Current Spent");
        setText("summaryCurrentRemainingLabel", "Current Remaining");
        return;
    }

    setText("summaryCurrentBudgetLabel", `Budget (${selectedYear})`);
    setText("summaryCurrentSpentLabel", `Spent (${selectedYear})`);
    setText("summaryCurrentRemainingLabel", `Remaining Budget (${selectedYear})`);
}

async function loadIncidentReport(showSuccessMessage = false) {
    try {
        const params = buildGlobalDateParams();
        const url = `${REPORTS_API_BASE}/incidents${params ? `?${params}` : ""}`;
        const data = await apiRequest(url);

        reportsState.incidentReport = data;
        renderIncidentReport(data);

        if (showSuccessMessage) {
            showMessage("Incident report updated successfully.", "success");
        }
    } catch (error) {
        console.error("Failed to load incident report:", error);
        renderIncidentErrorState();
        showMessage(extractErrorMessage(error, "Unable to load incident report."), "error");
    }
}

async function loadCalamityReport(showSuccessMessage = false) {
    try {
        const params = buildGlobalDateParams();
        const url = `${REPORTS_API_BASE}/calamities${params ? `?${params}` : ""}`;
        const data = await apiRequest(url);

        reportsState.calamityReport = data;
        renderCalamityReport(data);

        if (showSuccessMessage) {
            showMessage("Calamity report updated successfully.", "success");
        }
    } catch (error) {
        console.error("Failed to load calamity report:", error);
        renderCalamityErrorState();
        showMessage(extractErrorMessage(error, "Unable to load calamity report."), "error");
    }
}

async function loadResourceReport(showSuccessMessage = false) {
    try {
        const params = buildGlobalDateParams();
        const url = `${REPORTS_API_BASE}/resources${params ? `?${params}` : ""}`;
        const data = await apiRequest(url);

        reportsState.resourceReport = data;
        renderResourceReport(data);

        if (showSuccessMessage) {
            showMessage("Resources report updated successfully.", "success");
        }
    } catch (error) {
        console.error("Failed to load resources report:", error);
        renderResourceErrorState();
        showMessage(extractErrorMessage(error, "Unable to load resources report."), "error");
    }
}

function renderCountByLabelTable(tbodyId, rows) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (!Array.isArray(rows) || rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="2" class="empty-state-cell">No data available.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(row => `
        <tr>
            <td>${escapeHtml(readValue(row, ["label"]) || "--")}</td>
            <td>${escapeHtml(formatWholeNumber(readValue(row, ["count"])))}</td>
        </tr>
    `).join("");
}

function renderIncidentReport(data) {
    setText("incidentTotalCount", formatWholeNumber(readValue(data, ["totalIncidents"])));
    setText("incidentActiveCount", formatWholeNumber(readValue(data, ["activeIncidents"])));
    setText("incidentResolvedCount", formatWholeNumber(readValue(data, ["resolvedIncidents"])));

    renderCountByLabelTable("incidentByTypeTableBody", readValue(data, ["byType"]) || []);
    renderCountByLabelTable("incidentByBarangayTableBody", readValue(data, ["byBarangay"]) || []);

    const tbody = document.getElementById("incidentRecordsTableBody");
    const rows = readValue(data, ["incidents"]) || [];

    if (!tbody) return;
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state-cell">No incident records found.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(row => `
        <tr>
            <td>${escapeHtml(String(readValue(row, ["id"]) ?? "--"))}</td>
            <td>${escapeHtml(readValue(row, ["calamityType", "type"]) || "--")}</td>
            <td>${escapeHtml(readValue(row, ["status"]) || "--")}</td>
            <td>${escapeHtml(readValue(row, ["affectedArea"]) || "--")}</td>
            <td>${escapeHtml(readValue(row, ["barangayName", "barangay"]) || "--")}</td>
            <td>${escapeHtml(formatDateLong(readValue(row, ["date"])))}</td>
        </tr>
    `).join("");
}

function renderCalamityReport(data) {
    setText("calamityTotalCount", formatWholeNumber(readValue(data, ["totalCalamities"])));
    setText("calamityActiveCount", formatWholeNumber(readValue(data, ["activeCalamities"])));
    setText("calamityMonitoringCount", formatWholeNumber(readValue(data, ["monitoringCalamities"])));

    const resolved = Number(readValue(data, ["resolvedCalamities"]) ?? 0);
    const ended = Number(readValue(data, ["endedCalamities"]) ?? 0);
    setText("calamityResolvedEndedCount", formatWholeNumber(resolved + ended));

    renderCountByLabelTable("calamityByTypeTableBody", readValue(data, ["byType"]) || []);
    renderCountByLabelTable("calamityByBarangayTableBody", readValue(data, ["byBarangay"]) || []);

    const tbody = document.getElementById("calamityRecordsTableBody");
    const rows = readValue(data, ["calamities"]) || [];

    if (!tbody) return;
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state-cell">No calamity records found.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(row => `
        <tr>
            <td>${escapeHtml(String(readValue(row, ["id"]) ?? "--"))}</td>
            <td>${escapeHtml(readValue(row, ["calamityType"]) || "--")}</td>
            <td>${escapeHtml(readValue(row, ["status"]) || "--")}</td>
            <td>${escapeHtml(readValue(row, ["barangay"]) || "--")}</td>
            <td>${escapeHtml(readValue(row, ["location"]) || "--")}</td>
            <td>${escapeHtml(formatDateLong(readValue(row, ["date"])))}</td>
        </tr>
    `).join("");
}

function renderResourceReport(data) {
    setText("resourceInventoryCount", formatWholeNumber(readValue(data, ["inventoryCount"])));
    setText("resourceLowStockCount", formatWholeNumber(readValue(data, ["lowStockCount"])));
    setText("resourceEvacuationCenterCount", formatWholeNumber(readValue(data, ["evacuationCenterCount"])));
    setText("resourceOpenEvacuationCenters", formatWholeNumber(readValue(data, ["openEvacuationCenters"])));
    setText("resourceReliefDistributionCount", formatWholeNumber(readValue(data, ["reliefDistributionCount"])));

    const lowStockBody = document.getElementById("resourceLowStockTableBody");
    const lowStockItems = readValue(data, ["lowStockItems"]) || [];
    if (lowStockBody) {
        lowStockBody.innerHTML = lowStockItems.length ? lowStockItems.map(item => `
            <tr>
                <td>${escapeHtml(String(readValue(item, ["id"]) ?? "--"))}</td>
                <td>${escapeHtml(readValue(item, ["itemName"]) || "--")}</td>
                <td>${escapeHtml(readValue(item, ["category"]) || "--")}</td>
                <td>${escapeHtml(String(readValue(item, ["availableQuantity"]) ?? "--"))}</td>
                <td>${escapeHtml(String(readValue(item, ["reorderLevel"]) ?? "--"))}</td>
                <td>${escapeHtml(readValue(item, ["stockStatus"]) || "--")}</td>
            </tr>
        `).join("") : `<tr><td colspan="6" class="empty-state-cell">No low-stock items found.</td></tr>`;
    }

    const txBody = document.getElementById("resourceTransactionsTableBody");
    const transactions = readValue(data, ["inventoryTransactions"]) || [];
    if (txBody) {
        txBody.innerHTML = transactions.length ? transactions.map(tx => `
            <tr>
                <td>${escapeHtml(String(readValue(tx, ["id"]) ?? "--"))}</td>
                <td>${escapeHtml(String(readValue(tx, ["inventoryId"]) ?? "--"))}</td>
                <td>${escapeHtml(readValue(tx, ["itemName"]) || "--")}</td>
                <td>${escapeHtml(readValue(tx, ["actionType"]) || "--")}</td>
                <td>${escapeHtml(String(readValue(tx, ["quantity"]) ?? "--"))}</td>
                <td>${escapeHtml(readValue(tx, ["performedBy"]) || "--")}</td>
                <td>${escapeHtml(formatDateTime(readValue(tx, ["timeStamp"])))}</td>
            </tr>
        `).join("") : `<tr><td colspan="7" class="empty-state-cell">No inventory transactions found.</td></tr>`;
    }

    const reliefBody = document.getElementById("resourceReliefDistributionTableBody");
    const reliefRows = readValue(data, ["reliefDistributions"]) || [];
    if (reliefBody) {
        reliefBody.innerHTML = reliefRows.length ? reliefRows.map(row => `
            <tr>
                <td>${escapeHtml(String(readValue(row, ["id"]) ?? "--"))}</td>
                <td>${escapeHtml(readValue(row, ["referenceType"]) || "--")}</td>
                <td>${escapeHtml(String(readValue(row, ["referenceId"]) ?? "--"))}</td>
                <td>${escapeHtml(readValue(row, ["itemName"]) || "--")}</td>
                <td>${escapeHtml(String(readValue(row, ["quantity"]) ?? "--"))}</td>
                <td>${escapeHtml(readValue(row, ["distributedBy"]) || "--")}</td>
                <td>${escapeHtml(formatDateTime(readValue(row, ["distributedAt"])))}</td>
            </tr>
        `).join("") : `<tr><td colspan="7" class="empty-state-cell">No relief distributions found.</td></tr>`;
    }
}

async function exportActiveReportPdf() {
    const fromInput = document.getElementById("reportFromDate");
    const toInput = document.getElementById("reportToDate");
    const yearInput = document.getElementById("financialYearInput");

    const tabMap = {
        summaryTab: "summary",
        financialTab: "financial",
        auditTab: "audit",
        incidentTab: "incidents",
        calamityTab: "calamities",
        resourcesTab: "resources"
    };

    const params = new URLSearchParams();
    const tab = tabMap[reportsState.activeTab] || "summary";

    params.append("tab", tab);

    if (fromInput?.value) params.append("from", fromInput.value);
    if (toInput?.value) params.append("to", toInput.value);
    if (yearInput?.value && /^\d{4}$/.test(yearInput.value.trim())) {
        params.append("year", yearInput.value.trim());
    }

    const token = localStorage.getItem("jwtToken");

    if (!token) {
        showMessage("Unauthorized access. Please log in again.", "error");
        return;
    }

    try {
        const response = await fetch(`${REPORTS_API_BASE}/export/pdf?${params.toString()}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const text = await response.text();
            let errorMessage = "Unable to export PDF.";

            try {
                const parsed = JSON.parse(text);
                errorMessage = parsed.message || parsed.error || errorMessage;
            } catch {
                errorMessage = text || errorMessage;
            }

            showMessage(errorMessage, "error");
            return;
        }

        const blob = await response.blob();
        const objectUrl = window.URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = `report-${tab}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();

        window.URL.revokeObjectURL(objectUrl);

        showMessage("PDF exported successfully.", "success");
    } catch (error) {
        console.error("PDF export failed:", error);
        showMessage(extractErrorMessage(error, "Unable to export PDF."), "error");
    }
}

async function apiDownload(url, filename) {
    const token = localStorage.getItem("jwtToken") || sessionStorage.getItem("jwtToken");
    if (!token) {
        throw new Error("Unauthorized access");
    }

    const response = await fetch(url, {
        headers: {
            "Authorization": `Bearer ${token}`
        }
    });

    if (!response.ok) {
        let message = "Download failed.";
        try {
            const errorData = await response.json();
            message = errorData.message || errorData.error || message;
        } catch {
            // ignore
        }
        throw new Error(message);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
}