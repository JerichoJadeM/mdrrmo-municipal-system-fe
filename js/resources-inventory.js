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
            criticalItem: form.querySelector('[name="criticalItem"]').checked
        };

        try {
            if (mode === "create") {
                await apiSend("/inventory", "POST", payload);
            } else {
                await apiSend(`/inventory/${item.id}`, "PUT", payload);
            }

            closeResourcesModal();
            await refreshResourcesHeader();
            await window.loadInventorySection();
            if (window.loadReliefSection) await window.loadReliefSection();
        } catch (error) {
            console.error("Failed to save inventory", error);
            alert("Failed to save inventory.");
        }
    });
}

window.openInventoryAdjustModal = async function (item) {
    if (!canOperateInventory()) return;

    const [userOptions, incidentOptions] = await Promise.all([
        loadUserOptions(),
        loadIncidentOptions()
    ]);

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
                    <label>Performed By User</label>
                    <input type="text" id="performedByUserInput" autocomplete="off" placeholder="Search user name, email, or ID">
                    <input type="hidden" id="performedByUserIdInput">
                    <div class="searchable-dropdown" id="performedByUserDropdown"></div>
                </div>

                <div class="form-group searchable-group">
                    <label>Incident</label>
                    <input type="text" id="incidentLookupInput" autocomplete="off" placeholder="Search incident type, barangay, status, or ID">
                    <input type="hidden" id="incidentLookupIdInput">
                    <div class="searchable-dropdown" id="incidentLookupDropdown"></div>
                </div>
            </form>
        `,
        footerHtml: `
            <button class="btn btn-secondary" id="cancelInventoryAdjustBtn">Cancel</button>
            <button class="btn btn-primary" id="submitInventoryAdjustBtn">Apply Adjustment</button>
        `
    });

    bindSearchableDropdown({
        inputId: "performedByUserInput",
        dropdownId: "performedByUserDropdown",
        hiddenInputId: "performedByUserIdInput",
        options: userOptions,
        getLabel: option => option.label,
        getValue: option => option.value
    });

    bindSearchableDropdown({
        inputId: "incidentLookupInput",
        dropdownId: "incidentLookupDropdown",
        hiddenInputId: "incidentLookupIdInput",
        options: incidentOptions,
        getLabel: option => option.label,
        getValue: option => option.value
    });

    document.getElementById("cancelInventoryAdjustBtn")?.addEventListener("click", closeResourcesModal);

    document.getElementById("submitInventoryAdjustBtn")?.addEventListener("click", async () => {
        const form = document.getElementById("inventoryAdjustForm");
        const formData = new FormData(form);

        const performedByIdRaw = document.getElementById("performedByUserIdInput")?.value?.trim();
        const incidentIdRaw = document.getElementById("incidentLookupIdInput")?.value?.trim();

        const payload = {
            actionType: formData.get("actionType")?.toString().trim(),
            quantity: Number(formData.get("quantity") || 0),
            performedById: performedByIdRaw ? Number(performedByIdRaw) : null,
            incidentId: incidentIdRaw ? Number(incidentIdRaw) : null
        };

        try {
            await apiSend(`/inventory/${item.id}/adjust-stock`, "PATCH", payload);

            closeResourcesModal();
            await refreshResourcesHeader();
            await window.loadInventorySection();
            if (window.loadReliefSection) await window.loadReliefSection();
        } catch (error) {
            console.error("Failed to adjust stock", error);
            alert("Failed to adjust stock.");
        }
    });
};