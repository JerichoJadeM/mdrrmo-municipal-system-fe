const BUDGET_SECTION_OPTIONS = [
    "DISASTER PREPAREDNESS",
    "DISASTER PREVENTION AND MITIGATION",
    "DISASTER RESPONSE",
    "DISASTER REHABILITATION AND RECOVERY"
];

const BUDGET_CATEGORY_OPTIONS = [
    "Training Expenses",
    "Traveling Expenses",
    "Other Supplies and Materials",
    "Drugs and Medicines Expenses",
    "Medical Supplies",
    "Rescue Equipment",
    "Evacuation Support",
    "Food and Water",
    "Subsidy to Other Funds",
    "Capital Outlay",
    "Maintenance and Other Operating Expenses"
];

window.loadBudgetSection = async function () {
    try {
        ensureBudgetActionBindings();

        const [history, forecast, allBudgets] = await Promise.all([
            canManageBudgets() ? apiGet("/budgets/history?years=5") : Promise.resolve([]),
            apiGet("/budgets/forecast/next-year"),
            canManageBudgets() ? apiGet("/budgets") : Promise.resolve([])
        ]);

        resourcesState.budgets = allBudgets || [];

        if (resourcesState.budgets.length) {
            const stillExists = resourcesState.budgets.some(
                item => Number(item.id) === Number(resourcesState.selectedBudgetId)
            );

            if (!stillExists) {
                resourcesState.selectedBudgetId = resourcesState.budgets[0].id;
            }
        } else {
            resourcesState.selectedBudgetId = null;
        }

        renderBudgetSelector(resourcesState.budgets);
        await renderSelectedBudgetSummary();
        renderBudgetHistory(history);
        renderNextYearForecast(forecast);
    } catch (error) {
        console.error("Failed to load budget section", error);
        document.getElementById("currentBudgetSummary").innerHTML =
            `<div class="error-state">Failed to load budget summary.</div>`;
        document.getElementById("budgetAllocationContainer").innerHTML =
            `<div class="error-state">Failed to load budget allocations.</div>`;
        document.getElementById("budgetHistoryContainer").innerHTML =
            `<div class="error-state">Failed to load budget history.</div>`;
        document.getElementById("nextYearForecastContainer").innerHTML =
            `<div class="error-state">Failed to load budget forecast.</div>`;
    }
};

function ensureBudgetActionBindings() {
    const addBudgetBtn = document.getElementById("addBudgetBtn");
    const allocateBudgetBtn = document.getElementById("allocateBudgetBtn");
    const budgetSelect = document.getElementById("budgetSelect");

    if (addBudgetBtn && !addBudgetBtn.dataset.bound) {
        addBudgetBtn.dataset.bound = "true";
        addBudgetBtn.addEventListener("click", () => {
            if (!canManageBudgets()) {
                showToast("You do not have permission to add budgets.", "error");
                return;
            }
            window.openBudgetCreateModal();
        });
    }

    if (allocateBudgetBtn && !allocateBudgetBtn.dataset.bound) {
        allocateBudgetBtn.dataset.bound = "true";
        allocateBudgetBtn.addEventListener("click", () => {
            if (!canManageBudgets()) {
                showToast("You do not have permission to allocate budgets.", "error");
                return;
            }
            window.openBudgetAllocateModal();
        });
    }

    if (budgetSelect && !budgetSelect.dataset.bound) {
        budgetSelect.dataset.bound = "true";
        budgetSelect.addEventListener("change", async () => {
            resourcesState.selectedBudgetId = budgetSelect.value ? Number(budgetSelect.value) : null;
            await renderSelectedBudgetSummary();
        });
    }
}

function renderBudgetSelector(budgets) {
    const select = document.getElementById("budgetSelect");
    if (!select) return;

    if (!canManageBudgets()) {
        select.innerHTML = "";
        return;
    }

    if (!budgets || !budgets.length) {
        select.innerHTML = `<option value="">No budgets</option>`;
        return;
    }

    select.innerHTML = budgets.map(budget => `
        <option value="${budget.id}" ${Number(resourcesState.selectedBudgetId) === Number(budget.id) ? "selected" : ""}>
            ${escapeHtml(String(budget.year))} - ${escapeHtml(budget.description || "Budget")}
        </option>
    `).join("");
}

