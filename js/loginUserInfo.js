// Reuse your apiRequest function
async function apiRequest(url, options = {}) {
    const token = localStorage.getItem('jwtToken');

    options.headers = {
        ...options.headers,
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };

    const response = await fetch(url, options);

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `API error: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
        return await response.json();
    }

    return null;
}

// Show error modal with message
function showErrorModal(message) {
    const errorModal = document.getElementById('errorModal');
    const errorMessage = document.getElementById('errorMessage');
    
    if (errorModal && errorMessage) {
        errorMessage.textContent = message;
        errorModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

// Close error modal
function closeErrorModal() {
    const errorModal = document.getElementById('errorModal');
    if (errorModal) {
        errorModal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

// Set up error modal handlers
function setupErrorModalHandlers() {
    const errorModal = document.getElementById('errorModal');
    if (!errorModal) return;
    
    const errorModalClose = document.getElementById('errorModalClose');
    const errorModalConfirm = document.getElementById('errorModalConfirm');
    
    if (errorModalClose) {
        errorModalClose.addEventListener('click', function() {
            closeErrorModal();
            window.location.href = 'login.html';
        });
    }
    
    if (errorModalConfirm) {
        errorModalConfirm.addEventListener('click', function() {
            closeErrorModal();
            window.location.href = 'login.html';
        });
    }
    
    // Close modal on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeErrorModal();
        }
    });
}

// Check JWT and redirect if missing
const token = localStorage.getItem('jwtToken');
if (!token) {
    window.location.href = 'login.html';
}

// Fetch user info
async function loadUserInfo() {
    try {
        const user = await apiRequest('http://localhost:8080/api/users/info');
        console.log(user);

        // Store user info in localStorage for navbar to use
        localStorage.setItem('userName', user.fullName);
        localStorage.setItem('userEmail', user.email);
        localStorage.setItem('userNumber', user.number);
        localStorage.setItem('userAuthorities', JSON.stringify(user.authorities || []));
        localStorage.setItem('loginUserInfo', JSON.stringify(user));

        // Update navbar user name if navbar script is loaded
        if (typeof window.updateUserName === 'function') {
            window.updateUserName(user.fullName);
        } else if (typeof updateUserName === 'function') {
            updateUserName(user.fullName);
        }

        if(typeof window.applyFrontendRbac === 'function'){
            window.applyFrontendRbac();
        }

        // Only append to usersList if it exists (for dashboard page)
        const ul = document.getElementById('usersList');
        if (ul) {
            const li = document.createElement('li');
            li.textContent = `${user.fullName} ${user.email} (${user.number})`;
            ul.appendChild(li);
        }
    } catch (err) {
        console.error(err);
        
        // Set up error modal handlers before showing error
        setupErrorModalHandlers();
        
        // Show error modal instead of alert
        const errorMessage = 'Failed to load user info. Your session may have expired. Please login again.';
        showErrorModal(errorMessage);
        
        // Clear invalid token
        localStorage.removeItem('jwtToken');
    }
}

loadUserInfo();