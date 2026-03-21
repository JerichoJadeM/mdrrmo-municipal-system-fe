
const INVENTORY_CATEGORY_OPTIONS = [
    "CONSUMABLE", "SUPPLY", "TOOL", "VEHICLE", "PPE", "MEDICINE", "FOOD", "WATER", "SHELTER", "OTHER"
];

// const TRANSITION_RESOURCE_TYPE_OPTIONS = [
//     "RELIEF", "MEDICAL", "EQUIPMENT", "TRANSPORT", "COMMUNICATION", "SAFETY", "SHELTER", "FOOD", "WATER", "OTHER"
// ];

const INVENTORY_UNIT_OPTIONS = [
    "pcs", "box", "pack", "set", "roll", "pair", "bottle", "can", "bag", "sack", "kilo", "kilogram", "gram", "liter", "meter"
];
const INVENTORY_LOCATION_OPTIONS = [
    "MDRRMO Warehouse",
    "MDRRMO Office",
    "Municipal Storage",
    "Fire Station",
    "Barangay Storage",
    "Evacuation Center Storage"
];

const INVENTORY_ACTION_OPTIONS = [
    "RESTOCK",
    "DEPLOY",
    "RETURN",
    "CONSUMED",
    "DAMAGED",
    "ADJUSTMENT"
];

window.loadInventorySection = async function () {
    try {
        const params = new URLSearchParams();

        const keyword = document.getElementById("inventorySearchInput")?.value?.trim();
        const category = document.getElementById("inventoryCategoryFilter")?.value?.trim();
        const stockStatus = document.getElementById("inventoryStockFilter")?.value?.trim();

        if (keyword) params.append("keyword", keyword);
        if (category) params.append("category", category);
        if (stockStatus) params.append("stockStatus", stockStatus);

        const query = params.toString();
        const data = await apiGet(`/inventory/resources-view${query ? `?${query}` : ""}`);
        renderInventoryTable(data);
    } catch (error) {
        console.error("Failed to load inventory section", error);
        document.getElementById("inventoryTableContainer").innerHTML =
            `<div class="error-state">Failed to load inventory records.</div>`;
    }
};

