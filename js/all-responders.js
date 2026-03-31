const API_BASE = window.APP_CONFIG.API_BASE;
const RESPONDER_API = API_BASE + "/responders";

async function searchAvailableResponders(keyword = "") {
    try {
        const responders = await apiRequest(
            `${RESPONDER_API}/available?keyword=${encodeURIComponent(keyword)}`
        );

        const suggestions = document.getElementById("responderSuggestions");
        if (!suggestions) return;

        suggestions.innerHTML = "";

        if (!responders || responders.length === 0) {
            suggestions.innerHTML = `
                <div class="suggestion-item empty">No available responders found.</div>
            `;
            return;
        }

        responders.forEach(responder => {
            const item = document.createElement("div");
            item.className = "suggestion-item";
            item.textContent = responder.fullName || `${responder.firstName} ${responder.lastName}`;

            item.addEventListener("click", () => {
                const responderSearch = document.getElementById("responderSearch");
                const responderId = document.getElementById("responderId");

                if (responderSearch) {
                    responderSearch.value = responder.fullName || `${responder.firstName} ${responder.lastName}`;
                }

                if (responderId) {
                    responderId.value = responder.id;
                }

                suggestions.innerHTML = "";
            });

            suggestions.appendChild(item);
        });
    } catch (error) {
        console.error("Error loading responders:", error);
    }
}

function initResponderSearch() {
    const responderSearch = document.getElementById("responderSearch");
    const responderId = document.getElementById("responderId");
    const suggestions = document.getElementById("responderSuggestions");

    if (!responderSearch || !responderId || !suggestions) return;

    responderSearch.addEventListener("focus", async () => {
        await searchAvailableResponders(responderSearch.value.trim());
    });

    responderSearch.addEventListener("input", async () => {
        responderId.value = "";
        await searchAvailableResponders(responderSearch.value.trim());
    });

    document.addEventListener("click", (event) => {
        const clickedInside =
            responderSearch.contains(event.target) ||
            suggestions.contains(event.target);

        if (!clickedInside) {
            suggestions.innerHTML = "";
        }
    });
}