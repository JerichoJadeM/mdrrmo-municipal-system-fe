let reliefInventoryPagination = null;

window.loadReliefSection = async function () {
    try {
        const params = new URLSearchParams();

        const keyword = document.getElementById("reliefSearchInput")?.value?.trim();
        const category = document.getElementById("reliefCategoryFilter")?.value?.trim();
        const stockStatus = document.getElementById("reliefStatusFilter")?.value?.trim();

        if (keyword) params.append("keyword", keyword);
        if (category) params.append("category", category);
        if (stockStatus) params.append("stockStatus", stockStatus);

        const query = params.toString();

        const [rows, templates] = await Promise.all([
            apiGet(`/inventory/resources-view${query ? `?${query}` : ""}`),
            apiGet(`/relief-pack-templates/active`)
        ]);

        const reliefRows = (rows || []).filter(item => {
            const normalized = String(item.category || "").toUpperCase();
            return ["FOOD", "RELIEF", "WATER", "HYGIENE", "MEDICAL"].includes(normalized);
        });

        renderReliefTable(reliefRows);
        await renderReliefPackReadiness(templates || []);
        bindReliefToolbar();
        bindReliefSubtabs();
    } catch (error) {
        console.error("Failed to load relief section", error);
        document.getElementById("reliefTableContainer").innerHTML =
            `<div class="error-state">Failed to load relief records.</div>`;
        document.getElementById("reliefPackReadinessContainer").innerHTML =
            `<div class="error-state">Failed to load relief pack readiness.</div>`;
    }
};

function canManageReliefTemplates() {
    if (typeof getUserRoles === "function") {
        const roles = getUserRoles();
        return roles.includes("ROLE_ADMIN") || roles.includes("ROLE_MANAGER");
    }

    try {
        const roles = JSON.parse(localStorage.getItem("userAuthorities") || "[]");
        return roles.includes("ROLE_ADMIN") || roles.includes("ROLE_MANAGER");
    } catch (e) {
        return false;
    }
}

function bindReliefToolbar() {
    const refreshBtn = document.getElementById("refreshReliefPacksBtn");
    const addTemplateBtn = document.getElementById("addReliefPackTemplateBtn");

    if (addTemplateBtn) {
        addTemplateBtn.style.display = canManageReliefTemplates() ? "" : "none";
    }

    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = "true";
        refreshBtn.addEventListener("click", async () => {
            await window.loadReliefSection();
        });
    }

    if (addTemplateBtn && !addTemplateBtn.dataset.bound) {
        addTemplateBtn.dataset.bound = "true";
        addTemplateBtn.addEventListener("click", async () => {
            if (!canManageReliefTemplates()) return;
            await openReliefPackTemplateModal();
        });
    }
}

function bindReliefSubtabs() {
    const tabs = document.querySelectorAll("[data-relief-subtab]");
    if (!tabs.length) return;

    tabs.forEach(tab => {
        if (tab.dataset.bound === "true") return;
        tab.dataset.bound = "true";

        tab.addEventListener("click", () => {
            tabs.forEach(btn => btn.classList.remove("active"));
            tab.classList.add("active");

            document.querySelectorAll(".relief-subsection").forEach(section => {
                section.classList.remove("active");
            });

            const target = document.getElementById(`relief-subtab-${tab.dataset.reliefSubtab}`);
            if (target) target.classList.add("active");
        });
    });
}

function renderReliefTable(items) {
    const container = document.getElementById("reliefTableContainer");

    if (!items || !items.length) {
        container.innerHTML = `<div class="empty-state">No relief goods found.</div>`;
        reliefInventoryPagination = null;
        return;
    }

    container.innerHTML = `
        <div class="table-scroll-x">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Category</th>
                        <th>Available</th>
                        <th>Total</th>
                        <th>Unit</th>
                        <th>Estimated Unit Cost</th>
                        <th>Status</th>
                        <th>Location</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="reliefInventoryTableBody"></tbody>
            </table>
        </div>

        <div class="app-pagination-bar" id="reliefInventoryPaginationBar">
            <div class="app-pagination-left">
                <div class="app-pagination-info" id="reliefInventoryPaginationInfo">
                    Showing 0 to 0 of 0 relief items
                </div>

                <div class="app-page-size-wrap">
                    <label for="reliefInventoryPageSize">Rows per page</label>
                    <select id="reliefInventoryPageSize">
                        <option value="5" selected>5</option>
                        <option value="10">10</option>
                        <option value="15">15</option>
                    </select>
                </div>
            </div>

            <div class="app-pagination-controls" id="reliefInventoryPaginationControls"></div>
        </div>
    `;

    const renderRows = (pageRows) => {
        const body = document.getElementById("reliefInventoryTableBody");
        if (!body) return;

        body.innerHTML = pageRows.map(item => `
            <tr>
                <td>${escapeHtml(item.name)}</td>
                <td>${escapeHtml(item.category || "-")}</td>
                <td>${formatNumber(item.availableQuantity)}</td>
                <td>${formatNumber(item.totalQuantity)}</td>
                <td>${escapeHtml(item.unit || "-")}</td>
                <td>${renderMoneyOrNoCost(item.estimatedUnitCost)}</td>
                <td><span class="status-badge ${stockBadgeClass(item.stockStatus)}">${escapeHtml(item.stockStatus || "-")}</span></td>
                <td>${escapeHtml(item.location || "-")}</td>
                <td>
                    <div class="card-actions">
                        <button class="btn btn-sm btn-primary" data-distribute-id="${item.id}">Distribute</button>
                    </div>
                </td>
            </tr>
        `).join("");

        body.querySelectorAll("[data-distribute-id]").forEach(btn => {
            btn.addEventListener("click", () => {
                const item = items.find(row => String(row.id) === btn.dataset.distributeId);
                if (item) openReliefDistributionModal(item);
            });
        });
    };

    if (!reliefInventoryPagination) {
        reliefInventoryPagination = createPaginationController({
            initialPage: 1,
            initialPageSize: 5,
            rows: items,
            infoId: "reliefInventoryPaginationInfo",
            controlsId: "reliefInventoryPaginationControls",
            pageSizeSelectId: "reliefInventoryPageSize",
            itemLabel: "relief items",
            onRenderRows: renderRows
        });
    }

    reliefInventoryPagination.setRows(items);
}

