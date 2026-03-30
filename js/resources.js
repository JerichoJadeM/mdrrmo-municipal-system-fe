const API_BASE = "http://localhost:8080/api";
const USERS_LOOKUP_PATH = "/users";
const INCIDENTS_LOOKUP_PATH = "/incidents";
const CALAMITIES_LOOKUP_PATH = "/calamities";

const resourcesState = {
    activeTab: "inventory",
    summary: null,
    readiness: null,
    barangayOptions: null,
    userOptions: null,
    incidentOptions: null,
    calamityOptions: null,
    budgets: [],
    selectedBudgetId: null
};

window.parseResourceError = parseResourceError;
window.isApprovalSubmittedMessage = isApprovalSubmittedMessage;
window.refreshGlobalAdminBadgesIfAvailable = refreshGlobalAdminBadgesIfAvailable;
window.loadReliefOperationOptions = loadReliefOperationOptions;
window.loadEvacuationActivationOptions = loadEvacuationActivationOptions;
window.renderDismissibleReadinessWarnings = renderDismissibleReadinessWarnings;

document.addEventListener("DOMContentLoaded", async () => {
    bindResourcesTabs();
    bindResourcesGlobalActions();
    bindResourceSearchInputs();
    bindResourceCategoryFilters();
    bindResourcesSummaryShortcuts?.();
    applyResourcesRBAC();
    ensureToastContainer();

    await loadResourcesPage();
});

function bindResourcesSummaryShortcuts() {
    const reliefSummaryValue = document.getElementById("summaryReliefReadyCount");
    const reliefSummaryCard = reliefSummaryValue?.closest(".summary-card");

    if (reliefSummaryCard && !reliefSummaryCard.dataset.bound) {
        reliefSummaryCard.dataset.bound = "true";
        reliefSummaryCard.style.cursor = "pointer";

        reliefSummaryCard.addEventListener("click", async () => {
            resourcesState.activeTab = "relief";

            document.querySelectorAll(".resources-tab").forEach(btn => {
                btn.classList.toggle("active", btn.dataset.tab === "relief");
            });

            document.querySelectorAll(".resources-section").forEach(section => {
                section.classList.toggle("active", section.id === "tab-relief");
            });

            await loadActiveResourcesTab();

            const packTab = document.querySelector('[data-relief-subtab="packs"]');
            packTab?.click();
        });
    }
}

async function loadResourcesPage() {
    await Promise.all([
        loadResourcesSummary(),
        loadReadinessSummary()
    ]);

    await loadActiveResourcesTab();
}

async function loadEvacuationActivationOptions() {
    const centers = await apiGet("/evacuation-centers").catch(() => []);

    return (Array.isArray(centers) ? centers : [])
        .map(center => ({
            label: `${center.name || "Unnamed Center"}${center.barangayName ? ` (${center.barangayName})` : ""}`,
            value: center.id
        }));
}

async function loadReliefOperationOptions() {
    const [incidents, calamities] = await Promise.all([
        apiGet("/incidents").catch(() => []),
        apiGet("/calamities").catch(() => [])
    ]);

    const incidentOptions = (Array.isArray(incidents) ? incidents : []).map(item => ({
        label: `Incident - ${item.type || "Unknown"}${item.barangayName ? ` (${item.barangayName})` : ""}`,
        value: `INCIDENT:${item.id}`,
        meta: {
            type: "INCIDENT",
            id: item.id
        }
    }));

    const calamityOptions = (Array.isArray(calamities) ? calamities : []).map(item => ({
        label: `Calamity - ${item.eventName || item.type || "Unknown"}${item.primaryBarangayName ? ` (${item.primaryBarangayName})` : ""}`,
        value: `CALAMITY:${item.id}`,
        meta: {
            type: "CALAMITY",
            id: item.id
        }
    }));

    return [...incidentOptions, ...calamityOptions];
}