function renderInventoryTable(items) {
    const container = document.getElementById("inventoryTableContainer");

    if (!items || !items.length) {
        container.innerHTML = `<div class="empty-state">No inventory records found.</div>`;
        return;
    }

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Unit</th>
                    <th>Available</th>
                    <th>Total</th>
                    <th>Reorder Level</th>
                    <th>Critical</th>
                    <th>Estimated Unit Cost</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(item => `
                    <tr>
                        <td>${escapeHtml(item.name)}</td>
                        <td>${escapeHtml(item.category || "-")}</td>
                        <td>${escapeHtml(item.unit || "-")}</td>
                        <td>${formatNumber(item.availableQuantity)}</td>
                        <td>${formatNumber(item.totalQuantity)}</td>
                        <td>${formatNumber(item.reorderLevel ?? 0)}</td>
                        <td>${item.criticalItem ? "Yes" : "No"}</td>
                        <td>${item.estimatedUnitCost != null ? formatPeso(item.estimatedUnitCost) : "₱ --"}</td>
                        <td><span class="status-badge ${stockBadgeClass(item.stockStatus)}">${escapeHtml(item.stockStatus || "-")}</span></td>
                        <td>${escapeHtml(item.location || "-")}</td>
                        <td>
                            <div class="card-actions">
                                ${canManageInventoryMasterData() ? `
                                    <button class="btn btn-sm btn-secondary" data-edit-id="${item.id}">Edit</button>
                                ` : ""}
                                ${canOperateInventory() ? `
                                    <button class="btn btn-sm btn-primary" data-adjust-id="${item.id}">Adjust Stock</button>
                                ` : ""}
                                ${canOperateInventory() ? `
                                    <button class="btn btn-sm btn-secondary" data-procure-id="${item.id}">Procure</button>
                                ` : ""}
                            </div>
                        </td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;

    container.querySelectorAll("[data-edit-id]").forEach(btn => {
        btn.addEventListener("click", () => {
            const item = items.find(row => String(row.id) === btn.dataset.editId);
            if (item) openInventoryEditModal(item);
        });
    });

    container.querySelectorAll("[data-adjust-id]").forEach(btn => {
        btn.addEventListener("click", () => {
            const item = items.find(row => String(row.id) === btn.dataset.adjustId);
            if (item) openInventoryAdjustModal(item);
        });
    });

    container.querySelectorAll("[data-procure-id]").forEach(btn => {
        btn.addEventListener("click", () => {
            const item = items.find(row => String(row.id) === btn.dataset.procureId);
            if (item) openInventoryProcurementModal(item);
        });
    });
}

window.openInventoryCreateModal = function () {
    openInventoryFormModal({
        mode: "create",
        title: "Add Inventory",
        submitLabel: "Create Inventory"
    });
};

window.openInventoryEditModal = function (item) {
    if (!canManageInventoryMasterData()) return;

    openInventoryFormModal({
        mode: "edit",
        title: "Edit Inventory",
        submitLabel: "Save Changes",
        item
    });
};

function openInventoryFormModal({ mode, title, submitLabel, item = null }) {
    openResourcesModal({
        title,
        bodyHtml: `
            <form id="inventoryForm" class="form-grid">
                <div class="form-group">
                    <label>Name</label>
                    <input type="text" name="name" value="${escapeHtml(item?.name || "")}" required>
                </div>

                <div class="form-group searchable-group">
                    <label>Category</label>
                    <input type="text" id="inventoryCategoryInput" autocomplete="off" required>
                    <div class="searchable-dropdown" id="inventoryCategoryDropdown"></div>
                </div>

                <div class="form-group">
                    <label>Total Quantity</label>
                    <input type="number" name="totalQuantity" min="0" value="${item?.totalQuantity ?? 0}" required>
                </div>

                <div class="form-group searchable-group">
                    <label>Unit</label>
                    <input type="text" id="inventoryUnitInput" autocomplete="off" required>
                    <div class="searchable-dropdown" id="inventoryUnitDropdown"></div>
                </div>

                <div class="form-group searchable-group">
                    <label>Location</label>
                    <input type="text" id="inventoryLocationInput" autocomplete="off" required>
                    <div class="searchable-dropdown" id="inventoryLocationDropdown"></div>
                </div>

                <div class="form-group">
                    <label>Reorder Level</label>
                    <input type="number" name="reorderLevel" min="0" value="${item?.reorderLevel ?? 0}">
                </div>

                <div class="form-group">
                    <label>Estimated Unit Cost</label>
                    <input type="number" name="estimatedUnitCost" min="0" step="0.01" value="${item?.estimatedUnitCost ?? ""}">
                </div>

                <div class="form-group full">
                    <label>
                        <input type="checkbox" name="criticalItem" ${item?.criticalItem ? "checked" : ""}>
                        Critical item
                    </label>
                </div>
            </form>
        `,
        footerHtml: `
            <button class="btn btn-secondary" id="cancelInventoryFormBtn">Cancel</button>
            <button class="btn btn-primary" id="submitInventoryFormBtn">${submitLabel}</button>
        `
    });

    bindSearchableDropdown({
        inputId: "inventoryCategoryInput",
        dropdownId: "inventoryCategoryDropdown",
        options: INVENTORY_CATEGORY_OPTIONS,
        initialValue: item?.category || ""
    });

    bindSearchableDropdown({
        inputId: "inventoryUnitInput",
        dropdownId: "inventoryUnitDropdown",
        options: INVENTORY_UNIT_OPTIONS,
        initialValue: item?.unit || ""
    });

    bindSearchableDropdown({
        inputId: "inventoryLocationInput",
        dropdownId: "inventoryLocationDropdown",
        options: INVENTORY_LOCATION_OPTIONS,
        initialValue: item?.location || ""
    });

    document.getElementById("cancelInventoryFormBtn")?.addEventListener("click", closeResourcesModal);

    document.getElementById("submitInventoryFormBtn")?.addEventListener("click", async () => {
        const form = document.getElementById("inventoryForm");
        const formData = new FormData(form);

        const payload = {
            name: formData.get("name")?.toString().trim(),
            category: document.getElementById("inventoryCategoryInput")?.value?.trim(),
            totalQuantity: Number(formData.get("totalQuantity") || 0),
            unit: document.getElementById("inventoryUnitInput")?.value?.trim(),
            location: document.getElementById("inventoryLocationInput")?.value?.trim(),
            reorderLevel: Number(formData.get("reorderLevel") || 0),
            criticalItem: form.querySelector('[name="criticalItem"]').checked,
            estimatedUnitCost: formData.get("estimatedUnitCost") ? Number(formData.get("estimatedUnitCost")) : null
        };

        try {
            if (mode === "create") {
                await apiSend("/inventory", "POST", payload);
            } else {
                await apiSend(`/inventory/${item.id}`, "PUT", payload);
            }

            closeResourcesModal();
            showToast("Inventory saved successfully.", "success");
            await refreshResourcesHeader();
            await window.loadInventorySection();
            if (window.loadReliefSection) await window.loadReliefSection();
        } catch (error) {
            console.error("Failed to save inventory", error);
            showToast("Failed to save inventory.", "error");
        }
    });
}

window.openInventoryAdjustModal = async function (item) {
    if (!canOperateInventory()) return;

    const incidentOptions = await loadIncidentOptions();
    const calamityOptions = await loadCalamityOptions();

    openResourcesModal({
        title: `Adjust Stock - ${escapeHtml(item.name)}`,
        bodyHtml: `
            <form id="inventoryAdjustForm" class="form-grid">
                <div class="form-group">
                    <label>Item</label>
                    <input type="text" value="${escapeHtml(item.name)}" disabled>
                </div>

                <div class="form-group">
                    <label>Available Quantity</label>
                    <input type="text" value="${formatNumber(item.availableQuantity)}" disabled>
                </div>

                <div class="form-group">
                    <label>Action Type</label>
                    <select name="actionType" id="inventoryActionTypeInput">
                        ${INVENTORY_ACTION_OPTIONS.map(option => `
                            <option value="${option}">${option}</option>
                        `).join("")}
                    </select>
                </div>

                <div class="form-group">
                    <label>Quantity</label>
                    <input type="number" name="quantity" min="1" required>
                </div>

                <div class="form-group searchable-group">
                    <label>Incident</label>
                    <input type="text" id="incidentLookupInput" autocomplete="off" placeholder="Search incident type, barangay, status, or ID">
                    <input type="hidden" id="incidentLookupIdInput">
                    <div class="searchable-dropdown" id="incidentLookupDropdown"></div>
                </div>

                <div class="form-group searchable-group">
                    <label>Calamity</label>
                    <input type="text" id="calamityLookupInput" autocomplete="off" placeholder="Search calamity type, severity, status, or ID">
                    <input type="hidden" id="calamityLookupIdInput">
                    <div class="searchable-dropdown" id="calamityLookupDropdown"></div>
                </div>
            </form>
        `,
        footerHtml: `
            <button class="btn btn-secondary" id="cancelInventoryAdjustBtn">Cancel</button>
            <button class="btn btn-primary" id="submitInventoryAdjustBtn">Apply Adjustment</button>
        `
    });

    bindSearchableDropdown({
        inputId: "incidentLookupInput",
        dropdownId: "incidentLookupDropdown",
        hiddenInputId: "incidentLookupIdInput",
        options: incidentOptions,
        getLabel: option => option.label,
        getValue: option => option.value,
        onSelect: () => {
            const calamityHidden = document.getElementById("calamityLookupIdInput");
            const calamityInput = document.getElementById("calamityLookupInput");
            if (calamityHidden) calamityHidden.value = "";
            if (calamityInput) calamityInput.value = "";
        }
    });

    bindSearchableDropdown({
        inputId: "calamityLookupInput",
        dropdownId: "calamityLookupDropdown",
        hiddenInputId: "calamityLookupIdInput",
        options: calamityOptions,
        getLabel: option => option.label,
        getValue: option => option.value,
        onSelect: () => {
            const incidentHidden = document.getElementById("incidentLookupIdInput");
            const incidentInput = document.getElementById("incidentLookupInput");
            if (incidentHidden) incidentHidden.value = "";
            if (incidentInput) incidentInput.value = "";
        }
    });

    document.getElementById("cancelInventoryAdjustBtn")?.addEventListener("click", closeResourcesModal);

    document.getElementById("submitInventoryAdjustBtn")?.addEventListener("click", async () => {
        const form = document.getElementById("inventoryAdjustForm");
        const formData = new FormData(form);

        const incidentIdRaw = document.getElementById("incidentLookupIdInput")?.value?.trim();
        const calamityIdRaw = document.getElementById("calamityLookupIdInput")?.value?.trim();

        if (incidentIdRaw && calamityIdRaw) {
            showToast("Choose only one operation link: either incident or calamity.", "error");
            return;
        }

        const payload = {
            actionType: formData.get("actionType")?.toString().trim(),
            quantity: Number(formData.get("quantity") || 0),
            incidentId: incidentIdRaw ? Number(incidentIdRaw) : null,
            calamityId: calamityIdRaw ? Number(calamityIdRaw) : null
        };

        try {
            await apiSend(`/inventory/${item.id}/adjust-stock`, "PATCH", payload);

            closeResourcesModal();
            showToast("Inventory adjusted successfully.", "success");
            await refreshResourcesHeader();
            await window.loadInventorySection();
            if (window.loadReliefSection) await window.loadReliefSection();
        } catch (error) {
            console.error("Failed to adjust stock", error);
            showToast("Failed to adjust stock.", "error");
        }
    });
};

window.openInventoryProcurementModal = async function (item) {
    if (!canOperateInventory()) return;

    const [budgetOptions, incidentOptions, calamityOptions] = await Promise.all([
        loadBudgetCategoryOptions(),
        loadIncidentOptions(),
        loadCalamityOptions()
    ]);

    openResourcesModal({
        title: `Procure / Replenish - ${escapeHtml(item.name)}`,
        bodyHtml: `
            <form id="inventoryProcurementForm" class="form-grid">
                <div class="form-group">
                    <label>Item</label>
                    <input type="text" value="${escapeHtml(item.name)}" disabled>
                </div>

                <div class="form-group">
                    <label>Current Available</label>
                    <input type="text" value="${formatNumber(item.availableQuantity)}" disabled>
                </div>

                <div class="form-group searchable-group full">
                    <label>Budget Category</label>
                    <input type="text" id="procurementBudgetCategoryInput" autocomplete="off" placeholder="Search budget section/category" required>
                    <input type="hidden" id="procurementBudgetCategoryIdInput">
                    <div class="searchable-dropdown" id="procurementBudgetCategoryDropdown"></div>
                </div>

                <div class="form-group">
                    <label>Quantity Added</label>
                    <input type="number" name="quantityAdded" min="1" required>
                </div>

                <div class="form-group">
                    <label>Total Cost</label>
                    <input type="number" name="totalCost" min="0.01" step="0.01" required>
                </div>

                <div class="form-group">
                    <label>Expense Date</label>
                    <input type="date" name="expenseDate" value="${new Date().toISOString().slice(0, 10)}">
                </div>

                <div class="form-group searchable-group">
                    <label>Incident (Optional)</label>
                    <input type="text" id="procurementIncidentInput" autocomplete="off" placeholder="Search incident">
                    <input type="hidden" id="procurementIncidentIdInput">
                    <div class="searchable-dropdown" id="procurementIncidentDropdown"></div>
                </div>

                <div class="form-group searchable-group">
                    <label>Calamity (Optional)</label>
                    <input type="text" id="procurementCalamityInput" autocomplete="off" placeholder="Search calamity">
                    <input type="hidden" id="procurementCalamityIdInput">
                    <div class="searchable-dropdown" id="procurementCalamityDropdown"></div>
                </div>

                <div class="form-group full">
                    <label>Description</label>
                    <textarea name="description" rows="3" placeholder="Procurement note / purchase description"></textarea>
                </div>

                <div class="form-group full">
                    <div class="metric-card">
                        <div class="metric-label">Projected Estimated Unit Cost</div>
                        <div class="metric-value" id="procurementProjectedUnitCost">₱ --</div>
                    </div>
                </div>
            </form>
        `,
        footerHtml: `
            <button class="btn btn-secondary" id="cancelInventoryProcurementBtn">Cancel</button>
            <button class="btn btn-primary" id="submitInventoryProcurementBtn">Save Procurement</button>
        `
    });

    bindSearchableDropdown({
        inputId: "procurementBudgetCategoryInput",
        dropdownId: "procurementBudgetCategoryDropdown",
        hiddenInputId: "procurementBudgetCategoryIdInput",
        options: budgetOptions,
        getLabel: option => option.label,
        getValue: option => option.value
    });

    bindSearchableDropdown({
        inputId: "procurementIncidentInput",
        dropdownId: "procurementIncidentDropdown",
        hiddenInputId: "procurementIncidentIdInput",
        options: incidentOptions,
        getLabel: option => option.label,
        getValue: option => option.value,
        onSelect: () => {
            const calamityHidden = document.getElementById("procurementCalamityIdInput");
            const calamityInput = document.getElementById("procurementCalamityInput");
            if (calamityHidden) calamityHidden.value = "";
            if (calamityInput) calamityInput.value = "";
        }
    });

    bindSearchableDropdown({
        inputId: "procurementCalamityInput",
        dropdownId: "procurementCalamityDropdown",
        hiddenInputId: "procurementCalamityIdInput",
        options: calamityOptions,
        getLabel: option => option.label,
        getValue: option => option.value,
        onSelect: () => {
            const incidentHidden = document.getElementById("procurementIncidentIdInput");
            const incidentInput = document.getElementById("procurementIncidentInput");
            if (incidentHidden) incidentHidden.value = "";
            if (incidentInput) incidentInput.value = "";
        }
    });

    bindProcurementCostPreview();

    document.getElementById("cancelInventoryProcurementBtn")?.addEventListener("click", closeResourcesModal);

    document.getElementById("submitInventoryProcurementBtn")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const originalText = button.textContent;

        const form = document.getElementById("inventoryProcurementForm");
        const formData = new FormData(form);

        const categoryIdRaw = document.getElementById("procurementBudgetCategoryIdInput")?.value?.trim();
        const incidentIdRaw = document.getElementById("procurementIncidentIdInput")?.value?.trim();
        const calamityIdRaw = document.getElementById("procurementCalamityIdInput")?.value?.trim();

        if (!categoryIdRaw) {
            showToast("Please select a budget category.", "error");
            return;
        }

        if (incidentIdRaw && calamityIdRaw) {
            showToast("Choose only one operation link: either incident or calamity.", "error");
            return;
        }

        const payload = {
            categoryId: Number(categoryIdRaw),
            quantityAdded: Number(formData.get("quantityAdded") || 0),
            totalCost: Number(formData.get("totalCost") || 0),
            expenseDate: formData.get("expenseDate")?.toString() || null,
            description: formData.get("description")?.toString().trim() || null,
            incidentId: incidentIdRaw ? Number(incidentIdRaw) : null,
            calamityId: calamityIdRaw ? Number(calamityIdRaw) : null
        };

        if (payload.quantityAdded <= 0) {
            showToast("Quantity added must be greater than 0.", "error");
            return;
        }

        if (payload.totalCost <= 0) {
            showToast("Total cost must be greater than 0.", "error");
            return;
        }

        try {
            button.disabled = true;
            button.textContent = "Saving...";

            await apiSend(`/inventory/${item.id}/procure`, "PATCH", payload);

            closeResourcesModal();
            showToast("Procurement saved successfully.", "success");
            await refreshResourcesHeader();
            await window.loadInventorySection();
            if (window.loadReliefSection) await window.loadReliefSection();
            if (window.loadBudgetSection) await window.loadBudgetSection();
        } catch (error) {
            console.error("Failed to save procurement", error);
            showToast("Failed to save procurement.", "error");
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    });
};

function bindProcurementCostPreview() {
    const form = document.getElementById("inventoryProcurementForm");
    if (!form) return;

    const quantityInput = form.querySelector('[name="quantityAdded"]');
    const totalCostInput = form.querySelector('[name="totalCost"]');
    const output = document.getElementById("procurementProjectedUnitCost");

    const recalc = () => {
        const quantity = Number(quantityInput?.value || 0);
        const totalCost = Number(totalCostInput?.value || 0);

        if (quantity > 0 && totalCost > 0) {
            output.textContent = formatPeso(totalCost / quantity);
        } else {
            output.textContent = "₱ --";
        }
    };

    quantityInput?.addEventListener("input", recalc);
    totalCostInput?.addEventListener("input", recalc);
}

async function loadBudgetCategoryOptions() {
    try {
        const budgets = await apiGet("/budgets");
        if (!budgets || !budgets.length) return [];

        const currentYear = new Date().getFullYear();

        let targetBudget = budgets.find(
            item => Number(item.year) === currentYear
        );

        if (!targetBudget && resourcesState.selectedBudgetId) {
            targetBudget = budgets.find(
                item => Number(item.id) === Number(resourcesState.selectedBudgetId)
            );
        }

        if (!targetBudget) {
            targetBudget = budgets
                .slice()
                .sort((a, b) => Number(b.year) - Number(a.year))[0];
        }

        const detail = await apiGet(`/budgets/${targetBudget.id}`);
        const categories = detail.categories || [];

        return categories.map(item => ({
            label: `${item.section || "UNASSIGNED"} • ${item.name} • ${formatPeso(item.allocatedAmount)}`,
            value: item.id
        }));
    } catch (error) {
        console.error("Failed to load budget categories", error);
        return [];
    }
}