async function renderReliefPackReadiness(templates) {
    const container = document.getElementById("reliefPackReadinessContainer");

    if (!templates || !templates.length) {
        container.innerHTML = `<div class="empty-state">No active relief pack templates found.</div>`;
        return;
    }

    try {
        const readinessList = await Promise.all(
            templates.map(template => apiGet(`/relief-pack-templates/${template.id}/readiness`))
        );

        container.innerHTML = `
            <div class="relief-pack-grid">
                ${readinessList.map(readiness => `
                    <article class="relief-pack-card">
                        <div class="relief-pack-card-head">
                            <div>
                                <h3>${escapeHtml(readiness.templateName)}</h3>
                                <p>${escapeHtml(readiness.packType)} • ${escapeHtml(readiness.intendedUse)}</p>
                            </div>
                            <span class="status-badge ${readiness.maxProduciblePacks > 0 ? "available" : "out"}">
                                ${readiness.maxProduciblePacks > 0 ? "Ready" : "Blocked"}
                            </span>
                        </div>

                        <div class="metric-row relief-pack-metrics">
                            <div class="metric-card">
                                <div class="metric-label">Max Producible Packs</div>
                                <div class="metric-value">${formatNumber(readiness.maxProduciblePacks)}</div>
                            </div>
                            <div class="metric-card">
                                <div class="metric-label">Estimated Pack Cost</div>
                                <div class="metric-value">${renderPackCost(readiness)}</div>
                            </div>
                        </div>

                        <div class="relief-pack-limiting">
                            <strong>Stock Bottleneck:</strong>
                            <span>${escapeHtml(readiness.limitingItemName || "N/A")}</span>
                        </div>

                        <div class="relief-pack-components">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>Component</th>
                                        <th>Required / Pack</th>
                                        <th>Available</th>
                                        <th>Packs Possible</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${(readiness.items || []).map(item => `
                                        <tr class="${item.limitingItem ? "relief-pack-limiting-row" : ""}">
                                            <td>${escapeHtml(item.inventoryName)}</td>
                                            <td>${formatNumber(item.quantityRequiredPerPack)}</td>
                                            <td>${formatNumber(item.availableQuantity)}</td>
                                            <td>${formatNumber(item.produciblePacksFromThisItem)}</td>
                                        </tr>
                                    `).join("")}
                                </tbody>
                            </table>
                        </div>

                        <div class="card-actions relief-pack-actions">
                            <button class="btn btn-primary btn-sm" data-distribute-pack-id="${readiness.templateId}" ${readiness.maxProduciblePacks <= 0 ? "disabled" : ""}>
                                <i class="fas fa-box-open"></i>
                                Distribute Pack
                            </button>

                            ${canManageReliefTemplates() ? `
                                <button class="btn btn-secondary btn-sm" data-edit-pack-id="${readiness.templateId}">
                                    <i class="fas fa-pen"></i>
                                    Edit
                                </button>

                                <button class="btn btn-secondary btn-sm" data-delete-pack-id="${readiness.templateId}">
                                    <i class="fas fa-trash"></i>
                                    Delete
                                </button>
                            ` : ""}
                        </div>
                    </article>
                `).join("")}
            </div>
        `;

        container.querySelectorAll("[data-distribute-pack-id]").forEach(btn => {
            btn.addEventListener("click", () => {
                const readiness = readinessList.find(row => String(row.templateId) === btn.dataset.distributePackId);
                if (readiness) openReliefPackDistributionModal(readiness);
            });
        });

        container.querySelectorAll("[data-edit-pack-id]").forEach(btn => {
            btn.addEventListener("click", async () => {
                const templateId = Number(btn.dataset.editPackId);
                await openEditReliefPackTemplateModal(templateId);
            });
        });

        container.querySelectorAll("[data-delete-pack-id]").forEach(btn => {
            btn.addEventListener("click", async () => {
                const templateId = Number(btn.dataset.deletePackId);
                const readiness = readinessList.find(row => Number(row.templateId) === templateId);
                openDeleteReliefPackTemplateModal(templateId, readiness?.templateName || "Relief Pack Template");
            });
        });
    } catch (error) {
        console.error("Failed to render relief pack readiness", error);
        container.innerHTML = `<div class="error-state">Failed to load relief pack readiness.</div>`;
    }
}

