let actionConfirmState = {
    onConfirm: null,
    onCancel: null,
    isProcessing: false
};

function getActionConfirmElements() {
    return {
        modal: document.getElementById("actionConfirmModal"),
        kicker: document.getElementById("actionConfirmKicker"),
        title: document.getElementById("actionConfirmTitle"),
        iconWrap: document.getElementById("actionConfirmIconWrap"),
        icon: document.getElementById("actionConfirmIcon"),
        message: document.getElementById("actionConfirmMessage"),
        submessage: document.getElementById("actionConfirmSubmessage"),
        note: document.getElementById("actionConfirmNote"),
        submitBtn: document.getElementById("actionConfirmSubmitBtn"),
        submitText: document.getElementById("actionConfirmSubmitText"),
        cancelBtn: document.getElementById("actionConfirmCancelBtn"),
        closeBtn: document.getElementById("actionConfirmCloseBtn")
    };
}

function normalizeActionVariant(variant) {
    const allowed = ["neutral", "save", "update", "delete", "warning"];
    return allowed.includes(variant) ? variant : "neutral";
}

function getActionVariantMeta(variant) {
    const map = {
        neutral: {
            kicker: "Confirmation",
            icon: "fas fa-circle-info",
            submitClass: "btn btn-primary"
        },
        save: {
            kicker: "Save Changes",
            icon: "fas fa-floppy-disk",
            submitClass: "btn btn-success"
        },
        update: {
            kicker: "Update Record",
            icon: "fas fa-pen-to-square",
            submitClass: "btn btn-primary"
        },
        delete: {
            kicker: "Delete Record",
            icon: "fas fa-trash-alt",
            submitClass: "btn btn-danger"
        },
        warning: {
            kicker: "Warning",
            icon: "fas fa-triangle-exclamation",
            submitClass: "btn btn-warning"
        }
    };

    return map[variant] || map.neutral;
}

function setActionConfirmProcessing(isProcessing, processingText = "Processing...") {
    const { modal, submitBtn, submitText, cancelBtn, closeBtn } = getActionConfirmElements();
    if (!modal || !submitBtn || !submitText || !cancelBtn || !closeBtn) return;

    actionConfirmState.isProcessing = isProcessing;
    modal.classList.toggle("is-processing", isProcessing);

    submitBtn.disabled = isProcessing;
    cancelBtn.disabled = isProcessing;
    closeBtn.disabled = isProcessing;

    if (isProcessing) {
        submitBtn.dataset.originalText = submitText.textContent || "Confirm";
        submitText.textContent = processingText;
    } else {
        submitText.textContent = submitBtn.dataset.originalText || "Confirm";
    }
}

function closeActionConfirmModal(options = {}) {
    const { skipCancelCallback = false } = options;

    if (actionConfirmState.isProcessing) return;

    if (!skipCancelCallback && typeof actionConfirmState.onCancel === "function") {
        actionConfirmState.onCancel();
    }

    actionConfirmState.onConfirm = null;
    actionConfirmState.onCancel = null;

    if (typeof closeModal === "function") {
        closeModal("actionConfirmModal");
    } else {
        const { modal } = getActionConfirmElements();
        modal?.classList.remove("active");
        modal?.setAttribute("aria-hidden", "true");
    }
}

function openActionConfirmModal(config = {}) {
    const {
        variant = "neutral",
        title = "Confirm Action",
        message = "Are you sure you want to continue?",
        submessage = "Please review this action before proceeding.",
        note = "",
        confirmText = "Confirm",
        cancelText = "Cancel",
        processingText = "Processing...",
        onConfirm = null,
        onCancel = null,
        allowHtmlMessage = false
    } = config;

    const els = getActionConfirmElements();
    if (!els.modal) {
        console.error("actionConfirmModal is missing from the page.");
        return;
    }

    const safeVariant = normalizeActionVariant(variant);
    const meta = getActionVariantMeta(safeVariant);

    actionConfirmState.onConfirm = onConfirm;
    actionConfirmState.onCancel = onCancel;

    els.kicker.textContent = config.kicker || meta.kicker;
    els.title.textContent = title;

    els.iconWrap.className = `app-action-icon ${safeVariant}`;
    els.icon.className = meta.icon;

    if (allowHtmlMessage) {
        els.message.innerHTML = message;
        els.submessage.innerHTML = submessage || "";
    } else {
        els.message.textContent = message;
        els.submessage.textContent = submessage || "";
    }

    els.note.textContent = note || "";
    els.note.classList.toggle("hidden", !note);

    els.submitText.textContent = confirmText;
    els.submitBtn.dataset.originalText = confirmText;
    els.submitBtn.dataset.processingText = processingText;
    els.submitBtn.className = meta.submitClass;

    els.cancelBtn.textContent = cancelText;

    setActionConfirmProcessing(false);

    if (typeof openModal === "function") {
        openModal("actionConfirmModal");
    } else {
        els.modal.classList.add("active");
        els.modal.setAttribute("aria-hidden", "false");
    }
}

async function handleActionConfirmSubmit() {
    if (actionConfirmState.isProcessing) return;
    if (typeof actionConfirmState.onConfirm !== "function") {
        closeActionConfirmModal({ skipCancelCallback: true });
        return;
    }

    const { submitBtn } = getActionConfirmElements();
    const processingText = submitBtn?.dataset.processingText || "Processing...";

    try {
        setActionConfirmProcessing(true, processingText);
        await actionConfirmState.onConfirm();
        setActionConfirmProcessing(false);
        closeActionConfirmModal({ skipCancelCallback: true });
    } catch (error) {
        setActionConfirmProcessing(false);
        console.error("Action confirmation failed:", error);
        throw error;
    }
}

function initActionConfirmModal() {
    const els = getActionConfirmElements();
    if (!els.modal) return;

    els.closeBtn?.addEventListener("click", () => closeActionConfirmModal());
    els.cancelBtn?.addEventListener("click", () => closeActionConfirmModal());
    els.submitBtn?.addEventListener("click", handleActionConfirmSubmit);
}

/* Optional convenience wrappers */
function confirmDeleteAction(config = {}) {
    openActionConfirmModal({
        variant: "delete",
        title: config.title || "Delete Record",
        message: config.message || "Are you sure you want to delete this record?",
        submessage: config.submessage || "This action cannot be undone.",
        note: config.note || "",
        confirmText: config.confirmText || "Delete",
        cancelText: config.cancelText || "Cancel",
        processingText: config.processingText || "Deleting...",
        onConfirm: config.onConfirm,
        onCancel: config.onCancel
    });
}

function confirmSaveAction(config = {}) {
    openActionConfirmModal({
        variant: "save",
        title: config.title || "Save Record",
        message: config.message || "Do you want to save this record?",
        submessage: config.submessage || "Please confirm before continuing.",
        note: config.note || "",
        confirmText: config.confirmText || "Save",
        cancelText: config.cancelText || "Cancel",
        processingText: config.processingText || "Saving...",
        onConfirm: config.onConfirm,
        onCancel: config.onCancel
    });
}

function confirmUpdateAction(config = {}) {
    openActionConfirmModal({
        variant: "update",
        title: config.title || "Update Record",
        message: config.message || "Do you want to apply these updates?",
        submessage: config.submessage || "The selected record will be updated.",
        note: config.note || "",
        confirmText: config.confirmText || "Update",
        cancelText: config.cancelText || "Cancel",
        processingText: config.processingText || "Updating...",
        onConfirm: config.onConfirm,
        onCancel: config.onCancel
    });
}