async function renderSelectedBudgetSummary() {
    const currentContainer = document.getElementById("currentBudgetSummary");
    const allocationContainer = document.getElementById("budgetAllocationContainer");

    if (!resourcesState.selectedBudgetId || Number.isNaN(Number(resourcesState.selectedBudgetId))) {
        currentContainer.innerHTML = `<div class="empty-state">Select a budget record.</div>`;
        allocationContainer.innerHTML = `<div class="empty-state">Select a budget record.</div>`;
        return;
    }

    try {
        const detail = await apiGet(`/budgets/${resourcesState.selectedBudgetId}`);

        currentContainer.innerHTML = `
            <div class="metric-row">
                <div class="metric-card">
                    <div class="metric-label">Fiscal Year</div>
                    <div class="metric-value">${escapeHtml(String(detail.year ?? "-"))}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Total Allotment</div>
                    <div class="metric-value">${formatPeso(detail.totalAllotment)}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Total Obligations</div>
                    <div class="metric-value">${formatPeso(detail.totalObligations)}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Remaining Balance</div>
                    <div class="metric-value">${formatPeso(detail.remainingBalance)}</div>
                </div>
            </div>

            <div class="metric-row" style="margin-top: 14px;">
                <div class="metric-card">
                    <div class="metric-label">Allocated to Categories</div>
                    <div class="metric-value">${formatPeso(detail.allocatedToCategories)}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Unallocated Budget</div>
                    <div class="metric-value">${formatPeso(detail.unallocatedBudget)}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Utilization Rate</div>
                    <div class="metric-value">${formatNumber(detail.utilizationRate)}%</div>
                </div>
            </div>
        `;

        allocationContainer.innerHTML = `
            ${detail.categories && detail.categories.length ? `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Section</th>
                            <th>Category</th>
                            <th>Allocated Amount</th>
                            <th>% of Allotment</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${detail.categories.map(category => `
                            <tr>
                                <td>${escapeHtml(category.section || "-")}</td>
                                <td>${escapeHtml(category.name)}</td>
                                <td>${formatPeso(category.allocatedAmount)}</td>
                                <td>${detail.totalAllotment > 0 ? `${formatNumber((Number(category.allocatedAmount || 0) / Number(detail.totalAllotment || 0)) * 100)}%` : "--"}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            ` : `
                <div class="empty-state">No categories allocated yet for the selected budget.</div>
            `}
        `;
    } catch (error) {
        console.error("Failed to load selected budget detail", error);
        currentContainer.innerHTML = `<div class="error-state">Failed to load selected budget summary.</div>`;
        allocationContainer.innerHTML = `<div class="error-state">Failed to load selected budget allocations.</div>`;
    }
}

function renderBudgetHistory(rows) {
    const container = document.getElementById("budgetHistoryContainer");
    const historyPanel = document.getElementById("budgetHistoryPanel");

    if (!canManageBudgets()) {
        if (historyPanel) historyPanel.classList.add("hidden");
        return;
    }

    if (historyPanel) historyPanel.classList.remove("hidden");

    if (!rows || !rows.length) {
        container.innerHTML = `<div class="empty-state">No budget history found.</div>`;
        return;
    }

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Year</th>
                    <th>Allotment</th>
                    <th>Obligations</th>
                    <th>Remaining Balance</th>
                    <th>Utilization</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(row => `
                    <tr>
                        <td>${escapeHtml(String(row.year ?? "-"))}</td>
                        <td>${formatPeso(row.allotment)}</td>
                        <td>${formatPeso(row.obligations)}</td>
                        <td>${formatPeso(row.remainingBalance)}</td>
                        <td>${formatNumber(row.utilizationRate)}%</td>
                `).join("")}
            </tbody>
        </table>
    `;
}

function renderNextYearForecast(data) {
    const grouped = {};

    (data.categories || []).forEach(item => {
        const section = item.section || "UNASSIGNED";
        if (!grouped[section]) {
            grouped[section] = [];
        }
        grouped[section].push(item);
    });

    const groupedHtml = Object.entries(grouped).map(([section, items]) => {
        const sectionTotal = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);

        return `
            <div class="forecast-section-block">
                <div class="forecast-section-head">
                    <h3>${escapeHtml(section)}</h3>
                    <span class="forecast-section-total">${formatPeso(sectionTotal)}</span>
                </div>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Category</th>
                            <th>Forecast Amount</th>
                            <th>Note</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => `
                            <tr>
                                <td>${escapeHtml(item.category)}</td>
                                <td>${formatPeso(item.amount)}</td>
                                <td>${escapeHtml(item.note || "-")}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }).join("");

    document.getElementById("nextYearForecastContainer").innerHTML = `
        <div class="metric-row">
            <div class="metric-card">
                <div class="metric-label">Forecast Year</div>
                <div class="metric-value">${escapeHtml(String(data.year ?? "-"))}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Forecast Allotment</div>
                <div class="metric-value">${formatPeso(data.totalForecast)}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Recommended Adjustment</div>
                <div class="metric-value">${formatPeso(data.recommendedAdjustment)}</div>
            </div>
        </div>

        <div style="margin-top: 14px;" class="metric-card">
            <div class="metric-label">Forecast Assumptions</div>
            <div>${escapeHtml(data.assumptions || "No assumptions recorded.")}</div>
        </div>

        <div class="forecast-sections-wrapper" style="margin-top: 16px;">
            ${groupedHtml || `<div class="empty-state">No forecast data available.</div>`}
        </div>
    `;
}

window.openBudgetCreateModal = function () {
    if (!canManageBudgets()) return;

    openResourcesModal({
        title: "Add Budget",
        bodyHtml: `
            <form id="budgetCreateForm" class="form-grid">
                <div class="form-group">
                    <label>Year</label>
                    <input type="number" name="year" min="2000" max="9999" required>
                </div>

                <div class="form-group">
                    <label>Total Allotment</label>
                    <input type="number" name="totalAmount" min="0" step="0.01" required>
                </div>

                <div class="form-group full">
                    <label>Description</label>
                    <input type="text" name="description" required>
                </div>
            </form>
        `,
        footerHtml: `
            <button class="btn btn-secondary" id="cancelBudgetCreateBtn">Cancel</button>
            <button class="btn btn-primary" id="submitBudgetCreateBtn">Create Budget</button>
        `
    });

    document.getElementById("cancelBudgetCreateBtn")?.addEventListener("click", closeResourcesModal);

    document.getElementById("submitBudgetCreateBtn")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const originalText = button.textContent;

        const form = document.getElementById("budgetCreateForm");
        const formData = new FormData(form);

        const payload = {
            year: Number(formData.get("year")),
            totalAmount: Number(formData.get("totalAmount") || 0),
            description: formData.get("description")?.toString().trim()
        };

        try {
            button.disabled = true;
            button.textContent = "Creating...";
            const created = await apiSend("/budgets", "POST", payload);

            closeResourcesModal();
            showToast("Budget created successfully.", "success");

            if (created?.id) {
                resourcesState.selectedBudgetId = created.id;
            }

            await refreshResourcesHeader();
            await window.loadBudgetSection();
        } catch (error) {
            console.error("Failed to create budget", error);
            showToast("Failed to create budget.", "error");
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    });
};

