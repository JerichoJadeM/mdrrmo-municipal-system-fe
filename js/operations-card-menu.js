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
        items.push(`<button type="button" class="board-card-menu-item danger" data-action="remove-board">Remove from board</button>`);
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
        items.push(`<button type="button" class="board-card-menu-item danger" data-action="remove-board">Remove from board</button>`);
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
    document.querySelectorAll(".board-card-menu").forEach(menu => {
        menu.classList.add("hidden");
    });
}

function toggleCardMenu(card) {
    const menu = card.querySelector(".board-card-menu");
    if (!menu) return;

    const isHidden = menu.classList.contains("hidden");
    closeAllCardMenus();

    if (isHidden) {
        menu.classList.remove("hidden");
    }
}

function openIncidentEditOnly(incident) {
    openDispatchModal({
        ...incident,
        modalMode: "EDIT_ONLY"
    });
}

function openCalamityEditOnly(calamity) {
    openStatusUpdateModal({
        type: "CALAMITY",
        data: calamity,
        action: "EDIT_ONLY",
        targetStatus: calamity.status,
        title: "Calamity Details"
    });
}

function renderArchiveDrawer(type) {
    const drawer = document.getElementById("archiveDrawer");
    const overlay = document.getElementById("archiveDrawerOverlay");
    const title = document.getElementById("archiveDrawerTitle");
    const body = document.getElementById("archiveDrawerBody");

    if (!drawer || !overlay || !title || !body) return;

    const archived = getHiddenCardsByType(type);
    title.textContent = type === "INCIDENT" ? "Archived Incidents" : "Archived Calamities";

    body.innerHTML = "";

    if (!archived.length) {
        body.innerHTML = `<p>No archived cards.</p>`;
        drawer.classList.add("active");
        overlay.classList.add("active");
        return;
    }

    archived.forEach(item => {
        const card = document.createElement("div");
        card.className = "archive-drawer-card";

        if (type === "INCIDENT") {
            card.innerHTML = `
                <div class="archive-drawer-card-title">${item.type || "-"}</div>
                <div class="archive-drawer-card-meta">
                    Barangay: ${item.barangay || "-"}<br>
                    Status: ${item.status || "-"}<br>
                    Severity: ${item.severity || "-"}
                </div>
            `;
        } else {
            card.innerHTML = `
                <div class="archive-drawer-card-title">${item.type || item.calamityName || "-"}</div>
                <div class="archive-drawer-card-meta">
                    Area: ${formatCalamityArea(item)}<br>
                    Status: ${item.status || "-"}<br>
                    Severity: ${item.severity || "-"}
                </div>
            `;
        }

        body.appendChild(card);
    });

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
        const changed = restoreHiddenCardsByType(type);
        if (!changed) {
            showToast("No archived cards to restore.", "info");
            return;
        }

        if (type === "INCIDENT") {
            applyIncidentFilters();
        } else {
            applyCalamityFilters();
        }

        showToast("Archived cards restored.", "success");
        return;
    }

    if (action === "clear") {
        const changed = clearArchiveByType(type);
        if (!changed) {
            showToast("No archived cards to clear.", "info");
            return;
        }

        if (type === "INCIDENT") {
            applyIncidentFilters();
        } else {
            applyCalamityFilters();
        }

        closeArchiveDrawer();
        showToast("Archive cleared.", "success");
    }
}

function closeAllArchiveMenus() {
    document.querySelectorAll(".archive-menu").forEach(menu => {
        menu.classList.add("hidden");
    });
}

function initArchiveMenus() {
    const incidentBtn = document.getElementById("incidentArchiveMenuBtn");
    const calamityBtn = document.getElementById("calamityArchiveMenuBtn");
    const incidentMenu = document.getElementById("incidentArchiveMenu");
    const calamityMenu = document.getElementById("calamityArchiveMenu");
    const drawerClose = document.getElementById("archiveDrawerClose");
    const drawerOverlay = document.getElementById("archiveDrawerOverlay");
    const drawer = document.getElementById("archiveDrawer");

    incidentBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        const hidden = incidentMenu?.classList.contains("hidden");
        closeAllArchiveMenus();
        if (hidden) incidentMenu?.classList.remove("hidden");
    });

    calamityBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        const hidden = calamityMenu?.classList.contains("hidden");
        closeAllArchiveMenus();
        if (hidden) calamityMenu?.classList.remove("hidden");
    });

    document.querySelectorAll(".archive-menu-item").forEach(item => {
        item.addEventListener("click", async (e) => {
            e.stopPropagation();
            const action = item.dataset.archiveAction;
            const type = item.dataset.archiveType;
            closeAllArchiveMenus();
            await executeArchiveAction(type, action);
        });
    });

    drawerClose?.addEventListener("click", closeArchiveDrawer);
    drawerOverlay?.addEventListener("click", closeArchiveDrawer);

    document.addEventListener("click", (event) => {
        closeAllCardMenus();
        closeAllArchiveMenus();

        if (drawer?.classList.contains("active")) {
            const clickedInsideDrawer = drawer.contains(event.target);
            const clickedArchiveBtn =
                incidentBtn?.contains(event.target) ||
                calamityBtn?.contains(event.target);

            if (!clickedInsideDrawer && !clickedArchiveBtn) {
                closeArchiveDrawer();
            }
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

    if (action === "remove-board") {
        hideBoardCard(type, data.id);

        if (type === "INCIDENT") {
            applyIncidentFilters();
        } else {
            applyCalamityFilters();
        }

        showToast("Card archived from board.", "success");
        return;
    }

    if (type === "INCIDENT") {
        if (action === "move-dispatch") {
            openDispatchModal({
                ...data,
                modalMode: "DISPATCH"
            });
            return;
        }

        if (action === "move-onsite") {
            openStatusUpdateModal({
                type: "INCIDENT",
                data,
                action: "ARRIVE",
                targetStatus: "ON_SITE",
                title: "Mark Incident as On-Site"
            });
            return;
        }

        if (action === "move-resolved") {
            openStatusUpdateModal({
                type: "INCIDENT",
                data,
                action: "RESOLVE",
                targetStatus: "RESOLVED",
                title: "Resolve Incident"
            });
            return;
        }

        if (action === "edit-incident") {
            openIncidentEditOnly(data);
            return;
        }

        return;
    }

    if (type === "CALAMITY") {
        if (action === "move-monitoring") {
            openStatusUpdateModal({
                type: "CALAMITY",
                data,
                action: "MONITOR",
                targetStatus: "MONITORING",
                title: "Set Calamity to Monitoring"
            });
            return;
        }

        if (action === "move-resolved") {
            openStatusUpdateModal({
                type: "CALAMITY",
                data,
                action: "RESOLVE",
                targetStatus: "RESOLVED",
                title: "Resolve Calamity"
            });
            return;
        }

        if (action === "move-ended") {
            openStatusUpdateModal({
                type: "CALAMITY",
                data,
                action: "END",
                targetStatus: "ENDED",
                title: "End Calamity"
            });
            return;
        }

        if (action === "edit-calamity") {
            openCalamityEditOnly(data);
        }
    }
}

function initCardMenuEvents(card, type, data) {
    const menuBtn = card.querySelector('[data-action="toggle-menu"]');
    const menu = card.querySelector(".board-card-menu");

    menuBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleCardMenu(card);
    });

    menu?.querySelectorAll(".board-card-menu-item").forEach(item => {
        item.addEventListener("click", async (event) => {
            event.stopPropagation();
            const action = item.dataset.action;
            closeAllCardMenus();
            await executeMenuAction(type, data, action);
        });
    });
}