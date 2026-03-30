const API_BASE = "http://localhost:8080/api";

let dashboardCharts = {
    readiness: null,
    eventTrend: null,
    budgetTrend: null,
    budgetCategory: null,
    evacuationTrend: null,
    topResources: null
};

document.addEventListener("DOMContentLoaded", async () => {
    bindLogout();
    await loadDashboardPage();
});

async function loadDashboardPage() {
    try {
        const overview = await fetchJsonSafe(`${API_BASE}/dashboard/overview`, {});
        const viewModel = buildDashboardViewModel(overview);

        renderDashboard(viewModel);
        renderDashboardCharts(viewModel);
    } catch (error) {
        console.error("Failed to load dashboard page", error);

        const fallbackModel = buildDashboardViewModel({});
        renderDashboard(fallbackModel);
        renderDashboardCharts(fallbackModel);

        if (typeof showDashboardToast === "function") {
            showDashboardToast(error.message || "Failed to load dashboard data.", "error");
        }
    }
}

function buildDashboardViewModel(raw) {
    const summary = raw.summary || {};
    const weatherSource = raw.weather || {};
    const readinessSource = raw.readiness || {};
    const alertsSource = raw.alerts || {};
    const budgetCurrentSource = raw.budgetCurrent || {};
    const budgetHistory = Array.isArray(raw.budgetHistory) ? raw.budgetHistory : [];
    const incidents = Array.isArray(raw.incidents) ? raw.incidents : [];
    const calamities = Array.isArray(raw.calamities) ? raw.calamities : [];
    const evacuationCentersRaw = Array.isArray(raw.evacuationCenters) ? raw.evacuationCenters : [];
    const responders = Array.isArray(raw.responders) ? raw.responders : [];
    const recentActivity = Array.isArray(raw.recentActivity) ? raw.recentActivity : [];
    const overallReadinessLabel =
        raw.overallReadinessLabel ||
        alertsSource.summary?.overallReadinessLabel ||
        mapReadinessRiskToLabel(readinessSource.overallReadinessRiskLevel) ||
        "Partially Ready";

    const weather = normalizeWeather(weatherSource, raw.lastUpdated);

    const budgetCurrent = {
        year:
            Number(budgetCurrentSource.year) ||
            new Date().getFullYear(),

        totalAllotment:
            Number(budgetCurrentSource.totalAllotment) ||
            Number(budgetCurrentSource.allotment) ||
            Number(budgetCurrentSource.totalBudget) ||
            Number(summary.currentYearBudget) ||
            0,

        totalAllocated:
            Number(budgetCurrentSource.totalAllocated) ||
            Number(budgetCurrentSource.allocated) ||
            0,

        totalObligations:
            Number(budgetCurrentSource.totalObligations) ||
            Number(budgetCurrentSource.obligations) ||
            Number(budgetCurrentSource.totalSpent) ||
            Number(summary.currentYearSpent) ||
            0,

        totalRemaining:
            Number(budgetCurrentSource.totalRemaining) ||
            Number(budgetCurrentSource.remainingBalance) ||
            Number(budgetCurrentSource.remainingBudget) ||
            Number(summary.currentYearRemaining) ||
            0,

        allocationRate:
            Number(budgetCurrentSource.allocationRate) || 0,

        utilizationRate:
            Number(budgetCurrentSource.utilizationRate) ||
            (
                (Number(budgetCurrentSource.totalAllotment) ||
                 Number(budgetCurrentSource.allotment) ||
                 Number(budgetCurrentSource.totalBudget) || 0) > 0
                    ? (
                        (
                            Number(budgetCurrentSource.totalObligations) ||
                            Number(budgetCurrentSource.obligations) ||
                            Number(budgetCurrentSource.totalSpent) || 0
                        ) /
                        (
                            Number(budgetCurrentSource.totalAllotment) ||
                            Number(budgetCurrentSource.allotment) ||
                            Number(budgetCurrentSource.totalBudget) || 1
                        )
                    ) * 100
                    : 0
            )
    };

    const evacuationCenters = evacuationCentersRaw.map(center => {
        const capacity =
            Number(center.capacity) ||
            Number(center.centerCapacity) ||
            Number(center.maxCapacity) ||
            Number(center.totalCapacity) ||
            0;

        const currentEvacuees =
            Number(center.currentEvacuees) ||
            0;

        const availableSlots =
            Number.isFinite(Number(center.availableSlots))
                ? Number(center.availableSlots)
                : Math.max(capacity - currentEvacuees, 0);

        const occupancyRate =
            Number(center.occupancyRate) ||
            (capacity > 0 ? Math.round((currentEvacuees / capacity) * 100) : 0);

        return {
            ...center,
            id: center.id ?? center.centerId ?? null,
            name:
                center.name ||
                center.centerName ||
                `Center ${center.id || center.centerId || ""}`.trim(),
            barangayName: center.barangayName || center.centerBarangayName || "-",
            capacity,
            currentEvacuees,
            availableSlots,
            occupancyRate,
            capacityStatus: center.capacityStatus || "AVAILABLE",
            status: center.status || "ACTIVE"
        };
    });

    const openCenters = evacuationCenters.filter(center =>
        ["active", "open"].includes(normalizeText(center.status))
    );

    const totalEvacuees = sum(evacuationCenters.map(center => Number(center.currentEvacuees) || 0));
    const totalCapacity = sum(evacuationCenters.map(center => Number(center.capacity) || 0));
    const availableSlots = sum(evacuationCenters.map(center => Number(center.availableSlots) || 0));
    const occupancyRate = totalCapacity > 0 ? Math.round((totalEvacuees / totalCapacity) * 100) : 0;

    const activeIncidents = incidents.filter(incident =>
        ["ongoing", "in_progress", "on_site"].includes(normalizeText(incident.status))
    );
    const reportedIncidents = incidents.filter(incident => normalizeText(incident.status) === "ongoing");
    const dispatchedIncidents = incidents.filter(incident => normalizeText(incident.status) === "in_progress");
    const onSiteIncidents = incidents.filter(incident => normalizeText(incident.status) === "on_site");

    const activeCalamities = calamities.filter(calamity =>
        ["active", "monitoring"].includes(normalizeText(calamity.status))
    );
    const monitoringCalamities = calamities.filter(calamity =>
        normalizeText(calamity.status) === "monitoring"
    );

    const readiness = {
        inventoryRiskLevel: readinessSource.inventoryRiskLevel || "MODERATE",
        inventoryLowStockCount:
            Number(readinessSource.inventoryLowStockCount) || 0,
        inventoryOutOfStockCount:
            Number(readinessSource.inventoryOutOfStockCount) || 0,
        reliefRiskLevel: readinessSource.reliefRiskLevel || "MODERATE",
        reliefLowStockCount:
            Number(readinessSource.reliefLowStockCount) || 0,
        estimatedFamilyCoverage:
            Number(readinessSource.estimatedFamilyCoverage) || 0,
        evacuationRiskLevel: readinessSource.evacuationRiskLevel || "LOW",
        activeCentersCount:
            Number(readinessSource.activeCentersCount) || openCenters.length,
        nearFullCentersCount:
            Number(readinessSource.nearFullCentersCount) ||
            evacuationCenters.filter(center => center.occupancyRate >= 80 && center.occupancyRate < 95).length,
        fullCentersCount:
            Number(readinessSource.fullCentersCount) ||
            evacuationCenters.filter(center => center.occupancyRate >= 95).length,
        overallOccupancyRate:
            Number(readinessSource.overallOccupancyRate) || occupancyRate,
        budgetRiskLevel: readinessSource.budgetRiskLevel || "MODERATE",
        budgetUtilizationRate:
            Number(readinessSource.budgetUtilizationRate) ||
            Number(budgetCurrent.utilizationRate) ||
            0,
        overallReadinessRiskLevel:
            readinessSource.overallReadinessRiskLevel || "MODERATE",
        overallReadinessScore:
            Number(readinessSource.overallReadinessScore) || 0,
        topConsumedResources:
            Array.isArray(readinessSource.topConsumedResources)
                ? readinessSource.topConsumedResources
                : []
    };

    const alerts = {
        lastUpdated: raw.lastUpdated || weather.generatedAt || new Date().toISOString(),
        summary: {
            overallReadinessLabel,
            activeWarningsCount:
                Number(alertsSource.summary?.activeWarningsCount) ||
                Number(alertsSource.activeWarningsCount) ||
                0,
            criticalGapsCount:
                Number(alertsSource.summary?.criticalGapsCount) ||
                Number(alertsSource.criticalGapsCount) ||
                0,
            responseCapacityLabel:
                alertsSource.summary?.responseCapacityLabel ||
                alertsSource.responseCapacityLabel ||
                "Live"
        },
        readinessDomains: Array.isArray(alertsSource.readinessDomains) && alertsSource.readinessDomains.length
            ? alertsSource.readinessDomains
            : buildReadinessDomains(
                weather,
                readiness,
                budgetCurrent,
                evacuationCenters,
                activeIncidents,
                activeCalamities,
                responders
            ),
        priorityActions: Array.isArray(alertsSource.priorityActions) && alertsSource.priorityActions.length
            ? alertsSource.priorityActions.slice(0, 5)
            : buildAttentionList(readiness, weather, budgetCurrent)
    };

    const communityImpactNotes = buildCommunityImpactNotes(
        openCenters,
        totalEvacuees,
        occupancyRate,
        availableSlots
    );

    const eventTrend = buildEventTrendData(incidents, calamities);
    const evacuationOccupancyChart = buildEvacuationOccupancyChartData(evacuationCenters);
    const currentYear = Number(budgetCurrent.year) || new Date().getFullYear();
    const budgetTrend = buildBudgetTrendData(budgetHistory, currentYear);
    const budgetCategories = buildBudgetCategoryChartData(
        summary.categoryBreakdown || []
    );
    const topResources = buildTopResourcesChartData(
        readiness.topConsumedResources || []
    );
    const criticalItemsAtRisk = extractCriticalItemsAtRisk(alerts.readinessDomains);

    return {
        meta: {
            lastUpdated: alerts.lastUpdated,
            readinessLabel: overallReadinessLabel
        },
        summary: {
            overallReadiness: overallReadinessLabel,
            activeIncidents: activeIncidents.length || Number(summary.activeIncidents) || 0,
            activeCalamities: activeCalamities.length || Number(summary.calamityCount) || 0,
            openCenters: openCenters.length,
            currentEvacuees: totalEvacuees,
            remainingBudget: budgetCurrent.totalRemaining
        },
        situation: {
            statusLabel: overallReadinessLabel,
            availableResponders: responders.length,
            activeWarnings: alerts.summary.activeWarningsCount,
            criticalGaps: alerts.summary.criticalGapsCount,
            nearFullCenters: Number(readiness.nearFullCentersCount) || 0,
            lowStockItems: Number(readiness.inventoryLowStockCount) || 0,
            budgetUtilization: formatPercent(budgetCurrent.utilizationRate)
        },
        weather: {
            riskLevel: weather.summary.overallRiskLevel || "--",
            rainfallOutlook: weather.summary.rainfallOutlook || "--",
            recommendation: weather.summary.recommendation || "--",
            highRiskBarangays: weather.summary.highRiskBarangays ?? 0,
            monitoredBarangays: weather.summary.totalBarangays ?? 0
        },
        readiness: {
            domains: alerts.readinessDomains
        },
        attention: alerts.priorityActions,
        incidents: {
            reported: reportedIncidents.length,
            dispatched: dispatchedIncidents.length,
            onSite: onSiteIncidents.length,
            resolvedToday: countResolvedToday(recentActivity, "INCIDENT")
        },
        calamities: {
            active: activeCalamities.filter(item => normalizeText(item.status) === "active").length,
            monitoring: monitoringCalamities.length,
            resolvedToday: countResolvedToday(recentActivity, "CALAMITY"),
            ended: calamities.filter(item => normalizeText(item.status) === "ended").length
        },
        evacuation: {
            openCenters: openCenters.length,
            totalCapacity,
            currentEvacuees: totalEvacuees,
            availableSlots,
            occupancyRate
        },
        communityImpactNotes,
        budget: {
            total: budgetCurrent.totalAllotment,
            obligated: budgetCurrent.totalObligations,
            remaining: budgetCurrent.totalRemaining,
            utilization: budgetCurrent.utilizationRate
        },
        resources: {
            lowStock: Number(readiness.inventoryLowStockCount) || 0,
            outOfStock: Number(readiness.inventoryOutOfStockCount) || 0,
            criticalItemsAtRisk,
            familyCoverage: Number(readiness.estimatedFamilyCoverage) || 0
        },
        charts: {
            readinessDomains: alerts.readinessDomains,
            eventTrend,
            budgetTrend,
            budgetCategories,
            evacuationOccupancyChart,
            topResources
        }
    };
}

