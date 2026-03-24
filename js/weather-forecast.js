const API_BASE = "http://localhost:8080/api";

const weatherState = {
    rawData: null,
    filteredBarangays: [],
    barangayPage: 1,
    barangayPageSize: 5
};

document.addEventListener("DOMContentLoaded", async () => {
    bindWeatherEvents();
    await loadMunicipalForecast();
});

function bindWeatherEvents() {
    const refreshBtn = document.getElementById("refreshWeatherBtn");
    const barangaySearch = document.getElementById("barangaySearch");
    const barangayPageSize = document.getElementById("barangayPageSize");

    if (refreshBtn) {
        refreshBtn.addEventListener("click", loadMunicipalForecast);
    }

    if (barangaySearch) {
        barangaySearch.addEventListener("input", (event) => {
            const keyword = event.target.value;
            weatherState.barangayPage = 1;
            filterBarangayRisks(keyword);
            renderBarangaySearchResults(keyword);
        });

        barangaySearch.addEventListener("focus", (event) => {
            renderBarangaySearchResults(event.target.value);
        });
    }

    if (barangayPageSize) {
        barangayPageSize.addEventListener("change", (event) => {
            weatherState.barangayPageSize = Number(event.target.value) || 5;
            weatherState.barangayPage = 1;
            renderBarangayRiskTable(weatherState.filteredBarangays);
        });
    }

    document.addEventListener("click", (event) => {
        const searchWrap = document.querySelector(".barangay-search-box");
        const results = document.getElementById("barangaySearchResults");

        if (!searchWrap || !results) return;

        if (!searchWrap.contains(event.target)) {
            results.classList.remove("show");
        }
    });
}

async function loadMunicipalForecast() {
    try {
        setLoadingState();

        const response = await fetchWithAuth(`${API_BASE}/weather-forecast/municipal`);

        const data = await response.json();

        if (!response.ok) {
            throw new Error(extractErrorMessage(data));
        }

        weatherState.rawData = data;
        weatherState.filteredBarangays = Array.isArray(data.barangayRisks)
            ? [...data.barangayRisks]
            : [];

        weatherState.barangayPage = 1;
        
        renderWeatherPage(data);
        showWeatherMessage("Weather forecast loaded successfully.", "success");
    } catch (error) {
        console.error("Failed to load municipal forecast:", error);
        renderWeatherError(error.message || "Failed to load weather forecast.");
        showWeatherMessage(error.message || "Failed to load weather forecast.", "error");
    }
}

function renderWeatherPage(data) {
    renderMeta(data);
    renderStats(data);
    renderSnapshot(data);
    renderSummary(data.summary || {});
    renderForecastCards(data.dailyForecasts || []);
    renderBarangayRiskTable(weatherState.filteredBarangays || []);
    renderAlerts(data.alerts || []);
}

function renderMeta(data) {
    setHTML("sourceMetaPill", `
        <i class="fas fa-satellite-dish"></i>
        Source: ${escapeHtml(data.source || weatherState.source)}
    `);

    setText(
        "lastUpdatedText",
        `Last updated: ${data.generatedAt ? formatDateTime(data.generatedAt) : "--"}`
    );
}

function renderStats(data) {
    const current = data.current || {};
    const summary = data.summary || {};

    setText("conditionStat", current.condition || "--");
    setText("rainfallOutlookStat", summary.rainfallOutlook || "--");
    setText("temperatureStat", formatTemperature(current.temperature));
    setText("overallRiskStat", summary.overallRiskLevel || "--");
}

function renderSnapshot(data) {
    const current = data.current || {};
    const summary = data.summary || {};

    setText("snapshotCondition", current.condition || "--");
    setText("snapshotRecommendation", summary.recommendation || "--");
    setText("snapshotRainfall", formatRainfall(current.rainfall));
    setText("snapshotTemperature", formatTemperature(current.temperature));
    setText("snapshotWindSpeed", formatWind(current.windSpeed));
    setText("snapshotHighRiskBarangays", String(summary.highRiskBarangays ?? 0));

    const badge = document.getElementById("overallRiskBadge");
    if (badge) {
        const risk = String(summary.overallRiskLevel || "neutral").toLowerCase();
        badge.className = `status-badge ${normalizeRiskClass(risk)}`;
        badge.textContent = summary.overallRiskLevel || "--";
    }
}