function parseResourceError(error) {
    try {
        return JSON.parse(error.message);
    } catch {
        return {
            message: error.message || "Request failed."
        };
    }
}

function isApprovalSubmittedMessage(message) {
    return /submitted for approval/i.test(String(message || ""));
}

async function refreshGlobalAdminBadgesIfAvailable() {
    if (typeof window.refreshGlobalAdminBadges === "function") {
        try {
            await window.refreshGlobalAdminBadges();
        } catch (error) {
            console.warn("Failed to refresh navbar badges:", error);
        }
    }
}

function canManageReliefTemplates() {
    const roles = getUserRoles();
    return roles.includes("ROLE_ADMIN") || roles.includes("ROLE_MANAGER");
}

function bindResourcesTabs() {
    const tabs = document.querySelectorAll(".resources-tab");

    tabs.forEach(tab => {
        tab.addEventListener("click", async () => {
            const nextTab = tab.dataset.tab;
            if (!nextTab || nextTab === resourcesState.activeTab) return;

            resourcesState.activeTab = nextTab;

            document.querySelectorAll(".resources-tab").forEach(btn => {
                btn.classList.toggle("active", btn.dataset.tab === nextTab);
            });

            document.querySelectorAll(".resources-section").forEach(section => {
                section.classList.toggle("active", section.id === `tab-${nextTab}`);
            });

            await loadActiveResourcesTab();
        });
    });
}

