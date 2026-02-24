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

document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const userDropdownBtn = document.getElementById('userDropdownBtn');
    const dropdownMenu = document.getElementById('dropdownMenu');
    const userDropdown = document.querySelector('.user-dropdown');
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const sidebarClose = document.getElementById('sidebarClose');
    const logoutBtn = document.getElementById('logoutBtn');

    // Initialize user name from localStorage
    initializeUserInfo();

    // User Dropdown Toggle
    if (userDropdownBtn) {
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

    // Close dropdown when clicking on menu items (except logout which has its own handler)
    const dropdownLinks = dropdownMenu ? dropdownMenu.querySelectorAll('a') : [];
    dropdownLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            if (userDropdown) {
                userDropdown.classList.remove('active');
            }
        });
    });

    // Sidebar Menu Toggle (Mobile)
    menuToggle.addEventListener('click', function() {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
        menuToggle.classList.toggle('active');
    });

    // Sidebar Toggle Button (Desktop)
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function() {
            sidebar.classList.toggle('collapsed');
            const mainContent = document.querySelector('.main-content');
            if (mainContent) {
                mainContent.classList.toggle('sidebar-collapsed');
            }
        });
    }

    // Sidebar Close Button
    if (sidebarClose) {
        sidebarClose.addEventListener('click', function() {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            menuToggle.classList.remove('active');
        });
    }

    // Overlay Click to Close Sidebar
    if (overlay) {
        overlay.addEventListener('click', function() {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            menuToggle.classList.remove('active');
        });
    }

    // Close sidebar when clicking menu items
    const menuItems = document.querySelectorAll('.menu-item a');
    menuItems.forEach(item => {
        item.addEventListener('click', function() {
            if (window.innerWidth < 768) {
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
                menuToggle.classList.remove('active');
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

    if (logoutCancel || logoutModalClose) {
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

    // Handle window resize for responsive behavior
    window.addEventListener('resize', function() {
        if (window.innerWidth >= 768) {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            menuToggle.classList.remove('active');
        }
    });
});

/**
 * Initialize user information from local storage or session
 */
function initializeUserInfo() {
    const userNameDisplay = document.getElementById('userNameDisplay');
    
    // Try to get user info from various sources
    let userName = localStorage.getItem('userName') || 
                   sessionStorage.getItem('userName');
    
    if (userName) {
        updateUserName(userName);
    } else {
        // Fallback to email if name not available
        const userEmail = localStorage.getItem('userEmail') || sessionStorage.getItem('userEmail');
        if (userEmail) {
            const emailName = userEmail.split('@')[0];
            updateUserName(emailName);
        }
    }
}

/**
 * Handle logout functionality - Show modal confirmation
 */
function handleLogout() {
    const logoutModal = document.getElementById('logoutModal');
    if (logoutModal) {
        // Show the modal
        logoutModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

/**
 * Perform actual logout
 */
function performLogout() {
    // Clear local storage and session storage
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('userName');
    localStorage.removeItem('userEmail');
    sessionStorage.removeItem('userName');
    sessionStorage.removeItem('userEmail');
    
    // Redirect to login page
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
    
    userDropdown.classList.remove('active');
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
}

/**
 * Update user name display
 * @param {string} name - The user's name to display
 */
function updateUserName(name) {
    const userNameDisplay = document.getElementById('userNameDisplay');
    if (name && userNameDisplay) {
        // Get first name from full name
        let firstName = name.split(' ')[0];
        // Capitalize properly
        firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
        userNameDisplay.textContent = firstName;
        console.log('User name updated to:', firstName);
    } else if (!userNameDisplay) {
        console.warn('userNameDisplay element not found');
    }
}
