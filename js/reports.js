// reports.js
// ===================================
// Reports Page Script
// Uses shared apiRequest() from loginUserInfo.js
// ===================================
window.APP_CONFIG.API_BASE;
const REPORTS_API_BASE = API_BASE + "/reports";

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
        modules: [],
        recordTypes: []
    },
    incidentReport: null,
    calamityReport: null,
    resourceReport: null
};

const reportsPagination = {
    audit: null,
    incidents: null,
    calamities: null,
    resourceTransactions: null,
    resourceRelief: null
};

document.addEventListener("DOMContentLoaded", () => {
    if (!enforceManagementAccess()) return;
    initializeReportsPage();
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
    applyFrontendRbac?.();
    bindReportTabs();
    bindResourceSubtabs();
    bindGlobalFilters();
    bindAuditFilters();
    bindRefreshActions();
    bindAuditModal();
    populateYearSelect();
    applyDefaultDateRange();
    initializeSearchableFilters();
    initializePaginationControllers();
    loadInitialReports();
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

function bindResourceSubtabs() {
    const buttons = document.querySelectorAll(".report-subtab");
    const panels = document.querySelectorAll(".resource-subpanel");

    buttons.forEach(button => {
        button.addEventListener("click", () => {
            const targetId = button.dataset.resourceTab;

            buttons.forEach(btn => btn.classList.remove("active"));
            panels.forEach(panel => panel.classList.remove("active"));

            button.classList.add("active");

            const panel = document.getElementById(targetId);
            if (panel) {
                panel.classList.add("active");
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

function initializePaginationControllers() {
    reportsPagination.audit = createPaginationController({
        infoId: "auditPaginationInfo",
        controlsId: "auditPaginationControls",
        pageSizeSelectId: "auditPageSize",
        itemLabel: "audit events",
        onRenderRows: renderAuditTrailRows
    });

    reportsPagination.incidents = createPaginationController({
        infoId: "incidentPaginationInfo",
        controlsId: "incidentPaginationControls",
        pageSizeSelectId: "incidentPageSize",
        itemLabel: "incident records",
        onRenderRows: renderIncidentRecordRows
    });

    reportsPagination.calamities = createPaginationController({
        infoId: "calamityPaginationInfo",
        controlsId: "calamityPaginationControls",
        pageSizeSelectId: "calamityPageSize",
        itemLabel: "calamity records",
        onRenderRows: renderCalamityRecordRows
    });

    reportsPagination.resourceTransactions = createPaginationController({
        infoId: "resourceTransactionsPaginationInfo",
        controlsId: "resourceTransactionsPaginationControls",
        pageSizeSelectId: "resourceTransactionsPageSize",
        itemLabel: "inventory transactions",
        onRenderRows: renderResourceTransactionRows
    });

    reportsPagination.resourceRelief = createPaginationController({
        infoId: "resourceReliefPaginationInfo",
        controlsId: "resourceReliefPaginationControls",
        pageSizeSelectId: "resourceReliefPageSize",
        itemLabel: "relief distributions",
        onRenderRows: renderResourceReliefRows
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
        "auditModule",
        "auditRecordType",
        "auditActionType",
        "auditPerformedBy"
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
        const params = buildGlobalDateParams({ includeYear: true });
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
        const url = `${REPORTS_API_BASE}/audit-trail${params ? `?${params}` : ""}`;
        const data = await apiRequest(url);

        reportsState.auditTrail = Array.isArray(data) ? data : [];
        renderAuditTrail(reportsState.auditTrail);

        reportsState.searchable.actionTypes = [...new Set(
            reportsState.auditTrail
                .map(item => readValue(item, ["actionType", "action"]))
                .filter(Boolean)
        )].sort((a, b) => String(a).localeCompare(String(b)));

        reportsState.searchable.performedBy = [...new Set(
            reportsState.auditTrail
                .map(item => readValue(item, ["performedBy", "createdBy"]))
                .filter(Boolean)
        )].sort((a, b) => String(a).localeCompare(String(b)));

        reportsState.searchable.modules = [...new Set(
            reportsState.auditTrail
                .map(item => readValue(item, ["module"]))
                .filter(Boolean)
        )].sort((a, b) => String(a).localeCompare(String(b)));

        reportsState.searchable.recordTypes = [...new Set(
            reportsState.auditTrail
                .map(item => readValue(item, ["recordType", "operationType", "referenceType"]))
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

async function loadIncidentReport(showSuccessMessage = false) {
    try {
        const params = buildGlobalDateParams({ includeYear: false });
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
        const params = buildGlobalDateParams({ includeYear: false });
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
        const params = buildGlobalDateParams({ includeYear: false });
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

function buildGlobalDateParams(options = {}) {
    const { includeYear = false } = options;

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

    if (includeYear && yearInput && yearInput.value && /^\d{4}$/.test(yearInput.value.trim())) {
        params.append("year", yearInput.value.trim());
    }

    updateCoveredPeriodLabels();
    return params.toString();
}

function buildAuditTrailParams() {
    const params = new URLSearchParams();

    const fromInput = document.getElementById("reportFromDate");
    const toInput = document.getElementById("reportToDate");
    const moduleFilter = document.getElementById("auditModule");
    const recordType = document.getElementById("auditRecordType");
    const actionType = document.getElementById("auditActionType");
    const performedBy = document.getElementById("auditPerformedBy");

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

    return params.toString();
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

    renderFinancialHistory(history);
}

function renderFinancialHistory(history) {
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
    const rows = Array.isArray(data) ? data : [];
    if (!reportsPagination.audit) return;
    reportsPagination.audit.setRows(rows);
}

function renderAuditTrailRows(rows) {
    const tbody = document.getElementById("auditTrailTableBody");
    if (!tbody) return;

    if (!rows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="empty-state-cell">No audit events found.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = rows.map((item, index) => `
        <tr>
            <td>${escapeHtml(formatDateTime(readValue(item, ["performedAt", "createdAt", "timeStamp"])))}</td>
            <td>${escapeHtml(readValue(item, ["module"]) || "--")}</td>
            <td>${escapeHtml(readValue(item, ["recordType", "operationType", "referenceType"]) || "--")}</td>
            <td>${escapeHtml(String(readValue(item, ["recordId", "operationId", "referenceId"]) ?? "--"))}</td>
            <td>${escapeHtml(readValue(item, ["actionType", "action"]) || "--")}</td>
            <td>${escapeHtml(readValue(item, ["fromStatus"]) || "--")}</td>
            <td>${escapeHtml(readValue(item, ["toStatus"]) || "--")}</td>
            <td>${escapeHtml(readValue(item, ["performedBy", "createdBy"]) || "--")}</td>
            <td>
                <button class="audit-view-btn" type="button" data-page-index="${index}">
                    View
                </button>
            </td>
        </tr>
    `).join("");

    tbody.querySelectorAll(".audit-view-btn").forEach(button => {
        button.addEventListener("click", () => {
            const pageIndex = Number(button.dataset.pageIndex);
            const currentState = reportsPagination.audit.getState();
            const absoluteIndex = ((currentState.page - 1) * currentState.pageSize) + pageIndex;
            const auditItem = reportsState.auditTrail[absoluteIndex];
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

    const incidentRows = readValue(data, ["incidents"]) || [];
    if (reportsPagination.incidents) {
        reportsPagination.incidents.setRows(incidentRows);
    }
}

function renderIncidentRecordRows(rows) {
    const tbody = document.getElementById("incidentRecordsTableBody");
    if (!tbody) return;

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state-cell">No incident records found.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(row => `
        <tr>
            <td>${escapeHtml(String(readValue(row, ["id"]) ?? "--"))}</td>
            <td>${escapeHtml(readValue(row, ["type", "incidentType", "calamityType"]) || "--")}</td>
            <td>${escapeHtml(readValue(row, ["status"]) || "--")}</td>
            <td>${escapeHtml(readValue(row, ["barangayName", "barangay", "primaryBarangayName"]) || "--")}</td>
            <td>${escapeHtml(readValue(row, ["location", "affectedArea", "affectedAreaType"]) || "--")}</td>
            <td>${escapeHtml(formatDateLong(readValue(row, ["reportedAt", "date", "createdAt"])))}</td>
        </tr>
    `).join("");
}

function renderIncidentErrorState() {
    setText("incidentTotalCount", "0");
    setText("incidentActiveCount", "0");
    setText("incidentResolvedCount", "0");

    renderCountByLabelTable("incidentByTypeTableBody", []);
    renderCountByLabelTable("incidentByBarangayTableBody", []);

    if (reportsPagination.incidents) {
        reportsPagination.incidents.setRows([]);
    } else {
        renderIncidentRecordRows([]);
    }
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

    const calamityRows = readValue(data, ["calamities"]) || [];
    if (reportsPagination.calamities) {
        reportsPagination.calamities.setRows(calamityRows);
    }
}

function renderCalamityRecordRows(rows) {
    const tbody = document.getElementById("calamityRecordsTableBody");
    if (!tbody) return;

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state-cell">No calamity records found.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(row => `
        <tr>
            <td>${escapeHtml(String(readValue(row, ["id"]) ?? "--"))}</td>
            <td>${escapeHtml(readValue(row, ["type", "calamityType", "eventName"]) || "--")}</td>
            <td>${escapeHtml(readValue(row, ["status"]) || "--")}</td>
            <td>${escapeHtml(readValue(row, ["primaryBarangayName", "barangay", "barangayName"]) || "--")}</td>
            <td>${escapeHtml(formatAffectedAreaDisplay(row))}</td>
            <td>${escapeHtml(formatDateLong(readValue(row, ["date", "createdAt"])))}</td>
        </tr>
    `).join("");
}

function renderCalamityErrorState() {
    setText("calamityTotalCount", "0");
    setText("calamityActiveCount", "0");
    setText("calamityMonitoringCount", "0");
    setText("calamityResolvedEndedCount", "0");

    renderCountByLabelTable("calamityByTypeTableBody", []);
    renderCountByLabelTable("calamityByBarangayTableBody", []);

    if (reportsPagination.calamities) {
        reportsPagination.calamities.setRows([]);
    } else {
        renderCalamityRecordRows([]);
    }
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
                <td>${escapeHtml(readValue(item, ["itemName", "name"]) || "--")}</td>
                <td>${escapeHtml(readValue(item, ["category"]) || "--")}</td>
                <td>${escapeHtml(String(readValue(item, ["availableQuantity"]) ?? "--"))}</td>
                <td>${escapeHtml(String(readValue(item, ["reorderLevel"]) ?? "--"))}</td>
                <td>${escapeHtml(readValue(item, ["stockStatus"]) || "--")}</td>
            </tr>
        `).join("") : `<tr><td colspan="6" class="empty-state-cell">No low-stock items found.</td></tr>`;
    }

    const transactions = readValue(data, ["inventoryTransactions"]) || [];
    if (reportsPagination.resourceTransactions) {
        reportsPagination.resourceTransactions.setRows(transactions);
    }

    const reliefRows = readValue(data, ["reliefDistributions"]) || [];
    if (reportsPagination.resourceRelief) {
        reportsPagination.resourceRelief.setRows(reliefRows);
    }
}

function renderResourceTransactionRows(rows) {
    const tbody = document.getElementById("resourceTransactionsTableBody");
    if (!tbody) return;

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state-cell">No inventory transactions found.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(tx => `
        <tr>
            <td>${escapeHtml(String(readValue(tx, ["id"]) ?? "--"))}</td>
            <td>${escapeHtml(String(readValue(tx, ["inventoryId"]) ?? "--"))}</td>
            <td>${escapeHtml(readValue(tx, ["itemName"]) || "--")}</td>
            <td>${escapeHtml(readValue(tx, ["actionType"]) || "--")}</td>
            <td>${escapeHtml(String(readValue(tx, ["quantity"]) ?? "--"))}</td>
            <td>${escapeHtml(readValue(tx, ["performedBy"]) || "--")}</td>
            <td>${escapeHtml(formatDateTime(readValue(tx, ["timeStamp"])))}</td>
        </tr>
    `).join("");
}

function renderResourceReliefRows(rows) {
    const tbody = document.getElementById("resourceReliefDistributionTableBody");
    if (!tbody) return;

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state-cell">No relief distributions found.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(row => `
        <tr>
            <td>${escapeHtml(String(readValue(row, ["id"]) ?? "--"))}</td>
            <td>${escapeHtml(readValue(row, ["referenceType"]) || "--")}</td>
            <td>${escapeHtml(String(readValue(row, ["referenceId"]) ?? "--"))}</td>
            <td>${escapeHtml(readValue(row, ["itemName"]) || "--")}</td>
            <td>${escapeHtml(String(readValue(row, ["quantity"]) ?? "--"))}</td>
            <td>${escapeHtml(readValue(row, ["distributedBy"]) || "--")}</td>
            <td>${escapeHtml(formatDateTime(readValue(row, ["distributedAt"])))}</td>
        </tr>
    `).join("");
}

function renderResourceErrorState() {
    setText("resourceInventoryCount", "0");
    setText("resourceLowStockCount", "0");
    setText("resourceEvacuationCenterCount", "0");
    setText("resourceOpenEvacuationCenters", "0");
    setText("resourceReliefDistributionCount", "0");

    const lowStockBody = document.getElementById("resourceLowStockTableBody");
    if (lowStockBody) {
        lowStockBody.innerHTML = `<tr><td colspan="6" class="empty-state-cell">No low-stock items found.</td></tr>`;
    }

    if (reportsPagination.resourceTransactions) {
        reportsPagination.resourceTransactions.setRows([]);
    } else {
        renderResourceTransactionRows([]);
    }

    if (reportsPagination.resourceRelief) {
        reportsPagination.resourceRelief.setRows([]);
    } else {
        renderResourceReliefRows([]);
    }
}

function openAuditDetailsModal(item) {
    if (!item) return;

    setText("auditDetailModule", readValue(item, ["module"]) || "OPERATIONS");
    setText("auditDetailRecordType", readValue(item, ["recordType", "operationType", "referenceType"]) || "--");
    setText("auditDetailRecordId", readValue(item, ["recordId", "operationId", "referenceId"]) ?? "--");
    setText("auditDetailActionType", readValue(item, ["actionType", "action"]) || "--");
    setText("auditDetailFromStatus", readValue(item, ["fromStatus"]) || "--");
    setText("auditDetailToStatus", readValue(item, ["toStatus"]) || "--");
    setText("auditDetailPerformedBy", readValue(item, ["performedBy", "createdBy"]) || "--");
    setText("auditDetailPerformedAt", formatDateTime(readValue(item, ["performedAt", "createdAt", "timeStamp"])));

    setPreText("auditDetailDescription", readValue(item, ["description"]) || "--");
    setPreText("auditDetailMetadata", formatMetadata(readValue(item, ["metadataJson", "metadata"])) || "--");

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
        document.body.style.overflow = "auto";
    }
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

function formatAffectedAreaDisplay(row) {
    const direct = readValue(row, ["location", "affectedAreaTypes", "affectedAreaType"]);
    if (Array.isArray(direct)) {
        return direct.join(", ");
    }
    if (typeof direct === "string" && direct.trim()) {
        return direct;
    }

    const names = readValue(row, ["affectedBarangayNames"]);
    if (Array.isArray(names) && names.length) {
        return names.join(", ");
    }

    return "--";
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
            Authorization: `Bearer ${token}`
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