function bindResourcesGlobalActions() {
    document.getElementById("refreshResourcesBtn")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const originalHtml = button.innerHTML;

        try {
            button.disabled = true;
            button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Refreshing`;
            await loadResourcesPage();
            showToast("Resources data refreshed.", "success");
        } catch (error) {
            console.error("Failed to refresh resources page", error);
            showToast("Failed to refresh resources data.", "error");
        } finally {
            button.disabled = false;
            button.innerHTML = originalHtml;
        }
    });

    document.getElementById("closeResourcesModalBtn")?.addEventListener("click", closeResourcesModal);
    document.getElementById("resourcesModalBackdrop")?.addEventListener("click", closeResourcesModal);

    document.getElementById("addInventoryBtn")?.addEventListener("click", () => {
        if (canOperateInventory() && window.openInventoryCreateModal) {
            window.openInventoryCreateModal();
        }
    });

    document.getElementById("addCenterBtn")?.addEventListener("click", () => {
        if (canManageCenters() && window.openEvacuationCenterCreateModal) {
            window.openEvacuationCenterCreateModal();
        }
    });

    document.getElementById("addBudgetBtn")?.addEventListener("click", () => {
        if (canManageBudgets() && window.openBudgetCreateModal) {
            window.openBudgetCreateModal();
        }
    });

    document.getElementById("allocateBudgetBtn")?.addEventListener("click", () => {
        if (canManageBudgets() && window.openBudgetAllocateModal) {
            window.openBudgetAllocateModal();
        }
    });
}

function bindResourceSearchInputs() {
    [
        "inventorySearchInput",
        "inventoryCategoryFilter",
        "inventoryStockFilter",
        "reliefSearchInput",
        "reliefCategoryFilter",
        "reliefStatusFilter",
        "centerSearchInput",
        "centerStatusFilter",
        "centerUsageFilter"
    ].forEach(id => {
        document.getElementById(id)?.addEventListener("input", debounce(loadActiveResourcesTab, 300));
        document.getElementById(id)?.addEventListener("change", debounce(loadActiveResourcesTab, 150));
    });
}

function getUserRoles() {
    try {
        const raw = localStorage.getItem("userAuthorities");
        const parsed = raw ? JSON.parse(raw) : [];
        return (parsed || []).map(role => String(role).toUpperCase());
    } catch {
        return [];
    }
}

function hasAnyRole(...roles) {
    const userRoles = getUserRoles();
    return roles.some(role => {
        const normalized = role.toUpperCase();
        return userRoles.includes(normalized) || userRoles.includes(`ROLE_${normalized}`);
    });
}

function canOperateInventory() {
    return hasAnyRole("USER", "MANAGER", "ADMIN");
}

function canManageInventoryMasterData() {
    return hasAnyRole("MANAGER", "ADMIN");
}

function canManageBudgets() {
    return hasAnyRole("MANAGER", "ADMIN");
}

function canManageCenters() {
    return hasAnyRole("MANAGER", "ADMIN");
}

function applyResourcesRBAC() {
    const addInventoryBtn = document.getElementById("addInventoryBtn");
    if (addInventoryBtn) {
        addInventoryBtn.classList.toggle("hidden", !canOperateInventory());
    }

    const addCenterBtn = document.getElementById("addCenterBtn");
    if (addCenterBtn) {
        addCenterBtn.classList.toggle("hidden", !canManageCenters());
    }

    const budgetToolbar = document.getElementById("budgetToolbar");
    const budgetHistoryPanel = document.getElementById("budgetHistoryPanel");

    if (budgetToolbar) {
        budgetToolbar.classList.toggle("hidden", !canManageBudgets());
    }

    if (budgetHistoryPanel) {
        budgetHistoryPanel.classList.toggle("hidden", !canManageBudgets());
    }
}

async function loadResourcesSummary() {
    try {
        const summary = await apiGet("/resources/summary");
        resourcesState.summary = summary;
        renderResourcesSummary(summary);
    } catch (error) {
        console.error("Failed to load resources summary", error);
    }
}

function renderResourcesSummary(summary) {
    setText("summaryInventoryCount", summary.inventoryCount ?? "--");
    setText("summaryLowStockCount", `${summary.lowStockInventoryCount ?? "--"} low stock`);
    setText("summaryBudgetRemaining", formatPeso(summary.budgetRemaining));
    setText("summaryBudgetUsed", `Used: ${formatPeso(summary.budgetUsed)}`);
    setText("summaryReliefReadyCount", summary.reliefReadyCount ?? "--");
    setText("summaryReliefLowCount", `${summary.reliefLowStockCount ?? "--"} low stock`);
    setText("summaryActiveCenters", summary.activeCentersCount ?? "--");
    setText("summaryCenterOccupancy", `Occupancy: ${summary.centerOccupancyRate ?? "--"}%`);
}

async function refreshResourcesHeader() {
    await Promise.all([
        loadResourcesSummary(),
        loadReadinessSummary()
    ]);
}

async function loadActiveResourcesTab() {
    switch (resourcesState.activeTab) {
        case "inventory":
            if (window.loadInventorySection) await window.loadInventorySection();
            break;
        case "budget":
            if (window.loadBudgetSection) await window.loadBudgetSection();
            break;
        case "relief":
            if (window.loadReliefSection) await window.loadReliefSection();
            break;
        case "evacuation":
            if (window.loadEvacuationCentersSection) await window.loadEvacuationCentersSection();
            break;
    }
}

async function apiGet(path) {
    return apiRequest(`${API_BASE}${path}`);
}

async function apiSend(path, method = "POST", payload = null) {
    const token = localStorage.getItem("jwtToken");

    const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: payload != null ? JSON.stringify(payload) : null
    });

    const contentType = response.headers.get("content-type") || "";
    let body = null;

    if (contentType.includes("application/json")) {
        try {
            body = await response.json();
        } catch {
            body = null;
        }
    } else {
        try {
            body = await response.text();
        } catch {
            body = null;
        }
    }

    if (!response.ok) {
        if (body && typeof body === "object") {
            throw new Error(JSON.stringify(body));
        }
        throw new Error(
            typeof body === "string" && body
                ? body
                : `Request failed with status ${response.status}`
        );
    }

    return body;
}

async function loadBarangayOptions() {
    if (resourcesState.barangayOptions) return resourcesState.barangayOptions;

    try {
        const rows = await apiGet("/barangays");
        resourcesState.barangayOptions = (rows || []).map(item => ({
            label: item.name,
            value: item.id
        }));
        return resourcesState.barangayOptions;
    } catch (error) {
        console.error("Failed to load barangays", error);
        resourcesState.barangayOptions = [];
        return [];
    }
}

async function loadUserOptions(keyword = "") {
    try {
        const responderApiBase =
            typeof RESPONDER_API !== "undefined"
                ? RESPONDER_API
                : `${API_BASE}/responders`;

        const rows = await apiGet(
            `${responderApiBase}/available?keyword=${encodeURIComponent(keyword)}`
        );

        return (rows || []).map(item => ({
            label: item.fullName || `${item.firstName || ""} ${item.lastName || ""}`.trim(),
            value: item.id
        }));
    } catch (error) {
        console.error("Failed to load users", error);
        return [];
    }
}

async function loadIncidentOptions() {
    if (resourcesState.incidentOptions) return resourcesState.incidentOptions;

    try {
        const rows = await apiGet(INCIDENTS_LOOKUP_PATH);
        resourcesState.incidentOptions = (rows || []).map(item => ({
            label: item.type || `Incident ${item.id}`,
            value: item.id,
            status: item.status || "",
            severity: item.severity || "",
            type: item.type || ""
        }));
        return resourcesState.incidentOptions;
    } catch (error) {
        console.error("Failed to load incidents", error);
        resourcesState.incidentOptions = [];
        return [];
    }
}

async function loadCalamityOptions() {
    if (resourcesState.calamityOptions) return resourcesState.calamityOptions;

    try {
        const rows = await apiGet(CALAMITIES_LOOKUP_PATH);
        resourcesState.calamityOptions = (rows || []).map(item => ({
            label: item.type || `Calamity ${item.id}`,
            value: item.id,
            status: item.status || "",
            severity: item.severity || "",
            type: item.type || ""
        }));
        return resourcesState.calamityOptions;
    } catch (error) {
        console.error("Failed to load calamities", error);
        resourcesState.calamityOptions = [];
        return [];
    }
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value ?? "";
    }
}

function formatPeso(value) {
    if (value == null || Number.isNaN(Number(value))) return "₱ --";
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2
    }).format(Number(value));
}

function formatNumber(value) {
    if (value == null || Number.isNaN(Number(value))) return "--";
    return new Intl.NumberFormat("en-PH").format(Number(value));
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function stockBadgeClass(status) {
    switch ((status || "").toUpperCase()) {
        case "LOW": return "low";
        case "OUT": return "out";
        case "AVAILABLE": return "available";
        case "NEAR_FULL": return "near-full";
        case "FULL": return "full";
        case "ACTIVE": return "active";
        case "INACTIVE": return "inactive";
        case "MAINTENANCE": return "maintenance";
        default: return "ok";
    }
}

function openResourcesModal({ title, bodyHtml, footerHtml = "" }) {
    setText("resourcesModalTitle", title);
    document.getElementById("resourcesModalBody").innerHTML = bodyHtml;
    document.getElementById("resourcesModalFoot").innerHTML = footerHtml;
    document.getElementById("resourcesModal").classList.remove("hidden");
}

function closeResourcesModal() {
    document.getElementById("resourcesModal").classList.add("hidden");
    document.getElementById("resourcesModalBody").innerHTML = "";
    document.getElementById("resourcesModalFoot").innerHTML = "";
}

function debounce(fn, delay = 250) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

function bindSearchableDropdown({
    inputId,
    dropdownId,
    hiddenInputId = null,
    options = [],
    getLabel = option => typeof option === "string" ? option : option.label,
    getValue = option => typeof option === "string" ? option : option.value,
    initialValue = "",
    initialHiddenValue = "",
    onSelect = null
}) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    const hiddenInput = hiddenInputId ? document.getElementById(hiddenInputId) : null;

    if (!input || !dropdown) return;

    if (initialValue) input.value = initialValue;
    if (hiddenInput && initialHiddenValue !== undefined && initialHiddenValue !== null) {
        hiddenInput.value = initialHiddenValue;
    }

    function render(query = "") {
        const normalized = query.trim().toLowerCase();

        const filtered = options.filter(option =>
            getLabel(option).toLowerCase().includes(normalized)
        );

        if (!filtered.length) {
            dropdown.innerHTML = `<div class="searchable-empty">No matches found.</div>`;
            dropdown.classList.add("active");
            return;
        }

        dropdown.innerHTML = filtered.map(option => `
            <button type="button" class="searchable-option">
                ${escapeHtml(getLabel(option))}
            </button>
        `).join("");

        dropdown.classList.add("active");

        [...dropdown.querySelectorAll(".searchable-option")].forEach((btn, index) => {
            btn.addEventListener("click", () => {
                const selected = filtered[index];
                input.value = getLabel(selected);

                if (hiddenInput) {
                    hiddenInput.value = getValue(selected);
                }

                dropdown.classList.remove("active");

                if (onSelect) {
                    onSelect(selected);
                }
            });
        });
    }

    input.addEventListener("focus", () => render(input.value));
    input.addEventListener("input", () => {
        if (hiddenInput) hiddenInput.value = "";
        render(input.value);
    });

    document.addEventListener("click", event => {
        if (!dropdown.contains(event.target) && event.target !== input) {
            dropdown.classList.remove("active");
        }
    });
}

/* Toast */
function ensureToastContainer() {
    if (document.getElementById("resourcesToastContainer")) return;

    const container = document.createElement("div");
    container.id = "resourcesToastContainer";
    container.className = "resources-toast-container";
    document.body.appendChild(container);
}

function showToast(message, type = "info", duration = 2800) {
    ensureToastContainer();

    const container = document.getElementById("resourcesToastContainer");
    const toast = document.createElement("div");
    toast.className = `resources-toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add("show");
    });

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 220);
    }, duration);
}

