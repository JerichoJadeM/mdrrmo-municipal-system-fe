const API_BASE = "http://localhost:8080/api";

async function apiRequest(url, options = {}) {
    const token = localStorage.getItem("jwtToken");

    options.headers = {
        ...(options.headers || {}),
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    const response = await fetch(url, options);

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        return await response.json();
    }

    return null;
}

function formatDateTime(value) {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
}

function getSeverityClass(severity) {
    const normalized = String(severity || "").trim().toUpperCase();

    if (normalized === "HIGH") return "severity-high";
    if (normalized === "MEDIUM") return "severity-medium";
    if (normalized === "LOW") return "severity-low";

    return "severity-default";
}

function formatCalamityArea(calamity) {
    const areaType = String(calamity?.affectedAreaType || "").toUpperCase();
    const affectedNames = calamity?.affectedBarangayNames || [];

    if (areaType === "MUNICIPALITY") {
        return "Whole Municipality";
    }

    if (areaType === "MULTI_BARANGAY") {
        if (!affectedNames.length) return "-";
        if (affectedNames.length === 1) return affectedNames[0];
        return `${affectedNames.length} Barangays`;
    }

    return calamity?.primaryBarangayName || calamity?.barangay || "-";
}

function getCurrentUserRoles() {
    try {
        const raw = localStorage.getItem("userAuthorities") || sessionStorage.getItem("userAuthorities");
        if (!raw) return [];

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        return parsed.map(role => String(role).toUpperCase());
    } catch {
        return [];
    }
}

function canManageHiddenStorage() {
    const roles = getCurrentUserRoles();
    return roles.includes("ROLE_ADMIN") || roles.includes("ROLE_MANAGER");
}

function canManageArchiveClear() {
    return canManageHiddenStorage();
}

function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) {
        console.log(`[${type}] ${message}`);
        return;
    }

    const icons = {
        success: "fa-circle-check",
        error: "fa-circle-xmark",
        info: "fa-circle-info",
        warning: "fa-triangle-exclamation"
    };

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-icon"><i class="fas ${icons[type] || icons.info}"></i></div>
        <div class="toast-message">${message}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3200);
}

function clearCurrentSelection() {
    if (typeof currentSelection !== "undefined") {
        currentSelection.type = null;
        currentSelection.data = null;
    }

    if (typeof clearCardSelections === "function") {
        clearCardSelections();
    }

    if (typeof resetOperationsDrawer === "function") {
        resetOperationsDrawer();
    }

    if (typeof closeOperationsDrawer === "function") {
        closeOperationsDrawer();
    }

    if (typeof resetOperationsMap === "function") {
        resetOperationsMap();
    }
}

function initArchiveControls() {
    if (canManageArchiveClear()) {
        document.getElementById("incidentArchiveClearBtn")?.classList.remove("hidden");
        document.getElementById("calamityArchiveClearBtn")?.classList.remove("hidden");
    }

    if (typeof initArchiveMenus === "function") {
        initArchiveMenus();
    }
}

async function initOperationsPage() {
    if (!localStorage.getItem("jwtToken")) {
        window.location.href = "login.html";
        return;
    }

    try {
        if (typeof initBoardModeToggle === "function") {
            initBoardModeToggle();
        }

        if (typeof initBoardFilters === "function") {
            initBoardFilters();
        }

        if (typeof initDropzones === "function") {
            initDropzones();
        }

        if (typeof initOperationsDrawer === "function") {
            initOperationsDrawer();
        }

        if (typeof initOperationsMap === "function") {
            initOperationsMap();
        }

        if (typeof initArchiveDrawer === "function") {
            initArchiveDrawer();
        }

        initArchiveControls();

        if (typeof loadIncidentBoard === "function") {
            await loadIncidentBoard();
        }

        if (typeof loadCalamityBoard === "function") {
            await loadCalamityBoard();
        }

        if (typeof setBoardMode === "function") {
            setBoardMode("INCIDENTS");
        }
    } catch (error) {
        console.error("Error initializing operations page:", error);
        showToast("Failed to load operations data.", "error");
    }
}

// for admin integration
async function parseApiError(error) {
    try {
        return JSON.parse(error.message);
    } catch {
        return { message: error.message || "Request failed." };
    }
}

async function submitApprovalRequest(payload) {
    return apiRequest(`${API_BASE}/approval-requests`, {
        method: "POST",
        body: JSON.stringify(payload)
    });
}

document.addEventListener("DOMContentLoaded", initOperationsPage);