window.openBudgetAllocateModal = function () {
    if (!canManageBudgets()) return;

    if (!resourcesState.selectedBudgetId) {
        showToast("Please select a budget first.", "error");
        return;
    }

    openResourcesModal({
        title: "Allocate Budget Category",
        bodyHtml: `
            <form id="budgetAllocateForm" class="form-grid">
                <div class="form-group searchable-group">
                    <label>Section</label>
                    <input type="text" id="budgetSectionInput" autocomplete="off" placeholder="Search or select section" required>
                    <div class="searchable-dropdown" id="budgetSectionDropdown"></div>
                </div>

                <div class="form-group searchable-group">
                    <label>Category Name</label>
                    <input type="text" id="budgetCategoryNameInput" autocomplete="off" placeholder="Search or select category" required>
                    <div class="searchable-dropdown" id="budgetCategoryNameDropdown"></div>
                </div>

                <div class="form-group">
                    <label>Allocated Amount</label>
                    <input type="number" name="allocatedAmount" min="0" step="0.01" required>
                </div>
            </form>
        `,
        footerHtml: `
            <button class="btn btn-secondary" id="cancelBudgetAllocateBtn">Cancel</button>
            <button class="btn btn-primary" id="submitBudgetAllocateBtn">Allocate</button>
        `
    });

    bindSearchableDropdown({
        inputId: "budgetSectionInput",
        dropdownId: "budgetSectionDropdown",
        options: BUDGET_SECTION_OPTIONS
    });

    bindSearchableDropdown({
        inputId: "budgetCategoryNameInput",
        dropdownId: "budgetCategoryNameDropdown",
        options: BUDGET_CATEGORY_OPTIONS
    });

    document.getElementById("cancelBudgetAllocateBtn")?.addEventListener("click", closeResourcesModal);

    document.getElementById("submitBudgetAllocateBtn")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const originalText = button.textContent;

        const form = document.getElementById("budgetAllocateForm");
        const formData = new FormData(form);

        const detail = await apiGet(`/budgets/${resourcesState.selectedBudgetId}`);

        const payload = {
            section: document.getElementById("budgetSectionInput")?.value?.trim(),
            name: document.getElementById("budgetCategoryNameInput")?.value?.trim(),
            allocatedAmount: Number(formData.get("allocatedAmount") || 0)
        };

        if (payload.allocatedAmount > Number(detail.unallocatedBudget || 0)) {
            showToast(`Allocated amount exceeds remaining unallocated budget of ${formatPeso(detail.unallocatedBudget)}.`, "error");
            return;
        }

        try {
            button.disabled = true;
            button.textContent = "Allocating...";

            await apiSend(`/budgets/${resourcesState.selectedBudgetId}/categories`, "POST", payload);

            closeResourcesModal();
            showToast("Budget category allocated successfully.", "success");

            await refreshResourcesHeader();
            await window.loadBudgetSection();
        } catch (error) {
            console.error("Failed to allocate budget category", error);
            showToast("Failed to allocate budget category.", "error");
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    });
};