function normalizeWeather(weatherSource, lastUpdated) {
    const summary = weatherSource.summary || {};

    return {
        generatedAt: lastUpdated || weatherSource.generatedAt || new Date().toISOString(),
        summary: {
            overallRiskLevel:
                summary.overallRiskLevel ||
                weatherSource.overallRiskLevel ||
                weatherSource.riskLevel ||
                deriveWeatherRiskLevel(weatherSource) ||
                "--",

            rainfallOutlook:
                summary.rainfallOutlook ||
                weatherSource.rainfallOutlook ||
                weatherSource.outlook ||
                weatherSource.rainfallSummary ||
                deriveRainfallOutlook(weatherSource) ||
                "--",

            recommendation:
                summary.recommendation ||
                weatherSource.recommendation ||
                weatherSource.advisory ||
                deriveWeatherRecommendation(weatherSource) ||
                "--",

            totalBarangays:
                Number(
                    summary.totalBarangays ??
                    weatherSource.totalBarangays ??
                    weatherSource.monitoredBarangays ??
                    0
                ),

            highRiskBarangays:
                Number(
                    summary.highRiskBarangays ??
                    weatherSource.highRiskBarangays ??
                    weatherSource.barangaysAtHighRisk ??
                    0
                )
        }
    };
}

function deriveWeatherRiskLevel(weatherSource) {
    const text = JSON.stringify(weatherSource || {}).toLowerCase();
    if (text.includes("critical")) return "CRITICAL";
    if (text.includes("high")) return "HIGH";
    if (text.includes("moderate") || text.includes("medium")) return "MODERATE";
    if (text.includes("low")) return "LOW";
    return "";
}

