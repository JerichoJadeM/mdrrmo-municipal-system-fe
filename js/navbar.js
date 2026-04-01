// navbar.js
// ===================================
// Navbar and Sidebar Navigation Script
// ===================================

// Make functions global so they can be called from other scripts

window.updateUserName = updateUserName;
window.updateUserAvatar = updateUserAvatar;
window.initializeUserInfo = initializeUserInfo;
window.handleLogout = handleLogout;
window.performLogout = performLogout;
window.closeLogoutModal = closeLogoutModal;
window.closeAllMenus = closeAllMenus;
window.applyFrontendRbac = applyFrontendRbac;
window.refreshGlobalAdminBadges = refreshGlobalAdminBadges;

document.addEventListener("DOMContentLoaded", function () {
    applyFrontendRbac();

    const userDropdownBtn = document.getElementById("userDropdownBtn");
    const dropdownMenu = document.getElementById("dropdownMenu");
    const userDropdown = document.querySelector(".user-dropdown");
    const menuToggle = document.getElementById("menuToggle");
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("overlay");
    const sidebarClose = document.getElementById("sidebarClose");
    const logoutBtn = document.getElementById("logoutBtn");
    const sidebarToggle = document.getElementById("sidebarToggle");

    initializeUserInfo();
    patchAdminDropdownLinks();
    refreshGlobalAdminBadges();

    if (userDropdownBtn && userDropdown) {
        userDropdownBtn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            userDropdown.classList.toggle("active");
        });
    }

    document.addEventListener("click", function (e) {
        if (userDropdown && !userDropdown.contains(e.target)) {
            userDropdown.classList.remove("active");
        }
    });

    const dropdownLinks = dropdownMenu ? dropdownMenu.querySelectorAll("a") : [];
    dropdownLinks.forEach(link => {
        link.addEventListener("click", function () {
            if (userDropdown) {
                userDropdown.classList.remove("active");
            }
        });
    });

    if (menuToggle && sidebar && overlay) {
        menuToggle.addEventListener("click", function () {
            sidebar.classList.toggle("active");
            overlay.classList.toggle("active");
            menuToggle.classList.toggle("active");
        });
    }

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener("click", function () {
            sidebar.classList.toggle("collapsed");

            const pageContent = document.querySelector(".page-content, .main-content");
            if (pageContent) {
                pageContent.classList.toggle("sidebar-collapsed");
            }

            const footer = document.querySelector(".footer");
            if (footer) {
                footer.classList.toggle("sidebar-collapsed");
            }
        });
    }

    if (sidebarClose) {
        sidebarClose.addEventListener("click", function () {
            if (sidebar) sidebar.classList.remove("active");
            if (overlay) overlay.classList.remove("active");
            if (menuToggle) menuToggle.classList.remove("active");
        });
    }

    if (overlay) {
        overlay.addEventListener("click", function () {
            if (sidebar) sidebar.classList.remove("active");
            overlay.classList.remove("active");
            if (menuToggle) menuToggle.classList.remove("active");
        });
    }

    const menuItems = document.querySelectorAll(".menu-item a");
    menuItems.forEach(item => {
        item.addEventListener("click", function () {
            if (window.innerWidth < 768) {
                if (sidebar) sidebar.classList.remove("active");
                if (overlay) overlay.classList.remove("active");
                if (menuToggle) menuToggle.classList.remove("active");
            }
        });
    });

    if (logoutBtn) {
        logoutBtn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            handleLogout();
        });
    }

    const logoutModal = document.getElementById("logoutModal");
    const logoutConfirm = document.getElementById("logoutConfirm");
    const logoutCancel = document.getElementById("logoutCancel");
    const logoutModalClose = document.getElementById("logoutModalClose");

    if (logoutConfirm) {
        logoutConfirm.addEventListener("click", function () {
            performLogout();
        });
    }

    if (logoutCancel) {
        logoutCancel.addEventListener("click", function () {
            closeLogoutModal();
        });
    }

    if (logoutModalClose) {
        logoutModalClose.addEventListener("click", function () {
            closeLogoutModal();
        });
    }

    if (logoutModal) {
        logoutModal.addEventListener("click", function (e) {
            if (e.target === logoutModal) {
                closeLogoutModal();
            }
        });
    }

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            closeLogoutModal();
        }
    });

    const notificationBtn = document.getElementById("notificationBtn");
    const messageBtn = document.getElementById("messageBtn");
    const notificationBadge = document.getElementById("notificationBadge");
    const messageBadge = document.getElementById("messageBadge");

    window.updateNotificationBadge = function (count) {
        if (!notificationBadge) return;

        if (count > 0) {
            notificationBadge.textContent = count >= 99 ? "99+" : String(count);
            notificationBadge.style.display = "flex";
        } else {
            notificationBadge.style.display = "none";
        }
    };

    window.updateMessageBadge = function (count) {
        if (!messageBadge) return;

        if (count > 0) {
            messageBadge.textContent = count >= 99 ? "99+" : String(count);
            messageBadge.style.display = "flex";
        } else {
            messageBadge.style.display = "none";
        }
    };

    if (notificationBtn) {
        notificationBtn.addEventListener("click", function () {
            window.location.href = "admin.html#notifications";
        });
    }

    if (messageBtn) {
        messageBtn.addEventListener("click", function () {
            window.location.href = "admin.html#messages";
        });
    }

    window.addEventListener("resize", function () {
        if (window.innerWidth >= 768) {
            if (sidebar) sidebar.classList.remove("active");
            if (overlay) overlay.classList.remove("active");
            if (menuToggle) menuToggle.classList.remove("active");
        }
    });
});

