// Interactive Leaflet-based location picker for the Incident Create/Edit form.
// Separate from the existing SITREP map and does not affect Calamity map behavior.

const INCIDENT_MAP_DEFAULT_CENTER = { lat: 11.4167, lng: 123.1167 }; // Batad, Iloilo
const INCIDENT_MAP_DEFAULT_ZOOM = 13;
const INCIDENT_MAP_PIN_ZOOM = 17;
const INCIDENT_BARANGAY_FOCUS_ZOOM = 15;

// Center coordinates for each of Batad, Iloilo's 24 barangays (sourced from OpenStreetMap).
// Keys are normalized (trimmed, uppercased) barangay names — see normalizeIncidentBarangayName().
// Quiazan Florete / Quiazan Lopez have no public geocoded data; values are best-effort estimates
// based on neighboring barangays and should be refined if more precise survey data becomes available.
const INCIDENT_BARANGAY_CENTERS = {
    "ALAPASCO": { lat: 11.3830, lng: 123.0572 },
    "ALINSOLONG": { lat: 11.4016, lng: 123.1437 },
    "BANBAN": { lat: 11.4097, lng: 123.1377 },
    "BATAD VIEJO": { lat: 11.4246, lng: 123.1091 },
    "BINON-AN": { lat: 11.3937, lng: 123.1433 },
    "BOLHOG": { lat: 11.4186, lng: 123.1014 },
    "BULAK NORTE": { lat: 11.4040, lng: 123.0808 },
    "BULAK SUR": { lat: 11.3929, lng: 123.0826 },
    "CABAGOHAN": { lat: 11.3992, lng: 123.1113 },
    "CALANGAG": { lat: 11.4096, lng: 123.1011 },
    "CAW-I": { lat: 11.3896, lng: 123.1066 },
    "DRANCALAN": { lat: 11.4225, lng: 123.0944 },
    "EMBARCADERO": { lat: 11.4175, lng: 123.1269 },
    "HAMOD": { lat: 11.4113, lng: 123.1139 },
    "MALICO": { lat: 11.4343, lng: 123.0950 },
    "NANGKA": { lat: 11.4007, lng: 123.0619 },
    "PASAYAN": { lat: 11.3980, lng: 123.0916 },
    "POBLACION": { lat: 11.4169, lng: 123.1108 },
    "QUIAZAN FLORETE": { lat: 11.3930, lng: 123.1420 }, // estimated, see note above
    "QUIAZAN LOPEZ": { lat: 11.3980, lng: 123.1380 }, // estimated, see note above
    "SALONG": { lat: 11.4088, lng: 123.1239 },
    "SANTA ANA": { lat: 11.4388, lng: 123.1040 },
    "TANAO": { lat: 11.3835, lng: 123.1416 },
    "TAPI-AN": { lat: 11.3881, lng: 123.1286 }
};

let incidentLocationMapInstance = null;
let incidentLocationMarker = null;
let incidentLocationCoords = null; // { latitude, longitude } | null

