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

    // Load calamities count this year
    await loadCalamitiesThisYear();

    renderPie(data.totalSpent, data.remaining);
    renderBar(data.categoryBreakdown);
}

async function loadCalamitiesThisYear() {
    try {
        const response = await fetch("http://localhost:8080/api/calamities", {
            headers: {
                "Authorization": "Bearer " + localStorage.getItem("jwtToken")
            }
        });

        if (!response.ok) {
            console.error("Failed to fetch calamities");
            return;
        }

        const calamities = await response.json();
        
        // Get current year
        const currentYear = new Date().getFullYear();
        
        // Filter calamities for this year
        const calamitiesThisYear = calamities.filter(calamity => {
            const calamityYear = new Date(calamity.date).getFullYear();
            return calamityYear === currentYear;
        });
        
        // Update the calamity count card
        document.getElementById("calamityCount").innerText = calamitiesThisYear.length;
    } catch (error) {
        console.error("Error loading calamities this year:", error);
        document.getElementById("calamityCount").innerText = "0";
    }
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