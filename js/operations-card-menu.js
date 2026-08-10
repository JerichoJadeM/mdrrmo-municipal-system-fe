function buildIncidentCardMenu(incident) {
    const status = (incident.status || "").toUpperCase();
    const items = [];

    items.push(`<button type="button" class="board-card-menu-item" data-action="move-up">Move up</button>`);
    items.push(`<button type="button" class="board-card-menu-item" data-action="move-top">Move to top</button>`);
    items.push(`<div class="board-card-menu-divider"></div>`);

    if (status === "ONGOING") {
        items.push(`<button type="button" class="board-card-menu-item" data-action="move-dispatch">Dispatch</button>`);
    }
    if (status === "IN_PROGRESS") {
        items.push(`<button type="button" class="board-card-menu-item" data-action="move-onsite">Move to On-Site</button>`);
    }
    if (status === "ON_SITE") {
        items.push(`<button type="button" class="board-card-menu-item" data-action="move-resolved">Move to Resolved</button>`);
    }

    items.push(`<div class="board-card-menu-divider"></div>`);
    items.push(`<button type="button" class="board-card-menu-item" data-action="edit-incident">Show details</button>`);

    if (status === "RESOLVED") {
        items.push(`<div class="board-card-menu-divider"></div>`);
        items.push(`<button type="button" class="board-card-menu-item danger" data-action="archive">Archive</button>`);
    }

    return `
        <div class="board-card-menu-wrapper">
            <button type="button" class="board-card-menu-btn" data-action="toggle-menu" aria-label="More options">
                <i class="fas fa-ellipsis-h"></i>
            </button>
            <div class="board-card-menu hidden">
                ${items.join("")}
            </div>
        </div>
    `;
}

function buildCalamityCardMenu(calamity) {
    const status = (calamity.status || "").toUpperCase();
    const items = [];

    items.push(`<button type="button" class="board-card-menu-item" data-action="move-up">Move up</button>`);
    items.push(`<button type="button" class="board-card-menu-item" data-action="move-top">Move to top</button>`);
    items.push(`<div class="board-card-menu-divider"></div>`);

    if (status === "ACTIVE") {
        items.push(`<button type="button" class="board-card-menu-item" data-action="move-monitoring">Move to Monitoring</button>`);
    }
    if (status === "MONITORING") {
        items.push(`<button type="button" class="board-card-menu-item" data-action="move-resolved">Move to Resolved</button>`);
    }
    if (status === "RESOLVED") {
        items.push(`<button type="button" class="board-card-menu-item" data-action="move-ended">Move to Ended</button>`);
    }

    items.push(`<div class="board-card-menu-divider"></div>`);
    items.push(`<button type="button" class="board-card-menu-item" data-action="edit-calamity">Show details</button>`);

    if (status === "RESOLVED" || status === "ENDED") {
        items.push(`<div class="board-card-menu-divider"></div>`);
        items.push(`<button type="button" class="board-card-menu-item danger" data-action="archive">Archive</button>`);
    }

    return `
        <div class="board-card-menu-wrapper">
            <button type="button" class="board-card-menu-btn" data-action="toggle-menu" aria-label="More options">
                <i class="fas fa-ellipsis-h"></i>
            </button>
            <div class="board-card-menu hidden">
                ${items.join("")}
            </div>
        </div>
    `;
}

function closeAllCardMenus() {
    document.querySelectorAll(".board-card-menu").forEach(menu => menu.classList.add("hidden"));
}

function toggleCardMenu(card) {
    const menu = card.querySelector(".board-card-menu");
    if (!menu) return;

    const isHidden = menu.classList.contains("hidden");
    closeAllCardMenus();
    if (isHidden) menu.classList.remove("hidden");
}

function openIncidentEditOnly(incident) {
    if (typeof clearCardSelections === "function") clearCardSelections();
    document.querySelector(`.board-card[data-type="INCIDENT"][data-id="${incident.id}"]`)?.classList.add("active");

    if (typeof currentSelection !== "undefined") {
        currentSelection.type = "INCIDENT";
        currentSelection.data = incident;
    }

    if (typeof loadOperationsDrawer === "function") {
        loadOperationsDrawer("INCIDENT", incident);
    }
}

function openCalamityEditOnly(calamity) {
    if (typeof clearCardSelections === "function") clearCardSelections();
    document.querySelector(`.board-card[data-type="CALAMITY"][data-id="${calamity.id}"]`)?.classList.add("active");

    if (typeof currentSelection !== "undefined") {
        currentSelection.type = "CALAMITY";
        currentSelection.data = calamity;
    }

    if (typeof loadOperationsDrawer === "function") {
        loadOperationsDrawer("CALAMITY", calamity);
    }
}

function refreshBoardByType(type) {
    if (type === "INCIDENT") {
        applyIncidentFilters();
    } else {
        applyCalamityFilters();
    }
}

