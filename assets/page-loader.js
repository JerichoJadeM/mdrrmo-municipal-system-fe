window.PageLoader = (() => {
    const OVERLAY_ID = "globalPageLoader";

    function ensureLoader(options = {}) {
        let overlay = document.getElementById(OVERLAY_ID);
        if (overlay) {
            updateText(options.text);
            return overlay;
        }

        overlay = document.createElement("div");
        overlay.id = OVERLAY_ID;
        overlay.className = "page-loader-overlay hidden";
        overlay.innerHTML = `
            <div class="page-loader-card" role="status" aria-live="polite" aria-label="Page loading">
                <div class="page-loader-spinner"></div>
                <div class="page-loader-text">${escapeHtml(options.text || "Loading...")}</div>
            </div>
        `;

        document.body.appendChild(overlay);
        return overlay;
    }

    function show(options = {}) {
        const overlay = ensureLoader(options);
        updateText(options.text || "Loading...");
        overlay.classList.remove("hidden");
        document.body.classList.add("page-loading");
    }

    function hide() {
        const overlay = document.getElementById(OVERLAY_ID);
        if (!overlay) return;

        overlay.classList.add("hidden");
        document.body.classList.remove("page-loading");
    }

    function updateText(text) {
        const label = document.querySelector(`#${OVERLAY_ID} .page-loader-text`);
        if (label) {
            label.textContent = text || "Loading...";
        }
    }

    async function wrap(asyncFn, options = {}) {
        show(options);
        try {
            return await asyncFn();
        } finally {
            hide();
        }
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    return {
        ensureLoader,
        show,
        hide,
        updateText,
        wrap
    };
})();