function renderSummary(summary) {
    setText("totalBarangaysValue", String(summary.totalBarangays ?? 0));
    setText("highRiskBarangaysValue", String(summary.highRiskBarangays ?? 0));
    setText("mediumRiskBarangaysValue", String(summary.mediumRiskBarangays ?? 0));
    setText("lowRiskBarangaysValue", String(summary.lowRiskBarangays ?? 0));
}

function renderForecastCards(rows) {
    const rail = document.getElementById("forecastCardRail");
    if (!rail) return;

    if (!Array.isArray(rows) || rows.length === 0) {
        rail.innerHTML = `<div class="empty-state-card">No forecast data available.</div>`;
        return;
    }

    rail.innerHTML = rows.map((row, index) => {
        const visual = getForecastVisual(row.condition);
        const isToday = index === 0;

        return `
            <article class="forecast-day-card ${visual.theme} ${isToday ? "forecast-day-card--today" : ""}">
                <div class="forecast-card-top">
                    <div class="forecast-card-date-group">
                        <span class="forecast-card-day">${escapeHtml(formatDayName(row.forecastDate))}</span>
                        <span class="forecast-card-date">${escapeHtml(formatShortDate(row.forecastDate))}</span>
                    </div>
                    <div class="forecast-card-icon ${visual.iconClass}">
                        <i class="${visual.icon}"></i>
                    </div>
                </div>

                <div class="forecast-card-badges">
                    ${isToday ? `<span class="forecast-today-badge">Today</span>` : ""}
                    <span class="forecast-risk-badge ${getForecastRiskBadgeClass(row.riskLevel)}">
                        ${escapeHtml(row.riskLevel || "--")}
                    </span>
                </div>

                <div class="forecast-card-condition">
                    ${escapeHtml(row.condition || "--")}
                </div>

                <div class="forecast-temp-row">
                    <div class="forecast-temp-box">
                        <span>Min Temp</span>
                        <strong>${escapeHtml(formatTemperature(row.minTemperature))}</strong>
                    </div>
                    <div class="forecast-temp-box">
                        <span>Max Temp</span>
                        <strong>${escapeHtml(formatTemperature(row.maxTemperature))}</strong>
                    </div>
                </div>

                <div class="forecast-metrics">
                    <div class="forecast-metric">
                        <span>Rainfall</span>
                        <strong>${escapeHtml(formatRainfall(row.rainfallMm))}</strong>
                    </div>
                    <div class="forecast-metric">
                        <span>Rain Chance</span>
                        <strong>${escapeHtml(formatPercent(row.rainfallProbability))}</strong>
                    </div>
                    <div class="forecast-metric">
                        <span>Wind</span>
                        <strong>${escapeHtml(formatWind(row.windSpeed))}</strong>
                    </div>
                    <div class="forecast-metric">
                        <span>Risk</span>
                        <strong>${escapeHtml(row.riskLevel || "--")}</strong>
                    </div>
                </div>

                <div class="forecast-advisory">
                    ${escapeHtml(row.advisory || "--")}
                </div>
            </article>
        `;
    }).join("");
}

