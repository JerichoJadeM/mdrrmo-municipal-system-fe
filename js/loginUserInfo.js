// Reuse your apiRequest function
async function apiRequest(url, options = {}) {
    const token = localStorage.getItem('jwtToken');
        options.headers = {
            ...options.headers,
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : undefined
        };

    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error('API error: ' + response.status);
    }
    return response.json();
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

        // Update navbar user name if navbar script is loaded
        if (typeof window.updateUserName === 'function') {
            window.updateUserName(user.fullName);
        } else if (typeof updateUserName === 'function') {
            updateUserName(user.fullName);
        }

        const ul = document.getElementById('usersList');
        const li = document.createElement('li');
        li.textContent = `${user.fullName} ${user.email} (${user.number})`;
        ul.appendChild(li);
    } catch (err) {
        console.error(err);
        alert('Failed to load user info. Redirecting to login.');
        localStorage.removeItem('jwtToken');
        window.location.href = 'login.html';
    }
}

loadUserInfo();