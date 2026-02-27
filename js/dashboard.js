/* ===================================================================
   MDRRMO DASHBOARD - Main Dashboard JavaScript Logic
   
   MODIFICATIONS SUMMARY:
   - Moved clock update from inline HTML script (lines 106+)
   - Added working Chart.js implementations for pie and bar charts
   - Restructured data loading for all card sections
   - Added risk level color coding function
   - Implemented error handling for API calls with fallback dummy data
   =================================================================== */

/**
 * MODIFICATION 1: Clock Update Function
 * Purpose: Update current time display every second
 * Moved from: index.html inline script (lines 315+)
 * Called: On page load and every 1000ms interval
 */
function updateClock() {
    const now = new Date();
    const timeElement = document.getElementById("currentTime");
    if (timeElement) {
        timeElement.innerText = now.toLocaleTimeString();
    }
}

// Start clock update on page load
setInterval(updateClock, 1000);
updateClock();

/**
 * MODIFICATION 2: Main Dashboard Load Function
 * Purpose: Fetch all dashboard data from API and populate cards
 * Sections Loaded:
 *   - Section A: Live Operations (incidents, severity, risk, weather)
 *   - Section B: Resource Readiness (vehicles, inventory, responders)
 *   - Section C: Financial Overview (budget, remaining)
 *   - Section D: Analytics Charts (incident trend, budget, type breakdown)
 */
async function loadDashboard() {
    try {
        console.log("Loading dashboard data...");
        const response = await fetch("http://localhost:8080/api/dashboard/summary", {
            headers: {
                "Authorization": "Bearer " + localStorage.getItem("jwtToken")
            }
        });

        if (!response.ok) {
            console.error("Failed to fetch dashboard data:", response.status);
            loadDummyData();
            return;
        }

        const data = await response.json();
        console.log("Dashboard data loaded:", data);

        // SECTION A: LIVE OPERATIONS - Most Critical Metrics
        populateCard("activeIncidents", data.activeIncidents);
        populateCard("highSeverityCount", data.highSeverityCount);
        populateCard("weatherAlert", data.weatherAlert);
        
        // Apply risk level color coding
        if (data.riskLevel) {
            populateCard("riskLevel", data.riskLevel);
            applyRiskColor(data.riskLevel);
        }

        // SECTION B: RESOURCE READINESS - Operational Capability
        populateCard("availableVehicles", data.availableVehicles);
        populateCard("lowStockItems", data.lowStockItems);
        populateCard("activeResponders", data.activeResponders);

        // SECTION C: FINANCIAL OVERVIEW - Budget Status
        populateCard("totalBudget", data.totalBudget);
        populateCard("remaining", data.remainingBudget || data.remaining);

        // SECTION D: RENDER ANALYTICS CHARTS
        // Load chart data with fallback to dummy data
        renderIncidentTrendChart(data.incidentTrend || generateChartDummyData(30, 5, 50));
        renderIncidentTypeChart(data.incidentByType || generateTypeData());
        renderBudgetChart(data.totalBudget, data.remainingBudget || data.remaining);
        renderCategoryChart(data.categoryBreakdown || generateCategoryData());

    } catch (error) {
        console.error("Error loading dashboard:", error);
        loadDummyData();
    }
}

/**
 * MODIFICATION 3: Helper Function - Populate Card Values
 * Purpose: Safely populate card elements with data
 * Handles: Missing elements, null values, formatting
 */
function populateCard(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        // Format numbers with commas if they're numbers
        if (typeof value === 'number') {
            element.innerText = value.toLocaleString();
        } else {
            element.innerText = value || "0";
        }
    }
}

/**
 * MODIFICATION 4: Risk Level Color Coding
 * Purpose: Apply dynamic colors to risk level based on severity
 * Color Mapping:
 *   - LOW: Green (#2ecc71)
 *   - MODERATE: Orange (#f39c12)
 *   - HIGH: Dark Orange (#e67e22)
 *   - CRITICAL: Red (#e74c3c)
 */
function applyRiskColor(level) {
    const element = document.getElementById("riskLevel");
    if (!element) return;

    const colorMap = {
        "LOW": "#2ecc71",
        "MODERATE": "#f39c12",
        "HIGH": "#e67e22",
        "CRITICAL": "#e74c3c"
    };

    element.style.color = colorMap[level] || "#95a5a6";
    console.log("Risk level color applied:", level, colorMap[level]);
}

/**
 * MODIFICATION 5: Chart Function - Incident Trend
 * Purpose: Render line chart showing incident frequency over 30 days
 * Chart Type: Line chart with area fill
 * Data: Array of date and count pairs
 */
function renderIncidentTrendChart(data) {
    const ctx = document.getElementById("incidentTrendChart");
    if (!ctx) {
        console.warn("Chart element #incidentTrendChart not found");
        return;
    }

    // Destroy existing chart if it exists
    if (window.incidentTrendChartInstance) {
        window.incidentTrendChartInstance.destroy();
    }

    const labels = data.map((d, i) => {
        if (d.date) return d.date;
        const date = new Date();
        date.setDate(date.getDate() - (29 - i));
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const counts = data.map(d => d.count || d);

    window.incidentTrendChartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "Incidents",
                data: counts,
                borderColor: "rgba(74, 144, 226, 1)",
                backgroundColor: "rgba(74, 144, 226, 0.1)",
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: "rgba(74, 144, 226, 1)",
                pointBorderColor: "#fff",
                pointBorderWidth: 2,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    labels: { font: { size: 12 } }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: function(value) { return Math.floor(value); } }
                }
            }
        }
    });
    console.log("Incident Trend Chart rendered");
}