function deriveRainfallOutlook(weatherSource) {
    const daily = Array.isArray(weatherSource.dailyForecasts) ? weatherSource.dailyForecasts : [];
    const first = daily[0] || {};
    return first.rainfallOutlook || first.outlook || first.condition || weatherSource.condition || "";
}

function deriveWeatherRecommendation(weatherSource) {
    const daily = Array.isArray(weatherSource.dailyForecasts) ? weatherSource.dailyForecasts : [];
    const first = daily[0] || {};
    return first.recommendation || "";
}

function renderDashboard(viewModel) {
    renderHero(viewModel);
    renderSummaryCards(viewModel.summary);
    renderSituationOverview(viewModel.situation);
    renderWeatherSnapshot(viewModel.weather);
    renderReadinessSnapshot(viewModel.readiness.domains);
    renderAttentionAreas(viewModel.attention);
    renderIncidentOverview(viewModel.incidents);
    renderCalamityOverview(viewModel.calamities);
    renderEvacuationOverview(viewModel.evacuation);
    renderCommunityImpactNotes(viewModel.communityImpactNotes);
    renderBudgetSnapshot(viewModel.budget);
    renderResourceSnapshot(viewModel.resources);
}

function renderHero(viewModel) {
    const readinessPill = document.getElementById("dashboardReadinessPill");
    if (readinessPill) {
        readinessPill.innerHTML = `<i class="fas fa-shield-halved"></i> Readiness: ${escapeHtml(viewModel.meta.readinessLabel || "--")}`;
    }

    const lastUpdatedPill = document.getElementById("dashboardLastUpdatedPill");
    if (lastUpdatedPill) {
        lastUpdatedPill.innerHTML = `<i class="fas fa-clock"></i> Last updated: ${escapeHtml(formatDateTime(viewModel.meta.lastUpdated))}`;
    }
}

function renderSummaryCards(summary) {
    setText("dashboardOverallReadinessStat", summary.overallReadiness || "--");
    setText("dashboardActiveIncidentsStat", formatNumber(summary.activeIncidents));
    setText("dashboardActiveCalamitiesStat", formatNumber(summary.activeCalamities));
    setText("dashboardOpenCentersStat", formatNumber(summary.openCenters));
    setText("dashboardCurrentEvacueesStat", formatNumber(summary.currentEvacuees));
    setText("dashboardRemainingBudgetStat", formatCurrency(summary.remainingBudget));
}

function renderSituationOverview(situation) {
    const badge = document.getElementById("dashboardSituationStatusBadge");
    if (badge) {
        badge.className = `status-badge ${normalizeReadinessClass(situation.statusLabel)}`;
        badge.textContent = situation.statusLabel || "--";
    }

    setText("dashboardAvailableRespondersValue", formatNumber(situation.availableResponders));
    setText("dashboardActiveWarningsValue", formatNumber(situation.activeWarnings));
    setText("dashboardCriticalGapsValue", formatNumber(situation.criticalGaps));
    setText("dashboardNearFullCentersValue", formatNumber(situation.nearFullCenters));
    setText("dashboardLowStockItemsValue", formatNumber(situation.lowStockItems));
    setText("dashboardBudgetUtilizationValue", situation.budgetUtilization || "--");
}

