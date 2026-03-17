// let currentMapSelection = null;

// function initOperationsMap() {
//     resetOperationsMap();
// }

// function resetOperationsMap() {
//     currentMapSelection = null;

//     const title = document.getElementById("operationsMapTitle");
//     const subtitle = document.getElementById("operationsMapSubtitle");
//     const frame = document.getElementById("operationsMapFrame");
//     const empty = document.getElementById("operationsMapEmpty");
//     const details = document.getElementById("operationsMapDetails");

//     if (title) title.textContent = "Live Map";
//     if (subtitle) subtitle.textContent = "No active selection";
//     if (details) {
//         details.innerHTML = `
//             <div class="operations-map-detail-item"><strong>Type</strong><span>-</span></div>
//             <div class="operations-map-detail-item"><strong>Location</strong><span>-</span></div>
//             <div class="operations-map-detail-item"><strong>Status</strong><span>-</span></div>
//         `;
//     }
//     if (empty) empty.classList.remove("hidden");
//     if (frame) {
//         frame.classList.add("hidden");
//         frame.removeAttribute("src");
//     }
// }

// function renderSelectedOperationMap(type, data) {
//     if (!type || !data) {
//         resetOperationsMap();
//         return;
//     }

//     currentMapSelection = { type, data };

//     const title = document.getElementById("operationsMapTitle");
//     const subtitle = document.getElementById("operationsMapSubtitle");
//     const frame = document.getElementById("operationsMapFrame");
//     const empty = document.getElementById("operationsMapEmpty");
//     const details = document.getElementById("operationsMapDetails");

//     if (!title || !subtitle || !frame || !empty || !details) return;

//     const label = type === "INCIDENT"
//         ? (data.type || "Incident")
//         : (data.type || data.calamityName || "Calamity");

//     const locationLabel = getOperationMapLocationLabel(type, data);
//     const mapUrl = buildOperationMapUrl(data, locationLabel);

//     title.textContent = `${label} Map`;
//     subtitle.textContent = type === "INCIDENT"
//         ? "Focused on the selected incident"
//         : "Focused on the selected calamity area";

//     details.innerHTML = `
//         <div class="operations-map-detail-item"><strong>Type</strong><span>${escapeHtml(label)}</span></div>
//         <div class="operations-map-detail-item"><strong>Location</strong><span>${escapeHtml(locationLabel || "-")}</span></div>
//         <div class="operations-map-detail-item"><strong>Status</strong><span>${escapeHtml(data.status || "-")}</span></div>
//     `;

//     if (mapUrl) {
//         frame.src = mapUrl;
//         frame.classList.remove("hidden");
//         empty.classList.add("hidden");
//         return;
//     }

//     frame.classList.add("hidden");
//     frame.removeAttribute("src");
//     empty.classList.remove("hidden");
// }

// function getOperationMapLocationLabel(type, data) {
//     if (type === "INCIDENT") {
//         return [data.barangay, data.municipality, data.province, "Philippines"].filter(Boolean).join(", ");
//     }

//     const areaNames = Array.isArray(data.affectedBarangayNames) ? data.affectedBarangayNames.filter(Boolean) : [];
//     const primary = data.primaryBarangayName || data.barangay;
//     const area = areaNames.length ? areaNames.join(", ") : primary;

//     return [area, data.municipality, data.province, "Philippines"].filter(Boolean).join(", ");
// }

// function buildOperationMapUrl(data, locationLabel) {
//     const lat = firstDefinedNumber(data.latitude, data.lat, data.locationLat, data.locationLatitude, data.centerLatitude, data.primaryLatitude);
//     const lng = firstDefinedNumber(data.longitude, data.lng, data.lon, data.locationLng, data.locationLongitude, data.centerLongitude, data.primaryLongitude);

//     if (lat !== null && lng !== null) {
//         return `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
//     }

//     if (!locationLabel) return "";

//     return `https://maps.google.com/maps?q=${encodeURIComponent(locationLabel)}&z=14&output=embed`;
// }

// function firstDefinedNumber(...values) {
//     for (const value of values) {
//         if (value === null || value === undefined || value === "") continue;
//         const parsed = Number(value);
//         if (!Number.isNaN(parsed)) return parsed;
//     }
//     return null;
// }


// new 
function getCalamityMapLabel(calamity) {
    const areaType = String(calamity?.affectedAreaType || "").toUpperCase();
    const primary = calamity?.primaryBarangayName || calamity?.barangay || "";
    const affected = Array.isArray(calamity?.affectedBarangayNames) ? calamity.affectedBarangayNames : [];

    if (areaType === "MUNICIPALITY") return "Batad, Iloilo";
    if (areaType === "MULTI_BARANGAY") {
        if (primary) return `${primary}, Batad, Iloilo`;
        if (affected.length) return `${affected[0]}, Batad, Iloilo`;
        return "Batad, Iloilo";
    }
    return `${primary || "Batad"}, Iloilo`;
}

function updateOperationsMapSelection(type, data) {
    const frame = document.getElementById("operationsMapFrame");
    const empty = document.getElementById("operationsMapEmpty");
    const title = document.getElementById("operationsMapTitle");
    const subtitle = document.getElementById("operationsMapSubtitle");
    const details = document.getElementById("operationsMapDetails");

    if (!frame || !empty || !title || !subtitle || !details) return;

    const isIncident = type === "INCIDENT";
    const mapLabel = isIncident
        ? `${data.barangay || "Batad"}, Iloilo`
        : getCalamityMapLabel(data);

    title.textContent = isIncident ? "Incident Map" : "Calamity Area Map";
    subtitle.textContent = isIncident
        ? (data.barangay || "Selected incident location")
        : (String(data?.affectedAreaType || "").toUpperCase() === "MULTI_BARANGAY"
            ? `${(data?.affectedBarangayNames || []).length || 0} affected barangays`
            : getSafeCalamityArea(data));

    details.innerHTML = `
        <div class="operations-map-detail-item"><strong>Type</strong><span>${escapeHtml(type)}</span></div>
        <div class="operations-map-detail-item"><strong>Location</strong><span>${escapeHtml(mapLabel)}</span></div>
        <div class="operations-map-detail-item"><strong>Status</strong><span>${escapeHtml(data.status || "-")}</span></div>
    `;

    frame.src = `https://www.google.com/maps?q=${encodeURIComponent(mapLabel)}&output=embed`;
    frame.classList.remove("hidden");
    empty.classList.add("hidden");
}

function resetOperationsMap() {
    const frame = document.getElementById("operationsMapFrame");
    const empty = document.getElementById("operationsMapEmpty");
    const title = document.getElementById("operationsMapTitle");
    const subtitle = document.getElementById("operationsMapSubtitle");
    const details = document.getElementById("operationsMapDetails");

    if (!frame || !empty || !title || !subtitle || !details) return;

    title.textContent = "Live Map";
    subtitle.textContent = "No active selection";
    details.innerHTML = `
        <div class="operations-map-detail-item"><strong>Type</strong><span>-</span></div>
        <div class="operations-map-detail-item"><strong>Location</strong><span>-</span></div>
        <div class="operations-map-detail-item"><strong>Status</strong><span>-</span></div>
    `;

    frame.src = "";
    frame.classList.add("hidden");
    empty.classList.remove("hidden");
}