const API_BASE = "http://localhost:8080/api";
const ADMIN_SECTIONS = ["profile", "notifications", "approvals", "messages", "users", "roles", "password"];
const LIVE_REFRESH_MS = 10000;

const state = {
    profile: null,
    notifications: [],
    approvalsPending: [],
    approvalsMine: [],
    conversations: [],
    users: [],
    roleChanges: [],
    selectedConversationId: null,
    approvalView: "PENDING",
    selectedRecipientUserId: null,
    liveRefreshHandle: null
};

let notificationsPagination = null;
let approvalsPagination = null;
let conversationPagination = null;
let roleChangesPagination = null;
let activeThreadMenuId = null;
let currentThreadMessages = [];
let __appConfirmAction = null;
let editingMessageId = null;

document.addEventListener("DOMContentLoaded", async () => {
    ensureGlobalActionConfirmModal();
    bindGlobalActionConfirmModal();

    initNotificationsPagination();
    initApprovalsPagination();
    initConversationPagination();
    initRoleChangesPagination();

    bindAdminNavigation();
    bindHashRouting();
    bindProfileActions();
    bindNotificationActions();
    bindApprovalActions();
    bindMessageActions();
    bindUserActions();
    bindPasswordForm();
    bindModals();

    await loadAdminData();
    showSection(getHashSection());
    startLiveRefresh();
    document.addEventListener("visibilitychange", handleVisibilityRefresh);
});

async function apiRequest(url, options = {}) {
    const token = localStorage.getItem("jwtToken");
    const isFormData = options.body instanceof FormData;

    const response = await fetch(url, {
        ...options,
        headers: {
            ...(isFormData ? {} : { "Content-Type": "application/json" }),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers || {})
        }
    });

    const contentType = response.headers.get("content-type") || "";

    if (!response.ok) {
        if (contentType.includes("application/json")) {
            const errorBody = await response.json();
            throw new Error(errorBody.message || `API error: ${response.status}`);
        }

        const text = await response.text();
        throw new Error(text || `API error: ${response.status}`);
    }

    return contentType.includes("application/json") ? response.json() : null;
}