function renderWeatherSnapshot(weather) {
    const riskLevel = weather.riskLevel || "--";
    const rainfallOutlook = weather.rainfallOutlook || "--";

    setText("dashboardRainfallOutlook", rainfallOutlook);
    setText("dashboardHighRiskBarangays", formatNumber(weather.highRiskBarangays));
    setText("dashboardMonitoredBarangays", formatNumber(weather.monitoredBarangays));
    setText("dashboardWeatherRecommendation", weather.recommendation || "--");

    const riskPill = document.getElementById("dashboardWeatherRiskPill");
    if (riskPill) {
        const riskClass = getWeatherRiskClass(riskLevel);
        riskPill.className = `weather-risk-pill ${riskClass}`;
        riskPill.textContent = riskLevel;
    }

    const iconBadge = document.getElementById("dashboardWeatherIconBadge");
    if (iconBadge) {
        const weatherVisual = getWeatherVisualConfig(rainfallOutlook, riskLevel);
        iconBadge.className = `weather-icon-badge ${weatherVisual.className}`;
        iconBadge.innerHTML = `<i class="${weatherVisual.icon}"></i>`;
    }
}

function renderReadinessSnapshot(domains) {
    const container = document.getElementById("dashboardReadinessScoreList");
    if (!container) return;

    if (!Array.isArray(domains) || !domains.length) {
        container.innerHTML = `<div class="empty-state-card">No readiness data available.</div>`;
        return;
    }

    container.innerHTML = domains.map(domain => {
        const score = clampNumber(domain.score, 0, 100);
        const fillClass = score >= 75 ? "fill-ready" : score >= 45 ? "fill-limited" : "fill-critical";

        return `
            <div class="readiness-score-item">
                <div class="readiness-score-meta">
                    <strong>${escapeHtml(domain.title || "--")}</strong>
                    <span>${score}%</span>
                </div>
                <div class="readiness-score-bar">
                    <div class="readiness-score-fill ${fillClass}" style="width:${score}%"></div>
                </div>
            </div>
        `;
    }).join("");
}

function renderAttentionAreas(items) {
    const container = document.getElementById("dashboardAttentionList");
    if (!container) return;

    if (!Array.isArray(items) || !items.length) {
        container.innerHTML = `<div class="empty-state-card">No critical attention areas available.</div>`;
        return;
    }

    container.innerHTML = items.map(item => `
        <div class="attention-item">
            <div class="attention-item-icon">
                <i class="fas fa-bolt"></i>
            </div>
            <div class="attention-item-content">
                <h4>${escapeHtml(item.title || "--")}</h4>
                <p>${escapeHtml(item.message || "--")}</p>
            </div>
        </div>
    `).join("");
}

function renderIncidentOverview(incidents) {
    setText("dashboardActiveIncidentsOverviewCount", formatNumber(
        incidents.reported + incidents.dispatched + incidents.onSite
    ));
    setText("dashboardIncidentReportedCount", formatNumber(incidents.reported));
    setText("dashboardIncidentDispatchedCount", formatNumber(incidents.dispatched));
    setText("dashboardIncidentOnSiteCount", formatNumber(incidents.onSite));
    setText("dashboardIncidentResolvedTodayCount", formatNumber(incidents.resolvedToday));
}

function renderCalamityOverview(calamities) {
    setText("dashboardCalamityActiveCount", formatNumber(calamities.active));
    setText("dashboardCalamityMonitoringCount", formatNumber(calamities.monitoring));
    setText("dashboardCalamityResolvedTodayCount", formatNumber(calamities.resolvedToday));
    setText("dashboardCalamityEndedCount", formatNumber(calamities.ended));

    const note = document.getElementById("dashboardEventOverviewNote");
    if (note) {
        note.textContent =
            `${formatNumber(calamities.active)} active calamity record(s), `
            + `${formatNumber(calamities.monitoring)} monitoring case(s), and `
            + `${formatNumber(calamities.ended)} ended record(s) are currently reflected in the system.`;
    }
}

function renderEvacuationOverview(evacuation) {
    setText("dashboardEvacuationOpenCenters", formatNumber(evacuation.openCenters));
    setText("dashboardEvacuationTotalCapacity", formatNumber(evacuation.totalCapacity));
    setText("dashboardEvacuationCurrentEvacuees", formatNumber(evacuation.currentEvacuees));
    setText("dashboardEvacuationAvailableSlots", formatNumber(evacuation.availableSlots));
    setText("dashboardOccupancyRateText", `${formatNumber(evacuation.occupancyRate)}%`);

    const bar = document.getElementById("dashboardOccupancyRateBar");
    if (bar) {
        const rate = clampNumber(evacuation.occupancyRate, 0, 100);
        bar.style.width = `${rate}%`;
        bar.className = `readiness-score-fill ${rate >= 90 ? "fill-critical" : rate >= 70 ? "fill-limited" : "fill-ready"}`;
    }
}

function renderCommunityImpactNotes(notes) {
    const container = document.getElementById("dashboardCommunityImpactNotes");
    if (!container) return;

    if (!Array.isArray(notes) || !notes.length) {
        container.innerHTML = `<div class="empty-state-card">No community impact notes available.</div>`;
        return;
    }

    container.innerHTML = notes.map(note => `
        <div class="note-card">
            <h4>${escapeHtml(note.title || "--")}</h4>
            <p>${escapeHtml(note.message || "--")}</p>
            <small>${escapeHtml(note.category || "Community Impact")}</small>
        </div>
    `).join("");
}

function renderBudgetSnapshot(budget) {
    setText("dashboardBudgetTotal", formatCurrency(budget.total));
    setText("dashboardBudgetObligated", formatCurrency(budget.obligated));
    setText("dashboardBudgetRemaining", formatCurrency(budget.remaining));
    setText("dashboardBudgetUtilization", formatPercent(budget.utilization));
}

