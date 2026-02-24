// Protect page
const token = localStorage.getItem('jwtToken');

if (!token) {
    window.location.href = 'login.html';
}

document.getElementById("passwordForm").addEventListener("submit", async function(e) {
    e.preventDefault();

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

        document.getElementById("message").innerText =
            "Password updated successfully. Please login again.";

        localStorage.removeItem("jwtToken");
        setTimeout(() => {
            window.location.href = "login.html";
        }, 2000);

    } catch (error) {
        document.getElementById("message").innerText = error.message;
    }
});