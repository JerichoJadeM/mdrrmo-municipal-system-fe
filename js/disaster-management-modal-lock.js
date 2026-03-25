let activeModalId = null;

function getActiveLibraryMode() {
    const calamitiesBtn = document.getElementById("showCalamitiesBtn");
    return calamitiesBtn?.classList.contains("active") ? "CALAMITY" : "INCIDENT";
}

function showOverlayLock() {
    const overlay = document.getElementById("overlay");
    if (!overlay) return;

    overlay.classList.add("modal-overlay-active");
    overlay.style.display = "block";
}

function hideOverlayLock() {
    const overlay = document.getElementById("overlay");
    if (!overlay) return;

    overlay.classList.remove("modal-overlay-active");
    overlay.style.display = "";
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    activeModalId = modalId;
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");

    showOverlayLock();
    document.body.classList.add("modal-open");
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");

    const stillOpenModal = document.querySelector(".modal.active");
    if (!stillOpenModal) {
        activeModalId = null;
        hideOverlayLock();
        document.body.classList.remove("modal-open");
    }
}

function closeAllModals() {
    document.querySelectorAll(".modal.active").forEach((modal) => {
        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");
    });

    activeModalId = null;
    hideOverlayLock();
    document.body.classList.remove("modal-open");
}

function bindModalOpeners() {
    const heroAddBtn = document.getElementById("openLibraryModalBtnHero");
    const libraryAddBtn = document.getElementById("openLibraryModalBtn");
    const openViewBtn = document.getElementById("openViewEventModalBtn");

    const openCreateModalForCurrentTab = () => {
        const mode = getActiveLibraryMode();
        if (mode === "CALAMITY") {
            openModal("calamityModal");
        } else {
            openModal("incidentModal");
        }
    };

    heroAddBtn?.addEventListener("click", openCreateModalForCurrentTab);
    libraryAddBtn?.addEventListener("click", openCreateModalForCurrentTab);

    openViewBtn?.addEventListener("click", () => {
        openModal("viewEventModal");
    });
}

function bindModalClosers() {
    const closeMap = [
        ["closeCalamityModalBtn", "calamityModal"],
        ["cancelCalamityBtn", "calamityModal"],
        ["closeIncidentModalBtn", "incidentModal"],
        ["cancelIncidentBtn", "incidentModal"],
        ["closeViewEventModalBtn", "viewEventModal"],
        ["closeViewEventFooterBtn", "viewEventModal"]
    ];

    closeMap.forEach(([triggerId, modalId]) => {
        document.getElementById(triggerId)?.addEventListener("click", () => closeModal(modalId));
    });
}

function bindBackdropClose() {
    document.addEventListener("mousedown", (event) => {
        if (!activeModalId) return;

        const activeModal = document.getElementById(activeModalId);
        if (!activeModal) return;

        const content = activeModal.querySelector(".modal-content");
        if (!content) return;

        if (event.target === activeModal) {
            closeModal(activeModalId);
            return;
        }

        if (!content.contains(event.target) && activeModal.classList.contains("active")) {
            const overlay = document.getElementById("overlay");
            if (event.target === overlay) {
                closeModal(activeModalId);
            }
        }
    });
}

function bindEscapeClose() {
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && activeModalId) {
            closeModal(activeModalId);
        }
    });
}

function bindModeAwareAddButtonLabel() {
    const calamitiesBtn = document.getElementById("showCalamitiesBtn");
    const incidentsBtn = document.getElementById("showIncidentsBtn");
    const addBtnText = document.getElementById("libraryAddBtnText");
    const addBtnIcon = document.getElementById("libraryAddBtnIcon");

    const refresh = () => {
        const mode = getActiveLibraryMode();

        if (!addBtnText || !addBtnIcon) return;

        if (mode === "CALAMITY") {
            addBtnText.textContent = "Add Calamity";
            addBtnIcon.className = "fas fa-cloud-showers-heavy";
        } else {
            addBtnText.textContent = "Add Incident";
            addBtnIcon.className = "fas fa-helmet-safety";
        }
    };

    calamitiesBtn?.addEventListener("click", refresh);
    incidentsBtn?.addEventListener("click", refresh);
    refresh();
}

document.addEventListener("DOMContentLoaded", () => {
    bindModalOpeners();
    bindModalClosers();
    bindBackdropClose();
    bindEscapeClose();
    bindModeAwareAddButtonLabel();
});