function renderResourceSnapshot(resources) {
    setText("dashboardResourceLowStock", formatNumber(resources.lowStock));
    setText("dashboardResourceOutOfStock", formatNumber(resources.outOfStock));
    setText("dashboardResourceCriticalAtRisk", formatNumber(resources.criticalItemsAtRisk));
    setText("dashboardResourceFamilyCoverage", formatNumber(resources.familyCoverage));
}

function renderDashboardCharts(viewModel) {
    if (typeof Chart === "undefined") {
        console.warn("Chart.js is not loaded. Skipping dashboard charts.");
        return;
    }

    destroyDashboardCharts();
    renderReadinessChart(viewModel.charts.readinessDomains);
    renderEventTrendChart(viewModel.charts.eventTrend);
    renderBudgetTrendChart(viewModel.charts.budgetTrend);
    renderBudgetCategoryChart(viewModel.charts.budgetCategories);
    renderEvacuationTrendChart(viewModel.charts.evacuationOccupancyChart);
    renderTopResourcesChart(viewModel.charts.topResources);
}

function destroyDashboardCharts() {
    Object.keys(dashboardCharts).forEach(key => {
        if (dashboardCharts[key]) {
            dashboardCharts[key].destroy();
            dashboardCharts[key] = null;
        }
    });
}

function renderReadinessChart(domains) {
    const canvas = document.getElementById("dashboardReadinessChart");
    if (!canvas || !Array.isArray(domains) || !domains.length) return;

    const colorMap = {
        "weather readiness": "rgba(37, 99, 235, 0.85)",
        "personnel readiness": "rgba(139, 92, 246, 0.85)",
        "resource readiness": "rgba(245, 158, 11, 0.85)",
        "equipment & supply readiness": "rgba(245, 158, 11, 0.85)",
        "evacuation readiness": "rgba(20, 184, 166, 0.85)",
        "budget readiness": "rgba(100, 116, 139, 0.85)"
    };

    const labels = domains.map(item => item.title || "--");
    const values = domains.map(item => clampNumber(item.score, 0, 100));
    const colors = domains.map(item => {
        const key = String(item.title || "").trim().toLowerCase();
        return colorMap[key] || "rgba(44, 90, 160, 0.85)";
    });

    dashboardCharts.readiness = new Chart(canvas, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Readiness Score",
                data: values,
                backgroundColor: colors,
                borderColor: colors,
                borderWidth: 1,
                borderRadius: 8
            }]
        },
        options: buildChartOptions("Readiness Score", { max: 100 })
    });
}

function renderEventTrendChart(trend) {
    const canvas = document.getElementById("dashboardEventTrendChart");
    if (!canvas || !Array.isArray(trend) || !trend.length) return;

    dashboardCharts.eventTrend = new Chart(canvas, {
        type: "line",
        data: {
            labels: trend.map(item => item.label),
            datasets: [
                {
                    label: "Incidents",
                    data: trend.map(item => item.incidents),
                    borderColor: "rgba(239, 68, 68, 0.95)",
                    backgroundColor: "rgba(239, 68, 68, 0.18)",
                    tension: 0.35,
                    fill: true,
                    pointRadius: 3
                },
                {
                    label: "Calamities",
                    data: trend.map(item => item.calamities),
                    borderColor: "rgba(37, 99, 235, 0.95)",
                    backgroundColor: "rgba(37, 99, 235, 0.16)",
                    tension: 0.35,
                    fill: true,
                    pointRadius: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: "Event Frequency"
                    }
                }
            }
        }
    });
}

function renderBudgetTrendChart(history) {
    const canvas = document.getElementById("dashboardBudgetTrendChart");
    if (!canvas || !Array.isArray(history) || !history.length) return;

    dashboardCharts.budgetTrend = new Chart(canvas, {
        data: {
            labels: history.map(item => String(item.year || "--")),
            datasets: [
                {
                    type: "bar",
                    label: "Allotment",
                    data: history.map(item => roundNumber(item.allotment)),
                    backgroundColor: "rgba(37, 99, 235, 0.85)",
                    borderRadius: 8,
                    yAxisID: "y"
                },
                {
                    type: "bar",
                    label: "Obligations",
                    data: history.map(item => roundNumber(item.obligations)),
                    backgroundColor: "rgba(245, 158, 11, 0.85)",
                    borderRadius: 8,
                    yAxisID: "y"
                },
                {
                    type: "bar",
                    label: "Remaining Balance",
                    data: history.map(item => roundNumber(item.remainingBalance)),
                    backgroundColor: "rgba(20, 184, 166, 0.85)",
                    borderRadius: 8,
                    yAxisID: "y"
                },
                {
                    type: "line",
                    label: "Utilization Rate (%)",
                    data: history.map(item => Number(item.utilizationRate || 0)),
                    borderColor: "rgba(139, 92, 246, 0.95)",
                    backgroundColor: "rgba(139, 92, 246, 0.16)",
                    tension: 0.35,
                    pointRadius: 4,
                    fill: false,
                    yAxisID: "y1"
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: "Amount"
                    }
                },
                y1: {
                    beginAtZero: true,
                    position: "right",
                    grid: {
                        drawOnChartArea: false
                    },
                    title: {
                        display: true,
                        text: "Utilization Rate (%)"
                    },
                    suggestedMax: 100
                }
            }
        }
    });
}

function renderBudgetCategoryChart(rows) {
    const canvas = document.getElementById("dashboardBudgetCategoryChart");
    if (!canvas || !Array.isArray(rows) || !rows.length) return;

    const colors = [
        "rgba(37, 99, 235, 0.9)",
        "rgba(245, 158, 11, 0.9)",
        "rgba(20, 184, 166, 0.9)",
        "rgba(139, 92, 246, 0.9)",
        "rgba(239, 68, 68, 0.9)",
        "rgba(14, 165, 233, 0.9)"
    ];

    dashboardCharts.budgetCategory = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels: rows.map(item => item.label),
            datasets: [{
                label: "Allocation",
                data: rows.map(item => item.value),
                backgroundColor: rows.map((_, index) => colors[index % colors.length]),
                borderWidth: 2,
                borderColor: "#ffffff"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "58%",
            plugins: {
                legend: {
                    display: true,
                    position: "bottom"
                }
            }
        }
    });
}

