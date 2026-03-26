function buildPageNumbers(totalPages, currentPage) {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages = [1];

    if (currentPage > 3) {
        pages.push("...");
    }

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
        pages.push(i);
    }

    if (currentPage < totalPages - 2) {
        pages.push("...");
    }

    pages.push(totalPages);

    return pages;
}

function createPaginationController(config) {
    const state = {
        page: config.initialPage || 1,
        pageSize: config.initialPageSize || 5,
        rows: Array.isArray(config.rows) ? config.rows : []
    };

    function setRows(rows) {
        state.rows = Array.isArray(rows) ? rows : [];
        const totalPages = getTotalPages();
        if (state.page > totalPages) {
            state.page = totalPages;
        }
        if (state.page < 1) {
            state.page = 1;
        }
        render();
    }

    function setPage(page) {
        const totalPages = getTotalPages();
        if (!page || page < 1 || page > totalPages) return;
        state.page = page;
        render();
    }

    function setPageSize(size) {
        state.pageSize = Number(size) || 5;
        state.page = 1;
        render();
    }

    function getTotalPages() {
        return Math.max(1, Math.ceil(state.rows.length / state.pageSize));
    }

    function getPageSlice() {
        const total = state.rows.length;
        const startIndex = (state.page - 1) * state.pageSize;
        const endIndex = Math.min(startIndex + state.pageSize, total);

        return {
            total,
            startIndex,
            endIndex,
            pageRows: state.rows.slice(startIndex, endIndex)
        };
    }

    function renderInfo(total, startIndex, endIndex) {
        const info = document.getElementById(config.infoId);
        if (!info) return;

        const itemLabel = config.itemLabel || "items";

        if (total === 0) {
            info.textContent = `Showing 0 to 0 of 0 ${itemLabel}`;
            return;
        }

        info.textContent = `Showing ${startIndex + 1} to ${endIndex} of ${total} ${itemLabel}`;
    }

    function renderControls(total) {
        const controls = document.getElementById(config.controlsId);
        if (!controls) return;

        if (total === 0) {
            controls.innerHTML = "";
            return;
        }

        const totalPages = getTotalPages();
        const currentPage = state.page;
        const pages = buildPageNumbers(totalPages, currentPage);

        const buttonClass = config.buttonClass || "app-page-btn";
        const ellipsisClass = config.ellipsisClass || buttonClass;
        const prevLabel = config.prevLabel || "Prev";
        const nextLabel = config.nextLabel || "Next";

        controls.innerHTML = `
            <button class="${buttonClass}" ${currentPage === 1 ? "disabled" : ""} data-page="${currentPage - 1}">
                ${prevLabel}
            </button>

            ${pages.map(page =>
                page === "..."
                    ? `<span class="${ellipsisClass}" style="pointer-events:none; opacity:0.7;">...</span>`
                    : `<button class="${buttonClass} ${page === currentPage ? "active" : ""}" data-page="${page}">${page}</button>`
            ).join("")}

            <button class="${buttonClass}" ${currentPage === totalPages ? "disabled" : ""} data-page="${currentPage + 1}">
                ${nextLabel}
            </button>
        `;

        controls.querySelectorAll("[data-page]").forEach(button => {
            button.addEventListener("click", () => {
                const page = Number(button.dataset.page);
                setPage(page);
            });
        });
    }

    function render() {
        const { total, startIndex, endIndex, pageRows } = getPageSlice();

        if (typeof config.onRenderRows === "function") {
            config.onRenderRows(pageRows, {
                total,
                startIndex,
                endIndex,
                currentPage: state.page,
                pageSize: state.pageSize,
                totalPages: getTotalPages()
            });
        }

        renderInfo(total, startIndex, endIndex);
        renderControls(total);
    }

    function bindPageSizeSelect() {
        if (!config.pageSizeSelectId) return;

        const select = document.getElementById(config.pageSizeSelectId);
        if (!select) return;

        select.value = String(state.pageSize);

        select.addEventListener("change", (event) => {
            setPageSize(event.target.value);
        });
    }

    bindPageSizeSelect();

    return {
        setRows,
        setPage,
        setPageSize,
        render,
        getState: () => ({ ...state })
    };
}