// for admin integration
async function submitResourceApprovalRequest(payload) {
    return apiSend("/approval-requests", "POST", payload);
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

function bindResourceCategoryFilters() {
    const inventoryCategories = [
        "CONSUMABLE", "SUPPLY", "TOOL", "VEHICLE", "PPE",
        "MEDICINE", "FOOD", "WATER", "SHELTER", "OTHER"
    ];

    const reliefCategories = [
        "FOOD", "RELIEF", "WATER", "HYGIENE", "MEDICAL"
    ];

    bindSimpleCategoryDropdown("inventoryCategoryFilter", inventoryCategories);
    bindSimpleCategoryDropdown("reliefCategoryFilter", reliefCategories);
}

function bindSimpleCategoryDropdown(inputId, options) {
    const input = document.getElementById(inputId);
    if (!input) return;

    let wrapper = input.closest(".resource-filter-inline-wrap");

    if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.className = "resource-filter-inline-wrap searchable-group";

        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);
    } else {
        wrapper.classList.add("searchable-group");
    }

    let dropdown = wrapper.querySelector(`#${inputId}Dropdown`);
    if (!dropdown) {
        dropdown = document.createElement("div");
        dropdown.id = `${inputId}Dropdown`;
        dropdown.className = "searchable-dropdown";
        wrapper.appendChild(dropdown);
    }

    const normalizedOptions = options.map(option => ({
        label: option,
        value: option
    }));

    bindSearchableDropdown({
        inputId,
        dropdownId: `${inputId}Dropdown`,
        options: normalizedOptions,
        getLabel: option => option.label,
        getValue: option => option.value,
        onSelect: () => {
            loadActiveResourcesTab();
        }
    });

    if (!input.dataset.categoryBound) {
        input.dataset.categoryBound = "true";
        input.addEventListener("change", () => loadActiveResourcesTab());
    }
}