function renderEvacuationTrendChart(rows) {
    const canvas = document.getElementById("dashboardEvacuationTrendChart");
    if (!canvas || !Array.isArray(rows) || !rows.length) return;

    dashboardCharts.evacuationTrend = new Chart(canvas, {
        data: {
            labels: rows.map(item => item.label),
            datasets: [
                {
                    type: "bar",
                    label: "Evacuees",
                    data: rows.map(item => item.evacuees),
                    backgroundColor: "rgba(20, 184, 166, 0.85)",
                    borderRadius: 8,
                    yAxisID: "y"
                },
                {
                    type: "line",
                    label: "Occupancy %",
                    data: rows.map(item => item.occupancyRate),
                    borderColor: "rgba(245, 158, 11, 0.95)",
                    backgroundColor: "rgba(245, 158, 11, 0.18)",
                    tension: 0.35,
                    pointRadius: 4,
                    yAxisID: "y1"
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: "Evacuees"
                    }
                },
                y1: {
                    beginAtZero: true,
                    position: "right",
                    grid: {
                        drawOnChartArea: false
                    },
                    title: {
                        display: true,
                        text: "Occupancy %"
                    },
                    suggestedMax: 100
                }
            }
        }
    });
}

function renderTopResourcesChart(rows) {
    const canvas = document.getElementById("dashboardTopResourcesChart");
    if (!canvas || !Array.isArray(rows) || !rows.length) return;

    const palette = [
        "rgba(37, 99, 235, 0.85)",
        "rgba(20, 184, 166, 0.85)",
        "rgba(245, 158, 11, 0.85)",
        "rgba(139, 92, 246, 0.85)",
        "rgba(239, 68, 68, 0.85)",
        "rgba(14, 165, 233, 0.85)",
        "rgba(132, 204, 22, 0.85)",
        "rgba(168, 85, 247, 0.85)"
    ];

    dashboardCharts.topResources = new Chart(canvas, {
        type: "bar",
        data: {
            labels: rows.map(item => item.label),
            datasets: [{
                label: "Usage / Turnover",
                data: rows.map(item => item.value),
                backgroundColor: rows.map((_, index) => palette[index % palette.length]),
                borderColor: rows.map((_, index) => palette[index % palette.length]),
                borderWidth: 1,
                borderRadius: 8
            }]
        },
        options: buildChartOptions("Usage Count")
    });
}

function buildChartOptions(yLabel, extras = {}) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                max: extras.max || undefined,
                title: {
                    display: true,
                    text: yLabel
                }
            }
        }
    };
}

function buildReadinessDomains(weather, readiness, budgetCurrent, evacuationCenters, activeIncidents, activeCalamities, responders = []) {
    const weatherRisk = weather.summary?.overallRiskLevel || "MODERATE";
    const availableSlots = sum(evacuationCenters.map(center => Number(center.availableSlots) || 0));

    return [
        {
            type: "WEATHER",
            title: "Weather Readiness",
            status: mapRiskToStatus(weatherRisk),
            score: scoreFromRisk(weatherRisk),
            description: "Forecast-driven municipal weather posture",
            metrics: [
                { label: "Risk", value: weatherRisk },
                { label: "High Risk Barangays", value: String(weather.summary?.highRiskBarangays ?? 0) }
            ]
        },
        {
            type: "PERSONNEL",
            title: "Personnel Readiness",
            status: responders.length >= 8 ? "READY" : responders.length >= 4 ? "LIMITED" : "CRITICAL",
            score: responders.length >= 8 ? 84 : responders.length >= 4 ? 60 : 28,
            description: "Availability of responders for deployment",
            metrics: [
                { label: "Available Responders", value: String(responders.length) },
                { label: "Active Incidents", value: String(activeIncidents.length) },
                { label: "Active Calamities", value: String(activeCalamities.length) }
            ]
        },
        {
            type: "RESOURCE",
            title: "Resource Readiness",
            status: mapRiskToStatus(readiness.inventoryRiskLevel),
            score: scoreFromRisk(readiness.inventoryRiskLevel),
            description: "Inventory and supply condition",
            metrics: [
                { label: "Low Stock", value: String(readiness.inventoryLowStockCount ?? 0) },
                { label: "Out of Stock", value: String(readiness.inventoryOutOfStockCount ?? 0) },
                { label: "Critical Items At Risk", value: String((readiness.inventoryLowStockCount || 0) + (readiness.inventoryOutOfStockCount || 0)) }
            ]
        },
        {
            type: "EVACUATION",
            title: "Evacuation Readiness",
            status: mapRiskToStatus(readiness.evacuationRiskLevel),
            score: scoreFromRisk(readiness.evacuationRiskLevel),
            description: "Center occupancy and capacity posture",
            metrics: [
                { label: "Open Centers", value: String(readiness.activeCentersCount ?? 0) },
                { label: "Available Slots", value: String(availableSlots) }
            ]
        },
        {
            type: "BUDGET",
            title: "Budget Readiness",
            status: mapRiskToStatus(readiness.budgetRiskLevel),
            score: scoreFromRisk(readiness.budgetRiskLevel),
            description: "Current financial flexibility for operations",
            metrics: [
                { label: "Utilization", value: formatPercent(budgetCurrent.utilizationRate) },
                { label: "Remaining", value: formatCurrency(budgetCurrent.totalRemaining) }
            ]
        }
    ];
}

