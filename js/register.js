window.APP_CONFIG.API_BASE;
// Protect page
const token = localStorage.getItem('jwtToken');

if (!token) {
    window.location.href = 'login.html';
}

document.getElementById("registerForm").addEventListener("submit", function(e) {
    e.preventDefault();

    const data = {
        firstName: document.getElementById("firstName").value,
        middleName: document.getElementById("middleName").value,
        lastName: document.getElementById("lastName").value,
        number: document.getElementById("number").value,
        email: document.getElementById("email").value,
        password:document.getElementById("password").value
    };

    fetch(API_BASE+"/auth/register", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    })
    .then(response => {
        if(!response.ok){
            return response.json().then(errors => {
                const firstError = Object.values(errors)[0];
                throw new Error(firstError);
            });
        }

        if(response.status === 201){
            document.getElementById("message").innerText = "Registration successful!";
        } else {
            return response.json().then(err => {
                throw new Error(err.message || "Registration failed");
            });
        }
    })
    .catch(error => {
        document.getElementById("message").innerText = error.message;
    });
});