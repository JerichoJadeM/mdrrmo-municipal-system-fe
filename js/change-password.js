window.APP_CONFIG.API_BASE

document.getElementById("passwordForm")?.addEventListener("submit", async function (e) {
    e.preventDefault();

    const token = localStorage.getItem("jwtToken");
    const messageElement = document.getElementById("message");

    const data = {
        oldPassword: document.getElementById("oldPassword").value,
        newPassword: document.getElementById("newPassword").value,
        newPassword2: document.getElementById("newPassword2").value
    };

    function cleanErrorMessage(rawMessage) {
        if (!rawMessage) return "Failed to update password.";

        let message = String(rawMessage).trim();

        message = message.replace(/\b\d{3}\s+[A-Z_]+\b/g, "").trim();
        message = message.replace(/\bBAD_REQUEST\b/gi, "").trim();
        message = message.replace(/\bINTERNAL_SERVER_ERROR\b/gi, "").trim();
        message = message.replace(/\bFORBIDDEN\b/gi, "").trim();
        message = message.replace(/\bUNAUTHORIZED\b/gi, "").trim();
        message = message.replace(/^[:,\-\s]+|[:,\-\s]+$/g, "").trim();

        if (!message) {
            return "Failed to update password.";
        }

        return message;
    }

    try {
        const response = await fetch(API_BASE+"/users/password", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            let errorMessage = "Failed to update password.";

            try {
                const errors = await response.json();

                errorMessage =
                    cleanErrorMessage(errors.message) ||
                    cleanErrorMessage(Object.values(errors)[0]) ||
                    errorMessage;
            } catch {
                try {
                    const text = await response.text();
                    errorMessage = cleanErrorMessage(text) || errorMessage;
                } catch {
                    errorMessage = "Failed to update password.";
                }
            }

            throw new Error(errorMessage);
        }

        messageElement.textContent = "Password updated successfully. Redirecting to login...";
        messageElement.className = "message-text success show";

        localStorage.removeItem("jwtToken");
        localStorage.removeItem("userName");
        localStorage.removeItem("userEmail");
        localStorage.removeItem("loginUserInfo");
        sessionStorage.removeItem("userName");
        sessionStorage.removeItem("userEmail");

        setTimeout(() => {
            window.location.href = "login.html";
        }, 1800);

    } catch (error) {
        messageElement.textContent = cleanErrorMessage(error.message);
        messageElement.className = "message-text error show";
    }
});