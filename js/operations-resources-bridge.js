// operations-resources-bridge.js
// Load this AFTER the existing operations scripts.

(function () {
    const API_BASE_FALLBACK = "http://localhost:8080/api";

    function getApiBase() {
        return typeof API_BASE === "string" && API_BASE.trim()
            ? API_BASE
            : API_BASE_FALLBACK;
    }

    function escapeHtmlSafe(value) {
        if (typeof escapeHtml === "function") return escapeHtml(value ?? "");
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function showToastBridge(message, type = "info") {
        if (typeof showToastSafe === "function") {
            showToastSafe(message, type);
            return;
        }
        if (typeof showToast === "function") {
            showToast(message, type);
            return;
        }
        console.log(`[${type}] ${message}`);
    }

    async function apiGetBridge(url) {
        if (typeof apiRequest === "function") {
            return apiRequest(url);
        }

        const response = await fetch(url, {
            headers: { "Content-Type": "application/json" },
            credentials: "include"
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(text || `HTTP ${response.status}`);
        }

        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            return response.json();
        }
        return response.text();
    }

    async function fetchOperationReliefStatusBridge(eventType, eventId) {
        const normalized = String(eventType || "").toUpperCase();
        const base = getApiBase();

        if (normalized === "INCIDENT") {
            return apiGetBridge(`${base}/operations/incidents/${eventId}/relief-status`);
        }
        if (normalized === "CALAMITY") {
            return apiGetBridge(`${base}/operations/calamities/${eventId}/relief-status`);
        }
        return null;
    }

    function navigateToResourcesBridge(tab) {
        const review = window.pendingTransitionReview || null;
        const params = new URLSearchParams({
            tab: tab || "inventory",
            source: "operations",
            eventType: String(review?.type || ""),
            eventId: String(review?.data?.id || "")
        });
        window.location.href = `resources.html?${params.toString()}`;
    }

    function goToInventoryPageBridge() {
        navigateToResourcesBridge("inventory");
    }

    function goToReliefPageBridge() {
        navigateToResourcesBridge("relief");
    }

    function patchActionButtonsBridge(root) {
        if (!root) return;

        root.querySelectorAll("[data-stock-action='open-inventory'], [data-bridge-open-inventory='true']").forEach(btn => {
            if (btn.dataset.bridgeBound === "true") return;
            btn.dataset.bridgeBound = "true";
            btn.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                goToInventoryPageBridge();
            }, true);
        });

        root.querySelectorAll("[data-bridge-request-additional-packs='true']").forEach(btn => {
            if (btn.dataset.bridgeBound === "true") return;
            btn.dataset.bridgeBound = "true";
            btn.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                goToReliefPageBridge();
            }, true);
        });
    }

    function getReliefBasisLabel(relief) {
        const basis = String(relief?.basis || "").toUpperCase();
        if (basis === "EVACUEE") return "Per Evacuee";
        if (basis === "FAMILY") return "Per Family";
        return relief?.basis || "Forecast basis";
    }

    function getEffectiveProjectedPacks(relief) {
        const projected = Number(relief?.projectedReliefPacks || 0);
        const beneficiaries = Number(relief?.projectedBeneficiaries || 0);
        return Math.max(projected, beneficiaries);
    }

    function getEffectiveRemainingPacks(relief) {
        const effectiveProjected = getEffectiveProjectedPacks(relief);
        const distributed = Number(relief?.distributedReliefPacks || 0);
        return Math.max(effectiveProjected - distributed, 0);
    }

    function isReliefPriorityMode() {
        const relief = window.__opsPendingTransitionReliefStatus;
        return Boolean(
            relief &&
            relief.reliefRecommended &&
            getEffectiveProjectedPacks(relief) > 0
        );
    }

    function getDecisionModel(relief) {
        const status = String(relief?.status || "").toUpperCase();
        const remainingPacks = getEffectiveRemainingPacks(relief);
        const distributedPacks = Number(relief?.distributedReliefPacks || 0);
        const projectedPacks = getEffectiveProjectedPacks(relief);

        if (!relief || !relief.reliefRecommended || status === "NOT_REQUIRED") {
            return {
                title: "No relief action needed",
                toneClass: "decision-neutral",
                action: "Proceed with responder movement and monitoring. No food pack deployment is required right now.",
                nextStep: "Review team dispatch, scene safety, and status updates."
            };
        }

        if (remainingPacks <= 0 && distributedPacks > 0) {
            return {
                title: "Relief already covered",
                toneClass: "decision-good",
                action: "Food pack requirement is already fulfilled. Focus on monitoring, follow-up distribution, and field coordination.",
                nextStep: "Confirm responder actions and continue operation monitoring."
            };
        }

        if (status === "INSUFFICIENT_STOCK") {
            return {
                title: "Inventory action needed now",
                toneClass: "decision-danger",
                action: `Need ${remainingPacks} more food pack(s), but current stock is insufficient.`,
                nextStep: "Open Inventory and review lacking items before approving movement."
            };
        }

        if (distributedPacks > 0 && remainingPacks > 0) {
            return {
                title: "Request additional packs",
                toneClass: "decision-warn",
                action: `${distributedPacks} pack(s) already covered. Request ${remainingPacks} more food pack(s) to complete this operation.`,
                nextStep: "Open Relief and continue the additional distribution workflow."
            };
        }

        return {
            title: "Prepare relief deployment",
            toneClass: "decision-primary",
            action: `Prepare ${projectedPacks} food pack(s) for this operation.`,
            nextStep: "Review stock readiness, then approve distribution and dispatch."
        };
    }

    function renderReliefStatusBridge(relief) {
        const container = document.getElementById("transitionReliefReadiness");
        if (!container) return;

        if (!relief) {
            container.innerHTML = `<div class="decision-empty-card">No relief readiness data available.</div>`;
            return;
        }

        const status = String(relief.status || "").toUpperCase();
        const projectedBeneficiaries = Number(relief.projectedBeneficiaries || 0);
        const projectedReliefPacks = getEffectiveProjectedPacks(relief);
        const distributedReliefPacks = Number(relief.distributedReliefPacks || 0);
        const remainingReliefPacks = getEffectiveRemainingPacks(relief);
        const distributedItems = Array.isArray(relief.distributedItems) ? relief.distributedItems : [];
        const lackingItems = Array.isArray(relief.lackingItems) ? relief.lackingItems : [];
        const decision = getDecisionModel(relief);

        const statusLabel = {
            NOT_REQUIRED: "Not Required",
            REQUIRED: "Relief Needed",
            PARTIALLY_DISTRIBUTED: "Partially Distributed",
            FULFILLED: "Relief Ready",
            INSUFFICIENT_STOCK: "Insufficient Stock"
        }[status] || "Relief Review";

        const showInventoryButton = status === "INSUFFICIENT_STOCK" && remainingReliefPacks > 0;
        const showRequestButton = remainingReliefPacks > 0;

        container.innerHTML = `
            <div class="transition-relief-readiness-block">
                <section class="ops-decision-panel ${decision.toneClass}">
                    <div class="ops-decision-eyebrow">Immediate Action</div>
                    <h3>${escapeHtmlSafe(decision.title)}</h3>
                    <p>${escapeHtmlSafe(decision.action)}</p>
                    <div class="ops-decision-next">
                        <strong>Next step:</strong> ${escapeHtmlSafe(decision.nextStep)}
                    </div>
                    <div class="ops-action-row">
                        ${showRequestButton ? `
                            <button type="button" class="ops-decision-btn ops-decision-btn-secondary" data-bridge-request-additional-packs="true">
                                Request Additional Packs
                            </button>
                        ` : ""}
                        ${showInventoryButton ? `
                            <button type="button" class="ops-decision-btn" data-bridge-open-inventory="true">
                                Open Inventory
                            </button>
                        ` : ""}
                    </div>
                </section>

                <section class="ops-summary-strip">
                    <article class="ops-summary-chip">
                        <span class="ops-summary-label">Status</span>
                        <strong>${escapeHtmlSafe(statusLabel)}</strong>
                    </article>
                    <article class="ops-summary-chip">
                        <span class="ops-summary-label">Beneficiaries</span>
                        <strong>${projectedBeneficiaries}</strong>
                    </article>
                    <article class="ops-summary-chip ops-summary-chip-primary">
                        <span class="ops-summary-label">Food Packs</span>
                        <strong>${projectedReliefPacks}</strong>
                    </article>
                    <article class="ops-summary-chip">
                        <span class="ops-summary-label">Distributed</span>
                        <strong>${distributedReliefPacks}</strong>
                    </article>
                    <article class="ops-summary-chip">
                        <span class="ops-summary-label">Remaining</span>
                        <strong>${remainingReliefPacks}</strong>
                    </article>
                </section>

                <div class="ops-note-card ops-note-card-soft">
                    Pack Basis: <strong>${escapeHtmlSafe(getReliefBasisLabel(relief))}</strong>
                </div>

                ${remainingReliefPacks > 0 ? (
                    lackingItems.length ? `
                        <details class="ops-details-card ops-details-card-danger" open>
                            <summary>Lacking items (${lackingItems.length})</summary>
                            <div class="ops-details-list">
                                ${lackingItems.map(item => `
                                    <div class="ops-details-row">
                                        <strong>${escapeHtmlSafe(item.inventoryName || "-")}</strong>
                                        <span>Lacking ${Number(item.lackingQuantity || 0)} ${escapeHtmlSafe(item.unit || "")}</span>
                                    </div>
                                `).join("")}
                            </div>
                        </details>
                    ` : `
                        <div class="ops-note-card ops-note-card-warn">
                            ${remainingReliefPacks} more food pack(s) still needed.
                        </div>
                    `
                ) : ""}

                ${distributedItems.length ? `
                    <details class="ops-details-card">
                        <summary>View distributed items (${distributedItems.length})</summary>
                        <div class="ops-details-list">
                            ${distributedItems.map(item => `
                                <div class="ops-details-row">
                                    <strong>${escapeHtmlSafe(item.inventoryName || "-")}</strong>
                                    <span>${Number(item.distributedQuantity || 0)} ${escapeHtmlSafe(item.unit || "")}</span>
                                </div>
                            `).join("")}
                        </div>
                    </details>
                ` : `
                    <div class="ops-note-card">No relief has been distributed yet.</div>
                `}
            </div>
        `;

        patchActionButtonsBridge(container);
    }

    function renderPackOnlySuggestionBridge(relief) {
        const container = document.getElementById("transitionSuggestedResources");
        if (!container) return;

        const projected = getEffectiveProjectedPacks(relief);
        const distributed = Number(relief?.distributedReliefPacks || 0);
        const remaining = getEffectiveRemainingPacks(relief);
        const status = String(relief?.status || "").toUpperCase();

        const actionText = status === "INSUFFICIENT_STOCK"
            ? "Open Inventory to review shortages before approving movement."
            : remaining > 0
                ? `Request or send ${remaining} more food pack(s) now.`
                : projected > 0
                    ? `Prepare ${projected} food pack(s) for deployment.`
                    : "No food pack deployment needed right now.";

        container.innerHTML = `
            <div class="ops-pack-focus-card">
                <div class="ops-pack-focus-header">
                    <div>
                        <div class="ops-pack-focus-label">Priority Resource</div>
                        <h4>Food Pack Deployment</h4>
                    </div>
                    <span class="transition-resource-badge">Relief Priority</span>
                </div>

                <div class="ops-pack-focus-metrics">
                    <div class="ops-pack-focus-metric">
                        <span>Recommended</span>
                        <strong>${projected}</strong>
                    </div>
                    <div class="ops-pack-focus-metric">
                        <span>Distributed</span>
                        <strong>${distributed}</strong>
                    </div>
                    <div class="ops-pack-focus-metric">
                        <span>Remaining</span>
                        <strong>${remaining}</strong>
                    </div>
                </div>

                <div class="ops-pack-focus-action">
                    ${escapeHtmlSafe(actionText)}
                </div>

                <div class="ops-pack-basis">
                    Basis: <strong>${escapeHtmlSafe(getReliefBasisLabel(relief))}</strong>
                </div>
            </div>
        `;
    }

    function buildReliefStockRows(relief) {
        const distributedPacks = Number(relief?.distributedReliefPacks || 0);
        const remainingPacks = getEffectiveRemainingPacks(relief);

        if (distributedPacks > 0) return [];

        const lackingItems = Array.isArray(relief?.lackingItems) ? relief.lackingItems : [];
        if (lackingItems.length) {
            return lackingItems.map(item => ({
                name: item.inventoryName || "-",
                category: "RELIEF COMPONENT",
                requiredLabel: `${Number(item.requiredQuantityForRemainingPacks || 0)} ${item.unit || ""}`.trim(),
                availableLabel: `${Number(item.availableQuantity || 0)} ${item.unit || ""}`.trim(),
                state: Number(item.lackingQuantity || 0) > 0 ? "insufficient" : "ok",
                helper: `Needed for remaining food packs • per pack: ${Number(item.quantityRequiredPerPack || 0)} ${item.unit || ""}`.trim()
            }));
        }

        if (remainingPacks > 0) {
            return [{
                name: "Food Pack Requirement",
                category: "RELIEF SUMMARY",
                requiredLabel: `${remainingPacks} pack(s)`,
                availableLabel: "Check Relief Readiness",
                state: "ok",
                helper: "Use Relief Readiness to continue the relief workflow."
            }];
        }

        return [];
    }

    function renderReliefStockChecksBridge() {
        const container = document.getElementById("transitionStockChecks");
        if (!container) return;

        const relief = window.__opsPendingTransitionReliefStatus;
        const distributedPacks = Number(relief?.distributedReliefPacks || 0);
        const rows = buildReliefStockRows(relief);

        if (distributedPacks > 0) {
            container.innerHTML = `
                <div class="ops-note-card ops-note-card-soft">
                    Relief packs were already distributed. Review Relief Readiness above for distributed items and remaining pack needs.
                </div>
            `;
            return;
        }

        if (!rows.length) {
            container.innerHTML = `
                <div class="ops-note-card">
                    No component stock issues detected for the current relief requirement.
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="ops-stock-focus-card">
                <div class="ops-stock-focus-head">
                    <div>
                        <div class="ops-pack-focus-label">Inventory Check</div>
                        <h4>Relief Pack Components</h4>
                    </div>
                    <span class="transition-resource-badge">Relief Priority</span>
                </div>

                <div class="ops-stock-focus-list">
                    ${rows.map(row => `
                        <article class="ops-stock-row ${row.state === "insufficient" ? "ops-stock-row-danger" : ""}">
                            <div class="ops-stock-main">
                                <strong>${escapeHtmlSafe(row.name)}</strong>
                                <span>${escapeHtmlSafe(row.category)}</span>
                            </div>
                            <div class="ops-stock-values">
                                <div>
                                    <label>Required</label>
                                    <strong>${escapeHtmlSafe(row.requiredLabel)}</strong>
                                </div>
                                <div>
                                    <label>Available</label>
                                    <strong>${escapeHtmlSafe(row.availableLabel)}</strong>
                                </div>
                            </div>
                            <div class="ops-stock-helper">${escapeHtmlSafe(row.helper)}</div>
                        </article>
                    `).join("")}
                </div>

                <div class="ops-stock-footer">
                    Inventory check is showing component items for food pack readiness before distribution.
                </div>
            </div>
        `;

        patchActionButtonsBridge(container);
    }

    function renderAdditionalSupportNeedsBridge(forecast) {
        const container = document.getElementById("transitionSuggestedResources");
        if (!container) return;

        const suggested = Array.isArray(forecast?.recommendedResources) ? forecast.recommendedResources : [];
        const supportItems = suggested.filter(item => {
            const name = String(item?.itemName || "");
            return !/food pack|relief pack/i.test(name);
        });

        const rows = supportItems.map(item => {
            const name = item?.itemName || "Support Item";
            const category = item?.category || "SUPPORT";
            const quantity = Number(item?.suggestedQuantity || item?.requiredQuantity || 0);
            const unit = item?.unit || "";
            let helper = "Recommended to support this operation.";

            if (/vehicle/i.test(name)) {
                helper = "Use for transport of relief goods, responders, or evacuee support.";
            } else if (/medical|first aid|ambulance|medicine/i.test(name)) {
                helper = "For patients or people needing medical attention.";
            } else if (/chainsaw|generator|radio|truck|boat|equipment/i.test(name)) {
                helper = "Operational support asset or equipment.";
            } else if (/evac/i.test(name) || /center/i.test(name)) {
                helper = "Related to evacuation support or center operations.";
            }

            return `
                <div class="ops-support-item">
                    <div class="ops-support-item-top">
                        <strong>${escapeHtmlSafe(name)}</strong>
                        ${quantity > 0 ? `<span>${quantity} ${escapeHtmlSafe(unit)}</span>` : ""}
                    </div>
                    <div class="ops-support-item-meta">${escapeHtmlSafe(category)} • ${escapeHtmlSafe(helper)}</div>
                    <div class="ops-support-item-inputs">
                        <label>
                            Suggested Qty
                            <input type="number" min="0" value="${quantity > 0 ? quantity : 0}" />
                        </label>
                        <label>
                            Notes
                            <input type="text" placeholder="Optional notes" />
                        </label>
                    </div>
                </div>
            `;
        }).join("");

        container.innerHTML += `
            <details class="ops-details-card ops-support-details">
                <summary>View additional support needs (${supportItems.length})</summary>
                ${supportItems.length ? `
                    <div class="ops-support-list">
                        ${rows}
                    </div>
                ` : `
                    <div class="ops-note-card" style="margin-top:10px;">No additional support needs detected.</div>
                `}
            </details>
        `;
    }

    function hideCostDriversBridge() {
        const container = document.getElementById("transitionCostDrivers");
        if (!container) return;
        container.innerHTML = "";
        const section = container.closest(".transition-review-block, .transition-section, .review-section, .forecast-section");
        if (section) {
            section.style.display = "none";
        } else {
            container.style.display = "none";
        }
    }

    function injectBridgeStyles() {
        if (document.getElementById("operationsResourcesBridgeStyles")) return;

        const style = document.createElement("style");
        style.id = "operationsResourcesBridgeStyles";
        style.textContent = `
            .transition-relief-readiness-block {
                display: grid;
                gap: 12px;
            }

            .ops-decision-panel {
                border-radius: 14px;
                padding: 16px;
                border: 1px solid #e5e7eb;
                background: #ffffff;
                display: grid;
                gap: 8px;
            }

            .ops-decision-panel h3 {
                margin: 0;
                font-size: 1.05rem;
            }

            .ops-decision-panel p,
            .ops-decision-next {
                margin: 0;
                line-height: 1.45;
            }

            .ops-decision-eyebrow {
                font-size: 0.76rem;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                opacity: 0.8;
            }

            .decision-primary { border-color: #bfdbfe; background: #eff6ff; }
            .decision-good { border-color: #bbf7d0; background: #f0fdf4; }
            .decision-warn { border-color: #fde68a; background: #fffbeb; }
            .decision-danger { border-color: #fecaca; background: #fef2f2; }
            .decision-neutral { border-color: #e5e7eb; background: #f9fafb; }

            .ops-action-row {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
            }

            .ops-decision-btn {
                justify-self: start;
                border: none;
                border-radius: 10px;
                padding: 10px 14px;
                cursor: pointer;
                font-weight: 600;
                background: #111827;
                color: #ffffff;
            }

            .ops-decision-btn-secondary {
                background: #2563eb;
            }

            .ops-summary-strip {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                gap: 10px;
            }

            .ops-summary-chip {
                background: #ffffff;
                border: 1px solid #e5e7eb;
                border-radius: 12px;
                padding: 12px;
                display: grid;
                gap: 6px;
            }

            .ops-summary-chip-primary { border-color: #bfdbfe; background: #eff6ff; }

            .ops-summary-label,
            .ops-pack-focus-label {
                font-size: 0.78rem;
                color: #6b7280;
                text-transform: uppercase;
                letter-spacing: 0.04em;
            }

            .ops-details-card,
            .ops-note-card,
            .ops-pack-focus-card,
            .ops-stock-focus-card {
                background: #ffffff;
                border: 1px solid #e5e7eb;
                border-radius: 12px;
                padding: 12px 14px;
            }

            .ops-note-card-soft {
                background: #f8fafc;
            }

            .ops-details-card-danger,
            .ops-note-card-warn {
                border-color: #fecaca;
                background: #fff7f7;
            }

            .ops-details-card summary {
                cursor: pointer;
                font-weight: 600;
            }

            .ops-details-list,
            .ops-support-list {
                display: grid;
                gap: 8px;
                margin-top: 10px;
            }

            .ops-details-row {
                display: flex;
                justify-content: space-between;
                gap: 12px;
                border-bottom: 1px dashed #e5e7eb;
                padding-bottom: 6px;
            }

            .ops-pack-focus-header,
            .ops-stock-focus-head {
                display: flex;
                justify-content: space-between;
                align-items: start;
                gap: 12px;
                margin-bottom: 12px;
            }

            .ops-pack-focus-header h4,
            .ops-stock-focus-head h4 {
                margin: 4px 0 0 0;
            }

            .ops-pack-focus-metrics {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 10px;
                margin-bottom: 12px;
            }

            .ops-pack-focus-metric {
                border: 1px solid #e5e7eb;
                border-radius: 10px;
                padding: 10px;
                background: #f9fafb;
                display: grid;
                gap: 4px;
                text-align: center;
            }

            .ops-pack-focus-action {
                font-weight: 600;
                margin-bottom: 10px;
            }

            .ops-pack-basis {
                margin-bottom: 10px;
                color: #475569;
            }

            .ops-stock-focus-list {
                display: grid;
                gap: 10px;
            }

            .ops-stock-row {
                border: 1px solid #e5e7eb;
                border-radius: 12px;
                padding: 12px;
                background: #f9fafb;
                display: grid;
                gap: 10px;
            }

            .ops-stock-row-danger {
                border-color: #fecaca;
                background: #fff7f7;
            }

            .ops-stock-main {
                display: flex;
                justify-content: space-between;
                gap: 12px;
                align-items: center;
            }

            .ops-stock-main span {
                color: #6b7280;
                font-size: 0.8rem;
            }

            .ops-stock-values {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
            }

            .ops-stock-values label {
                display: block;
                font-size: 0.72rem;
                text-transform: uppercase;
                color: #64748b;
                margin-bottom: 4px;
            }

            .ops-stock-helper,
            .ops-stock-footer {
                color: #475569;
                font-size: 0.9rem;
            }

            .ops-support-details {
                margin-top: 12px;
            }

            .ops-support-item {
                border: 1px solid #e5e7eb;
                border-radius: 12px;
                padding: 12px;
                background: #f9fafb;
                display: grid;
                gap: 8px;
            }

            .ops-support-item-top {
                display: flex;
                justify-content: space-between;
                gap: 12px;
            }

            .ops-support-item-meta {
                color: #475569;
                font-size: 0.92rem;
            }

            .ops-support-item-inputs {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
            }

            .ops-support-item-inputs label {
                display: grid;
                gap: 6px;
                font-size: 0.82rem;
                color: #475569;
            }

            .ops-support-item-inputs input {
                border: 1px solid #d1d5db;
                border-radius: 8px;
                padding: 8px 10px;
                font: inherit;
                background: #ffffff;
            }

            .decision-empty-card {
                background: #f9fafb;
                border: 1px dashed #d1d5db;
                border-radius: 12px;
                padding: 14px;
            }
        `;
        document.head.appendChild(style);
    }

    async function loadTransitionReviewForecastBridge(config) {
        try {
            const base = getApiBase();
            const forecastEndpoint = config.type === "INCIDENT"
                ? `${base}/operations/forecast/incidents/${config.data.id}`
                : `${base}/operations/forecast/calamities/${config.data.id}`;

            const [forecast, reliefStatus] = await Promise.all([
                apiGetBridge(forecastEndpoint),
                fetchOperationReliefStatusBridge(config.type, config.data.id)
            ]);

            window.__opsPendingTransitionReliefStatus = reliefStatus || null;
            window.__opsPendingTransitionForecast = forecast || null;

            if (typeof pendingTransitionStockChecksRaw !== "undefined") {
                pendingTransitionStockChecksRaw = Array.isArray(forecast.stockChecks) ? forecast.stockChecks : [];
            }
            if (typeof pendingTransitionSuggestedResources !== "undefined" && typeof normalizeTransitionSuggestedResources === "function") {
                pendingTransitionSuggestedResources = normalizeTransitionSuggestedResources(forecast.recommendedResources || []);
            }
            if (typeof pendingTransitionWarnings !== "undefined") {
                pendingTransitionWarnings = Array.isArray(forecast.warnings) ? forecast.warnings : [];
            }

            if (typeof preloadTransitionInventoryCatalog === "function") {
                await preloadTransitionInventoryCatalog();
            }
            if (typeof preloadEvacuationCenterCatalog === "function") {
                await preloadEvacuationCenterCatalog();
            }
            if (typeof loadTransitionEvacuationAssignments === "function") {
                await loadTransitionEvacuationAssignments(config);
            }

            if (typeof renderTransitionSuggestedResources === "function") {
                renderTransitionSuggestedResources();
            }

            if (isReliefPriorityMode()) {
                renderReliefStockChecksBridge();
            } else if (typeof renderTransitionStockChecks === "function") {
                renderTransitionStockChecks();
            }

            renderReliefStatusBridge(reliefStatus || forecast.reliefReadiness);

            if (typeof renderTransitionEvacuation === "function") {
                renderTransitionEvacuation(forecast.evacuationChecks || []);
            }

            hideCostDriversBridge();

            if (typeof renderTransitionWarnings === "function") {
                renderTransitionWarnings(typeof pendingTransitionWarnings !== "undefined" ? pendingTransitionWarnings : []);
            }

            if (typeof loadTransitionAcknowledgementStatus === "function") {
                await loadTransitionAcknowledgementStatus(config);
            }

            if (typeof renderTransitionAcknowledgements === "function") {
                renderTransitionAcknowledgements(typeof pendingTransitionWarnings !== "undefined" ? pendingTransitionWarnings : []);
            }

            if (typeof syncTransitionReviewButtonLabel === "function") {
                syncTransitionReviewButtonLabel(typeof pendingTransitionWarnings !== "undefined" ? pendingTransitionWarnings : []);
            }

            patchActionButtonsBridge(document);
        } catch (error) {
            console.error("Error loading transition review forecast:", error);
            showToastBridge("Failed to load transition review.", "error");
        }
    }

    function installPatches() {
        injectBridgeStyles();

        window.fetchOperationReliefStatusBridge = fetchOperationReliefStatusBridge;
        window.renderOperationReliefStatusBridge = renderReliefStatusBridge;
        window.renderReliefStockChecksBridge = renderReliefStockChecksBridge;

        if (typeof loadTransitionReviewForecast === "function") {
            window.__originalLoadTransitionReviewForecast = loadTransitionReviewForecast;
            loadTransitionReviewForecast = loadTransitionReviewForecastBridge;
        }

        if (typeof renderTransitionSuggestedResources === "function") {
            const originalRenderTransitionSuggestedResources = renderTransitionSuggestedResources;
            renderTransitionSuggestedResources = function () {
                if (isReliefPriorityMode()) {
                    renderPackOnlySuggestionBridge(window.__opsPendingTransitionReliefStatus);
                    renderAdditionalSupportNeedsBridge(window.__opsPendingTransitionForecast || {});
                } else {
                    originalRenderTransitionSuggestedResources.apply(this, arguments);
                }

                patchActionButtonsBridge(document.getElementById("transitionSuggestedResources") || document);
            };
        }

        if (typeof renderTransitionStockChecks === "function") {
            const originalRenderTransitionStockChecks = renderTransitionStockChecks;
            renderTransitionStockChecks = function () {
                if (isReliefPriorityMode()) {
                    renderReliefStockChecksBridge();
                } else {
                    originalRenderTransitionStockChecks.apply(this, arguments);
                }
                patchActionButtonsBridge(document.getElementById("transitionStockChecks") || document);
            };
        }

        if (typeof renderTransitionCostDrivers === "function") {
            renderTransitionCostDrivers = function () {
                hideCostDriversBridge();
            };
        }

        // IMPORTANT: do not override renderTransitionWarnings.
        // Let operations-readiness.js keep the original warning behavior and colors.

        const observer = new MutationObserver(() => {
            hideCostDriversBridge();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", installPatches);
    } else {
        installPatches();
    }
})();