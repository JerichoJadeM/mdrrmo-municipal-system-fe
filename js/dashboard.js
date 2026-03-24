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
    setDashboardLoadingState();

    try {
        const raw = await fetchDashboardData();
        const viewModel = buildDashboardViewModel(raw);

        renderDashboard(viewModel);

        requestAnimationFrame(() => {
            renderDashboardCharts(viewModel);
        });
    } catch (error) {
        console.error("Failed to load dashboard page", error);
        const fallback = buildDashboardViewModel(getMockDashboardOverview());

        renderDashboard(fallback);

        requestAnimationFrame(() => {
            renderDashboardCharts(fallback);
        });
    }
}

async function fetchDashboardData() {
    return fetchJson(`${API_BASE}/dashboard/overview`);
}

function buildDashboardViewModel(raw) {
    const dashboardSummary = raw.summary || getMockDashboardSummary();
    const weather = raw.weather || getMockWeatherForecast();
    const readiness = raw.readiness || getMockReadinessSummary();
    const alerts = raw.alerts || getMockAlertsOverview();
    const budgetCurrent = raw.budgetCurrent || getMockBudgetCurrentSummary();
    const budgetHistory = Array.isArray(raw.budgetHistory) && raw.budgetHistory.length
        ? raw.budgetHistory
        : getMockBudgetHistory();
    const incidents = Array.isArray(raw.incidents) && raw.incidents.length
        ? raw.incidents
        : getMockIncidents();
    const calamities = Array.isArray(raw.calamities) && raw.calamities.length
        ? raw.calamities
        : getMockCalamities();
    const evacuationCenters = Array.isArray(raw.evacuationCenters) && raw.evacuationCenters.length
        ? raw.evacuationCenters
        : getMockEvacuationCenters();
    const responders = Array.isArray(raw.responders) && raw.responders.length
        ? raw.responders
        : getMockResponders();
    const recentActivity = Array.isArray(raw.recentActivity) && raw.recentActivity.length
        ? raw.recentActivity
        : buildFallbackRecentActivity(incidents, calamities);

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

    const readinessDomains = Array.isArray(alerts.readinessDomains) && alerts.readinessDomains.length
        ? alerts.readinessDomains
        : buildReadinessDomainsFromFallback(
            weather,
            readiness,
            budgetCurrent,
            responders,
            evacuationCenters,
            activeIncidents,
            activeCalamities
        );

    const latestAlerts = Array.isArray(alerts.activeAlerts) ? alerts.activeAlerts.slice(0, 5) : [];
    const criticalAttention = Array.isArray(alerts.priorityActions) && alerts.priorityActions.length
        ? alerts.priorityActions.slice(0, 5)
        : buildFallbackAttentionList(readiness, weather, budgetCurrent);

    const communityImpactNotes = buildCommunityImpactNotes(
        openCenters,
        totalEvacuees,
        occupancyRate,
        availableSlots
    );

    const eventTrend = buildEventTrendData(incidents, calamities);
    const evacuationOccupancyChart = buildEvacuationOccupancyChartData(evacuationCenters);
    const currentYear =
        Number(raw.budgetCurrent?.year)
        || Number(raw.summary?.year)
        || new Date().getFullYear();

    const budgetTrend = buildBudgetTrendData(budgetHistory, currentYear);
    const budgetCategories = buildBudgetCategoryChartData(
        raw.summary?.categoryBreakdown || dashboardSummary.categoryBreakdown || []
    );
    const topResources = buildTopResourcesChartData(
        raw.readiness?.topConsumedResources || []
    );
    const criticalItemsAtRisk = extractCriticalItemsAtRisk(readinessDomains);

    return {
        meta: {
            lastUpdated: raw.lastUpdated || alerts.lastUpdated || weather.generatedAt || new Date().toISOString(),
            readinessLabel: raw.overallReadinessLabel
                || alerts.summary?.overallReadinessLabel
                || mapReadinessRiskToLabel(readiness.overallReadinessRiskLevel)
                || "Partially Ready"
        },
        summary: {
            overallReadiness: raw.overallReadinessLabel
                || alerts.summary?.overallReadinessLabel
                || mapReadinessRiskToLabel(readiness.overallReadinessRiskLevel),
            activeIncidents: activeIncidents.length || Number(dashboardSummary.activeIncidents) || 0,
            activeCalamities: activeCalamities.length || Number(dashboardSummary.calamityCount) || 0,
            openCenters: openCenters.length,
            currentEvacuees: totalEvacuees,
            remainingBudget: budgetCurrent.totalRemaining
        },
        situation: {
            statusLabel: raw.overallReadinessLabel
                || alerts.summary?.overallReadinessLabel
                || mapReadinessRiskToLabel(readiness.overallReadinessRiskLevel),
            availableResponders: responders.length,
            activeWarnings: alerts.summary?.activeWarningsCount || latestAlerts.length,
            criticalGaps: alerts.summary?.criticalGapsCount
                || latestAlerts.filter(item => ["HIGH", "CRITICAL"].includes(String(item.severity || "").toUpperCase())).length,
            nearFullCenters: Number(readiness.nearFullCentersCount)
                || evacuationCenters.filter(center => normalizeText(center.capacityStatus) === "near_full").length,
            lowStockItems: Number(readiness.inventoryLowStockCount) || 0,
            budgetUtilization: formatPercent(budgetCurrent.utilizationRate)
        },
        weather: {
            riskLevel: weather.summary?.overallRiskLevel || "--",
            rainfallOutlook: weather.summary?.rainfallOutlook || "--",
            recommendation: weather.summary?.recommendation || "--",
            highRiskBarangays: weather.summary?.highRiskBarangays ?? 0,
            monitoredBarangays: weather.summary?.totalBarangays ?? 0
        },
        readiness: {
            domains: readinessDomains
        },
        attention: criticalAttention,
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
            readinessDomains,
            eventTrend,
            budgetTrend,
            budgetCategories,
            evacuationOccupancyChart,
            topResources
        }
    };
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

