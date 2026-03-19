window.loadEvacuationCentersSection = async function () {
    try {
        const params = new URLSearchParams();

        const keyword = document.getElementById("centerSearchInput")?.value?.trim();
        const status = document.getElementById("centerStatusFilter")?.value?.trim();
        const usage = document.getElementById("centerUsageFilter")?.value?.trim();

        if (keyword) params.append("keyword", keyword);
        if (status) params.append("status", status);
        if (usage) params.append("usage", usage);

        const query = params.toString();
        const centers = await apiGet(`/evacuation-centers/resources-view${query ? `?${query}` : ""}`);
        renderEvacuationCenters(centers);
    } catch (error) {
        console.error("Failed to load evacuation centers", error);
        document.getElementById("evacuationCenterContainer").innerHTML =
            `<div class="error-state">Failed to load evacuation centers.</div>`;
    }
};

function renderEvacuationCenters(centers) {
    const container = document.getElementById("evacuationCenterContainer");

    if (!centers || !centers.length) {
        container.innerHTML = `<div class="empty-state">No evacuation centers found.</div>`;
        return;
    }

    container.innerHTML = `
        <table class="data-table evacuation-table">
            <thead>
                <tr>
                    <th>Center</th>
                    <th>Barangay</th>
                    <th>Capacity</th>
                    <th>Current Evacuees</th>
                    <th>Available Slots</th>
                    <th>Occupancy</th>
                    <th>Usage</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th>Coordinates</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${centers.map(center => `
                    <tr>
                        <td>${escapeHtml(center.name)}</td>
                        <td>${escapeHtml(center.barangayName || "-")}</td>
                        <td>${formatNumber(center.capacity)}</td>
                        <td>${formatNumber(center.currentEvacuees)}</td>
                        <td>${formatNumber(center.availableSlots)}</td>
                        <td>${formatNumber(center.occupancyRate)}%</td>
                        <td>
                            <span class="status-badge ${stockBadgeClass(center.capacityStatus)}">
                                ${escapeHtml(center.capacityStatus || "-")}
                            </span>
                        </td>
                        <td>
                            <span class="status-badge ${stockBadgeClass(center.status)}">
                                ${escapeHtml(center.status || "-")}
                            </span>
                        </td>
                        <td>${escapeHtml(center.locationDetails || "-")}</td>
                        <td>${center.latitude != null && center.longitude != null ? `${center.latitude}, ${center.longitude}` : "-"}</td>
                        <td>
                            <div class="card-actions">
                                ${canManageCenters() ? `
                                    <button class="btn btn-sm btn-secondary" data-center-edit-id="${center.id}">
                                        Edit
                                    </button>
                                ` : ""}
                                ${center.latitude != null && center.longitude != null ? `
                                    <button class="btn btn-sm btn-primary" data-center-map-id="${center.id}">
                                        Show on Map
                                    </button>
                                ` : ""}
                            </div>
                        </td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;

    container.querySelectorAll("[data-center-edit-id]").forEach(btn => {
        btn.addEventListener("click", () => {
            const center = centers.find(row => String(row.id) === btn.dataset.centerEditId);
            if (center) {
                openEvacuationCenterEditModal(center);
            }
        });
    });

    container.querySelectorAll("[data-center-map-id]").forEach(btn => {
        btn.addEventListener("click", () => {
            const center = centers.find(row => String(row.id) === btn.dataset.centerMapId);
            if (center?.latitude != null && center?.longitude != null) {
                window.open(`https://www.google.com/maps?q=${center.latitude},${center.longitude}`, "_blank");
            }
        });
    });
}

window.openEvacuationCenterCreateModal = function () {
    if (!canManageCenters()) return;

    openEvacuationCenterFormModal({
        mode: "create",
        title: "Add Evacuation Center",
        submitLabel: "Create Center"
    });
};

window.openEvacuationCenterEditModal = function (center) {
    if (!canManageCenters()) return;

    openEvacuationCenterFormModal({
        mode: "edit",
        title: "Edit Evacuation Center",
        submitLabel: "Save Changes",
        center
    });
};