function buildAttentionList(readiness, weather, budgetCurrent) {
    const rows = [];

    if (Number(readiness.inventoryOutOfStockCount) > 0) {
        rows.push({
            title: "Inventory shortages require immediate action",
            message: "One or more response items are currently out of stock."
        });
    }

    if (Number(readiness.nearFullCentersCount) > 0) {
        rows.push({
            title: "Evacuation capacity is tightening",
            message: "One or more open evacuation centers are nearing full capacity."
        });
    }

    if (Number(budgetCurrent.utilizationRate) >= 75) {
        rows.push({
            title: "Budget utilization is elevated",
            message: "Current spending pressure may affect operational flexibility."
        });
    }

    if (["HIGH", "CRITICAL", "SEVERE"].includes(String(weather.summary?.overallRiskLevel || "").toUpperCase())) {
        rows.push({
            title: "Weather risk is elevated",
            message: "Forecast conditions suggest closer municipal monitoring is needed."
        });
    }

    if (!rows.length) {
        rows.push({
            title: "Maintain current monitoring posture",
            message: "No high-priority dashboard attention item was generated."
        });
    }

    return rows;
}

function buildCommunityImpactNotes(openCenters, totalEvacuees, occupancyRate, availableSlots) {
    const rows = [];

    rows.push({
        title: "Evacuation Load",
        message: `${formatNumber(totalEvacuees)} evacuees are currently supported across ${formatNumber(openCenters.length)} open center(s).`,
        category: "Evacuation"
    });

    if (occupancyRate >= 85) {
        rows.push({
            title: "Capacity Pressure",
            message: `Overall occupancy is ${occupancyRate}%, which may require overflow planning.`,
            category: "Capacity"
        });
    } else {
        rows.push({
            title: "Capacity Posture",
            message: `Overall occupancy is ${occupancyRate}%, with ${formatNumber(availableSlots)} available slots remaining.`,
            category: "Capacity"
        });
    }

    if (!openCenters.length) {
        rows.push({
            title: "Standby Shelter Status",
            message: "No evacuation center is currently open. Standby activation remains available if needed.",
            category: "Preparedness"
        });
    }

    return rows.slice(0, 3);
}

function buildBudgetTrendData(history, currentYear = new Date().getFullYear()) {
    const startYear = currentYear - 4;
    const endYear = currentYear;

    const historyMap = new Map();

    (Array.isArray(history) ? history : []).forEach(item => {
        const year = Number(item.year || 0);
        if (!year) return;

        const allotment =
            Number(item.allotment) ||
            Number(item.totalAllotment) ||
            Number(item.totalBudget) ||
            Number(item.totalAmount) ||
            0;

        const obligations =
            Number(item.obligations) ||
            Number(item.totalObligations) ||
            Number(item.totalObligated) ||
            Number(item.totalSpent) ||
            0;

        const remainingBalance =
            Number(item.remainingBalance) ||
            Number(item.totalRemaining) ||
            Number(item.remaining) ||
            Math.max(allotment - obligations, 0);

        const utilizationRate =
            Number(item.utilizationRate) ||
            (allotment > 0 ? (obligations / allotment) * 100 : 0);

        historyMap.set(year, {
            year,
            allotment,
            obligations,
            remainingBalance,
            utilizationRate
        });
    });

    const filled = [];
    for (let year = startYear; year <= endYear; year++) {
        if (historyMap.has(year)) {
            filled.push(historyMap.get(year));
        } else {
            filled.push({
                year,
                allotment: 0,
                obligations: 0,
                remainingBalance: 0,
                utilizationRate: 0
            });
        }
    }

    return filled;
}

function buildEventTrendData(incidents, calamities) {
    const last7 = [];
    const counts = new Map();

    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const key = formatDateKey(date);

        last7.push(key);
        counts.set(key, {
            incidents: 0,
            calamities: 0
        });
    }

    incidents.forEach(item => {
        const key = formatDateKey(item.reportedAt);
        if (counts.has(key)) {
            counts.get(key).incidents += 1;
        }
    });

    calamities.forEach(item => {
        const key = formatDateKey(item.date);
        if (counts.has(key)) {
            counts.get(key).calamities += 1;
        }
    });

    return last7.map(key => ({
        label: formatShortDate(key),
        incidents: counts.get(key)?.incidents || 0,
        calamities: counts.get(key)?.calamities || 0
    }));
}

function buildEvacuationOccupancyChartData(centers) {
    return (Array.isArray(centers) ? centers : [])
        .map(center => {
            const capacity =
                Number(center.capacity) ||
                Number(center.centerCapacity) ||
                Number(center.maxCapacity) ||
                Number(center.totalCapacity) ||
                0;

            const evacuees =
                Number(center.currentEvacuees) ||
                0;

            const occupancyRate =
                Number(center.occupancyRate) ||
                (capacity > 0 ? Math.round((evacuees / capacity) * 100) : 0);

            return {
                label:
                    center.name ||
                    center.centerName ||
                    `Center ${center.id || center.centerId || ""}`.trim(),
                occupancyRate,
                evacuees,
                reliefDistributed: Number(center.reliefDistributed || 0),
                capacity
            };
        })
        .filter(center => center.capacity > 0 || center.evacuees > 0)
        .sort((a, b) => b.occupancyRate - a.occupancyRate)
        .slice(0, 8);
}

function buildBudgetCategoryChartData(rows) {
    const mapped = Array.isArray(rows)
        ? rows.map(item => ({
            label: item.categoryName || item.name || "Category",
            value: Number(item.amount || item.total || item.allocatedAmount || 0)
        })).filter(item => item.value > 0)
        : [];

    return mapped;
}

function buildTopResourcesChartData(rows) {
    return Array.isArray(rows)
        ? rows
            .map(item => ({
                label: item.itemName || item.name || "Resource",
                value: Number(item.usedQuantity || item.totalUsed || item.usageCount || 0)
            }))
            .filter(item => item.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, 8)
        : [];
}

