window.loadReliefSection = async function () {
    try {
        const params = new URLSearchParams({
            keyword: document.getElementById("reliefSearchInput")?.value || "",
            category: document.getElementById("reliefCategoryFilter")?.value || "",
            stockStatus: document.getElementById("reliefStatusFilter")?.value || ""
        });

        const data = await apiGet(`/inventory/resources-view?${params.toString()}`);
        const reliefData = (data || []).filter(item => {
            const category = (item.category || "").toUpperCase();
            return ["FOOD", "RELIEF", "WATER", "HYGIENE", "MEDICAL"].includes(category);
        });

        renderReliefTable(reliefData);
    } catch (error) {
        console.error("Failed to load relief section", error);
        document.getElementById("reliefTableContainer").innerHTML =
            `<div class="error-state">Failed to load relief goods.</div>`;
    }
};

function renderReliefTable(items) {
    const container = document.getElementById("reliefTableContainer");

    if (!items || !items.length) {
        container.innerHTML = `<div class="empty-state">No relief goods found.</div>`;
        return;
    }

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Available</th>
                    <th>Total</th>
                    <th>Unit</th>
                    <th>Critical</th>
                    <th>Status</th>
                    <th>Location</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(item => `
                    <tr>
                        <td>${escapeHtml(item.name)}</td>
                        <td>${escapeHtml(item.category || "-")}</td>
                        <td>${formatNumber(item.availableQuantity)}</td>
                        <td>${formatNumber(item.totalQuantity)}</td>
                        <td>${escapeHtml(item.unit || "-")}</td>
                        <td>${item.criticalItem ? "Yes" : "No"}</td>
                        <td><span class="status-badge ${stockBadgeClass(item.stockStatus)}">${escapeHtml(item.stockStatus || "-")}</span></td>
                        <td>${escapeHtml(item.location || "-")}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}