function initializeUserInfo() {
    const userNameDisplay = document.getElementById("userNameDisplay");

    let user = null;
    try {
        const raw = localStorage.getItem("loginUserInfo");
        user = raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.error("Failed to parse loginUserInfo:", error);
    }

    const fullName =
        user?.fullName ||
        localStorage.getItem("userName") ||
        sessionStorage.getItem("userName") ||
        "";

    const email =
        user?.email ||
        localStorage.getItem("userEmail") ||
        sessionStorage.getItem("userEmail") ||
        "";

    const profileImageUrl =
        user?.profileImageUrl ||
        localStorage.getItem("mdrrmo_profile_photo") ||
        "";

    if (fullName) {
        updateUserName(fullName);
    } else if (email) {
        updateUserName(email.split("@")[0]);
    } else if (userNameDisplay) {
        userNameDisplay.textContent = "User";
    }

    updateUserAvatar(profileImageUrl, fullName || email || "User");
}

function patchAdminDropdownLinks() {
    const dropdownMenu = document.getElementById("dropdownMenu");
    if (!dropdownMenu) return;

    const dropdownItems = dropdownMenu.querySelectorAll("a.dropdown-item");

    dropdownItems.forEach(link => {
        const text = (link.textContent || "").trim().toLowerCase();

        if (text.includes("profile")) {
            link.setAttribute("href", "admin.html#profile");
        } else if (text.includes("notification")) {
            link.setAttribute("href", "admin.html#notifications");
        } else if (text.includes("message")) {
            link.setAttribute("href", "admin.html#messages");
        } else if (text.includes("change password")) {
            link.setAttribute("href", "admin.html#password");
        }
    });
}

function handleLogout() {
    const logoutModal = document.getElementById("logoutModal");
    if (logoutModal) {
        logoutModal.classList.add("active");
        document.body.style.overflow = "hidden";
    }
}

function performLogout() {
    localStorage.removeItem("jwtToken");
    localStorage.removeItem("userName");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userNumber");
    localStorage.removeItem("userAuthorities");
    localStorage.removeItem("loginUserInfo");
    localStorage.removeItem("mdrrmo_profile_photo");

    sessionStorage.removeItem("userName");
    sessionStorage.removeItem("userEmail");

    window.location.href = "login.html";
}

function closeLogoutModal() {
    const logoutModal = document.getElementById("logoutModal");
    if (logoutModal) {
        logoutModal.classList.remove("active");
        document.body.style.overflow = "auto";
    }
}

function closeAllMenus() {
    const userDropdown = document.querySelector(".user-dropdown");
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("overlay");

    if (userDropdown) userDropdown.classList.remove("active");
    if (sidebar) sidebar.classList.remove("active");
    if (overlay) overlay.classList.remove("active");
}

function updateUserName(name) {
    const userNameDisplay = document.getElementById("userNameDisplay");
    if (name && userNameDisplay) {
        let firstName = name.split(" ")[0] || "User";
        firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
        userNameDisplay.textContent = firstName;
    }
}