function formatIncidentStatus(status) {
    const normalized = String(status || "").trim().toUpperCase();

    switch (normalized) {
        case "ONGOING":
            return "Reported";
        case "IN_PROGRESS":
            return "Dispatched";
        case "ON_SITE":
            return "On-Site";
        case "RESOLVED":
            return "Resolved";
        default:
            return normalized
                .toLowerCase()
                .replaceAll("_", " ")
                .replace(/\b\w/g, char => char.toUpperCase()) || "Unknown";
    }
}

function formatCalamityStatus(status) {
    const normalized = String(status || "").trim().toUpperCase();

    switch (normalized) {
        case "ACTIVE":
            return "Active";
        case "MONITORING":
            return "Monitoring";
        case "RESOLVED":
            return "Resolved";
        case "ENDED":
            return "Ended";
        default:
            return normalized
                .toLowerCase()
                .replaceAll("_", " ")
                .replace(/\b\w/g, char => char.toUpperCase()) || "Unknown";
    }
}

function countResolvedToday(rows, recordType) {
    const today = formatDateKey(new Date());

    return rows.filter(item => {
        const typeMatches = normalizeText(item.recordType || item.operationType) === normalizeText(recordType);
        const actionType = normalizeText(item.actionType);
        const toStatus = normalizeText(item.toStatus);
        const actionMatches = (actionType === "status_changed" && toStatus === "resolved") || actionType === "resolved";
        const dateMatches = formatDateKey(item.performedAt || item.recordedAt || item.time) === today;

        return typeMatches && actionMatches && dateMatches;
    }).length;
}

function extractCriticalItemsAtRisk(domains) {
    const resourceDomain = domains.find(item => normalizeText(item.type) === "resource");
    if (!resourceDomain || !Array.isArray(resourceDomain.metrics)) return 0;

    const metric = resourceDomain.metrics.find(item => normalizeText(item.label) === "critical items at risk");
    return metric ? Number(metric.value) || 0 : 0;
}

async function fetchJson(url, options = {}) {
    const token = localStorage.getItem("jwtToken");

    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers || {})
        }
    });

    const contentType = response.headers.get("content-type") || "";

    if (!response.ok) {
        let message = `Request failed: ${response.status}`;

        try {
            if (contentType.includes("application/json")) {
                const errorBody = await response.json();
                message = errorBody.message || errorBody.error || message;
            } else {
                const text = await response.text();
                if (text) message = text;
            }
        } catch (_) {
            // keep default message
        }

        throw new Error(message);
    }

    if (contentType.includes("application/json")) {
        return response.json();
    }

    return null;
}

async function fetchJsonSafe(url, fallbackValue = null, options = {}) {
    try {
        return await fetchJson(url, options);
    } catch (error) {
        console.warn(`Dashboard request failed for ${url}:`, error);
        return fallbackValue;
    }
}

function bindLogout() {
    const logoutBtn = document.getElementById("logoutBtn");
    if (!logoutBtn) return;

    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("jwtToken");
        sessionStorage.removeItem("jwtToken");
        window.location.href = "login.html";
    });
}

function getWeatherRiskClass(value) {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "LOW") return "low";
    if (normalized === "MODERATE" || normalized === "MEDIUM") return "medium";
    if (normalized === "HIGH") return "high";
    if (normalized === "CRITICAL" || normalized === "SEVERE") return "critical";
    return "neutral";
}

function getWeatherVisualConfig(rainfallOutlook, riskLevel) {
    const outlook = String(rainfallOutlook || "").toLowerCase();
    const risk = String(riskLevel || "").toLowerCase();

    if (outlook.includes("thunder") || outlook.includes("storm") || risk === "critical" || risk === "severe") {
        return { className: "storm", icon: "fas fa-bolt" };
    }
    if (outlook.includes("rain")) {
        return { className: "rainy", icon: "fas fa-cloud-rain" };
    }
    if (outlook.includes("cloud")) {
        return { className: "cloudy", icon: "fas fa-cloud" };
    }
    if (outlook.includes("sun") || outlook.includes("clear")) {
        return { className: "sunny", icon: "fas fa-sun" };
    }

    return { className: "cloudy", icon: "fas fa-cloud" };
}

function normalizeReadinessClass(value) {
    const normalized = normalizeText(value);
    if (normalized === "ready" || normalized === "fully ready") return "ready";
    if (normalized === "partially ready" || normalized === "limited") return "limited";
    if (normalized === "not ready" || normalized === "critical") return "critical";
    return "neutral";
}

function mapReadinessRiskToLabel(value) {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "LOW") return "Ready";
    if (normalized === "MODERATE" || normalized === "MEDIUM" || normalized === "HIGH") return "Partially Ready";
    if (normalized === "CRITICAL" || normalized === "SEVERE") return "Not Ready";
    return "Partially Ready";
}

function mapRiskToStatus(value) {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "LOW") return "READY";
    if (normalized === "MODERATE" || normalized === "MEDIUM" || normalized === "HIGH") return "LIMITED";
    if (normalized === "CRITICAL" || normalized === "SEVERE") return "CRITICAL";
    return "LIMITED";
}

function scoreFromRisk(value) {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "LOW") return 88;
    if (normalized === "MODERATE" || normalized === "MEDIUM") return 66;
    if (normalized === "HIGH") return 48;
    if (normalized === "CRITICAL" || normalized === "SEVERE") return 24;
    return 60;
}

function formatCurrency(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "--";

    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        maximumFractionDigits: 2
    }).format(num);
}

function formatPercent(value) {
    const num = Number(value);
    return Number.isFinite(num) ? `${Math.round(num)}%` : "--";
}

function formatNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num.toLocaleString("en-PH") : "--";
}

function formatDateTime(value) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
}

function formatShortDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat("en-PH", {
        month: "short",
        day: "numeric"
    }).format(date);
}

function formatDateKey(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || "");

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function toTime(value) {
    if (!value) return 0;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function roundNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? Math.round(num) : 0;
}

function sum(values) {
    return values.reduce((acc, value) => acc + (Number(value) || 0), 0);
}

function clampNumber(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? "--";
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}