function getForecastVisual(condition) {
    const value = String(condition || "").toLowerCase();

    if (value.includes("thunder")) {
        return {
            icon: "fas fa-bolt",
            theme: "forecast-theme-storm",
            iconClass: "forecast-icon-storm"
        };
    }

    if (value.includes("rain") || value.includes("shower") || value.includes("drizzle")) {
        return {
            icon: "fas fa-cloud-rain",
            theme: "forecast-theme-rain",
            iconClass: "forecast-icon-rain"
        };
    }

    if (value.includes("mostly sunny") || value.includes("sunny") || value.includes("clear")) {
        return {
            icon: "fas fa-sun",
            theme: "forecast-theme-sunny",
            iconClass: "forecast-icon-sunny"
        };
    }

    if (value.includes("partly") || value.includes("few clouds")) {
        return {
            icon: "fas fa-cloud-sun",
            theme: "forecast-theme-partly-cloudy",
            iconClass: "forecast-icon-partly-cloudy"
        };
    }

    if (value.includes("cloud")) {
        return {
            icon: "fas fa-cloud",
            theme: "forecast-theme-cloudy",
            iconClass: "forecast-icon-cloudy"
        };
    }

    return {
        icon: "fas fa-cloud-sun",
        theme: "forecast-theme-default",
        iconClass: "forecast-icon-default"
    };
}

function getForecastRiskBadgeClass(riskLevel) {
    const value = String(riskLevel || "").trim().toLowerCase();

    if (value === "low") return "forecast-risk-low";
    if (value === "medium") return "forecast-risk-medium";
    if (value === "moderate") return "forecast-risk-moderate";
    if (value === "high") return "forecast-risk-high";
    if (value === "severe") return "forecast-risk-severe";

    return "forecast-risk-neutral";
}

function formatDayName(value) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";

    return new Intl.DateTimeFormat("en-PH", {
        weekday: "short"
    }).format(date);
}

function formatShortDate(value) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return new Intl.DateTimeFormat("en-PH", {
        month: "short",
        day: "numeric"
    }).format(date);
}