function buildArchiveDrawerCard(type, item) {
    const title = type === "INCIDENT"
        ? (item.type || "-")
        : getCalamityDisplayName(item);

    const meta = type === "INCIDENT"
        ? `Barangay: ${item.barangay || "-"}<br>Status: ${item.status || "-"}<br>Severity: ${item.severity || "-"}`
        : `Area: ${(typeof formatCalamityArea === "function" ? formatCalamityArea(item) : (item.affectedAreaName || item.barangayName || "-"))}<br>Status: ${item.status || "-"}<br>Severity: ${item.severity || "-"}`;

    return `
        <div class="archive-drawer-card">
            <div class="archive-drawer-card-title">${title}</div>
            <div class="archive-drawer-card-meta">${meta}</div>
            <div class="archive-drawer-card-actions">
                <button type="button" class="btn btn-primary archive-inline-action" data-inline-action="restore" data-type="${type}" data-id="${item.id}">Restore</button>
                <button type="button" class="btn btn-cancel archive-inline-action" data-inline-action="clear" data-type="${type}" data-id="${item.id}">Clear</button>
            </div>
        </div>
    `;
}

function bindArchiveDrawerActions() {
    document.querySelectorAll(".archive-inline-action").forEach(btn => {
        btn.addEventListener("click", async event => {
            event.stopPropagation();
            const action = btn.dataset.inlineAction;
            const type = btn.dataset.type;
            const id = Number(btn.dataset.id);

            let success = false;

            if (action === "restore") {
                success = await restoreArchivedCard(type, id);
            } else if (action === "clear") {
                success = await hideArchivedCard(type, id);
            }

            if (!success) {
                showToast("Action failed.", "error");
                return;
            }

            refreshBoardByType(type);
            renderArchiveDrawer(type);
            showToast(action === "restore" ? "Archived item restored." : "Archived item cleared.", "success");
        });
    });
}

async function renderArchiveDrawer(type) {
    const drawer = document.getElementById("archiveDrawer");
    const overlay = document.getElementById("archiveDrawerOverlay");
    const title = document.getElementById("archiveDrawerTitle");
    const body = document.getElementById("archiveDrawerBody");
    if (!drawer || !overlay || !title || !body) return;

    const archived = await fetchArchivedCards(type);

    title.textContent = type === "INCIDENT"
        ? "Archived Incidents"
        : "Archived Calamities";

    body.innerHTML = archived.length
        ? archived.map(item => buildArchiveDrawerCard(type, item)).join("")
        : `<p>No archived cards.</p>`;

    bindArchiveDrawerActions();
    drawer.classList.add("active");
    overlay.classList.add("active");
}

function closeArchiveDrawer() {
    document.getElementById("archiveDrawer")?.classList.remove("active");
    document.getElementById("archiveDrawerOverlay")?.classList.remove("active");
}

async function executeArchiveAction(type, action) {
    if (action === "show") {
        renderArchiveDrawer(type);
        return;
    }

    if (action === "restore") {
        const result = await bulkRestoreArchivedCards(type);
        if (!result) {
            showToast("Failed to restore archived cards.", "error");
            return;
        }
        refreshBoardByType(type);
        renderArchiveDrawer(type);
        showToast("Archived cards restored.", "success");
        return;
    }

    if (action === "clear") {
        const result = await bulkClearArchivedCards(type);
        if (!result) {
            showToast("Failed to clear archive.", "error");
            return;
        }
        refreshBoardByType(type);
        renderArchiveDrawer(type);
        showToast("Archive cleared.", "success");
    }
}

function closeAllArchiveMenus() {
    document.querySelectorAll(".archive-menu").forEach(menu => menu.classList.add("hidden"));
}

function initArchiveMenus() {
    const incidentBtn = document.getElementById("incidentArchiveMenuBtn");
    const calamityBtn = document.getElementById("calamityArchiveMenuBtn");
    const incidentMenu = document.getElementById("incidentArchiveMenu");
    const calamityMenu = document.getElementById("calamityArchiveMenu");
    const drawerClose = document.getElementById("archiveDrawerClose");
    const drawerOverlay = document.getElementById("archiveDrawerOverlay");
    const drawer = document.getElementById("archiveDrawer");

    incidentBtn?.addEventListener("click", e => {
        e.stopPropagation();
        const hidden = incidentMenu?.classList.contains("hidden");
        closeAllArchiveMenus();
        if (hidden) incidentMenu?.classList.remove("hidden");
    });

    calamityBtn?.addEventListener("click", e => {
        e.stopPropagation();
        const hidden = calamityMenu?.classList.contains("hidden");
        closeAllArchiveMenus();
        if (hidden) calamityMenu?.classList.remove("hidden");
    });

    document.querySelectorAll(".archive-menu-item").forEach(item => {
        item.addEventListener("click", async e => {
            e.stopPropagation();
            closeAllArchiveMenus();
            await executeArchiveAction(item.dataset.archiveType, item.dataset.archiveAction);
        });
    });

    drawerClose?.addEventListener("click", closeArchiveDrawer);
    drawerOverlay?.addEventListener("click", closeArchiveDrawer);

    document.addEventListener("click", event => {
        closeAllCardMenus();
        closeAllArchiveMenus();

        if (drawer?.classList.contains("active")) {
            const clickedInsideDrawer = drawer.contains(event.target);
            const clickedArchiveBtn = incidentBtn?.contains(event.target) || calamityBtn?.contains(event.target);
            if (!clickedInsideDrawer && !clickedArchiveBtn) closeArchiveDrawer();
        }
    });
}