function renderMoneyOrNoCost(value) {
    if (value == null || Number(value) <= 0) return "No cost data";
    return formatPeso(value);
}

function renderPackCost(readiness) {
    const packCost = Number(
        readiness.estimatePackCost ??
        readiness.estimatedPackCost ??
        0
    );

    if (readiness.hasCompleteCostData === false || packCost <= 0) {
        return "No cost data";
    }

    return formatPeso(packCost);
}

async function openReliefPackTemplateModal(existingTemplate = null) {
    if (!canManageReliefTemplates()) return;

    const inventoryRows = await apiGet(`/inventory/resources-view`);

    const reliefInventory = (inventoryRows || []).filter(item => {
        const normalized = String(item.category || "").toUpperCase();
        return ["FOOD", "RELIEF", "WATER", "HYGIENE", "MEDICAL"].includes(normalized);
    });

    const isEdit = !!existingTemplate;

    openResourcesModal({
        title: isEdit ? "Edit Relief Pack Template" : "Add Relief Pack Template",
        bodyHtml: `
            <form id="reliefPackTemplateForm" class="form-grid">
                <div class="form-group">
                    <label>Template Name</label>
                    <input type="text" name="name" placeholder="Food Pack - Plastic" value="${escapeHtml(existingTemplate?.name || "")}" required>
                </div>

                <div class="form-group">
                    <label>Pack Type</label>
                    <select name="packType" required>
                        <option value="PLASTIC" ${existingTemplate?.packType === "PLASTIC" ? "selected" : ""}>PLASTIC</option>
                        <option value="BOX" ${existingTemplate?.packType === "BOX" ? "selected" : ""}>BOX</option>
                        <option value="CUSTOM" ${existingTemplate?.packType === "CUSTOM" ? "selected" : ""}>CUSTOM</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>Intended Use</label>
                    <select name="intendedUse" required>
                        <option value="FAMILY" ${existingTemplate?.intendedUse === "FAMILY" ? "selected" : ""}>FAMILY</option>
                        <option value="EVACUEE" ${existingTemplate?.intendedUse === "EVACUEE" ? "selected" : ""}>EVACUEE</option>
                        <option value="FIRE_VICTIM" ${existingTemplate?.intendedUse === "FIRE_VICTIM" ? "selected" : ""}>FIRE_VICTIM</option>
                        <option value="GENERAL_RELIEF" ${existingTemplate?.intendedUse === "GENERAL_RELIEF" ? "selected" : ""}>GENERAL_RELIEF</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>Status</label>
                    <select name="active">
                        <option value="true" ${existingTemplate?.active !== false ? "selected" : ""}>ACTIVE</option>
                        <option value="false" ${existingTemplate?.active === false ? "selected" : ""}>INACTIVE</option>
                    </select>
                </div>

                <div class="form-group full">
                    <div class="template-items-head">
                        <label>Pack Components</label>
                        <button type="button" class="btn btn-secondary btn-sm" id="addPackItemRowBtn">
                            <i class="fas fa-plus"></i>
                            Add Item
                        </button>
                    </div>
                    <div id="reliefPackItemsContainer"></div>
                </div>
            </form>
        `,
        footerHtml: `
            <button class="btn btn-secondary" id="cancelReliefPackTemplateBtn">Cancel</button>
            <button class="btn btn-primary" id="submitReliefPackTemplateBtn">${isEdit ? "Save Changes" : "Create Template"}</button>
        `
    });

    const container = document.getElementById("reliefPackItemsContainer");

    const createRow = (selectedItem = null) => {
        const rowId = `pack-item-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

        const row = document.createElement("div");
        row.className = "pack-item-row";

        const initialLabel = selectedItem
            ? `${selectedItem.inventoryName} • ${selectedItem.unit || "-"} • Available ${selectedItem.availableQuantity ?? "-"}`
            : "";

        row.innerHTML = `
            <div class="pack-item-row-grid">
                <div class="form-group searchable-group">
                    <label>Inventory Item</label>
                    <input type="text" id="${rowId}-input" autocomplete="off" placeholder="Search relief inventory item" value="${escapeHtml(initialLabel)}">
                    <input type="hidden" class="pack-item-inventory-id" value="${selectedItem?.inventoryId || ""}">
                    <div class="searchable-dropdown" id="${rowId}-dropdown"></div>
                </div>

                <div class="form-group">
                    <label>Quantity Required</label>
                    <input type="number" class="pack-item-qty" min="1" value="${selectedItem?.quantityRequired || 1}">
                </div>

                <div class="form-group pack-item-remove-group">
                    <label>&nbsp;</label>
                    <button type="button" class="btn btn-secondary pack-item-remove-btn">Remove</button>
                </div>
            </div>
        `;

        container.appendChild(row);

        bindSearchableDropdown({
            inputId: `${rowId}-input`,
            dropdownId: `${rowId}-dropdown`,
            options: reliefInventory.map(item => ({
                label: `${item.name} • ${item.unit || "-"} • Available ${item.availableQuantity}`,
                value: item.id
            })),
            getLabel: option => option.label,
            getValue: option => option.value,
            onSelect: selected => {
                row.querySelector(".pack-item-inventory-id").value = selected.value;
            }
        });

        row.querySelector(".pack-item-remove-btn")?.addEventListener("click", () => {
            row.remove();
        });
    };

    if (isEdit && existingTemplate.items?.length) {
        existingTemplate.items.forEach(item => createRow(item));
    } else {
        createRow();
    }

    document.getElementById("addPackItemRowBtn")?.addEventListener("click", () => createRow());
    document.getElementById("cancelReliefPackTemplateBtn")?.addEventListener("click", closeResourcesModal);

    document.getElementById("submitReliefPackTemplateBtn")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const originalText = button.textContent;

        const form = document.getElementById("reliefPackTemplateForm");
        const formData = new FormData(form);

        const itemRows = Array.from(document.querySelectorAll(".pack-item-row"));
        const items = itemRows.map(row => {
            const inventoryId = row.querySelector(".pack-item-inventory-id")?.value?.trim();
            const quantityRequired = row.querySelector(".pack-item-qty")?.value;

            return {
                inventoryId: inventoryId ? Number(inventoryId) : null,
                quantityRequired: Number(quantityRequired || 0)
            };
        }).filter(item => item.inventoryId && item.quantityRequired > 0);

        if (!items.length) {
            showToast("Please add at least one valid pack component.", "error");
            return;
        }

        const payload = {
            name: formData.get("name")?.toString().trim(),
            packType: formData.get("packType")?.toString().trim(),
            intendedUse: formData.get("intendedUse")?.toString().trim(),
            active: formData.get("active") === "true",
            items
        };

        try {
            button.disabled = true;
            button.textContent = isEdit ? "Saving..." : "Creating...";

            if (isEdit) {
                await apiSend(`/relief-pack-templates/${existingTemplate.id}`, "PUT", payload);
                showToast("Relief pack template updated successfully.", "success");
            } else {
                await apiSend(`/relief-pack-templates`, "POST", payload);
                showToast("Relief pack template created successfully.", "success");
            }

            closeResourcesModal();
            await window.loadReliefSection();
        } catch (error) {
            console.error("Failed to save relief pack template", error);
            showToast(isEdit ? "Failed to update relief pack template." : "Failed to create relief pack template.", "error");
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    });
}

async function openEditReliefPackTemplateModal(templateId) {
    if (!canManageReliefTemplates()) return;

    try {
        const templates = await apiGet(`/relief-pack-templates`);
        const template = (templates || []).find(item => Number(item.id) === Number(templateId));

        if (!template) {
            showToast("Template not found.", "error");
            return;
        }

        await openReliefPackTemplateModal(template);
    } catch (error) {
        console.error("Failed to load template for edit", error);
        showToast("Failed to load relief pack template.", "error");
    }
}

function openDeleteReliefPackTemplateModal(templateId, templateName) {
    if (!canManageReliefTemplates()) return;

    openResourcesModal({
        title: "Delete Relief Pack Template",
        bodyHtml: `
            <div class="delete-confirmation-content">
                <p>Are you sure you want to delete this relief pack template?</p>
                <div class="metric-card" style="margin-top: 12px;">
                    <div class="metric-label">Template</div>
                    <div class="metric-value">${escapeHtml(templateName || "Unknown Template")}</div>
                </div>
            </div>
        `,
        footerHtml: `
            <button class="btn btn-secondary" id="cancelDeleteReliefPackBtn">Cancel</button>
            <button class="btn btn-primary" id="confirmDeleteReliefPackBtn">Delete</button>
        `
    });

    document.getElementById("cancelDeleteReliefPackBtn")?.addEventListener("click", closeResourcesModal);

    document.getElementById("confirmDeleteReliefPackBtn")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const originalText = button.textContent;

        try {
            button.disabled = true;
            button.textContent = "Deleting...";

            await apiSend(`/relief-pack-templates/${templateId}`, "DELETE");

            closeResourcesModal();
            showToast("Relief pack template deleted successfully.", "success");
            await window.loadReliefSection();
        } catch (error) {
            console.error("Failed to delete relief pack template", error);
            showToast("Failed to delete relief pack template.", "error");
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    });
}

async function openReliefPackDistributionModal(readiness) {
    const operations = await loadReliefOperationOptions();
    const centers = await loadEvacuationActivationOptions();
    const isElevated = hasAnyRole("MANAGER", "ADMIN");
    const submitLabel = isElevated ? "Distribute Pack" : "Request Pack Distribution";

    openResourcesModal({
        title: `Distribute Pack - ${escapeHtml(readiness.templateName)}`,
        bodyHtml: `
            <form id="reliefPackDistributionForm" class="form-grid">
                <div class="form-group">
                    <label>Template</label>
                    <input type="text" value="${escapeHtml(readiness.templateName)}" disabled>
                </div>

                <div class="form-group">
                    <label>Max Producible Packs</label>
                    <input type="text" value="${formatNumber(readiness.maxProduciblePacks)}" disabled>
                </div>

                <div class="form-group searchable-group full">
                    <label>Operation</label>
                    <input type="text" id="reliefPackOperationInput" autocomplete="off" placeholder="Search incident or calamity" required>
                    <input type="hidden" id="reliefPackOperationTypeInput">
                    <input type="hidden" id="reliefPackOperationIdInput">
                    <div class="searchable-dropdown" id="reliefPackOperationDropdown"></div>
                </div>

                <div class="form-group">
                    <label>Pack Count</label>
                    <input type="number" name="packCount" min="1" max="${Number(readiness.maxProduciblePacks || 0)}" required>
                </div>

                <div class="form-group searchable-group full">
                    <label>Evacuation Center (Optional)</label>
                    <input type="text" id="reliefPackCenterInput" autocomplete="off" placeholder="Search evacuation center">
                    <input type="hidden" id="reliefPackCenterIdInput">
                    <div class="searchable-dropdown" id="reliefPackCenterDropdown"></div>
                </div>

                ${
                    !isElevated
                        ? `
                    <div class="form-group full">
                        <div class="info-pill">
                            <i class="fas fa-clipboard-check"></i>
                            This pack distribution may require manager/admin approval before execution.
                        </div>
                    </div>
                `
                        : ""
                }
            </form>
        `,
        footerHtml: `
            <button class="btn btn-secondary" id="cancelReliefPackDistributionBtn">Cancel</button>
            <button class="btn btn-primary" id="submitReliefPackDistributionBtn">${submitLabel}</button>
        `
    });

    bindSearchableDropdown({
        inputId: "reliefPackOperationInput",
        dropdownId: "reliefPackOperationDropdown",
        options: operations,
        getLabel: option => option.label,
        getValue: option => option.value,
        onSelect: selected => {
            const typeNode = document.getElementById("reliefPackOperationTypeInput");
            const idNode = document.getElementById("reliefPackOperationIdInput");
            if (typeNode) typeNode.value = selected.meta?.type || "";
            if (idNode) idNode.value = selected.meta?.id || "";
        }
    });

    bindSearchableDropdown({
        inputId: "reliefPackCenterInput",
        dropdownId: "reliefPackCenterDropdown",
        hiddenInputId: "reliefPackCenterIdInput",
        options: centers,
        getLabel: option => option.label,
        getValue: option => option.value
    });

    document.getElementById("cancelReliefPackDistributionBtn")?.addEventListener("click", closeResourcesModal);

    document.getElementById("submitReliefPackDistributionBtn")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const originalText = button.textContent;

        const form = document.getElementById("reliefPackDistributionForm");
        const formData = new FormData(form);

        const operationType = document.getElementById("reliefPackOperationTypeInput")?.value?.trim();
        const operationIdRaw = document.getElementById("reliefPackOperationIdInput")?.value?.trim();
        const centerIdRaw = document.getElementById("reliefPackCenterIdInput")?.value?.trim();

        if (!operationType || !operationIdRaw) {
            showToast("Please select an incident or calamity.", "error");
            return;
        }

        const packCount = Number(formData.get("packCount") || 0);
        if (packCount <= 0) {
            showToast("Pack count must be greater than 0.", "error");
            return;
        }

        if (Number(readiness.maxProduciblePacks || 0) > 0 && packCount > Number(readiness.maxProduciblePacks)) {
            showToast("Pack count exceeds max producible packs.", "error");
            return;
        }

        const payload = {
            packCount,
            evacuationActivationId: centerIdRaw ? Number(centerIdRaw) : null
        };

        const endpoint =
            operationType === "INCIDENT"
                ? `/relief-pack-templates/${readiness.templateId}/distribute/incidents/${Number(operationIdRaw)}`
                : `/relief-pack-templates/${readiness.templateId}/distribute/calamities/${Number(operationIdRaw)}`;

        try {
            button.disabled = true;
            button.textContent = isElevated ? "Distributing..." : "Submitting...";

            await apiSend(endpoint, "POST", payload);

            closeResourcesModal();
            showToast(
                isElevated
                    ? "Relief pack distributed successfully."
                    : "Relief pack distribution completed successfully.",
                "success"
            );

            await refreshResourcesHeader();
            if (window.loadReliefSection) await window.loadReliefSection();
            await window.loadInventorySection();
        } catch (error) {
            const parsed = await parseResourceError(error);

            if (isApprovalSubmittedMessage(parsed.message)) {
                closeResourcesModal();
                showToast(parsed.message || "Relief pack distribution request submitted for approval.", "info");
                await refreshGlobalAdminBadgesIfAvailable();
                return;
            }

            console.error("Failed to distribute relief pack", error);
            showToast(parsed.message || "Failed to distribute relief pack.", "error");
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    });
}

function bindReliefPackOperationToggle() {
    const operationType = document.getElementById("reliefPackOperationType");
    const incidentGroup = document.getElementById("reliefPackIncidentGroup");
    const calamityGroup = document.getElementById("reliefPackCalamityGroup");
    const evacuationGroup = document.getElementById("reliefPackEvacuationGroup");

    const incidentInput = document.getElementById("reliefPackIncidentInput");
    const incidentHidden = document.getElementById("reliefPackIncidentIdInput");
    const calamityInput = document.getElementById("reliefPackCalamityInput");
    const calamityHidden = document.getElementById("reliefPackCalamityIdInput");

    if (!operationType) return;

    const refresh = () => {
        const mode = operationType.value;

        clearReliefPackEvacuationSelection();

        if (mode === "INCIDENT") {
            incidentGroup?.classList.remove("hidden");
            calamityGroup?.classList.add("hidden");
            evacuationGroup?.classList.add("hidden");

            if (calamityInput) calamityInput.value = "";
            if (calamityHidden) calamityHidden.value = "";
        } else {
            calamityGroup?.classList.remove("hidden");
            incidentGroup?.classList.add("hidden");
            evacuationGroup?.classList.add("hidden");

            if (incidentInput) incidentInput.value = "";
            if (incidentHidden) incidentHidden.value = "";
        }
    };

    operationType.addEventListener("change", refresh);
    refresh();
}

async function handleReliefPackOperationSelection(operationType, selected) {
    if (!selected) return;

    clearReliefPackEvacuationSelection();

    if (operationType === "INCIDENT") {
        const needsEvacuation = incidentNeedsEvacuation(selected);
        if (!needsEvacuation) {
            document.getElementById("reliefPackEvacuationGroup")?.classList.add("hidden");
            return;
        }

        const options = await loadIncidentEvacuationOptions(selected.value);
        bindReliefPackEvacuationDropdown(options);
        document.getElementById("reliefPackEvacuationGroup")?.classList.remove("hidden");
    }

    if (operationType === "CALAMITY") {
        const options = await loadCalamityEvacuationOptions(selected.value);
        bindReliefPackEvacuationDropdown(options);

        if (options.length) {
            document.getElementById("reliefPackEvacuationGroup")?.classList.remove("hidden");
        } else {
            document.getElementById("reliefPackEvacuationGroup")?.classList.add("hidden");
        }
    }
}

function clearReliefPackEvacuationSelection() {
    const group = document.getElementById("reliefPackEvacuationGroup");
    const input = document.getElementById("reliefPackEvacuationInput");
    const hidden = document.getElementById("reliefPackEvacuationIdInput");
    const dropdown = document.getElementById("reliefPackEvacuationDropdown");

    if (group) group.classList.add("hidden");
    if (input) input.value = "";
    if (hidden) hidden.value = "";
    if (dropdown) dropdown.innerHTML = "";
}

function bindReliefPackEvacuationDropdown(options) {
    bindSearchableDropdown({
        inputId: "reliefPackEvacuationInput",
        dropdownId: "reliefPackEvacuationDropdown",
        hiddenInputId: "reliefPackEvacuationIdInput",
        options,
        getLabel: option => option.label,
        getValue: option => option.value
    });
}

/* ---------- Existing direct relief distribution ---------- */

async function openReliefDistributionModal(item) {
    const operations = await loadReliefOperationOptions();
    const centers = await loadEvacuationActivationOptions();
    const isElevated = hasAnyRole("MANAGER", "ADMIN");
    const submitLabel = isElevated ? "Distribute Item" : "Request Distribution";

    openResourcesModal({
        title: `Distribute Relief - ${escapeHtml(item.name)}`,
        bodyHtml: `
            <form id="reliefDistributionForm" class="form-grid">
                <div class="form-group">
                    <label>Inventory Item</label>
                    <input type="text" value="${escapeHtml(item.name)}" disabled>
                </div>

                <div class="form-group">
                    <label>Available Quantity</label>
                    <input type="text" value="${formatNumber(item.availableQuantity)} ${escapeHtml(item.unit || "")}" disabled>
                </div>

                <div class="form-group searchable-group full">
                    <label>Operation</label>
                    <input type="text" id="reliefOperationInput" autocomplete="off" placeholder="Search incident or calamity" required>
                    <input type="hidden" id="reliefOperationTypeInput">
                    <input type="hidden" id="reliefOperationIdInput">
                    <div class="searchable-dropdown" id="reliefOperationDropdown"></div>
                </div>

                <div class="form-group">
                    <label>Quantity</label>
                    <input type="number" name="quantity" min="1" required>
                </div>

                <div class="form-group searchable-group full">
                    <label>Evacuation Center (Optional)</label>
                    <input type="text" id="reliefCenterInput" autocomplete="off" placeholder="Search evacuation center">
                    <input type="hidden" id="reliefCenterIdInput">
                    <div class="searchable-dropdown" id="reliefCenterDropdown"></div>
                </div>

                ${
                    !isElevated
                        ? `
                    <div class="form-group full">
                        <div class="info-pill">
                            <i class="fas fa-clipboard-check"></i>
                            This distribution may require manager/admin approval before execution.
                        </div>
                    </div>
                `
                        : ""
                }
            </form>
        `,
        footerHtml: `
            <button class="btn btn-secondary" id="cancelReliefDistributionBtn">Cancel</button>
            <button class="btn btn-primary" id="submitReliefDistributionBtn">${submitLabel}</button>
        `
    });

    bindSearchableDropdown({
        inputId: "reliefOperationInput",
        dropdownId: "reliefOperationDropdown",
        options: operations,
        getLabel: option => option.label,
        getValue: option => option.value,
        onSelect: selected => {
            const typeNode = document.getElementById("reliefOperationTypeInput");
            const idNode = document.getElementById("reliefOperationIdInput");
            if (typeNode) typeNode.value = selected.meta?.type || "";
            if (idNode) idNode.value = selected.meta?.id || "";
        }
    });

    bindSearchableDropdown({
        inputId: "reliefCenterInput",
        dropdownId: "reliefCenterDropdown",
        hiddenInputId: "reliefCenterIdInput",
        options: centers,
        getLabel: option => option.label,
        getValue: option => option.value
    });

    document.getElementById("cancelReliefDistributionBtn")?.addEventListener("click", closeResourcesModal);

    document.getElementById("submitReliefDistributionBtn")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const originalText = button.textContent;

        const form = document.getElementById("reliefDistributionForm");
        const formData = new FormData(form);

        const operationType = document.getElementById("reliefOperationTypeInput")?.value?.trim();
        const operationIdRaw = document.getElementById("reliefOperationIdInput")?.value?.trim();
        const centerIdRaw = document.getElementById("reliefCenterIdInput")?.value?.trim();

        if (!operationType || !operationIdRaw) {
            showToast("Please select an incident or calamity.", "error");
            return;
        }

        const quantity = Number(formData.get("quantity") || 0);
        if (quantity <= 0) {
            showToast("Quantity must be greater than 0.", "error");
            return;
        }

        const payload = {
            inventoryId: Number(item.id),
            quantity,
            evacuationActivationId: centerIdRaw ? Number(centerIdRaw) : null
        };

        const endpoint =
            operationType === "INCIDENT"
                ? `/incidents/${Number(operationIdRaw)}/relief`
                : `/calamities/${Number(operationIdRaw)}/relief`;

        try {
            button.disabled = true;
            button.textContent = isElevated ? "Distributing..." : "Submitting...";

            await apiSend(endpoint, "POST", payload);

            closeResourcesModal();
            showToast(
                isElevated
                    ? "Relief distributed successfully."
                    : "Relief distribution completed successfully.",
                "success"
            );

            await refreshResourcesHeader();
            if (window.loadReliefSection) await window.loadReliefSection();
            await window.loadInventorySection();
        } catch (error) {
            const parsed = await parseResourceError(error);

            if (isApprovalSubmittedMessage(parsed.message)) {
                closeResourcesModal();
                showToast(parsed.message || "Relief distribution request submitted for approval.", "info");
                await refreshGlobalAdminBadgesIfAvailable();
                return;
            }

            console.error("Failed to distribute relief", error);
            showToast(parsed.message || "Failed to distribute relief.", "error");
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    });
}

function bindReliefOperationToggle() {
    const operationType = document.getElementById("reliefOperationType");
    const incidentGroup = document.getElementById("reliefIncidentGroup");
    const calamityGroup = document.getElementById("reliefCalamityGroup");
    const evacuationGroup = document.getElementById("reliefEvacuationGroup");

    const incidentInput = document.getElementById("reliefIncidentInput");
    const incidentHidden = document.getElementById("reliefIncidentIdInput");
    const calamityInput = document.getElementById("reliefCalamityInput");
    const calamityHidden = document.getElementById("reliefCalamityIdInput");

    if (!operationType) return;

    const refresh = () => {
        const mode = operationType.value;

        clearReliefEvacuationSelection();

        if (mode === "INCIDENT") {
            incidentGroup?.classList.remove("hidden");
            calamityGroup?.classList.add("hidden");
            evacuationGroup?.classList.add("hidden");

            if (calamityInput) calamityInput.value = "";
            if (calamityHidden) calamityHidden.value = "";
        } else {
            calamityGroup?.classList.remove("hidden");
            incidentGroup?.classList.add("hidden");
            evacuationGroup?.classList.add("hidden");

            if (incidentInput) incidentInput.value = "";
            if (incidentHidden) incidentHidden.value = "";
        }
    };

    operationType.addEventListener("change", refresh);
    refresh();
}

async function handleReliefOperationSelection(operationType, selected) {
    if (!selected) return;

    clearReliefEvacuationSelection();

    if (operationType === "INCIDENT") {
        const needsEvacuation = incidentNeedsEvacuation(selected);
        if (!needsEvacuation) {
            document.getElementById("reliefEvacuationGroup")?.classList.add("hidden");
            return;
        }

        const options = await loadIncidentEvacuationOptions(selected.value);
        bindReliefEvacuationDropdown(options);
        document.getElementById("reliefEvacuationGroup")?.classList.remove("hidden");
    }

    if (operationType === "CALAMITY") {
        const options = await loadCalamityEvacuationOptions(selected.value);
        bindReliefEvacuationDropdown(options);

        if (options.length) {
            document.getElementById("reliefEvacuationGroup")?.classList.remove("hidden");
        } else {
            document.getElementById("reliefEvacuationGroup")?.classList.add("hidden");
        }
    }
}

function incidentNeedsEvacuation(selected) {
    const type = String(selected.type || "").toUpperCase();
    const severity = String(selected.severity || "").toUpperCase();

    if (severity === "HIGH") return true;

    return [
        "FIRE INCIDENT",
        "STRUCTURAL COLLAPSE",
        "FLOOD",
        "LANDSLIDE",
        "HAZARDOUS",
        "HAZMAT",
        "EXPLOSION"
    ].some(keyword => type.includes(keyword));
}

function clearReliefEvacuationSelection() {
    const group = document.getElementById("reliefEvacuationGroup");
    const input = document.getElementById("reliefEvacuationInput");
    const hidden = document.getElementById("reliefEvacuationIdInput");
    const dropdown = document.getElementById("reliefEvacuationDropdown");

    if (group) group.classList.add("hidden");
    if (input) input.value = "";
    if (hidden) hidden.value = "";
    if (dropdown) dropdown.innerHTML = "";
}

function bindReliefEvacuationDropdown(options) {
    bindSearchableDropdown({
        inputId: "reliefEvacuationInput",
        dropdownId: "reliefEvacuationDropdown",
        hiddenInputId: "reliefEvacuationIdInput",
        options,
        getLabel: option => option.label,
        getValue: option => option.value
    });
}

async function loadIncidentEvacuationOptions(incidentId) {
    try {
        const rows = await apiGet(`/incidents/${incidentId}/evacuations`);
        return (rows || [])
            .filter(item => String(item.status || "").toUpperCase() === "OPEN")
            .map(item => ({
                label: item.centerName || "Unknown Center",
                value: item.id
            }));
    } catch (error) {
        console.error("Failed to load incident evacuation centers", error);
        return [];
    }
}

async function loadCalamityEvacuationOptions(calamityId) {
    try {
        const rows = await apiGet(`/calamities/${calamityId}/evacuations`);
        return (rows || [])
            .filter(item => String(item.status || "").toUpperCase() === "OPEN")
            .map(item => ({
                label: item.centerName || "Unknown Center",
                value: item.id
            }));
    } catch (error) {
        console.error("Failed to load calamity evacuation centers", error);
        return [];
    }
}

function bindReliefDistributionValuePreview(item) {
    const form = document.getElementById("reliefDistributionForm");
    if (!form) return;

    const quantityInput = form.querySelector('[name="quantity"]');
    const output = document.getElementById("reliefDistributionValue");

    const recalc = () => {
        const quantity = Number(quantityInput?.value || 0);
        const unitCost = Number(item.estimatedUnitCost || 0);

        if (quantity > 0 && unitCost > 0) {
            output.textContent = formatPeso(quantity * unitCost);
        } else {
            output.textContent = "No cost data";
        }
    };

    quantityInput?.addEventListener("input", recalc);
    recalc();
}

function bindReliefPackDistributionValuePreview(readiness) {
    const form = document.getElementById("reliefPackDistributionForm");
    if (!form) return;

    const packCountInput = form.querySelector('[name="packCount"]');
    const output = document.getElementById("reliefPackDistributionValue");

    const recalc = () => {
        const packCount = Number(packCountInput?.value || 0);
        const packCost = Number(
            readiness.estimatePackCost ??
            readiness.estimatedPackCost ??
            0
        );

        if (packCount > 0 && packCost > 0) {
            output.textContent = formatPeso(packCount * packCost);
        } else if (packCost > 0) {
            output.textContent = formatPeso(packCost);
        } else {
            output.textContent = "No cost data";
        }
    };

    packCountInput?.addEventListener("input", recalc);
    recalc();
}