function renderBarangayRiskTable(rows) {
    const tbody = document.getElementById("barangayRiskTableBody");
    if (!tbody) return;

    if (!Array.isArray(rows) || rows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">No barangay risk data available.</td>
            </tr>
        `;
        renderBarangayPagination(0, 0, 0);
        return;
    }

    const total = rows.length;
    const pageSize = weatherState.barangayPageSize;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    if (weatherState.barangayPage > totalPages) {
        weatherState.barangayPage = totalPages;
    }

    const startIndex = (weatherState.barangayPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, total);
    const pageRows = rows.slice(startIndex, endIndex);

    tbody.innerHTML = pageRows.map(row => `
        <tr>
            <td>${escapeHtml(row.barangayName || "--")}</td>
            <td>${renderFlag(row.floodProne)}</td>
            <td>${renderFlag(row.landslideProne)}</td>
            <td>${renderFlag(row.coastal)}</td>
            <td>
                <span class="risk-badge ${normalizeRiskClass(row.riskLevel)}">
                    ${escapeHtml(row.riskLevel || "--")}
                </span>
            </td>
            <td>${escapeHtml(row.reason || "--")}</td>
            <td>${escapeHtml(row.recommendation || "--")}</td>
        </tr>
    `).join("");

    renderBarangayPagination(startIndex + 1, endIndex, total);
}

function renderBarangayPagination(start, end, total) {
    const info = document.getElementById("barangayPaginationInfo");
    const controls = document.getElementById("barangayPaginationControls");

    if (info) {
        if (total === 0) {
            info.textContent = "Showing 0 to 0 of 0 barangays";
        } else {
            info.textContent = `Showing ${start} to ${end} of ${total} barangays`;
        }
    }

    if (!controls) return;

    if (total === 0) {
        controls.innerHTML = "";
        return;
    }

    const totalPages = Math.max(1, Math.ceil(total / weatherState.barangayPageSize));
    const currentPage = weatherState.barangayPage;

    const pages = buildBarangayPageNumbers(totalPages, currentPage);

    controls.innerHTML = `
        <button class="barangay-page-btn" ${currentPage === 1 ? "disabled" : ""} data-page="${currentPage - 1}">
            Prev
        </button>

        ${pages.map(page =>
            page === "..."
                ? `<span class="barangay-page-btn" style="pointer-events:none; opacity:0.7;">...</span>`
                : `<button class="barangay-page-btn ${page === currentPage ? "active" : ""}" data-page="${page}">${page}</button>`
        ).join("")}

        <button class="barangay-page-btn" ${currentPage === totalPages ? "disabled" : ""} data-page="${currentPage + 1}">
            Next
        </button>
    `;

    controls.querySelectorAll("[data-page]").forEach(button => {
        button.addEventListener("click", () => {
            const page = Number(button.dataset.page);
            if (!page || page < 1 || page > totalPages) return;

            weatherState.barangayPage = page;
            renderBarangayRiskTable(weatherState.filteredBarangays);
        });
    });
}

function buildBarangayPageNumbers(totalPages, currentPage) {
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

function renderAlerts(alerts) {
    const container = document.getElementById("alertsList");
    if (!container) return;

    if (!Array.isArray(alerts) || alerts.length === 0) {
        container.innerHTML = `<div class="empty-state-card">No weather alerts available.</div>`;
        return;
    }

    container.innerHTML = alerts.map(alert => `
        <div class="weather-alert-card">
            <div class="weather-alert-header">
                <h4 class="weather-alert-title">${escapeHtml(alert.title || "--")}</h4>
                <span class="risk-badge ${normalizeRiskClass(alert.severity)}">
                    ${escapeHtml(alert.severity || "--")}
                </span>
            </div>
            <div class="weather-alert-meta">
                ${escapeHtml(alert.affectedArea || "Batad, Iloilo")}
                ${alert.issuedAt ? ` • ${escapeHtml(formatDateTime(alert.issuedAt))}` : ""}
                ${alert.source ? ` • ${escapeHtml(alert.source)}` : ""}
            </div>
            <div class="weather-alert-message">
                ${escapeHtml(alert.message || "--")}
            </div>
        </div>
    `).join("");
}

function filterBarangayRisks(keyword) {
    const normalized = String(keyword || "").trim().toLowerCase();
    const all = Array.isArray(weatherState.rawData?.barangayRisks)
        ? weatherState.rawData.barangayRisks
        : [];

    weatherState.filteredBarangays = !normalized
        ? [...all]
        : all.filter(item =>
            String(item.barangayName || "").toLowerCase().includes(normalized)
        );

    weatherState.barangayPage = 1;
    renderBarangayRiskTable(weatherState.filteredBarangays);
}

function setLoadingState() {
    setText("conditionStat", "Loading...");
    setText("rainfallOutlookStat", "Loading...");
    setText("temperatureStat", "Loading...");
    setText("overallRiskStat", "Loading...");

    setText("snapshotCondition", "Loading...");
    setText("snapshotRecommendation", "Loading weather data...");
    setText("snapshotRainfall", "--");
    setText("snapshotTemperature", "--");
    setText("snapshotWindSpeed", "--");
    setText("snapshotHighRiskBarangays", "--");

    setText("totalBarangaysValue", "--");
    setText("highRiskBarangaysValue", "--");
    setText("mediumRiskBarangaysValue", "--");
    setText("lowRiskBarangaysValue", "--");

    setText("barangayPaginationInfo", "Showing 0 to 0 of 0 barangays");
    setHTML("barangayPaginationControls", "");

    setHTML("forecastCardRail", `<div class="empty-state-card">Loading forecast...</div>`);

    setHTML("barangayRiskTableBody", `
        <tr>
            <td colspan="7" class="empty-state">Loading barangay risk data...</td>
        </tr>
    `);

    setHTML("alertsList", `<div class="empty-state-card">Loading alerts...</div>`);

    const badge = document.getElementById("overallRiskBadge");
    if (badge) {
        badge.className = "status-badge neutral";
        badge.textContent = "Loading";
    }
}

function renderWeatherError(message) {
    setText("conditionStat", "Unavailable");
    setText("rainfallOutlookStat", "Unavailable");
    setText("temperatureStat", "--");
    setText("overallRiskStat", "Unavailable");
    setText("snapshotCondition", "Weather data unavailable");
    setText("snapshotRecommendation", message || "Unable to load forecast.");
    setText("snapshotRainfall", "--");
    setText("snapshotTemperature", "--");
    setText("snapshotWindSpeed", "--");
    setText("snapshotHighRiskBarangays", "--");

    setText("barangayPaginationInfo", "Showing 0 to 0 of 0 barangays");
    setHTML("barangayPaginationControls", "");

    setHTML("forecastCardRail", `
        <div class="empty-state-card">${escapeHtml(message || "Failed to load forecast data.")}</div>
    `);

    setHTML("barangayRiskTableBody", `
        <tr>
            <td colspan="7" class="empty-state">${escapeHtml(message || "Failed to load barangay risk data.")}</td>
        </tr>
    `);

    setHTML("alertsList", `
        <div class="empty-state-card">${escapeHtml(message || "Failed to load alerts.")}</div>
    `);

    const badge = document.getElementById("overallRiskBadge");
    if (badge) {
        badge.className = "status-badge neutral";
        badge.textContent = "Unavailable";
    }
}

async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem("jwtToken");
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    return fetch(url, {
        ...options,
        headers
    });
}

function extractErrorMessage(payload) {
    if (!payload) return "Request failed.";
    if (typeof payload === "string") return payload;
    if (payload.message) return payload.message;
    if (payload.error) return payload.error;
    return "Request failed.";
}

function normalizeRiskClass(value) {
    const risk = String(value || "").trim().toLowerCase();
    if (risk === "low") return "low";
    if (risk === "medium") return "medium";
    if (risk === "moderate") return "moderate";
    if (risk === "high") return "high";
    if (risk === "severe") return "severe";
    return "neutral";
}

function renderFlag(value) {
    const yes = Boolean(value);
    return `<span class="flag-badge ${yes ? "yes" : ""}">${yes ? "YES" : "NO"}</span>`;
}

function formatDate(value) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return new Intl.DateTimeFormat("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric"
    }).format(date);
}

function formatDateTime(value) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return new Intl.DateTimeFormat("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
}

function formatTemperature(value) {
    if (value === null || value === undefined || value === "") return "--";
    return `${Number(value).toFixed(1)} °C`;
}

function formatRainfall(value) {
    if (value === null || value === undefined || value === "") return "--";
    return `${Number(value).toFixed(1)} mm`;
}

function formatWind(value) {
    if (value === null || value === undefined || value === "") return "--";
    return `${Number(value).toFixed(1)} km/h`;
}

function formatPercent(value) {
    if (value === null || value === undefined || value === "") return "--";
    return `${Number(value).toFixed(0)}%`;
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? "--";
}

function setHTML(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = value;
}

function showWeatherMessage(message, type = "success") {
    const container = document.getElementById("weatherMessageContainer");
    if (!container) return;

    const div = document.createElement("div");
    div.className = `report-message ${type}`;
    div.textContent = message;

    container.appendChild(div);

    setTimeout(() => {
        div.remove();
    }, 3000);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderBarangaySearchResults(keyword = "") {
    const results = document.getElementById("barangaySearchResults");
    if (!results) return;

    const all = Array.isArray(weatherState.rawData?.barangayRisks)
        ? weatherState.rawData.barangayRisks
        : [];

    const normalized = String(keyword || "").trim().toLowerCase();

    const matches = !normalized
        ? all.slice(0, 8)
        : all
            .filter(item => String(item.barangayName || "").toLowerCase().includes(normalized))
            .slice(0, 8);

    if (matches.length === 0) {
        results.innerHTML = `<div class="barangay-search-empty">No matching barangays found.</div>`;
        results.classList.add("show");
        return;
    }

    results.innerHTML = matches.map(item => `
        <div class="barangay-search-item" data-barangay="${escapeHtml(item.barangayName || "")}">
            ${escapeHtml(item.barangayName || "--")}
        </div>
    `).join("");

    results.classList.add("show");

    results.querySelectorAll(".barangay-search-item").forEach(item => {
        item.addEventListener("click", () => {
            const barangayName = item.dataset.barangay || "";
            const input = document.getElementById("barangaySearch");
            if (input) {
                input.value = barangayName;
            }
            filterBarangayRisks(barangayName);
            results.classList.remove("show");
        });
    });
}