function safeJsonParse(value) {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function getInitials(fullName) {
    return (fullName || "U")
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map(word => word[0].toUpperCase())
        .join("");
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function capitalize(value) {
    const text = String(value || "").toLowerCase();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
}

function derivePrimaryRole(authorities = []) {
    const normalized = authorities.map(v => String(v).toUpperCase());
    if (normalized.includes("ROLE_ADMIN") || normalized.includes("ADMIN")) return "ADMIN";
    if (normalized.includes("ROLE_MANAGER") || normalized.includes("MANAGER")) return "MANAGER";
    if (normalized.includes("ROLE_VIEWER") || normalized.includes("VIEWER")) return "VIEWER";
    return "USER";
}

function isAdmin() {
    return derivePrimaryRole(state.profile?.authorities || []) === "ADMIN";
}

function isAdminOrManager() {
    const role = derivePrimaryRole(state.profile?.authorities || []);
    return role === "ADMIN" || role === "MANAGER";
}

function canEditUsers() {
    return isAdminOrManager();
}

function canAddUsers() {
    return isAdminOrManager();
}

function canDeleteUsers() {
    return isAdmin();
}

function canViewApprovalsTab() {
    return isAdminOrManager();
}

function canViewRolesTab() {
    return isAdmin();
}

function toggleSectionPaginationBar(barId, totalCount, threshold) {
    const bar = document.getElementById(barId);
    if (!bar) return;
    bar.classList.toggle("hidden", totalCount <= threshold);
}

function toggleSectionScrollable(listElement, totalCount, threshold) {
    if (!listElement) return;
    listElement.classList.toggle("admin-section-list-scroll", totalCount >= threshold);
}

function buildUserAvatarHtml(userOrName, fallbackName = "") {
    const profileImageUrl = userOrName?.profileImageUrl || "";
    const name = userOrName?.fullName || fallbackName || "U";

    return profileImageUrl
        ? `<img src="${escapeHtml(profileImageUrl)}" alt="${escapeHtml(name)}">`
        : escapeHtml(getInitials(name));
}

function renderThreadHeaderAvatar(conversation) {
    const avatarNode = document.getElementById("threadHeaderAvatar");
    if (!avatarNode) return;

    if (!conversation) {
        avatarNode.textContent = "U";
        return;
    }

    const matchedUser = state.users.find(user =>
        String(user.fullName || "").trim().toLowerCase() === String(conversation.displayName || "").trim().toLowerCase()
    );

    avatarNode.innerHTML = buildUserAvatarHtml(matchedUser, conversation.displayName || "U");
}

function persistProfileCache() {
    if (!state.profile) return;

    const profile = state.profile;
    const fullName = profile.fullName || [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(" ");

    const cached = safeJsonParse(localStorage.getItem("loginUserInfo")) || {};

    localStorage.setItem("loginUserInfo", JSON.stringify({
        ...cached,
        id: profile.id,
        firstName: profile.firstName || "",
        middleName: profile.middleName || "",
        lastName: profile.lastName || "",
        fullName,
        username: fullName,
        email: profile.email || "",
        number: profile.number || "",
        position: profile.position || "",
        office: profile.office || "",
        profileImageUrl: profile.profileImageUrl || "",
        accountStatus: profile.accountStatus || "ACTIVE",
        responderEligible: !!profile.responderEligible,
        coordinatorEligible: !!profile.coordinatorEligible,
        authorities: profile.authorities || []
    }));

    localStorage.setItem("userName", fullName || "");
    localStorage.setItem("userEmail", profile.email || "");
    sessionStorage.setItem("userName", fullName || "");
    sessionStorage.setItem("userEmail", profile.email || "");
}

async function loadAdminData() {
    state.profile = await loadProfile();
    persistProfileCache();
    applyAdminTabVisibility();

    state.notifications = await loadNotifications();
    state.approvalsPending = await loadApprovalsPending();
    state.approvalsMine = await loadApprovalsMine();
    state.conversations = await loadConversations();
    state.users = await loadUsers();
    state.roleChanges = await loadRoleChanges();

    renderProfile();
    renderNotifications();
    renderApprovals();
    renderConversationList();
    renderUserTable();
    renderRoleChanges();
    updateBadges();
    updateMetaBar();
    updateLastUpdated();
    syncNavbarAvatar();
    updateUserActionsVisibility();
}

async function loadRoleChanges() {
    try {
        const rows = await apiRequest(`${API_BASE}/admin/audit-logs`);
        console.log("loaded role changes =", rows);
        return Array.isArray(rows) ? rows : [];
    } catch (error) {
        console.error("Failed to load role changes:", error);
        return [];
    }
}

async function loadProfile() {
    const cached = safeJsonParse(localStorage.getItem("loginUserInfo")) || {};

    try {
        const user = await apiRequest(`${API_BASE}/users/info`);
        const authorities = user.authorities || cached.authorities || [];

        return {
            id: user.id ?? cached.id ?? null,
            firstName: user.firstName || cached.firstName || "",
            middleName: user.middleName || cached.middleName || "",
            lastName: user.lastName || cached.lastName || "",
            fullName: user.fullName || [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ") || cached.fullName || "",
            username: user.username || user.fullName || user.email || cached.username || cached.fullName || cached.email || "",
            email: user.email || cached.email || "",
            number: user.number || cached.number || "",
            position: user.position || cached.position || "",
            office: user.office || cached.office || "MDRRMO",
            profileImageUrl: user.profileImageUrl || cached.profileImageUrl || localStorage.getItem("mdrrmo_profile_photo") || "",
            accountStatus: user.accountStatus || cached.accountStatus || "ACTIVE",
            responderEligible: !!(user.responderEligible ?? cached.responderEligible),
            coordinatorEligible: !!(user.coordinatorEligible ?? cached.coordinatorEligible),
            authorities
        };
    } catch (error) {
        if (Object.keys(cached).length) {
            return {
                id: cached.id ?? null,
                firstName: cached.firstName || "",
                middleName: cached.middleName || "",
                lastName: cached.lastName || "",
                fullName: cached.fullName || [cached.firstName, cached.middleName, cached.lastName].filter(Boolean).join(" "),
                username: cached.username || cached.fullName || cached.email || "",
                email: cached.email || "",
                number: cached.number || "",
                position: cached.position || "",
                office: cached.office || "MDRRMO",
                profileImageUrl: cached.profileImageUrl || localStorage.getItem("mdrrmo_profile_photo") || "",
                accountStatus: cached.accountStatus || "ACTIVE",
                responderEligible: !!cached.responderEligible,
                coordinatorEligible: !!cached.coordinatorEligible,
                authorities: cached.authorities || []
            };
        }

        return {
            id: null,
            firstName: "",
            middleName: "",
            lastName: "",
            fullName: "",
            username: "",
            email: "",
            number: "",
            position: "",
            office: "MDRRMO",
            profileImageUrl: localStorage.getItem("mdrrmo_profile_photo") || "",
            accountStatus: "ACTIVE",
            responderEligible: false,
            coordinatorEligible: false,
            authorities: []
        };
    }
}

async function loadNotifications() {
    try {
        const data = await apiRequest(`${API_BASE}/notifications`);
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

async function loadApprovalsPending() {
    try {
        const data = await apiRequest(`${API_BASE}/approval-requests/pending`);
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

async function loadApprovalsMine() {
    try {
        const data = await apiRequest(`${API_BASE}/approval-requests/mine`);
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

async function loadConversations() {
    try {
        const data = await apiRequest(`${API_BASE}/messages/conversations`);
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

async function loadUsers() {
    try {
        const data = await apiRequest(`${API_BASE}/admin/users`);
        return Array.isArray(data) ? data : [];
    } catch {
        try {
            const data = await apiRequest(`${API_BASE}/users`);
            return Array.isArray(data) ? data : [];
        } catch {
            return [];
        }
    }
}

function bindAdminNavigation() {
    document.querySelectorAll(".admin-nav-btn").forEach(button => {
        button.addEventListener("click", () => {
            const section = button.dataset.section;
            showSection(section);
            window.location.hash = section;
        });
    });
}

function bindHashRouting() {
    window.addEventListener("hashchange", () => showSection(getHashSection()));
}

function getHashSection() {
    const hash = window.location.hash.replace("#", "").trim().toLowerCase();
    return ADMIN_SECTIONS.includes(hash) ? hash : "profile";
}

function showSection(section) {
    if (section === "approvals" && !canViewApprovalsTab()) {
        section = "profile";
    }

    if (section === "roles" && !canViewRolesTab()) {
        section = "profile";
    }

    document.querySelectorAll(".admin-nav-btn").forEach(button => {
        button.classList.toggle("active", button.dataset.section === section);
    });

    document.querySelectorAll(".admin-panel").forEach(panel => {
        panel.classList.toggle("active", panel.id === `panel-${section}`);
    });
}

function renderProfile() {
    if (!state.profile) return;
    const profile = state.profile;

    setValue("profileFirstName", profile.firstName || "");
    setValue("profileMiddleName", profile.middleName || "");
    setValue("profileLastName", profile.lastName || "");
    setValue("profileNumber", profile.number || "");
    setValue("profilePosition", profile.position || "");
    setValue("profileOffice", profile.office || "");

    const role = derivePrimaryRole(profile.authorities || []);
    const statusPill = document.getElementById("profileStatusPill");
    document.getElementById("profileRolePill").textContent = role;
    statusPill.textContent = capitalize(profile.accountStatus || "ACTIVE");
    statusPill.className = `status-badge ${(profile.accountStatus || "ACTIVE") === "ACTIVE" ? "ready" : "attention"}`;

    document.getElementById("profileResponderFlag").innerHTML =
        `<i class="fas fa-user-check"></i> ${profile.responderEligible ? "Responder Eligible" : "Not Responder Eligible"}`;
    document.getElementById("profileCoordinatorFlag").innerHTML =
        `<i class="fas fa-clipboard-check"></i> ${profile.coordinatorEligible ? "Coordinator Eligible" : "Not Coordinator Eligible"}`;

    renderAvatar("profileAvatarPreview", profile.profileImageUrl, profile.fullName || [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(" "));
}

function setValue(id, value) {
    const node = document.getElementById(id);
    if (node) node.value = value;
}

function renderAvatar(elementId, imageUrl, fullName) {
    const container = document.getElementById(elementId);
    if (!container) return;

    if (imageUrl) {
        container.innerHTML = `<img src="${escapeHtml(imageUrl)}" alt="Profile Photo">`;
    } else {
        container.innerHTML = `<span class="admin-avatar-fallback">${escapeHtml(getInitials(fullName))}</span>`;
    }
}

function syncNavbarAvatar() {
    const node = document.getElementById("navbarUserAvatar");
    if (!node || !state.profile) return;

    if (state.profile.profileImageUrl) {
        node.innerHTML = `<img src="${escapeHtml(state.profile.profileImageUrl)}" alt="User Avatar">`;
    } else {
        node.textContent = getInitials(state.profile.fullName || [state.profile.firstName, state.profile.middleName, state.profile.lastName].filter(Boolean).join(" "));
    }
}

function renderNotifications() {
    const list = document.getElementById("notificationList");
    if (!list) return;

    const filter = document.getElementById("notificationFilter")?.value || "ALL";
    const items = state.notifications.filter(item => {
        if (filter === "ALL") return true;
        if (filter === "UNREAD") return !item.isRead;
        return String(item.type || "").toUpperCase() === filter;
    });

    updateClearReadNotificationsButton();
    toggleSectionPaginationBar("notificationsPaginationBar", items.length, 5);
    toggleSectionScrollable(list, items.length, 6);

    if (!items.length) {
        list.innerHTML = `<div class="empty-state-card">No notifications found.</div>`;
        return;
    }

    if (!notificationsPagination) {
        renderNotificationRows(items.slice(0, 5));
        return;
    }

    notificationsPagination.setRows(items);
}

function renderNotificationRows(pageRows) {
    const list = document.getElementById("notificationList");
    if (!list) return;

    list.innerHTML = pageRows.map(item => `
        <article class="admin-notification-card ${item.isRead ? "" : "unread"}">
            <div class="admin-notification-head">
                <div>
                    <h4 class="admin-notification-title">${escapeHtml(item.title)}</h4>
                    <div class="admin-notification-meta">
                        <span class="report-tag">${escapeHtml(item.type)}</span>
                        <span class="report-tag">${escapeHtml(formatDateTime(item.createdAt))}</span>
                    </div>
                </div>
                ${!item.isRead ? `<span class="status-badge attention">Unread</span>` : `<span class="status-badge ready">Read</span>`}
            </div>
            <div class="admin-notification-message">${escapeHtml(item.message)}</div>
            <div class="admin-notification-actions">
                ${!item.isRead ? `<button class="action-btn secondary-btn mark-read-btn" type="button" data-id="${item.id}">Mark as read</button>` : ""}
            </div>
        </article>
    `).join("");

    list.querySelectorAll(".mark-read-btn").forEach(button => {
        button.addEventListener("click", async () => {
            openActionConfirm({
                title: "Mark Notification as Read",
                message: "Are you sure you want to mark this notification as read?",
                confirmText: "Mark as Read",
                kicker: "Notifications",
                variant: "update",
                onConfirm: async () => {
                    await markNotificationAsRead(Number(button.dataset.id));
                }
            });
        });
    });
}

function updateClearReadNotificationsButton() {
    const button = document.getElementById("clearReadNotificationsBtn");
    if (!button) return;
    const hasRead = state.notifications.some(item => item.isRead);
    button.disabled = !hasRead;
}

function renderApprovals() {
    const list = document.getElementById("approvalList");
    if (!list) return;

    const items = state.approvalView === "MINE" ? state.approvalsMine : state.approvalsPending;

    toggleSectionPaginationBar("approvalsPaginationBar", items.length, 5);
    toggleSectionScrollable(list, items.length, 6);

    if (!items.length) {
        list.innerHTML = `<div class="empty-state-card">${state.approvalView === "MINE" ? "No requests submitted yet." : "No pending approvals."}</div>`;
        return;
    }

    if (!approvalsPagination) {
        renderApprovalRows(items.slice(0, 5));
        return;
    }

    approvalsPagination.setRows(items);
}

function renderApprovalRows(pageRows) {
    const list = document.getElementById("approvalList");
    if (!list) return;

    list.innerHTML = pageRows.map(item => `
        <article class="admin-approval-card ${String(item.status).toUpperCase() === "PENDING" ? "pending" : ""}">
            <div class="admin-approval-head">
                <div>
                    <h4 class="admin-approval-title">${escapeHtml(item.title)}</h4>
                    <div class="admin-approval-meta">
                        <span class="report-tag">${escapeHtml(item.requestType)}</span>
                        <span class="report-tag">${escapeHtml(item.referenceType || "")} #${escapeHtml(item.referenceId || "")}</span>
                        <span class="report-tag">${escapeHtml(formatDateTime(item.createdAt))}</span>
                    </div>
                </div>
                <span class="status-badge ${String(item.status).toUpperCase() === "APPROVED" ? "ready" : String(item.status).toUpperCase() === "REJECTED" ? "attention" : "watch"}">
                    ${escapeHtml(capitalize(item.status))}
                </span>
            </div>
            <div class="admin-approval-message">${escapeHtml(item.description)}</div>
            <div class="admin-approval-meta" style="margin-bottom: 10px;">
                ${item.requestedByName ? `<span class="report-tag">Requester: ${escapeHtml(item.requestedByName)}</span>` : ""}
                ${item.reviewedByName ? `<span class="report-tag">Reviewed by: ${escapeHtml(item.reviewedByName)}</span>` : ""}
            </div>
            ${item.payloadJson ? `<div class="admin-approval-payload">${escapeHtml(prettyPayload(item.payloadJson))}</div>` : ""}
            <div class="admin-approval-actions">
                ${state.approvalView === "PENDING" && isAdminOrManager() && String(item.status).toUpperCase() === "PENDING" ? `
                    <button class="action-btn secondary-btn approval-approve-btn" type="button" data-id="${item.id}">Approve</button>
                    <button class="action-btn secondary-btn approval-reject-btn" type="button" data-id="${item.id}">Reject</button>
                ` : ""}
            </div>
        </article>
    `).join("");

    list.querySelectorAll(".approval-approve-btn").forEach(button => {
        button.addEventListener("click", () => openApprovalDecisionModal(button.dataset.id, "APPROVE"));
    });

    list.querySelectorAll(".approval-reject-btn").forEach(button => {
        button.addEventListener("click", () => openApprovalDecisionModal(button.dataset.id, "REJECT"));
    });
}

function prettyPayload(payload) {
    try {
        return JSON.stringify(JSON.parse(payload), null, 2);
    } catch {
        return payload;
    }
}

function initNotificationsPagination() {
    if (typeof createPaginationController !== "function") return;

    notificationsPagination = createPaginationController({
        infoId: "notificationsPaginationInfo",
        controlsId: "notificationsPaginationControls",
        pageSizeSelectId: "notificationsPageSize",
        itemLabel: "notifications",
        initialPage: 1,
        initialPageSize: 5,
        buttonClass: "app-page-btn",
        ellipsisClass: "app-page-btn app-page-btn-ellipsis",
        onRenderRows: (pageRows) => renderNotificationRows(pageRows)
    });
}

function initApprovalsPagination() {
    if (typeof createPaginationController !== "function") return;

    approvalsPagination = createPaginationController({
        infoId: "approvalsPaginationInfo",
        controlsId: "approvalsPaginationControls",
        pageSizeSelectId: "approvalsPageSize",
        itemLabel: "approvals",
        initialPage: 1,
        initialPageSize: 5,
        buttonClass: "app-page-btn",
        ellipsisClass: "app-page-btn app-page-btn-ellipsis",
        onRenderRows: (pageRows) => renderApprovalRows(pageRows)
    });
}

function initConversationPagination() {
    if (typeof createPaginationController !== "function") return;

    conversationPagination = createPaginationController({
        infoId: "conversationPaginationInfo",
        controlsId: "conversationPaginationControls",
        pageSizeSelectId: "conversationPageSize",
        itemLabel: "conversations",
        initialPage: 1,
        initialPageSize: 3,
        buttonClass: "app-page-btn",
        ellipsisClass: "app-page-btn app-page-btn-ellipsis",
        onRenderRows: (pageRows) => renderConversationRows(pageRows)
    });
}

function initRoleChangesPagination() {
    if (typeof createPaginationController !== "function") return;

    roleChangesPagination = createPaginationController({
        infoId: "roleChangesPaginationInfo",
        controlsId: "roleChangesPaginationControls",
        pageSizeSelectId: "roleChangesPageSize",
        itemLabel: "role changes",
        initialPage: 1,
        initialPageSize: 5,
        buttonClass: "app-page-btn",
        ellipsisClass: "app-page-btn app-page-btn-ellipsis",
        onRenderRows: (pageRows) => renderRoleChangeRows(pageRows)
    });
}

function renderConversationList() {
    const keyword = (document.getElementById("messageSearchInput")?.value || "").trim().toLowerCase();

    const conversations = state.conversations.filter(item =>
        String(item.displayName || "").toLowerCase().includes(keyword) ||
        String(item.lastMessage || "").toLowerCase().includes(keyword)
    );

    if (!state.selectedConversationId && conversations.length) {
        state.selectedConversationId = conversations[0].id;
    }

    const list = document.getElementById("conversationList");
    if (list) {
        list.classList.toggle("is-scrollable", conversations.length >= 4);
    }

    toggleSectionPaginationBar("conversationPaginationBar", conversations.length, 3);

    if (!conversationPagination) {
        renderConversationRows(conversations.slice(0, 3));
        return;
    }

    conversationPagination.setRows(conversations);
}

function renderConversationRows(pageRows) {
    const container = document.getElementById("conversationList");
    if (!container) return;

    if (!pageRows.length) {
        container.innerHTML = `<div class="empty-state-card">No conversations found.</div>`;
        renderThread(null);
        return;
    }

    container.innerHTML = pageRows.map(item => `
        <article class="admin-conversation-item ${state.selectedConversationId === item.id ? "active" : ""}" data-id="${item.id}">
            <div class="admin-conversation-top">
                <div class="admin-conversation-name">${escapeHtml(item.displayName)}</div>
                <div class="admin-conversation-time">${escapeHtml(formatDateTime(item.updatedAt))}</div>
            </div>
            <div class="admin-conversation-preview">${escapeHtml(item.lastMessage || "")}</div>
        </article>
    `).join("");

    container.querySelectorAll(".admin-conversation-item").forEach(item => {
        item.addEventListener("click", async () => {
            state.selectedConversationId = Number(item.dataset.id);
            renderConversationList();
            await renderThread(state.selectedConversationId);
        });
    });

    renderThread(state.selectedConversationId);
}

async function renderThread(conversationId) {
    const header = document.getElementById("threadHeader");
    const body = document.getElementById("threadMessages");
    if (!header || !body) return;

    const titleNode = header.querySelector(".admin-thread-header-copy h3");
    const subtitleNode = header.querySelector(".admin-thread-header-copy p");

    if (!conversationId) {
        if (titleNode) titleNode.textContent = "Select a conversation";
        if (subtitleNode) subtitleNode.textContent = "View and continue internal communication.";
        renderThreadHeaderAvatar(null);
        body.innerHTML = `<div class="empty-state-card">Select a conversation to view messages.</div>`;
        updateThreadScrollState(0);
        renderPinnedMessageStrip([]);
        return;
    }

    const conversation = state.conversations.find(item => item.id === conversationId);
    if (titleNode) titleNode.textContent = conversation?.displayName || "Conversation";
    if (subtitleNode) subtitleNode.textContent = "Conversation thread";
    renderThreadHeaderAvatar(conversation);

    try {
        const messages = await apiRequest(`${API_BASE}/messages/conversations/${conversationId}`);
        if (!Array.isArray(messages) || !messages.length) {
            body.innerHTML = `<div class="empty-state-card">No messages yet.</div>`;
            updateThreadScrollState(0);
            renderPinnedMessageStrip([]);
            return;
        }

        currentThreadMessages = messages;
        renderPinnedMessageStrip(currentThreadMessages);

        body.innerHTML = currentThreadMessages.map(message => {
            const mine = state.profile && message.senderUserId === state.profile.id;
            const senderUser = state.users.find(user => user.id === message.senderUserId);
            const avatarHtml = buildUserAvatarHtml(senderUser, message.senderName || "U");

            return `
                <article class="admin-thread-row ${mine ? "mine" : ""}" id="thread-message-${message.id}" data-message-id="${message.id}">
                    <div class="admin-thread-avatar">${avatarHtml}</div>

                    <div class="admin-thread-message ${mine ? "mine" : ""}">
                        <div class="admin-thread-message-top">
                            <div class="admin-thread-message-flags">
                                ${message.editedAt ? `<span class="admin-thread-flag muted">Edited</span>` : ""}
                            </div>

                            <div class="admin-thread-message-menu-wrap">
                                <button class="admin-thread-message-menu-btn" type="button" data-message-menu-btn="${message.id}">
                                    <i class="fas fa-ellipsis-h"></i>
                                </button>
                                <div class="admin-thread-message-menu" id="threadMessageMenu-${message.id}">
                                    <button type="button" data-thread-action="pin" data-message-id="${message.id}">
                                        ${message.pinned ? "Unpin" : "Pin"}
                                    </button>
                                    <button type="button" data-thread-action="edit" data-message-id="${message.id}">Edit</button>
                                    <button type="button" data-thread-action="delete" data-message-id="${message.id}">Delete</button>
                                </div>
                            </div>
                        </div>

                        <div class="admin-thread-text">${escapeHtml(message.content || "")}</div>
                        <div class="admin-thread-time">${escapeHtml(formatDateTime(message.createdAt))}</div>
                    </div>
                </article>
            `;
        }).join("");

        updateThreadScrollState(currentThreadMessages.length);
        bindThreadMessageMenus();
    } catch {
        body.innerHTML = `<div class="empty-state-card">Failed to load messages.</div>`;
        updateThreadScrollState(0);
        renderPinnedMessageStrip([]);
    }
}

function updateThreadScrollState(messageCount) {
    const body = document.getElementById("threadMessages");
    if (!body) return;
    body.classList.toggle("thread-scroll-enabled", Number(messageCount) >= 4);
}

function bindThreadMessageMenus() {
    document.querySelectorAll("[data-message-menu-btn]").forEach(button => {
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            const messageId = button.dataset.messageMenuBtn;
            toggleThreadMessageMenu(messageId);
        });
    });

    document.querySelectorAll("[data-thread-action]").forEach(button => {
        button.addEventListener("click", async (event) => {
            event.stopPropagation();

            const action = button.dataset.threadAction;
            const messageId = Number(button.dataset.messageId);
            const message = currentThreadMessages.find(item => item.id === messageId);

            closeAllThreadMessageMenus();

            if (!message) return;

            if (action === "pin") {
                await handlePinMessage(message);
                return;
            }

            if (action === "edit") {
                await handleEditMessage(message);
                return;
            }

            if (action === "delete") {
                await handleDeleteMessage(message);
            }
        });
    });

    document.addEventListener("click", closeAllThreadMessageMenus, { once: true });
}

async function handlePinMessage(message) {
    const willPin = !message.pinned;

    try {
        await apiRequest(`${API_BASE}/messages/${message.id}/pin`, {
            method: "PUT",
            body: JSON.stringify({ pinned: willPin })
        });

        currentThreadMessages = currentThreadMessages.map(item => ({
            ...item,
            pinned: item.id === message.id ? willPin : false
        }));

        await renderThread(state.selectedConversationId);
        showToastMessage(`Message ${willPin ? "pinned" : "unpinned"} successfully.`, "success");
    } catch (error) {
        showToastMessage(error.message || `Failed to ${willPin ? "pin" : "unpin"} message.`, "error");
    }
}

function renderPinnedMessageStrip(messages) {
    const container = document.getElementById("threadPinnedMessage");
    if (!container) return;

    const pinned = (messages || []).find(message => message.pinned);

    if (!pinned) {
        container.classList.add("hidden");
        container.innerHTML = "";
        return;
    }

    container.classList.remove("hidden");
    container.innerHTML = `
        <button type="button" class="admin-thread-pinned-link" data-pinned-message-id="${pinned.id}">
            <div class="admin-thread-pinned-header">
                <i class="fas fa-thumbtack"></i>
                <span>Pinned message</span>
            </div>
            <div class="admin-thread-pinned-content">${escapeHtml(pinned.content || "")}</div>
            <div class="admin-thread-pinned-meta">
                ${escapeHtml(pinned.senderName || "")} • ${escapeHtml(formatDateTime(pinned.createdAt))}
            </div>
        </button>
    `;

    container.querySelector("[data-pinned-message-id]")?.addEventListener("click", () => {
        scrollToThreadMessage(pinned.id);
    });
}

function scrollToThreadMessage(messageId) {
    const body = document.getElementById("threadMessages");
    const target = document.getElementById(`thread-message-${messageId}`);
    if (!body || !target) return;

    target.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

    target.classList.add("admin-thread-row-highlight");
    setTimeout(() => {
        target.classList.remove("admin-thread-row-highlight");
    }, 1800);
}

async function handleEditMessage(message) {
    enterEditMode(message);
}

function enterEditMode(message) {
    const composeInput = document.getElementById("composeInput");
    const composeForm = document.getElementById("composeForm");
    const submitButton = composeForm?.querySelector('button[type="submit"]');

    if (!composeInput || !submitButton) return;

    editingMessageId = message.id;
    composeInput.value = message.content || "";
    composeInput.focus();

    submitButton.innerHTML = `<i class="fas fa-save"></i>Update`;
    ensureCancelEditButton();
}

function exitEditMode() {
    editingMessageId = null;

    const composeInput = document.getElementById("composeInput");
    const composeForm = document.getElementById("composeForm");
    const submitButton = composeForm?.querySelector('button[type="submit"]');
    const cancelEditBtn = document.getElementById("cancelEditMessageBtn");

    if (composeInput) composeInput.value = "";
    if (submitButton) {
        submitButton.innerHTML = `<i class="fas fa-paper-plane"></i>Send`;
    }
    if (cancelEditBtn) {
        cancelEditBtn.remove();
    }
}

function ensureCancelEditButton() {
    const composeForm = document.getElementById("composeForm");
    if (!composeForm) return;

    let cancelButton = document.getElementById("cancelEditMessageBtn");
    if (cancelButton) return;

    cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.id = "cancelEditMessageBtn";
    cancelButton.className = "action-btn secondary-btn";
    cancelButton.innerHTML = `<i class="fas fa-times"></i>Cancel Edit`;

    cancelButton.addEventListener("click", () => {
        exitEditMode();
    });

    composeForm.appendChild(cancelButton);
}

async function handleDeleteMessage(message) {
    openActionConfirm({
        title: "Delete Message",
        message: "Are you sure you want to delete this message?",
        confirmText: "Delete Message",
        kicker: "Messages",
        variant: "delete",
        onConfirm: async () => {
            try {
                await apiRequest(`${API_BASE}/messages/${message.id}`, {
                    method: "DELETE"
                });

                currentThreadMessages = currentThreadMessages.filter(item => item.id !== message.id);
                await renderThread(state.selectedConversationId);
                showToastMessage("Message deleted successfully.", "success");
            } catch (error) {
                showToastMessage(error.message || "Failed to delete message.", "error");
            }
        }
    });
}

function toggleThreadMessageMenu(messageId) {
    const menu = document.getElementById(`threadMessageMenu-${messageId}`);
    if (!menu) return;

    const shouldOpen = !menu.classList.contains("active");
    closeAllThreadMessageMenus();

    if (shouldOpen) {
        menu.classList.add("active");
        activeThreadMenuId = messageId;
    } else {
        activeThreadMenuId = null;
    }
}

function closeAllThreadMessageMenus() {
    document.querySelectorAll(".admin-thread-message-menu.active").forEach(menu => {
        menu.classList.remove("active");
    });
    activeThreadMenuId = null;
}

function renderUserTable() {
    const tbody = document.getElementById("userTableBody");
    if (!tbody) return;

    const keyword = (document.getElementById("userSearchInput")?.value || "").trim().toLowerCase();
    const roleFilter = document.getElementById("userRoleFilter")?.value || "";
    const statusFilter = document.getElementById("userStatusFilter")?.value || "";

    const users = state.users.filter(user => {
        const role = derivePrimaryRole(user.authorities || []);
        const matchesKeyword =
            String(user.fullName || "").toLowerCase().includes(keyword) ||
            String(user.email || "").toLowerCase().includes(keyword) ||
            String(user.position || "").toLowerCase().includes(keyword);

        const matchesRole = !roleFilter || role === roleFilter;
        const matchesStatus = !statusFilter || String(user.accountStatus || "").toUpperCase() === statusFilter;
        return matchesKeyword && matchesRole && matchesStatus;
    });

    if (!users.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No users found.</td></tr>`;
        return;
    }

    tbody.innerHTML = users.map(user => {
        const role = derivePrimaryRole(user.authorities || []);
        return `
            <tr>
                <td>
                    <div class="admin-user-cell">
                        <div class="admin-user-avatar">
                            ${user.profileImageUrl
                                ? `<img src="${escapeHtml(user.profileImageUrl)}" alt="${escapeHtml(user.fullName)}">`
                                : escapeHtml(getInitials(user.fullName))}
                        </div>
                        <div>
                            <div class="admin-user-name">${escapeHtml(user.fullName)}</div>
                            <div class="admin-user-subtext">${escapeHtml(user.position || "")}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <div>${escapeHtml(user.email || "")}</div>
                    <div class="admin-user-subtext">${escapeHtml(user.number || "")}</div>
                </td>
                <td><span class="report-tag">${escapeHtml(role)}</span></td>
                <td><span class="status-badge ${String(user.accountStatus || "").toUpperCase() === "ACTIVE" ? "ready" : "attention"}">${escapeHtml(capitalize(user.accountStatus || ""))}</span></td>
                <td>${user.responderEligible ? "Yes" : "No"}</td>
                <td>${user.coordinatorEligible ? "Yes" : "No"}</td>
                <td>
                    <div class="admin-table-actions">
                        <button class="action-btn secondary-btn view-user-btn" type="button" data-id="${user.id}">View</button>
                        ${canEditUsers() ? `<button class="action-btn secondary-btn edit-user-btn" type="button" data-id="${user.id}">Edit</button>` : ""}
                        ${canDeleteUsers() ? `<button class="action-btn secondary-btn delete-user-btn" type="button" data-id="${user.id}">Delete</button>` : ""}
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    tbody.querySelectorAll(".view-user-btn").forEach(button => {
        button.addEventListener("click", () => openViewUserModal(Number(button.dataset.id)));
    });

    tbody.querySelectorAll(".edit-user-btn").forEach(button => {
        button.addEventListener("click", () => openUserModal(Number(button.dataset.id)));
    });

    tbody.querySelectorAll(".delete-user-btn").forEach(button => {
        button.addEventListener("click", async () => {
            await deleteUser(Number(button.dataset.id));
        });
    });
}

function renderRoleChanges() {
    const list = document.getElementById("roleChangeList");
    if (!list) return;

    const rows = Array.isArray(state.roleChanges) ? state.roleChanges : [];

    toggleSectionPaginationBar("roleChangesPaginationBar", rows.length, 5);
    toggleSectionScrollable(list, rows.length, 6);

    if (!rows.length) {
        list.innerHTML = `<div class="empty-state-card">No recent role or eligibility updates found.</div>`;
        return;
    }

    if (!roleChangesPagination) {
        renderRoleChangeRows(rows.slice(0, 5));
        return;
    }

    roleChangesPagination.setRows(rows);
}

function renderRoleChangeRows(pageRows) {
    const list = document.getElementById("roleChangeList");
    if (!list) return;

    list.innerHTML = pageRows.map(item => `
        <article class="admin-role-change-item">
            <strong>${escapeHtml(item.description || item.actionType || "Role update")}</strong>
            <div class="admin-user-subtext">
                ${escapeHtml(item.performedBy || "--")} • ${escapeHtml(formatDateTime(item.performedAt || item.createdAt))}
            </div>
        </article>
    `).join("");
}

function updateBadges() {
    const unreadNotifications = state.notifications.filter(item =>
        !item.isRead && String(item.type || "").toUpperCase() !== "MESSAGE"
    ).length;

    const unreadMessagesFromNotifications = state.notifications.filter(item =>
        !item.isRead && String(item.type || "").toUpperCase() === "MESSAGE"
    ).length;

    const unreadMessagesFromConversations = state.conversations.reduce(
        (sum, item) => sum + Number(item.unreadCount || 0),
        0
    );

    const unreadMessages = Math.max(unreadMessagesFromNotifications, unreadMessagesFromConversations);
    const pendingApprovals = state.approvalsPending.filter(item => String(item.status || "").toUpperCase() === "PENDING").length;

    setBadgeValue("panelNotificationBadge", unreadNotifications);
    setBadgeValue("panelMessageBadge", unreadMessages);
    setBadgeValue("panelApprovalBadge", pendingApprovals);

    if (typeof window.updateNotificationBadge === "function") {
        window.updateNotificationBadge(unreadNotifications);
    }
    if (typeof window.updateMessageBadge === "function") {
        window.updateMessageBadge(unreadMessages);
    }
}

function setBadgeValue(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
}

function updateMetaBar() {
    if (!state.profile) return;
    const role = derivePrimaryRole(state.profile.authorities || []);
    document.getElementById("adminRoleTag").innerHTML = `<i class="fas fa-user-shield"></i> Role: ${escapeHtml(role)}`;
    document.getElementById("adminAccountStatusTag").innerHTML = `<i class="fas fa-circle-check"></i> Status: ${escapeHtml(capitalize(state.profile.accountStatus || ""))}`;
}

function updateLastUpdated() {
    const node = document.getElementById("adminLastUpdatedText");
    if (node) node.textContent = `Last updated: ${new Date().toLocaleString()}`;
}

function updateUserActionsVisibility() {
    const addUserBtn = document.getElementById("addUserBtn");
    if (addUserBtn) addUserBtn.style.display = canAddUsers() ? "" : "none";
}

function bindProfileActions() {
    document.getElementById("selectPhotoBtn")?.addEventListener("click", () => {
        document.getElementById("profilePhotoInput")?.click();
    });

    document.getElementById("profilePhotoInput")?.addEventListener("change", async event => {
        const file = event.target.files?.[0];
        if (!file || !state.profile) return;

        const base64 = await fileToBase64(file);
        openActionConfirm({
            title: "Confirm Photo Upload",
            message: "Are you sure you want to update your profile photo?",
            submessage: "This will update your profile, view modal, and navbar avatar.",
            confirmText: "Upload Photo",
            kicker: "Profile Update",
            variant: "update",
            onConfirm: async () => {
                try {
                    const updatedUser = await apiRequest(`${API_BASE}/users/me/photo`, {
                        method: "PUT",
                        body: JSON.stringify({ profileImageUrl: base64 })
                    });

                    state.profile.profileImageUrl = updatedUser?.profileImageUrl || base64;
                    localStorage.setItem("mdrrmo_profile_photo", state.profile.profileImageUrl);

                    persistProfileCache();
                    renderProfile();
                    syncNavbarAvatar();

                    state.users = await loadUsers();
                    renderUserTable();

                    showToastMessage("Profile photo updated successfully.", "success");
                } catch (error) {
                    showToastMessage(error.message || "Failed to update profile photo.", "error");
                } finally {
                    event.target.value = "";
                }
            }
        });
    });

    document.getElementById("removePhotoBtn")?.addEventListener("click", () => {
        if (!state.profile) return;

        openActionConfirm({
            title: "Remove Profile Photo",
            message: "Are you sure you want to remove your profile photo?",
            submessage: "This will remove the profile image from your account and navbar avatar.",
            confirmText: "Remove Photo",
            kicker: "Profile Update",
            variant: "delete",
            onConfirm: async () => {
                try {
                    const updatedUser = await apiRequest(`${API_BASE}/users/me/photo`, {
                        method: "PUT",
                        body: JSON.stringify({ profileImageUrl: "" })
                    });

                    state.profile.profileImageUrl = updatedUser?.profileImageUrl || "";
                    localStorage.removeItem("mdrrmo_profile_photo");

                    persistProfileCache();
                    renderProfile();
                    syncNavbarAvatar();

                    state.users = await loadUsers();
                    renderUserTable();

                    showToastMessage("Profile photo removed successfully.", "success");
                } catch (error) {
                    showToastMessage(error.message || "Failed to remove profile photo.", "error");
                }
            }
        });
    });

    document.getElementById("profileForm")?.addEventListener("submit", async event => {
        event.preventDefault();

        if (!state.profile) return;

        const firstName = document.getElementById("profileFirstName").value.trim();
        const middleName = document.getElementById("profileMiddleName").value.trim();
        const lastName = document.getElementById("profileLastName").value.trim();
        const number = document.getElementById("profileNumber").value.trim();
        const position = document.getElementById("profilePosition").value.trim();
        const office = document.getElementById("profileOffice").value.trim();

        if (!firstName) {
            showToastMessage("First name is required.", "error");
            return;
        }

        if (!lastName) {
            showToastMessage("Last name is required.", "error");
            return;
        }

        openActionConfirm({
            title: "Confirm Profile Update",
            message: "Are you sure you want to save your profile changes?",
            confirmText: "Save Profile",
            kicker: "Profile Update",
            variant: "save",
            onConfirm: async () => {
                try {
                    const updatedUser = await apiRequest(`${API_BASE}/users/me/profile`, {
                        method: "PUT",
                        body: JSON.stringify({
                            firstName,
                            middleName,
                            lastName,
                            number,
                            position,
                            office
                        })
                    });

                    const computedFullName = updatedUser.fullName ?? [firstName, middleName, lastName].filter(Boolean).join(" ");

                    state.profile = {
                        ...state.profile,
                        id: updatedUser.id ?? state.profile.id,
                        firstName,
                        middleName,
                        lastName,
                        fullName: computedFullName,
                        username: computedFullName,
                        email: updatedUser.email ?? state.profile.email,
                        number: updatedUser.number ?? number,
                        position: updatedUser.position ?? position,
                        office: updatedUser.office ?? office,
                        profileImageUrl: updatedUser.profileImageUrl ?? state.profile.profileImageUrl,
                        accountStatus: updatedUser.accountStatus ?? state.profile.accountStatus,
                        responderEligible: updatedUser.responderEligible ?? state.profile.responderEligible,
                        coordinatorEligible: updatedUser.coordinatorEligible ?? state.profile.coordinatorEligible,
                        authorities: updatedUser.authorities || state.profile.authorities
                    };

                    persistProfileCache();
                    renderProfile();
                    syncNavbarAvatar();
                    updateMetaBar();

                    showToastMessage("Profile updated successfully.", "success");

                    setTimeout(() => {
                        window.location.reload();
                    }, 700);
                } catch (error) {
                    showToastMessage(error.message || "Failed to update profile.", "error");
                }
            }
        });
    });
}

function bindNotificationActions() {
    document.getElementById("notificationFilter")?.addEventListener("change", renderNotifications);

    document.getElementById("markAllReadBtn")?.addEventListener("click", async () => {
        openActionConfirm({
            title: "Mark All Notifications as Read",
            message: "Are you sure you want to mark all notifications as read?",
            confirmText: "Mark All Read",
            kicker: "Notifications",
            variant: "update",
            onConfirm: async () => {
                try {
                    await apiRequest(`${API_BASE}/notifications/read-all`, { method: "PUT" });
                    state.notifications = state.notifications.map(item => ({ ...item, isRead: true }));
                    renderNotifications();
                    updateBadges();
                    showToastMessage("All notifications marked as read.", "success");
                } catch (error) {
                    showToastMessage(error.message || "Failed to mark notifications as read.", "error");
                }
            }
        });
    });

    document.getElementById("clearReadNotificationsBtn")?.addEventListener("click", async () => {
        openActionConfirm({
            title: "Clear Read Notifications",
            message: "Are you sure you want to clear all notifications that are already marked as read?",
            confirmText: "Clear Read",
            kicker: "Notifications",
            variant: "delete",
            onConfirm: async () => {
                try {
                    await apiRequest(`${API_BASE}/notifications/read`, { method: "DELETE" });
                    state.notifications = state.notifications.filter(item => !item.isRead);
                    renderNotifications();
                    updateBadges();
                    showToastMessage("Read notifications cleared.", "success");
                } catch (error) {
                    showToastMessage(error.message || "Failed to clear read notifications.", "error");
                }
            }
        });
    });
}

async function markNotificationAsRead(id) {
    try {
        await apiRequest(`${API_BASE}/notifications/${id}/read`, { method: "PUT" });
        state.notifications = state.notifications.map(item => item.id === id ? { ...item, isRead: true } : item);
        renderNotifications();
        updateBadges();
    } catch (error) {
        showToastMessage(error.message || "Failed to mark notification as read.", "error");
    }
}

function bindApprovalActions() {
    document.getElementById("approvalViewFilter")?.addEventListener("change", event => {
        state.approvalView = event.target.value;
        renderApprovals();
    });

    document.getElementById("approvalDecisionForm")?.addEventListener("submit", async event => {
        event.preventDefault();
        const requestId = document.getElementById("approvalDecisionRequestId").value;
        const action = document.getElementById("approvalDecisionAction").value;
        const remarks = document.getElementById("approvalDecisionRemarks").value.trim();

        if (!requestId || !action) return;

        const endpoint = action === "APPROVE" ? "approve" : "reject";
        const verbText = action === "APPROVE" ? "approve" : "reject";

        openActionConfirm({
            title: `${action === "APPROVE" ? "Approve" : "Reject"} Request`,
            message: `Are you sure you want to ${verbText} this approval request?`,
            confirmText: action === "APPROVE" ? "Approve Request" : "Reject Request",
            kicker: "Approval Decision",
            variant: action === "APPROVE" ? "save" : "delete",
            onConfirm: async () => {
                try {
                    await apiRequest(`${API_BASE}/approval-requests/${requestId}/${endpoint}`, {
                        method: "PUT",
                        body: JSON.stringify({
                            decision: action,
                            remarks
                        })
                    });

                    closeApprovalDecisionModal();
                    await refreshApprovalsAndNotifications();
                    showToastMessage(`Request ${action === "APPROVE" ? "approved" : "rejected"} successfully.`, "success");
                } catch (error) {
                    showToastMessage(error.message || `Failed to ${verbText} request.`, "error");
                }
            }
        });
    });
}

async function refreshApprovalsAndNotifications() {
    state.notifications = await loadNotifications();
    state.approvalsPending = await loadApprovalsPending();
    state.approvalsMine = await loadApprovalsMine();
    renderNotifications();
    renderApprovals();
    updateBadges();
    updateLastUpdated();
}

function openApprovalDecisionModal(requestId, action) {
    document.getElementById("approvalDecisionRequestId").value = requestId;
    document.getElementById("approvalDecisionAction").value = action;
    document.getElementById("approvalDecisionTitle").textContent = `${action === "APPROVE" ? "Approve" : "Reject"} Request`;
    document.getElementById("confirmApprovalDecisionBtn").textContent = action === "APPROVE" ? "Approve Request" : "Reject Request";
    document.getElementById("approvalDecisionRemarks").value = "";
    openModal("approvalDecisionModal");
}

function closeApprovalDecisionModal() {
    closeModal("approvalDecisionModal");
}

function bindMessageActions() {
    document.getElementById("messageSearchInput")?.addEventListener("input", renderConversationList);

    document.getElementById("composeForm")?.addEventListener("submit", async event => {
        event.preventDefault();
        const input = document.getElementById("composeInput");
        const value = input.value.trim();

        if (!value) return;

        if (editingMessageId) {
            try {
                await apiRequest(`${API_BASE}/messages/${editingMessageId}`, {
                    method: "PUT",
                    body: JSON.stringify({ content: value })
                });

                currentThreadMessages = currentThreadMessages.map(item =>
                    item.id === editingMessageId
                        ? { ...item, content: value, editedAt: new Date().toISOString() }
                        : item
                );

                exitEditMode();
                await renderThread(state.selectedConversationId);
                showToastMessage("Message updated successfully.", "success");
            } catch (error) {
                showToastMessage(error.message || "Failed to update message.", "error");
            }

            return;
        }

        if (!state.selectedConversationId) return;

        try {
            await apiRequest(`${API_BASE}/messages/conversations/${state.selectedConversationId}`, {
                method: "POST",
                body: JSON.stringify({ message: value })
            });

            input.value = "";
            await loadAndRenderMessages();
            showToastMessage("Message sent.", "success");
        } catch (error) {
            showToastMessage(error.message || "Failed to send message.", "error");
        }
    });

    const recipientSearchInput = document.getElementById("messageRecipientSearch");
    const recipientResults = document.getElementById("messageRecipientResults");

    recipientSearchInput?.addEventListener("input", event => {
        const value = event.target.value;
        clearRecipientSelection();
        const results = filterUsersForRecipientSearch(value);
        renderRecipientSearchResults(results);
    });

    recipientSearchInput?.addEventListener("focus", event => {
        const value = event.target.value;
        if (!value.trim()) return;
        renderRecipientSearchResults(filterUsersForRecipientSearch(value));
    });

    document.addEventListener("click", event => {
        const wrapper = document.querySelector(".admin-recipient-group");
        if (!wrapper?.contains(event.target)) {
            recipientResults?.classList.add("hidden");
        }
    });

    document.getElementById("newMessageBtn")?.addEventListener("click", () => openModal("newMessageModal"));

    document.getElementById("newMessageForm")?.addEventListener("submit", async event => {
        event.preventDefault();
        const recipientUserId = Number(document.getElementById("messageRecipient").value);
        const message = document.getElementById("messageInitialText").value.trim();

        if (!recipientUserId) {
            showToastMessage("Please select a recipient from the search results.", "error");
            return;
        }

        if (!message) return;

        openActionConfirm({
            title: "Start New Conversation",
            message: "Are you sure you want to send this message and start a new conversation?",
            confirmText: "Send Message",
            kicker: "Messages",
            variant: "save",
            onConfirm: async () => {
                try {
                    await apiRequest(`${API_BASE}/messages/conversations`, {
                        method: "POST",
                        body: JSON.stringify({ recipientUserId, message })
                    });

                    closeModal("newMessageModal");
                    document.getElementById("newMessageForm").reset();
                    clearRecipientSelection();
                    document.getElementById("messageRecipientResults")?.classList.add("hidden");
                    await loadAndRenderMessages();
                    showToastMessage("Conversation started.", "success");
                } catch (error) {
                    showToastMessage(error.message || "Failed to start conversation.", "error");
                }
            }
        });
    });
}

function getUserDisplayRole(user) {
    return derivePrimaryRole(user.authorities || []);
}

function filterUsersForRecipientSearch(keyword) {
    const text = String(keyword || "").trim().toLowerCase();
    if (!text) return [];

    return state.users
        .filter(user =>
            String(user.fullName || "").toLowerCase().includes(text) ||
            String(user.email || "").toLowerCase().includes(text) ||
            String(user.position || "").toLowerCase().includes(text)
        )
        .slice(0, 8);
}

function renderRecipientSearchResults(results) {
    const container = document.getElementById("messageRecipientResults");
    if (!container) return;

    if (!results.length) {
        container.innerHTML = `<div class="admin-recipient-option"><div class="admin-recipient-option-name">No users found</div></div>`;
        container.classList.remove("hidden");
        return;
    }

    container.innerHTML = results.map(user => `
        <div class="admin-recipient-option" data-id="${user.id}">
            <div class="admin-recipient-option-name">${escapeHtml(user.fullName || "")}</div>
            <div class="admin-recipient-option-meta">
                ${escapeHtml(user.email || "")}
                ${user.position ? ` • ${escapeHtml(user.position)}` : ""}
                ${getUserDisplayRole(user) ? ` • ${escapeHtml(getUserDisplayRole(user))}` : ""}
            </div>
        </div>
    `).join("");

    container.querySelectorAll(".admin-recipient-option[data-id]").forEach(option => {
        option.addEventListener("click", () => {
            const userId = Number(option.dataset.id);
            const user = state.users.find(item => item.id === userId);
            if (!user) return;

            state.selectedRecipientUserId = userId;
            document.getElementById("messageRecipient").value = userId;
            document.getElementById("messageRecipientSearch").value = user.fullName || "";
            container.classList.add("hidden");
        });
    });

    container.classList.remove("hidden");
}

function clearRecipientSelection() {
    state.selectedRecipientUserId = null;
    const hidden = document.getElementById("messageRecipient");
    if (hidden) hidden.value = "";
}

async function loadAndRenderMessages() {
    const oldCount = state.conversations.reduce((sum, item) => sum + Number(item.unreadCount || 0), 0);
    state.conversations = await loadConversations();
    const newCount = state.conversations.reduce((sum, item) => sum + Number(item.unreadCount || 0), 0);

    renderConversationList();
    updateBadges();
    updateLastUpdated();

    if (newCount > oldCount) {
        showToastMessage("New message received.", "info");
    }
}

function bindUserActions() {
    document.getElementById("addUserBtn")?.addEventListener("click", () => {
        if (!canAddUsers()) return;
        openModal("addUserModal");
    });

    document.getElementById("userSearchInput")?.addEventListener("input", renderUserTable);
    document.getElementById("userRoleFilter")?.addEventListener("change", renderUserTable);
    document.getElementById("userStatusFilter")?.addEventListener("change", renderUserTable);

    document.getElementById("userModalForm")?.addEventListener("submit", async event => {
        event.preventDefault();
        if (!canEditUsers()) {
            showToastMessage("You do not have permission to edit users.", "error");
            return;
        }

        const userId = Number(document.getElementById("userModalId").value);
        const roleValue = document.getElementById("userModalRole").value;
        const statusValue = document.getElementById("userModalStatus").value;
        const responderEligible = document.getElementById("userModalResponder").checked;
        const coordinatorEligible = document.getElementById("userModalCoordinator").checked;

        openActionConfirm({
            title: "Confirm User Update",
            message: "Are you sure you want to save the changes for this user?",
            confirmText: "Save Changes",
            kicker: "User Management",
            variant: "update",
            onConfirm: async () => {
                try {
                    await apiRequest(`${API_BASE}/admin/users/${userId}`, {
                        method: "PUT",
                        body: JSON.stringify({
                            accountStatus: statusValue,
                            responderEligible,
                            coordinatorEligible
                        })
                    });

                    await apiRequest(`${API_BASE}/admin/users/${userId}/roles`, {
                        method: "PUT",
                        body: JSON.stringify({
                            authorities: [`ROLE_${roleValue}`]
                        })
                    });

                    closeModal("userManageModal");
                    state.users = await loadUsers();
                    renderUserTable();
                    showToastMessage("User updated successfully.", "success");
                } catch (error) {
                    console.error(error);
                    showToastMessage(error.message || "Failed to update user.", "error");
                }
            }
        });
    });

    document.getElementById("addUserForm")?.addEventListener("submit", async event => {
        event.preventDefault();
        if (!canAddUsers()) {
            showToastMessage("You do not have permission to add users.", "error");
            return;
        }

        const payload = {
            firstName: document.getElementById("addUserFirstName").value.trim(),
            middleName: document.getElementById("addUserMiddleName").value.trim(),
            lastName: document.getElementById("addUserLastName").value.trim(),
            email: document.getElementById("addUserEmail").value.trim(),
            number: document.getElementById("addUserNumber").value.trim(),
            password: document.getElementById("addUserPassword").value.trim(),
            position: document.getElementById("addUserPosition").value.trim(),
            office: document.getElementById("addUserOffice").value.trim(),
            accountStatus: document.getElementById("addUserStatus").value,
            responderEligible: document.getElementById("addUserResponder").checked,
            coordinatorEligible: document.getElementById("addUserCoordinator").checked,
            authorities: [`ROLE_${document.getElementById("addUserRole").value}`]
        };

        openActionConfirm({
            title: "Confirm User Creation",
            message: "Are you sure you want to create this user account?",
            confirmText: "Create User",
            kicker: "User Management",
            variant: "save",
            onConfirm: async () => {
                try {
                    await apiRequest(`${API_BASE}/admin/users`, {
                        method: "POST",
                        body: JSON.stringify(payload)
                    });

                    closeModal("addUserModal");
                    document.getElementById("addUserForm").reset();
                    state.users = await loadUsers();
                    renderUserTable();
                    showToastMessage("User created successfully.", "success");
                } catch (error) {
                    showToastMessage(error.message || "Failed to create user.", "error");
                }
            }
        });
    });
}

function openUserModal(userId) {
    if (!canEditUsers()) return;

    const user = state.users.find(item => item.id === userId);
    if (!user) return;

    document.getElementById("userModalId").value = user.id;
    document.getElementById("userModalFullName").value = user.fullName || "";
    document.getElementById("userModalEmail").value = user.email || "";
    document.getElementById("userModalRole").value = derivePrimaryRole(user.authorities || []);
    document.getElementById("userModalStatus").value = String(user.accountStatus || "ACTIVE").toUpperCase();
    document.getElementById("userModalResponder").checked = !!user.responderEligible;
    document.getElementById("userModalCoordinator").checked = !!user.coordinatorEligible;

    openModal("userManageModal");
}

function openViewUserModal(userId) {
    const user = state.users.find(item => item.id === userId);
    if (!user) return;

    const avatar = document.getElementById("viewUserAvatar");
    if (user.profileImageUrl) {
        avatar.innerHTML = `<img src="${escapeHtml(user.profileImageUrl)}" alt="${escapeHtml(user.fullName)}">`;
    } else {
        avatar.textContent = getInitials(user.fullName);
    }

    const roleText = derivePrimaryRole(user.authorities || []);
    const statusText = capitalize(user.accountStatus || "--");
    const positionText = user.position || "--";
    const officeText = user.office || "--";
    const emailText = user.email || "--";
    const numberText = user.number || "--";
    const responderText = user.responderEligible ? "Eligible" : "Not Eligible";
    const coordinatorText = user.coordinatorEligible ? "Eligible" : "Not Eligible";

    document.getElementById("viewUserFullName").textContent = user.fullName || "--";
    document.getElementById("viewUserPosition").textContent = positionText;
    document.getElementById("viewUserEmail").textContent = emailText;
    document.getElementById("viewUserNumber").textContent = numberText;
    document.getElementById("viewUserOffice").textContent = officeText;

    document.getElementById("viewUserRole").textContent = roleText;
    const statusNode = document.getElementById("viewUserStatus");
    statusNode.textContent = statusText;
    statusNode.className = `status-badge ${String(user.accountStatus || "").toUpperCase() === "ACTIVE" ? "ready" : "attention"}`;

    document.getElementById("viewUserFullNameSummary").textContent = user.fullName || "--";
    document.getElementById("viewUserRoleSummary").textContent = roleText;
    document.getElementById("viewUserPositionSummary").textContent = positionText;
    document.getElementById("viewUserOfficeSummary").textContent = officeText;
    document.getElementById("viewUserEmailSummary").textContent = emailText;
    document.getElementById("viewUserNumberSummary").textContent = numberText;
    document.getElementById("viewUserResponder").textContent = responderText;
    document.getElementById("viewUserCoordinator").textContent = coordinatorText;

    const responderCard = document.getElementById("viewUserResponderCard");
    const coordinatorCard = document.getElementById("viewUserCoordinatorCard");

    responderCard.classList.toggle("is-eligible", !!user.responderEligible);
    responderCard.classList.toggle("is-not-eligible", !user.responderEligible);

    coordinatorCard.classList.toggle("is-eligible", !!user.coordinatorEligible);
    coordinatorCard.classList.toggle("is-not-eligible", !user.coordinatorEligible);

    openModal("viewUserModal");
}

async function deleteUser(userId) {
    if (!canDeleteUsers()) {
        showToastMessage("Only admin can delete users.", "error");
        return;
    }

    openActionConfirm({
        title: "Confirm User Deletion",
        message: "Are you sure you want to delete this user account? This action cannot be undone.",
        confirmText: "Delete User",
        kicker: "Danger Zone",
        variant: "delete",
        onConfirm: async () => {
            try {
                await apiRequest(`${API_BASE}/admin/users/${userId}`, {
                    method: "DELETE"
                });

                state.users = await loadUsers();
                renderUserTable();
                showToastMessage("User deleted successfully.", "success");
            } catch (error) {
                showToastMessage(error.message || "Failed to delete user.", "error");
            }
        }
    });
}

function bindPasswordForm() {
    // handled by change-password.js
}

function bindModals() {
    document.getElementById("closeUserModalBtn")?.addEventListener("click", () => closeModal("userManageModal"));
    document.getElementById("cancelUserModalBtn")?.addEventListener("click", () => closeModal("userManageModal"));

    document.getElementById("closeViewUserModalBtn")?.addEventListener("click", () => closeModal("viewUserModal"));
    document.getElementById("closeViewUserModalFooterBtn")?.addEventListener("click", () => closeModal("viewUserModal"));

    document.getElementById("closeAddUserModalBtn")?.addEventListener("click", () => closeModal("addUserModal"));
    document.getElementById("cancelAddUserModalBtn")?.addEventListener("click", () => closeModal("addUserModal"));

    document.getElementById("closeMessageModalBtn")?.addEventListener("click", () => closeModal("newMessageModal"));
    document.getElementById("cancelMessageModalBtn")?.addEventListener("click", () => closeModal("newMessageModal"));

    document.getElementById("closeApprovalDecisionModalBtn")?.addEventListener("click", () => closeApprovalDecisionModal());
    document.getElementById("cancelApprovalDecisionModalBtn")?.addEventListener("click", () => closeApprovalDecisionModal());

    ["userManageModal", "viewUserModal", "addUserModal", "newMessageModal", "approvalDecisionModal"].forEach(id => {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.addEventListener("click", event => {
            if (event.target === modal) closeModal(id);
        });
    });
}

function openModal(id) {
    document.getElementById(id)?.classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeModal(id) {
    document.getElementById(id)?.classList.remove("active");
    document.body.style.overflow = "auto";
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function startLiveRefresh() {
    if (state.liveRefreshHandle) clearInterval(state.liveRefreshHandle);
    state.liveRefreshHandle = setInterval(async () => {
        await silentRefreshLiveData();
    }, LIVE_REFRESH_MS);
}

async function handleVisibilityRefresh() {
    if (!document.hidden) {
        await silentRefreshLiveData();
    }
}

async function silentRefreshLiveData() {
    const previousNotificationCount = state.notifications.filter(item => !item.isRead).length;
    const previousMessageCount = state.conversations.reduce((sum, item) => sum + Number(item.unreadCount || 0), 0);
    const previousApprovalCount = state.approvalsPending.filter(item => String(item.status || "").toUpperCase() === "PENDING").length;

    state.notifications = await loadNotifications();
    state.approvalsPending = await loadApprovalsPending();
    state.approvalsMine = await loadApprovalsMine();
    state.conversations = await loadConversations();

    renderNotifications();
    renderApprovals();
    renderConversationList();
    updateBadges();
    updateLastUpdated();

    const currentNotificationCount = state.notifications.filter(item => !item.isRead).length;
    const currentMessageCount = state.conversations.reduce((sum, item) => sum + Number(item.unreadCount || 0), 0);
    const currentApprovalCount = state.approvalsPending.filter(item => String(item.status || "").toUpperCase() === "PENDING").length;

    if (currentNotificationCount > previousNotificationCount) {
        showToastMessage("New notifications received.", "info");
    }

    if (currentMessageCount > previousMessageCount) {
        showToastMessage("New message received.", "info");
    }

    if (currentApprovalCount > previousApprovalCount && isAdminOrManager()) {
        showToastMessage("New approval request received.", "info");
    }
}

function showToastMessage(message, type = "info") {
    const existing = document.querySelector(".admin-inline-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = `admin-inline-toast admin-inline-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add("show");
    });

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 220);
    }, 2600);
}

function ensureGlobalActionConfirmModal() {
    if (document.getElementById("actionConfirmModal")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "modal";
    wrapper.id = "actionConfirmModal";
    wrapper.innerHTML = `
        <div class="modal-content app-action-modal">
            <div class="app-action-modal-header">
                <div class="app-action-modal-title-wrap">
                    <span class="app-action-modal-kicker" id="actionConfirmKicker">Confirmation</span>
                    <h3 id="actionConfirmTitle">Please Confirm</h3>
                </div>
                <button class="modal-close" id="actionConfirmCloseBtn"><i class="fas fa-times"></i></button>
            </div>
            <div class="app-action-modal-body">
                <div class="app-action-hero">
                    <div class="app-action-icon neutral" id="actionConfirmIcon"><i class="fas fa-circle-question"></i></div>
                    <div class="app-action-copy">
                        <p class="app-action-message" id="actionConfirmMessage">Are you sure you want to continue?</p>
                        <p class="app-action-submessage" id="actionConfirmSubmessage"></p>
                    </div>
                </div>
                <div class="app-action-note" id="actionConfirmNote" style="display:none;"></div>
            </div>
            <div class="app-action-footer modal-footer">
                <button class="btn btn-cancel" type="button" id="actionConfirmCancelBtn">Cancel</button>
                <button class="btn btn-primary" type="button" id="actionConfirmSubmitBtn">Confirm</button>
            </div>
        </div>
    `;
    document.body.appendChild(wrapper);
}

function bindGlobalActionConfirmModal() {
    document.getElementById("actionConfirmCloseBtn")?.addEventListener("click", closeActionConfirm);
    document.getElementById("actionConfirmCancelBtn")?.addEventListener("click", closeActionConfirm);
    document.getElementById("actionConfirmSubmitBtn")?.addEventListener("click", async () => {
        if (typeof __appConfirmAction === "function") {
            const action = __appConfirmAction;
            closeActionConfirm();
            await action();
            return;
        }
        closeActionConfirm();
    });

    document.getElementById("actionConfirmModal")?.addEventListener("click", event => {
        if (event.target === document.getElementById("actionConfirmModal")) {
            closeActionConfirm();
        }
    });
}

function openActionConfirm({
    title = "Please Confirm",
    message = "Are you sure you want to continue?",
    submessage = "",
    note = "",
    confirmText = "Confirm",
    cancelText = "Cancel",
    kicker = "Confirmation",
    variant = "neutral",
    onConfirm = null
}) {
    const modal = document.getElementById("actionConfirmModal");
    if (!modal) return;

    document.getElementById("actionConfirmTitle").textContent = title;
    document.getElementById("actionConfirmMessage").textContent = message;
    document.getElementById("actionConfirmSubmessage").textContent = submessage || "";
    document.getElementById("actionConfirmKicker").textContent = kicker;
    document.getElementById("actionConfirmSubmitBtn").textContent = confirmText;
    document.getElementById("actionConfirmCancelBtn").textContent = cancelText;

    const noteNode = document.getElementById("actionConfirmNote");
    if (note) {
        noteNode.style.display = "";
        noteNode.textContent = note;
    } else {
        noteNode.style.display = "none";
        noteNode.textContent = "";
    }

    const iconNode = document.getElementById("actionConfirmIcon");
    const iconMap = {
        neutral: '<i class="fas fa-circle-question"></i>',
        save: '<i class="fas fa-floppy-disk"></i>',
        update: '<i class="fas fa-pen"></i>',
        delete: '<i class="fas fa-trash"></i>',
        warning: '<i class="fas fa-triangle-exclamation"></i>'
    };
    iconNode.className = `app-action-icon ${variant}`;
    iconNode.innerHTML = iconMap[variant] || iconMap.neutral;

    __appConfirmAction = onConfirm;
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeActionConfirm() {
    document.getElementById("actionConfirmModal")?.classList.remove("active");
    document.body.style.overflow = "auto";
    __appConfirmAction = null;
}

function applyAdminTabVisibility() {
    const approvalsBtn = document.querySelector('.admin-nav-btn[data-section="approvals"]');
    const approvalsPanel = document.getElementById("panel-approvals");

    const rolesBtn = document.querySelector('.admin-nav-btn[data-section="roles"]');
    const rolesPanel = document.getElementById("panel-roles");

    if (approvalsBtn) approvalsBtn.style.display = canViewApprovalsTab() ? "" : "none";
    if (approvalsPanel && !canViewApprovalsTab()) approvalsPanel.classList.remove("active");

    if (rolesBtn) rolesBtn.style.display = canViewRolesTab() ? "" : "none";
    if (rolesPanel && !canViewRolesTab()) rolesPanel.classList.remove("active");
}