async function openEvacuationCenterFormModal({ mode, title, submitLabel, center = null }) {
    const barangayOptions = await loadBarangayOptions();

    openResourcesModal({
        title,
        bodyHtml: `
            <form id="evacuationCenterForm" class="form-grid">
                <div class="form-group">
                    <label>Name</label>
                    <input type="text" name="name" value="${escapeHtml(center?.name || "")}" required>
                </div>

                <div class="form-group searchable-group">
                    <label>Barangay</label>
                    <input type="text" id="centerBarangayInput" autocomplete="off" required>
                    <input type="hidden" id="centerBarangayIdInput">
                    <div class="searchable-dropdown" id="centerBarangayDropdown"></div>
                </div>

                <div class="form-group">
                    <label>Capacity</label>
                    <input type="number" name="capacity" min="0" value="${center?.capacity ?? 0}" required>
                </div>

                <div class="form-group">
                    <label>Status</label>
                    <select name="status">
                        <option value="ACTIVE" ${center?.status === "ACTIVE" ? "selected" : ""}>ACTIVE</option>
                        <option value="INACTIVE" ${center?.status === "INACTIVE" ? "selected" : ""}>INACTIVE</option>
                        <option value="MAINTENANCE" ${center?.status === "MAINTENANCE" ? "selected" : ""}>MAINTENANCE</option>
                    </select>
                </div>

                <div class="form-group full">
                    <label>Location Details</label>
                    <input type="text" name="locationDetails" value="${escapeHtml(center?.locationDetails || "")}">
                </div>

                <div class="form-group">
                    <label>Latitude</label>
                    <input type="number" step="0.0000001" name="latitude" value="${center?.latitude ?? ""}">
                </div>

                <div class="form-group">
                    <label>Longitude</label>
                    <input type="number" step="0.0000001" name="longitude" value="${center?.longitude ?? ""}">
                </div>
            </form>
        `,
        footerHtml: `
            <button class="btn btn-secondary" id="cancelCenterFormBtn">Cancel</button>
            <button class="btn btn-primary" id="submitEvacuationCenterFormBtn">${submitLabel}</button>
        `
    });

    bindSearchableDropdown({
        inputId: "centerBarangayInput",
        dropdownId: "centerBarangayDropdown",
        hiddenInputId: "centerBarangayIdInput",
        options: barangayOptions,
        getLabel: option => option.label,
        getValue: option => option.value,
        initialValue: center?.barangayName || "",
        initialHiddenValue: center?.barangayId || "",
        onSelect: selected => {
            document.getElementById("centerBarangayInput").value = selected.label;
            document.getElementById("centerBarangayIdInput").value = selected.value;
        }
    });

    document.getElementById("cancelCenterFormBtn")?.addEventListener("click", closeResourcesModal);

    document.getElementById("submitEvacuationCenterFormBtn")?.addEventListener("click", async () => {
        const form = document.getElementById("evacuationCenterForm");
        const formData = new FormData(form);

        const latitudeRaw = formData.get("latitude")?.toString().trim();
        const longitudeRaw = formData.get("longitude")?.toString().trim();

        const payload = {
            name: formData.get("name")?.toString().trim(),
            barangayId: Number(document.getElementById("centerBarangayIdInput")?.value),
            capacity: Number(formData.get("capacity") || 0),
            locationDetails: formData.get("locationDetails")?.toString().trim(),
            latitude: latitudeRaw ? Number(latitudeRaw) : null,
            longitude: longitudeRaw ? Number(longitudeRaw) : null,
            status: formData.get("status")?.toString().trim()
        };

        try {
            if (!payload.barangayId) {
                alert("Please select a barangay from the dropdown.");
                return;
            }

            if (mode === "create") {
                await apiSend("/evacuation-centers", "POST", payload);
            } else {
                await apiSend(`/evacuation-centers/${center.id}`, "PUT", payload);
            }

            closeResourcesModal();
            await refreshResourcesHeader();
            await window.loadEvacuationCentersSection();
        } catch (error) {
            console.error("Failed to save evacuation center", error);
            alert("Failed to save evacuation center.");
        }
    });
}