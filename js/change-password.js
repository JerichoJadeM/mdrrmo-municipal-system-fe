document.getElementById("passwordForm").addEventListener("submit", async function(e) {
    e.preventDefault();

    const token = localStorage.getItem('jwtToken');

    const data = {
        oldPassword: document.getElementById("oldPassword").value,
        newPassword: document.getElementById("newPassword").value,
        newPassword2: document.getElementById("newPassword2").value
    };

    try {
        const response = await fetch("http://localhost:8080/api/users/password", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errors = await response.json();
            const firstError = Object.values(errors)[0];
            throw new Error(firstError);
        }

        // Show success message
        const messageElement = document.getElementById("message");
        messageElement.textContent = "Password updated successfully. Redirecting to login...";
        messageElement.className = "message-text success show";

        localStorage.removeItem("jwtToken");
        localStorage.removeItem("userName");
        localStorage.removeItem("userEmail");
        sessionStorage.removeItem("userName");
        sessionStorage.removeItem("userEmail");
        
        setTimeout(() => {
            window.location.href = "login.html";
        }, 2000);

    } catch (error) {
        const messageElement = document.getElementById("message");
        messageElement.textContent = error.message;
        messageElement.className = "message-text error show";
    }
});