function updateUserAvatar(profileImageUrl, fullName) {
    const avatarNode = document.getElementById("navbarUserAvatar");
    if (!avatarNode) return;

    const initials = (fullName || "U")
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0].toUpperCase())
        .join("") || "U";

    avatarNode.style.backgroundImage = "";
    avatarNode.style.backgroundSize = "";
    avatarNode.style.backgroundPosition = "";
    avatarNode.style.backgroundRepeat = "";
    avatarNode.style.overflow = "hidden";
    avatarNode.style.display = "inline-flex";
    avatarNode.style.alignItems = "center";
    avatarNode.style.justifyContent = "center";

    if (profileImageUrl) {
        avatarNode.innerHTML = `
            <img
                src="${profileImageUrl}"
                alt="${fullName || "User Avatar"}"
                style="
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    border-radius: 50%;
                    display: block;
                "
            >
        `;

        const img = avatarNode.querySelector("img");
        if (img) {
            img.onerror = function () {
                avatarNode.innerHTML = "";
                avatarNode.textContent = initials;
            };
        }
        return;
    }

    avatarNode.innerHTML = "";
    avatarNode.textContent = initials;
}

async function refreshGlobalAdminBadges() {
    const token = localStorage.getItem("jwtToken");
    if (!token) return;

    const apiBase = window.APP_CONFIG?.API_BASE || "http://localhost:8080/api";

    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    };

    try {
        const [notificationsRes, conversationsRes] = await Promise.all([
            fetch(`${apiBase}/notifications`, { headers }),
            fetch(`${apiBase}/messages/conversations`, { headers })
        ]);

        let unreadNotifications = 0;
        let unreadMessages = 0;

        if (notificationsRes.ok) {
            const notifications = await notificationsRes.json();

            unreadNotifications = (notifications || []).filter(item =>
                !item.isRead && String(item.type || "").toUpperCase() !== "MESSAGE"
            ).length;

            const unreadMessagesFromNotifications = (notifications || []).filter(item =>
                !item.isRead && String(item.type || "").toUpperCase() === "MESSAGE"
            ).length;

            unreadMessages = Math.max(unreadMessages, unreadMessagesFromNotifications);
        }

        if (conversationsRes.ok) {
            const conversations = await conversationsRes.json();
            const unreadMessagesFromThreads = (conversations || []).reduce(
                (sum, item) => sum + Number(item.unreadCount || 0),
                0
            );
            unreadMessages = Math.max(unreadMessages, unreadMessagesFromThreads);
        }

        if (typeof window.updateNotificationBadge === "function") {
            window.updateNotificationBadge(unreadNotifications);
        }

        if (typeof window.updateMessageBadge === "function") {
            window.updateMessageBadge(unreadMessages);
        }
    } catch (error) {
        console.warn("Failed to refresh navbar badges:", error);
    }
}

function getCurrentUserInfo() {
    try {
        const raw = localStorage.getItem("loginUserInfo");
        if (raw) {
            return JSON.parse(raw);
        }

        const authoritiesRaw = localStorage.getItem("userAuthorities");
        const authorities = authoritiesRaw ? JSON.parse(authoritiesRaw) : [];

        return {
            fullName: localStorage.getItem("userName"),
            email: localStorage.getItem("userEmail"),
            number: localStorage.getItem("userNumber"),
            authorities
        };
    } catch (error) {
        console.error("Failed to parse login user info:", error);
        return null;
    }
}

function hasAuthority(user, role) {
    return Array.isArray(user?.authorities) && user.authorities.includes(role);
}

function canAccessManagementPages(user) {
    return hasAuthority(user, "ROLE_ADMIN") || hasAuthority(user, "ROLE_MANAGER");
}

function applyFrontendRbac() {
    const currentUser = getCurrentUserInfo();
    const canManage = canAccessManagementPages(currentUser);

    const reportsMenuItem = document.querySelector('a[href="reports.html"]')?.closest(".menu-item");
    const adminMenuItem = document.querySelector('a[href="admin.html"]')?.closest(".menu-item");
    const settingsMenuItem = document.querySelector('a[href="#settings"]')?.closest(".menu-item");

    if (!canManage) {
        if (reportsMenuItem) reportsMenuItem.style.display = "none";
        if (adminMenuItem) adminMenuItem.style.display = "none";
        if (settingsMenuItem) settingsMenuItem.style.display = "none";
    }
}