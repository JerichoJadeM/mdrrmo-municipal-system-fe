async function loadDashboard() {
    const response = await fetch("http://localhost:8080/api/dashboard/summary", {
        headers: {
            "Authorization": "Bearer " + localStorage.getItem("jwtToken")
        }
    });

    const data = await response.json();

    // Populate cards
    document.getElementById("totalBudget").innerText = data.totalBudget;
    document.getElementById("totalSpent").innerText = data.totalSpent;
    document.getElementById("remaining").innerText = data.remaining;
    document.getElementById("categoryCount").innerText = data.categoryCount;
    document.getElementById("expenseCount").innerText = data.expenseCount;

    renderPie(data.totalSpent, data.remaining);
    renderBar(data.categoryBreakdown);
}

function renderPie(spent, remaining) {
    new Chart(document.getElementById("budgetPie"), {
        type: "pie",
        data: {
            labels: ["Spent", "Remaining"],
            datasets: [{
                data: [spent, remaining],
                backgroundColor: ["#e74c3c", "#2ecc71"]
            }]
        }
    });
}

function renderBar(categories) {
    const labels = categories.map(c => c.name);
    const amounts = categories.map(c => c.amount);

    new Chart(document.getElementById("categoryBar"), {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Expense per Category",
                data: amounts,
                backgroundColor: "#3498db"
            }]
        }
    });
}

loadDashboard();