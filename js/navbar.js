// ===================================
// Navbar and Sidebar Navigation Script
// ===================================

// Make functions global so they can be called from other scripts
window.updateUserName = updateUserName;
window.initializeUserInfo = initializeUserInfo;
window.handleLogout = handleLogout;
window.performLogout = performLogout;
window.closeLogoutModal = closeLogoutModal;
window.closeAllMenus = closeAllMenus;
window.applyFrontendRbac = applyFrontendRbac;

document.addEventListener('DOMContentLoaded', function() {
    applyFrontendRbac();

    // Elements
    const userDropdownBtn = document.getElementById('userDropdownBtn');
    const dropdownMenu = document.getElementById('dropdownMenu');
    const userDropdown = document.querySelector('.user-dropdown');
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const sidebarClose = document.getElementById('sidebarClose');
    const logoutBtn = document.getElementById('logoutBtn');
    const sidebarToggle = document.getElementById('sidebarToggle');

    // Initialize user name from localStorage
    initializeUserInfo();
    patchAdminDropdownLinks();

    // User Dropdown Toggle
    if (userDropdownBtn && userDropdown) {
        userDropdownBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            userDropdown.classList.toggle('active');
            console.log('Dropdown toggled, active:', userDropdown.classList.contains('active'));
        });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (userDropdown && !userDropdown.contains(e.target)) {
            userDropdown.classList.remove('active');
        }
    });

    // Close dropdown when clicking on menu items
    const dropdownLinks = dropdownMenu ? dropdownMenu.querySelectorAll('a') : [];
    dropdownLinks.forEach(link => {
        link.addEventListener('click', function() {
            if (userDropdown) {
                userDropdown.classList.remove('active');
            }
        });
    });

    // Sidebar Menu Toggle (Mobile)
    if (menuToggle && sidebar && overlay) {
        menuToggle.addEventListener('click', function() {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
            menuToggle.classList.toggle('active');
        });
    }

    // Sidebar Toggle Button (Desktop)
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', function() {
            sidebar.classList.toggle('collapsed');

            const pageContent = document.querySelector('.page-content, .main-content');
            if (pageContent) {
                pageContent.classList.toggle('sidebar-collapsed');
            }

            const footer = document.querySelector('.footer');
            if (footer) {
                footer.classList.toggle('sidebar-collapsed');
            }
        });
    }

    // Sidebar Close Button
    if (sidebarClose) {
        sidebarClose.addEventListener('click', function() {
            if (sidebar) sidebar.classList.remove('active');
            if (overlay) overlay.classList.remove('active');
            if (menuToggle) menuToggle.classList.remove('active');
        });
    }

    // Overlay Click to Close Sidebar
    if (overlay) {
        overlay.addEventListener('click', function() {
            if (sidebar) sidebar.classList.remove('active');
            if (overlay) overlay.classList.remove('active');
            if (menuToggle) menuToggle.classList.remove('active');
        });
    }

    // Close sidebar when clicking menu items
    const menuItems = document.querySelectorAll('.menu-item a');
    menuItems.forEach(item => {
        item.addEventListener('click', function() {
            if (window.innerWidth < 768) {
                if (sidebar) sidebar.classList.remove('active');
                if (overlay) overlay.classList.remove('active');
                if (menuToggle) menuToggle.classList.remove('active');
            }
        });
    });

    // Logout Button Handler
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            handleLogout();
        });
    }

    // Modal handlers
    const logoutModal = document.getElementById('logoutModal');
    const logoutConfirm = document.getElementById('logoutConfirm');
    const logoutCancel = document.getElementById('logoutCancel');
    const logoutModalClose = document.getElementById('logoutModalClose');

    if (logoutConfirm) {
        logoutConfirm.addEventListener('click', function() {
            performLogout();
        });
    }

    if (logoutCancel) {
        logoutCancel.addEventListener('click', function() {
            closeLogoutModal();
        });
    }

    if (logoutModalClose) {
        logoutModalClose.addEventListener('click', function() {
            closeLogoutModal();
        });
    }

    // Close modal when clicking outside
    if (logoutModal) {
        logoutModal.addEventListener('click', function(e) {
            if (e.target === logoutModal) {
                closeLogoutModal();
            }
        });
    }

    // Close modal on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeLogoutModal();
        }
    });

    // Notification and Message Badge Management
    const notificationBtn = document.getElementById('notificationBtn');
    const messageBtn = document.getElementById('messageBtn');
    const notificationBadge = document.getElementById('notificationBadge');
    const messageBadge = document.getElementById('messageBadge');

    window.updateNotificationBadge = function(count) {
        if (notificationBadge) {
            if (count > 0) {
                notificationBadge.textContent = count >= 99 ? '99+' : count;
                notificationBadge.style.display = 'flex';
            } else {
                notificationBadge.style.display = 'none';
            }
        }
    };

    window.updateMessageBadge = function(count) {
        if (messageBadge) {
            if (count > 0) {
                messageBadge.textContent = count >= 99 ? '99+' : count;
                messageBadge.style.display = 'flex';
            } else {
                messageBadge.style.display = 'none';
            }
        }
    };

    if (notificationBtn) {
        notificationBtn.addEventListener('click', function() {
            window.location.href = 'admin.html#notifications';
        });
    }

    if (messageBtn) {
        messageBtn.addEventListener('click', function() {
            window.location.href = 'admin.html#messages';
        });
    }

    // Handle window resize for responsive behavior
    window.addEventListener('resize', function() {
        if (window.innerWidth >= 768) {
            if (sidebar) sidebar.classList.remove('active');
            if (overlay) overlay.classList.remove('active');
            if (menuToggle) menuToggle.classList.remove('active');
        }
    });
});

