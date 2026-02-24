/**
 * MDRRMO Forecasting System - Login Script
 * Handles user authentication with enhanced validation and notifications
 */

const form = document.getElementById('loginForm');
const messageElement = document.getElementById('message');
const messageContainer = document.getElementById('messageContainer');
const submitBtn = document.getElementById('submitBtn');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

/**
 * Display notification message with different types
 * @param {string} message - The message text to display
 * @param {string} type - Message type: 'success', 'error', 'warning', 'info', 'loading'
 * @param {number} duration - Duration to show message in milliseconds (0 = persistent)
 */
function showNotification(message, type = 'info', duration = 5000) {
    // Clear any existing classes
    messageElement.className = '';
    
    // Set the message content
    messageElement.textContent = message;
    
    // Add the appropriate type class
    messageElement.classList.add(type);
    
    // Show the container
    messageContainer.classList.add('show');
    
    // Auto-hide after duration (except for loading messages)
    if (duration > 0 && type !== 'loading') {
        setTimeout(() => {
            hideNotification();
        }, duration);
    }
}

/**
 * Hide the notification message
 */
function hideNotification() {
    messageContainer.classList.remove('show');
    messageElement.className = '';
    messageElement.textContent = '';
}

/**
 * Validate email or username format
 * @param {string} input - The email or username input
 * @returns {boolean} - True if valid
 */
function validateEmailOrUsername(input) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const usernameRegex = /^[a-zA-Z0-9_.-]{3,}$/;
    
    return emailRegex.test(input) || usernameRegex.test(input);
}

/**
 * Validate password format
 * @param {string} password - The password input
 * @returns {boolean} - True if valid
 */
function validatePassword(password) {
    return password && password.length >= 6;
}

/**
 * Perform client-side form validation
 * @returns {boolean} - True if form is valid
 */
function validateForm() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    // Clear previous message
    hideNotification();
    
    // Validate email/username
    if (!email) {
        showNotification('Please enter your email address or username', 'warning', 4000);
        emailInput.focus();
        return false;
    }
    
    if (!validateEmailOrUsername(email)) {
        showNotification('Please enter a valid email address or username (minimum 3 characters)', 'warning', 4000);
        emailInput.focus();
        return false;
    }
    
    // Validate password
    if (!password) {
        showNotification('Please enter your password', 'warning', 4000);
        passwordInput.focus();
        return false;
    }
    
    if (!validatePassword(password)) {
        showNotification('Password must be at least 6 characters long', 'warning', 4000);
        passwordInput.focus();
        return false;
    }
    
    return true;
}

/**
 * Handle form submission
 */
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Validate form before submission
    if (!validateForm()) {
        return;
    }
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    try {
        // Show loading state
        submitBtn.disabled = true;
        showNotification('Logging in... Please wait', 'loading', 0);
        
        const response = await fetch('http://localhost:8080/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            // Handle specific error responses
            const errorMessage = data.message || data.error || 'Invalid credentials. Please try again.';
            showNotification(errorMessage, 'error', 5000);
            submitBtn.disabled = false;
            return;
        }
        
        // Save JWT in localStorage or sessionStorage
        if (data.token) {
            localStorage.setItem('jwtToken', data.token);
            
            // Show success message and redirect
            showNotification('Login successful! Redirecting...', 'success', 2000);
            
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);
        } else {
            showNotification('Login response invalid. Please contact support.', 'error', 5000);
            submitBtn.disabled = false;
        }
        
    } catch (err) {
        // Handle network or other errors
        let errorMessage = 'An error occurred. Please check your connection and try again.';
        
        if (err.name === 'TypeError' && err.message.includes('fetch')) {
            errorMessage = 'Unable to connect to the server. Please check your internet connection.';
        } else if (err.message) {
            errorMessage = err.message;
        }
        
        showNotification(errorMessage, 'error', 5000);
        submitBtn.disabled = false;
    }
});

/**
 * Clear error messages when user starts typing
 */
emailInput.addEventListener('input', () => {
    if (messageElement.classList.contains('error') || messageElement.classList.contains('warning')) {
        hideNotification();
    }
});

passwordInput.addEventListener('input', () => {
    if (messageElement.classList.contains('error') || messageElement.classList.contains('warning')) {
        hideNotification();
    }
});

/**
 * Generic API request helper function
 * @param {string} url - The API endpoint
 * @param {object} options - Fetch options
 * @returns {Promise<object>} - The JSON response
 */
async function apiRequest(url, options = {}) {
    const token = localStorage.getItem('jwtToken');
    options.headers = {
        ...options.headers,
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : undefined
    };
    
    const response = await fetch(url, options);
    
    if (!response.ok) {
        const error = new Error('API error');
        error.status = response.status;
        throw error;
    }
    
    return response.json();
}