function buildReadinessDomainsFromFallback(weather, readiness, budgetCurrent, responders, evacuationCenters, activeIncidents, activeCalamities) {
    const weatherRisk = weather.summary?.overallRiskLevel || "MODERATE";
    const openCenters = evacuationCenters.filter(center => ["active", "open"].includes(normalizeText(center.status)));
    const availableSlots = sum(openCenters.map(center => Number(center.availableSlots) || 0));

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
                { label: "Critical Items At Risk", value: "2" }
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

function buildFallbackAttentionList(readiness, weather, budgetCurrent) {
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
            Number(item.allotment)
            || Number(item.totalAllotment)
            || Number(item.totalBudget)
            || Number(item.totalAmount)
            || 0;

        const obligations =
            Number(item.obligations)
            || Number(item.totalObligations)
            || Number(item.totalObligated)
            || Number(item.totalSpent)
            || 0;

        const remainingBalance =
            Number(item.remainingBalance)
            || Number(item.totalRemaining)
            || Number(item.remaining)
            || Math.max(allotment - obligations, 0);

        const utilizationRate =
            Number(item.utilizationRate)
            || (allotment > 0 ? (obligations / allotment) * 100 : 0);

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
    return centers
        .slice()
        .sort((a, b) => Number(b.occupancyRate || 0) - Number(a.occupancyRate || 0))
        .slice(0, 8)
        .map(center => ({
            label: center.name || `Center ${center.id || ""}`.trim(),
            occupancyRate: Number(center.occupancyRate) || 0,
            evacuees: Number(center.currentEvacuees) || 0,
            reliefDistributed: Number(center.reliefDistributed || 0)
        }));
}

function buildBudgetCategoryChartData(rows) {
    const mapped = Array.isArray(rows)
        ? rows.map(item => ({
            label: item.categoryName || item.name || "Category",
            value: Number(item.amount || item.total || item.allocatedAmount || 0)
        })).filter(item => item.value > 0)
        : [];

    if (mapped.length) return mapped;

    return [
        { label: "Response Ops", value: 300000 },
        { label: "Relief Goods", value: 250000 },
        { label: "Equipment", value: 180000 },
        { label: "Evacuation Support", value: 140000 },
        { label: "Medical Support", value: 120000 }
    ];
}

function buildTopResourcesChartData(rows) {
    if (!Array.isArray(rows) || !rows.length) {
        return [
            { label: "Food Packs", value: 120 },
            { label: "Bottled Water", value: 98 },
            { label: "Medical Kits", value: 64 },
            { label: "Blankets", value: 52 },
            { label: "Hygiene Kits", value: 41 }
        ];
    }

    return rows
        .map(item => ({
            label: item.itemName || item.name || "Resource",
            value: Number(item.usedQuantity || item.totalUsed || item.usageCount || 0)
        }))
        .filter(item => item.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
}

function buildFallbackRecentActivity(incidents, calamities) {
    const incidentRows = incidents.slice(0, 4).map(item => ({
        recordType: "INCIDENT",
        actionType: item.status || "UPDATED",
        description: `${item.type || "Incident"} in ${item.barangayName || item.barangay || "Batad"} is ${formatIncidentStatus(item.status).toLowerCase()}.`,
        performedBy: "Operations module",
        performedAt: item.reportedAt
    }));

    const calamityRows = calamities.slice(0, 4).map(item => ({
        recordType: "CALAMITY",
        actionType: item.status || "UPDATED",
        description: `${item.eventName || item.type || "Calamity"} is currently ${formatCalamityStatus(item.status).toLowerCase()}.`,
        performedBy: "Disaster management module",
        performedAt: item.date
    }));

    return [...incidentRows, ...calamityRows]
        .sort((a, b) => toTime(b.performedAt) - toTime(a.performedAt))
        .slice(0, 10);
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

// function setDashboardLoadingState() {
//     const ids = [
//         "dashboardOverallReadinessStat",
//         "dashboardActiveIncidentsStat",
//         "dashboardActiveCalamitiesStat",
//         "dashboardOpenCentersStat",
//         "dashboardCurrentEvacueesStat",
//         "dashboardRemainingBudgetStat",
//         "dashboardAvailableRespondersValue",
//         "dashboardActiveWarningsValue",
//         "dashboardCriticalGapsValue",
//         "dashboardNearFullCentersValue",
//         "dashboardLowStockItemsValue",
//         "dashboardBudgetUtilizationValue",
//         "dashboardRainfallOutlook",
//         "dashboardHighRiskBarangays",
//         "dashboardMonitoredBarangays",
//         "dashboardWeatherRecommendation",
//         "dashboardActiveIncidentsOverviewCount",
//         "dashboardIncidentReportedCount",
//         "dashboardIncidentDispatchedCount",
//         "dashboardIncidentOnSiteCount",
//         "dashboardIncidentResolvedTodayCount",
//         "dashboardCalamityActiveCount",
//         "dashboardCalamityMonitoringCount",
//         "dashboardCalamityResolvedTodayCount",
//         "dashboardCalamityEndedCount",
//         "dashboardEvacuationOpenCenters",
//         "dashboardEvacuationTotalCapacity",
//         "dashboardEvacuationCurrentEvacuees",
//         "dashboardEvacuationAvailableSlots",
//         "dashboardOccupancyRateText",
//         "dashboardBudgetTotal",
//         "dashboardBudgetObligated",
//         "dashboardBudgetRemaining",
//         "dashboardBudgetUtilization",
//         "dashboardResourceLowStock",
//         "dashboardResourceOutOfStock",
//         "dashboardResourceCriticalAtRisk",
//         "dashboardResourceFamilyCoverage"
//     ];

//     ids.forEach(id => setText(id, "--"));
//     setHTML("dashboardReadinessScoreList", `<div class="empty-state-card">Loading readiness snapshot...</div>`);
//     setHTML("dashboardAttentionList", `<div class="empty-state-card">Loading critical attention areas...</div>`);
//     setHTML("dashboardCommunityImpactNotes", `<div class="empty-state-card">Loading community impact notes...</div>`);

//     const riskPill = document.getElementById("dashboardWeatherRiskPill");
//     if (riskPill) {
//         riskPill.className = "weather-risk-pill neutral";
//         riskPill.textContent = "--";
//     }

//     const iconBadge = document.getElementById("dashboardWeatherIconBadge");
//     if (iconBadge) {
//         iconBadge.className = "weather-icon-badge cloudy";
//         iconBadge.innerHTML = `<i class="fas fa-cloud"></i>`;
//     }
// }

function setDashboardLoadingState() {
    setHTML("dashboardReadinessScoreList", `<div class="empty-state-card">Loading readiness snapshot...</div>`);
    setHTML("dashboardAttentionList", `<div class="empty-state-card">Loading critical attention areas...</div>`);
    setHTML("dashboardCommunityImpactNotes", `<div class="empty-state-card">Loading community impact notes...</div>`);

    const riskPill = document.getElementById("dashboardWeatherRiskPill");
    if (riskPill) {
        riskPill.className = "weather-risk-pill neutral";
        riskPill.textContent = "--";
    }

    const iconBadge = document.getElementById("dashboardWeatherIconBadge");
    if (iconBadge) {
        iconBadge.className = "weather-icon-badge cloudy";
        iconBadge.innerHTML = `<i class="fas fa-cloud"></i>`;
    }
}

async function fetchJson(url) {
    const response = await fetchWithAuth(url);
    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
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

function getSeverityClass(value) {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "LOW") return "low";
    if (normalized === "MEDIUM") return "medium";
    if (normalized === "HIGH") return "high";
    if (normalized === "CRITICAL") return "critical";
    return "neutral";
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

function setHTML(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = value;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* Mock fallback */

function getMockDashboardOverview() {
    return {
        lastUpdated: new Date().toISOString(),
        overallReadinessLabel: "Partially Ready",
        summary: getMockDashboardSummary(),
        weather: getMockWeatherForecast(),
        readiness: getMockReadinessSummary(),
        alerts: getMockAlertsOverview(),
        budgetCurrent: getMockBudgetCurrentSummary(),
        budgetHistory: getMockBudgetHistory(),
        incidents: getMockIncidents(),
        calamities: getMockCalamities(),
        evacuationCenters: getMockEvacuationCenters(),
        responders: getMockResponders()
    };
}

function getMockDashboardSummary() {
    return {
        totalBudget: 1200000,
        totalSpent: 772000,
        remaining: 428000,
        categoryCount: 12,
        expenseCount: 35,
        calamityCount: 2,
        activeIncidents: 3,
        categoryBreakdown: []
    };
}

function getMockWeatherForecast() {
    return {
        generatedAt: new Date().toISOString(),
        summary: {
            overallRiskLevel: "HIGH",
            rainfallOutlook: "Moderate to Heavy Rain",
            recommendation: "Prepare flood-prone barangays and monitor rainfall escalation.",
            totalBarangays: 24,
            highRiskBarangays: 5,
            mediumRiskBarangays: 9,
            lowRiskBarangays: 10
        }
    };
}

function getMockReadinessSummary() {
    return {
        inventoryRiskLevel: "HIGH",
        inventoryLowStockCount: 5,
        inventoryOutOfStockCount: 2,
        reliefRiskLevel: "MODERATE",
        reliefLowStockCount: 3,
        estimatedFamilyCoverage: 146,
        evacuationRiskLevel: "LOW",
        activeCentersCount: 2,
        nearFullCentersCount: 1,
        fullCentersCount: 0,
        overallOccupancyRate: 54,
        budgetRiskLevel: "MODERATE",
        budgetUtilizationRate: 67,
        overallReadinessRiskLevel: "HIGH",
        overallReadinessScore: 72
    };
}

function getMockAlertsOverview() {
    return {
        lastUpdated: new Date().toISOString(),
        summary: {
            overallReadinessLabel: "Partially Ready",
            activeWarningsCount: 6,
            criticalGapsCount: 2,
            responseCapacityLabel: "8 Available"
        },
        readinessDomains: [
            { type: "WEATHER", title: "Weather Readiness", score: 46, status: "LIMITED", metrics: [{ label: "Risk", value: "HIGH" }] },
            { type: "PERSONNEL", title: "Personnel Readiness", score: 82, status: "READY", metrics: [{ label: "Available Responders", value: "8" }] },
            { type: "RESOURCE", title: "Resource Readiness", score: 61, status: "LIMITED", metrics: [{ label: "Critical Items At Risk", value: "2" }] },
            { type: "EVACUATION", title: "Evacuation Readiness", score: 86, status: "READY", metrics: [{ label: "Open Centers", value: "2" }] },
            { type: "BUDGET", title: "Budget Readiness", score: 58, status: "LIMITED", metrics: [{ label: "Remaining", value: "₱ 428,000" }] }
        ],
        priorityActions: [
            {
                title: "Restock emergency medical kits",
                message: "Critical shortage detected in medical response supplies."
            },
            {
                title: "Prepare flood-prone barangays",
                message: "Weather indicators suggest elevated flood monitoring."
            }
        ]
    };
}

function getMockBudgetCurrentSummary() {
    return {
        year: 2026,
        totalAllotment: 1200000,
        totalAllocated: 1050000,
        totalObligations: 772000,
        totalRemaining: 428000,
        allocationRate: 88,
        utilizationRate: 67
    };
}

function getMockBudgetHistory() {
    return [
        { year: 2022, totalBudget: 850000, totalObligated: 460000, totalRemaining: 390000 },
        { year: 2023, totalBudget: 920000, totalObligated: 560000, totalRemaining: 360000 },
        { year: 2024, totalBudget: 980000, totalObligated: 650000, totalRemaining: 330000 },
        { year: 2025, totalBudget: 1100000, totalObligated: 760000, totalRemaining: 340000 },
        { year: 2026, totalBudget: 1200000, totalObligated: 772000, totalRemaining: 428000 }
    ];
}

function getMockIncidents() {
    return [
        {
            id: 1,
            type: "Fallen Tree",
            status: "ONGOING",
            severity: "MEDIUM",
            reportedAt: new Date().toISOString(),
            barangayName: "Alapasco"
        },
        {
            id: 2,
            type: "Fire Incident",
            status: "IN_PROGRESS",
            severity: "HIGH",
            reportedAt: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
            barangayName: "Bulak"
        },
        {
            id: 3,
            type: "Vehicular Accident",
            status: "ON_SITE",
            severity: "MEDIUM",
            reportedAt: new Date(Date.now() - 3600 * 1000 * 10).toISOString(),
            barangayName: "Tanao"
        }
    ];
}

function getMockCalamities() {
    return [
        {
            id: 10,
            type: "Flood",
            eventName: "River Overflow Monitoring",
            status: "ACTIVE",
            severity: "HIGH",
            date: new Date().toISOString(),
            affectedBarangayNames: ["Alapasco", "Bulak"]
        },
        {
            id: 11,
            type: "Typhoon",
            eventName: "Typhoon Preparedness Watch",
            status: "MONITORING",
            severity: "MEDIUM",
            date: new Date(Date.now() - 86400 * 1000).toISOString(),
            affectedBarangayNames: ["Banban", "Bulak", "Tanao"]
        }
    ];
}

function getMockEvacuationCenters() {
    return [
        {
            id: 1,
            name: "Evacuation Center 1",
            status: "ACTIVE",
            capacity: 250,
            currentEvacuees: 110,
            availableSlots: 140,
            occupancyRate: 44,
            capacityStatus: "AVAILABLE"
        },
        {
            id: 2,
            name: "Evacuation Center 2",
            status: "ACTIVE",
            capacity: 200,
            currentEvacuees: 134,
            availableSlots: 66,
            occupancyRate: 67,
            capacityStatus: "NEAR_FULL"
        }
    ];
}

function getMockResponders() {
    return [
        { id: 1, fullName: "Responder 1" },
        { id: 2, fullName: "Responder 2" },
        { id: 3, fullName: "Responder 3" },
        { id: 4, fullName: "Responder 4" },
        { id: 5, fullName: "Responder 5" },
        { id: 6, fullName: "Responder 6" },
        { id: 7, fullName: "Responder 7" },
        { id: 8, fullName: "Responder 8" }
    ];
}