async function executeMenuAction(type, data, action) {
    const status = (data.status || "").toUpperCase();

    if (action === "move-up") {
        moveBoardItem(type, status, data.id, "UP");
        return;
    }

    if (action === "move-top") {
        moveBoardItem(type, status, data.id, "TOP");
        return;
    }

    if (action === "archive") {
        await archiveCard(type, data.id);
        refreshBoardByType(type);
        showToast("Card archived.", "success");
        return;
    }

    // if (action === "remove-board") {
    //     hideBoardCard(type, data.id);
    //     refreshBoardByType(type);
    //     showToast("Card archived from board.", "success");
    //     return;
    // }

    if (type === "INCIDENT") {
        if (action === "move-dispatch") {
            openTransitionReviewModal({ type: "INCIDENT", mode: "DISPATCH_REVIEW", data, title: "Dispatch Incident" });
            return;
        }
        if (action === "move-onsite") {
            openTransitionReviewModal({ type: "INCIDENT", mode: "ARRIVE_REVIEW", data, title: "Mark Incident as On-Site" });
            return;
        }
        if (action === "move-resolved") {
            openTransitionReviewModal({ type: "INCIDENT", mode: "RESOLVE_REVIEW", data, title: "Resolve Incident" });
            return;
        }
        if (action === "edit-incident") {
            openIncidentEditOnly(data);
            return;
        }
        return;
    }

    if (action === "move-monitoring") {
        openTransitionReviewModal({ type: "CALAMITY", mode: "MONITOR_REVIEW", data, title: "Set Calamity to Monitoring" });
        return;
    }
    if (action === "move-resolved") {
        openTransitionReviewModal({ type: "CALAMITY", mode: "RESOLVE_REVIEW", data, title: "Resolve Calamity" });
        return;
    }
    if (action === "move-ended") {
        openTransitionReviewModal({ type: "CALAMITY", mode: "END_REVIEW", data, title: "End Calamity" });
        return;
    }
    if (action === "edit-calamity") {
        openCalamityEditOnly(data);
    }
}

function initCardMenuEvents(card, type, data) {
    const menuBtn = card.querySelector('[data-action="toggle-menu"]');
    const menu = card.querySelector(".board-card-menu");

    menuBtn?.addEventListener("click", event => {
        event.stopPropagation();
        toggleCardMenu(card);
    });

    menu?.querySelectorAll(".board-card-menu-item").forEach(item => {
        item.addEventListener("click", async event => {
            event.stopPropagation();
            closeAllCardMenus();
            await executeMenuAction(type, data, item.dataset.action);
        });
    });
}

async function fetchArchivedCards(type) {
    try {
        const endpoint = type === "INCIDENT"
            ? "/incidents/archived"
            : "/calamities/archived";

        const data = await apiRequest(`${window.APP_CONFIG.API_BASE}${endpoint}`, { method: "GET" });
        return Array.isArray(data) ? data : [];
    } catch (err) {
        console.error(err);
        showToast("Failed to load archived data.", "error");
        return [];
    }
}

async function restoreArchivedCard(type, id) {
    try {
        const endpoint = type === "INCIDENT"
            ? `/incidents/${id}/restore`
            : `/calamities/${id}/restore`;

        await apiRequest(`${window.APP_CONFIG.API_BASE}${endpoint}`, { method: "PUT" });
        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}

async function hideArchivedCard(type, id) {
    try {
        const endpoint = type === "INCIDENT"
            ? `/incidents/${id}/archive/clear`
            : `/calamities/${id}/archive/clear`;

        await apiRequest(`${window.APP_CONFIG.API_BASE}${endpoint}`, { method: "PUT" });
        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}

async function bulkRestoreArchivedCards(type) {
    try {
        const endpoint = type === "INCIDENT"
            ? "/incidents/archived/restore-all"
            : "/calamities/archived/restore-all";

        await apiRequest(`${window.APP_CONFIG.API_BASE}${endpoint}`, { method: "PUT" });
        return true;
    } catch (err) {
        console.error(err);
        return null;
    }
}

async function bulkClearArchivedCards(type) {
    try {
        const endpoint = type === "INCIDENT"
            ? "/incidents/archived/clear-all"
            : "/calamities/archived/clear-all";

        await apiRequest(`${window.APP_CONFIG.API_BASE}${endpoint}`, { method: "PUT" });
        return true;
    } catch (err) {
        console.error(err);
        return null;
    }
}