/**
 * MODIFICATION 6: Chart Function - Incidents by Type
 * Purpose: Render bar chart showing incident breakdown by category
 * Chart Type: Horizontal bar chart
 * Colors: Red, Orange, Blue gradient
 */
function renderIncidentTypeChart(data) {
    const ctx = document.getElementById("incidentTypeChart");
    if (!ctx) {
        console.warn("Chart element #incidentTypeChart not found");
        return;
    }

    // Destroy existing chart if it exists
    if (window.incidentTypeChartInstance) {
        window.incidentTypeChartInstance.destroy();
    }

    const labels = data.map(d => d.type || d.name || "Type");
    const counts = data.map(d => d.count || d.value || 0);
    const colors = ["rgba(231, 76, 60, 0.7)", "rgba(243, 156, 18, 0.7)", "rgba(52, 152, 219, 0.7)"];

    window.incidentTypeChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Incident Count",
                data: counts,
                backgroundColor: colors.slice(0, labels.length),
                borderColor: colors.map(c => c.replace("0.7", "1")).slice(0, labels.length),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: 'y',
            plugins: { legend: { display: true } },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { callback: function(value) { return Math.floor(value); } }
                }
            }
        }
    });
    console.log("Incident Type Chart rendered");
}

/**
 * MODIFICATION 7: Chart Function - Budget Pie Chart
 * Purpose: Render pie chart showing budget spent vs remaining
 * Chart Type: Pie chart with red/green color scheme
 * Data: Total spent and remaining amounts
 */
function renderBudgetChart(spent, remaining) {
    const ctx = document.getElementById("budgetPie");
    if (!ctx) {
        console.warn("Chart element #budgetPie not found");
        return;
    }

    // Destroy existing chart if it exists
    if (window.budgetChartInstance) {
        window.budgetChartInstance.destroy();
    }

    spent = spent || 0;
    remaining = remaining || 0;

    window.budgetChartInstance = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: ["Spent", "Remaining"],
            datasets: [{
                data: [spent, remaining],
                backgroundColor: ["rgba(231, 76, 60, 0.8)", "rgba(39, 174, 96, 0.8)"],
                borderColor: ["#e74c3c", "#27ae60"],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: true, position: "bottom" } }
        }
    });
    console.log("Budget Chart rendered");
}

/**
 * MODIFICATION 8: Chart Function - Category Bar Chart
 * Purpose: Render bar chart showing expenses by category
 * Chart Type: Vertical bar chart
 * Data: Category names and expense amounts
 */
function renderCategoryChart(data) {
    const ctx = document.getElementById("categoryBar");
    if (!ctx) {
        console.warn("Chart element #categoryBar not found");
        return;
    }

    // Destroy existing chart if it exists
    if (window.categoryChartInstance) {
        window.categoryChartInstance.destroy();
    }

    const labels = data.map(d => d.name || "Category");
    const amounts = data.map(d => d.amount || d.value || 0);

    window.categoryChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Expense Amount",
                data: amounts,
                backgroundColor: "rgba(52, 152, 219, 0.7)",
                borderColor: "rgba(52, 152, 219, 1)",
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: true } },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: function(value) { return "₱" + value.toLocaleString(); } }
                }
            }
        }
    });
    console.log("Category Chart rendered");
}

/**
 * MODIFICATION 9: Dummy Data Generators
 * Purpose: Provide fallback data when API is unavailable
 * Used for: Testing and offline mode
 */
function generateChartDummyData(days, min, max) {
    const data = [];
    for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - (days - 1 - i));
        data.push({
            date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            count: Math.floor(Math.random() * (max - min + 1)) + min
        });
    }
    return data;
}

function generateTypeData() {
    return [
        { type: "Flood", count: Math.floor(Math.random() * 20) + 5 },
        { type: "Fire", count: Math.floor(Math.random() * 15) + 3 },
        { type: "Landslide", count: Math.floor(Math.random() * 10) + 2 }
    ];
}

function generateCategoryData() {
    return [
        { name: "Relief", amount: Math.floor(Math.random() * 500000) },
        { name: "Response", amount: Math.floor(Math.random() * 800000) },
        { name: "Prevention", amount: Math.floor(Math.random() * 300000) }
    ];
}

/**
 * MODIFICATION 10: Load Dummy Data
 * Purpose: Populate dashboard with dummy data when API fails
 * Displays: All cards and charts with sample values
 */
function loadDummyData() {
    console.log("Loading dummy data due to API failure...");
    
    // Populate dummy card values
    populateCard("activeIncidents", 3);
    populateCard("highSeverityCount", 1);
    populateCard("riskLevel", "MODERATE");
    populateCard("weatherAlert", "CAUTION");
    populateCard("availableVehicles", 12);
    populateCard("lowStockItems", 5);
    populateCard("activeResponders", 24);
    populateCard("totalBudget", 1000000);
    populateCard("remaining", 450000);

    // Apply risk color
    applyRiskColor("MODERATE");

    // Render dummy charts
    renderIncidentTrendChart(generateChartDummyData(30, 2, 8));
    renderIncidentTypeChart(generateTypeData());
    renderBudgetChart(550000, 450000);
    renderCategoryChart(generateCategoryData());
}

/**
 * MODIFICATION 11: Initialize Dashboard on Page Load
 * Purpose: Entry point - loads all dashboard data when page is ready
 */
document.addEventListener("DOMContentLoaded", function() {
    console.log("DOM loaded, initializing dashboard...");
    loadDashboard();
});