/**
 * Initialize user information from local storage or session
 */
function initializeUserInfo() {
    const userNameDisplay = document.getElementById('userNameDisplay');

    let userName = localStorage.getItem('userName') ||
                   sessionStorage.getItem('userName');

    if (userName) {
        updateUserName(userName);
    } else {
        const userEmail = localStorage.getItem('userEmail') || sessionStorage.getItem('userEmail');
        if (userEmail) {
            const emailName = userEmail.split('@')[0];
            updateUserName(emailName);
        }
    }

    if (!userNameDisplay) {
        console.warn('userNameDisplay element not found');
    }
}

/**
 * Patch dropdown links so they route to the admin sections
 */
function patchAdminDropdownLinks() {
    const dropdownMenu = document.getElementById('dropdownMenu');
    if (!dropdownMenu) return;

    const dropdownItems = dropdownMenu.querySelectorAll('a.dropdown-item');

    dropdownItems.forEach(link => {
        const text = (link.textContent || '').trim().toLowerCase();

        if (text.includes('profile')) {
            link.setAttribute('href', 'admin.html#profile');
        } else if (text.includes('notification')) {
            link.setAttribute('href', 'admin.html#notifications');
        } else if (text.includes('message')) {
            link.setAttribute('href', 'admin.html#messages');
        } else if (text.includes('change password')) {
            link.setAttribute('href', 'admin.html#password');
        }
    });
}

/**
 * Handle logout functionality - Show modal confirmation
 */
function handleLogout() {
    const logoutModal = document.getElementById('logoutModal');
    if (logoutModal) {
        logoutModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

/**
 * Perform actual logout
 */
function performLogout() {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('userName');
    localStorage.removeItem('userEmail');
    sessionStorage.removeItem('userName');
    sessionStorage.removeItem('userEmail');

    window.location.href = 'login.html';
}

/**
 * Close logout modal
 */
function closeLogoutModal() {
    const logoutModal = document.getElementById('logoutModal');
    if (logoutModal) {
        logoutModal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

/**
 * Close all menus
 */
function closeAllMenus() {
    const userDropdown = document.querySelector('.user-dropdown');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');

    if (userDropdown) userDropdown.classList.remove('active');
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
}

/**
 * Update user name display
 * @param {string} name - The user's name to display
 */
function updateUserName(name) {
    const userNameDisplay = document.getElementById('userNameDisplay');
    if (name && userNameDisplay) {
        let firstName = name.split(' ')[0];
        firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
        userNameDisplay.textContent = firstName;
        console.log('User name updated to:', firstName);
    } else if (!userNameDisplay) {
        console.warn('userNameDisplay element not found');
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

// modal for global confirmation
// (function () {
//     let confirmAction = null;

//     function closeAppConfirm() {
//         const modal = document.getElementById("appConfirmModal");
//         if (modal) {
//             modal.classList.remove("active");
//             document.body.style.overflow = "auto";
//         }
//         confirmAction = null;
//     }

//     function openAppConfirm({
//         title = "Please Confirm",
//         message = "Are you sure you want to continue?",
//         confirmText = "Confirm",
//         cancelText = "Cancel",
//         kicker = "Confirmation",
//         onConfirm = null
//     }) {
//         const modal = document.getElementById("appConfirmModal");
//         if (!modal) return;

//         document.getElementById("appConfirmTitle").textContent = title;
//         document.getElementById("appConfirmMessage").textContent = message;
//         document.getElementById("appConfirmKicker").textContent = kicker;
//         document.getElementById("appConfirmProceedBtn").textContent = confirmText;
//         document.getElementById("appConfirmCancelBtn").textContent = cancelText;

//         confirmAction = onConfirm;
//         modal.classList.add("active");
//         document.body.style.overflow = "hidden";
//     }

//     async function handleConfirmProceed() {
//         if (typeof confirmAction === "function") {
//             const action = confirmAction;
//             closeAppConfirm();
//             await action();
//             return;
//         }
//         closeAppConfirm();
//     }

//     document.addEventListener("DOMContentLoaded", function () {
//         document.getElementById("appConfirmCloseBtn")?.addEventListener("click", closeAppConfirm);
//         document.getElementById("appConfirmCancelBtn")?.addEventListener("click", closeAppConfirm);
//         document.getElementById("appConfirmProceedBtn")?.addEventListener("click", handleConfirmProceed);

//         document.getElementById("appConfirmModal")?.addEventListener("click", function (e) {
//             if (e.target === this) closeAppConfirm();
//         });
//     });

//     window.openAppConfirm = openAppConfirm;
//     window.closeAppConfirm = closeAppConfirm;
// })();