function normalizeIncidentBarangayName(name) {
    return String(name || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function initIncidentLocationMap() {
    if (incidentLocationMapInstance || typeof L === "undefined") return;

    const container = document.getElementById("incidentLocationMap");
    if (!container) return;

    incidentLocationMapInstance = L.map(container).setView(
        [INCIDENT_MAP_DEFAULT_CENTER.lat, INCIDENT_MAP_DEFAULT_CENTER.lng],
        INCIDENT_MAP_DEFAULT_ZOOM
    );

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(incidentLocationMapInstance);

    incidentLocationMapInstance.on("click", (event) => {
        setIncidentLocationCoords(event.latlng.lat, event.latlng.lng);
    });
}

function placeIncidentLocationMarker(lat, lng, draggable = true) {
    if (!incidentLocationMapInstance) return;

    if (incidentLocationMarker) {
        incidentLocationMarker.setLatLng([lat, lng]);
    } else {
        incidentLocationMarker = L.marker([lat, lng], { draggable }).addTo(incidentLocationMapInstance);
        incidentLocationMarker.on("dragend", () => {
            const position = incidentLocationMarker.getLatLng();
            setIncidentLocationCoords(position.lat, position.lng);
        });
    }
}

function updateIncidentLocationCoordsLabel() {
    const label = document.getElementById("incidentLocationCoordsLabel");
    if (!label) return;

    if (!incidentLocationCoords) {
        label.textContent = "No location selected yet.";
        return;
    }

    label.textContent = `Selected: ${incidentLocationCoords.latitude.toFixed(6)}, ${incidentLocationCoords.longitude.toFixed(6)}`;
}

function setIncidentLocationCoords(latitude, longitude) {
    incidentLocationCoords = { latitude: Number(latitude), longitude: Number(longitude) };
    placeIncidentLocationMarker(incidentLocationCoords.latitude, incidentLocationCoords.longitude);
    updateIncidentLocationCoordsLabel();
}

function clearIncidentLocationMarker() {
    if (incidentLocationMarker && incidentLocationMapInstance) {
        incidentLocationMapInstance.removeLayer(incidentLocationMarker);
    }
    incidentLocationMarker = null;
    incidentLocationCoords = null;
}

// Resets the picker for a blank "Add Incident" form: no marker, default Batad view.
function resetIncidentLocationPicker() {
    initIncidentLocationMap();
    clearIncidentLocationMarker();
    updateIncidentLocationCoordsLabel();

    if (incidentLocationMapInstance) {
        incidentLocationMapInstance.setView(
            [INCIDENT_MAP_DEFAULT_CENTER.lat, INCIDENT_MAP_DEFAULT_CENTER.lng],
            INCIDENT_MAP_DEFAULT_ZOOM
        );
        setTimeout(() => incidentLocationMapInstance.invalidateSize(), 0);
    }
}

// Loads the picker for "Edit Incident": marker at saved coordinates, or default view if none.
function loadIncidentLocationPicker(latitude, longitude) {
    initIncidentLocationMap();
    clearIncidentLocationMarker();

    const hasCoords = latitude != null && longitude != null && latitude !== "" && longitude !== "";

    if (hasCoords) {
        setIncidentLocationCoords(latitude, longitude);
        if (incidentLocationMapInstance) {
            incidentLocationMapInstance.setView([Number(latitude), Number(longitude)], INCIDENT_MAP_PIN_ZOOM);
        }
    } else {
        updateIncidentLocationCoordsLabel();
        if (incidentLocationMapInstance) {
            incidentLocationMapInstance.setView(
                [INCIDENT_MAP_DEFAULT_CENTER.lat, INCIDENT_MAP_DEFAULT_CENTER.lng],
                INCIDENT_MAP_DEFAULT_ZOOM
            );
        }
    }

    if (incidentLocationMapInstance) {
        setTimeout(() => incidentLocationMapInstance.invalidateSize(), 0);
    }
}

function getIncidentLocationCoords() {
    return incidentLocationCoords
        ? { latitude: incidentLocationCoords.latitude, longitude: incidentLocationCoords.longitude }
        : { latitude: null, longitude: null };
}

// Called when the user changes the Incident Barangay selection: recenters the map on that
// Barangay for navigation only. It does NOT save the Barangay center as the Incident location —
// the exact coordinates are only captured once the user clicks the map or drags the marker.
function focusIncidentMapOnBarangay(barangayName) {
    initIncidentLocationMap();
    if (!incidentLocationMapInstance) return;

    const center = INCIDENT_BARANGAY_CENTERS[normalizeIncidentBarangayName(barangayName)];
    if (!center) return;

    clearIncidentLocationMarker();
    incidentLocationCoords = null;

    incidentLocationMapInstance.setView([center.lat, center.lng], INCIDENT_BARANGAY_FOCUS_ZOOM);

    const label = document.getElementById("incidentLocationCoordsLabel");
    if (label) {
        label.textContent = `Map centered on ${barangayName}. Click the exact incident location.`;
    }

    setTimeout(() => incidentLocationMapInstance.invalidateSize(), 0);
}
