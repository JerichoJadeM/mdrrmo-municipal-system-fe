/**
 * MDRRMO Forecasting System - Login Script
 * Current login flow with feature/login page behavior,
 * aligned with navbar.js and loginUserInfo.js storage expectations.
 */
const LOGIN_API = window.APP_CONFIG.API_BASE+"/auth/login";
const USER_INFO_API = window.APP_CONFIG.API_BASE+"/users/info";

const form = document.getElementById("loginForm");
const messageElement = document.getElementById("message");
const messageContainer = document.getElementById("messageContainer");
const submitBtn = document.getElementById("submitBtn");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

const SUBMIT_DEFAULT_TEXT = submitBtn ? submitBtn.textContent : "Login";

function showNotification(message, type = "info", duration = 5000) {
    if (!messageElement || !messageContainer) return;

    messageElement.className = "";
    messageElement.textContent = message;
    messageElement.classList.add(type);
    messageContainer.classList.add("show");

    if (duration > 0 && type !== "loading") {
        window.clearTimeout(showNotification._timer);
        showNotification._timer = window.setTimeout(() => {
            hideNotification();
        }, duration);
    }
}

function hideNotification() {
    if (!messageElement || !messageContainer) return;

    messageContainer.classList.remove("show");
    messageElement.className = "";
    messageElement.textContent = "";
    window.clearTimeout(showNotification._timer);
}

function setInputInvalidState(input, isInvalid) {
    if (!input) return;
    input.classList.toggle("is-invalid", Boolean(isInvalid));
}

function clearValidationState() {
    setInputInvalidState(emailInput, false);
    setInputInvalidState(passwordInput, false);
}

function validateEmailOrUsername(input) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const usernameRegex = /^[a-zA-Z0-9_.-]{3,}$/;
    return emailRegex.test(input) || usernameRegex.test(input);
}

function validatePassword(password) {
    return Boolean(password && password.length >= 6);
}

function validateForm() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    clearValidationState();
    hideNotification();

    if (!email) {
        setInputInvalidState(emailInput, true);
        showNotification("Please enter your email address or username", "warning", 4000);
        emailInput.focus();
        return false;
    }

    if (!validateEmailOrUsername(email)) {
        setInputInvalidState(emailInput, true);
        showNotification("Please enter a valid email address or username (minimum 3 characters)", "warning", 4000);
        emailInput.focus();
        return false;
    }

    if (!password) {
        setInputInvalidState(passwordInput, true);
        showNotification("Please enter your password", "warning", 4000);
        passwordInput.focus();
        return false;
    }

    if (!validatePassword(password)) {
        setInputInvalidState(passwordInput, true);
        showNotification("Password must be at least 6 characters long", "warning", 4000);
        passwordInput.focus();
        return false;
    }

    return true;
}

function setSubmitState(state) {
    if (!submitBtn) return;

    submitBtn.disabled = state !== "idle";
    submitBtn.classList.remove("is-loading", "is-redirecting");

    if (state === "loading") {
        submitBtn.classList.add("is-loading");
        submitBtn.setAttribute("aria-busy", "true");
        submitBtn.setAttribute("aria-label", "Logging in");
        return;
    }

    if (state === "redirecting") {
        submitBtn.classList.add("is-redirecting");
        submitBtn.setAttribute("aria-busy", "true");
        submitBtn.setAttribute("aria-label", "Redirecting");
        return;
    }

    submitBtn.removeAttribute("aria-busy");
    submitBtn.setAttribute("aria-label", SUBMIT_DEFAULT_TEXT);
}

function clearStoredLoginState() {
    localStorage.removeItem("jwtToken");
    localStorage.removeItem("userName");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userNumber");
    localStorage.removeItem("userAuthorities");
    localStorage.removeItem("loginUserInfo");
    localStorage.removeItem("mdrrmo_profile_photo");
}

async function fetchJsonSafe(response) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        return await response.json();
    }

    const text = await response.text();
    return { message: text };
}

async function fetchUserInfo(token) {
    const response = await fetch(USER_INFO_API, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        }
    });

    if (!response.ok) {
        throw new Error("Failed to load user info after login.");
    }

    return await response.json();
}

function persistUserInfo(userInfo) {
    const fullName = userInfo?.fullName || "";
    const email = userInfo?.email || "";
    const number = userInfo?.number || "";
    const authorities = Array.isArray(userInfo?.authorities) ? userInfo.authorities : [];
    const profileImageUrl = userInfo?.profileImageUrl || "";

    localStorage.setItem("userName", fullName);
    localStorage.setItem("userEmail", email);
    localStorage.setItem("userNumber", number);
    localStorage.setItem("userAuthorities", JSON.stringify(authorities));
    localStorage.setItem("loginUserInfo", JSON.stringify(userInfo || {}));
    localStorage.setItem("mdrrmo_profile_photo", profileImageUrl);
}

function applyImmediateGlobalHooks(userInfo) {
    const fullName = userInfo?.fullName || "";
    const profileImageUrl = userInfo?.profileImageUrl || "";

    if (typeof window.updateUserName === "function") {
        window.updateUserName(fullName);
    }

    if (typeof window.updateUserAvatar === "function") {
        window.updateUserAvatar(profileImageUrl, fullName);
    }

    if (typeof window.applyFrontendRbac === "function") {
        window.applyFrontendRbac();
    }

    if (typeof window.refreshGlobalAdminBadges === "function") {
        window.refreshGlobalAdminBadges();
    }
}

function goToDashboard() {
    window.location.href = "index.html";
}

async function handleLoginSubmit(event) {
    event.preventDefault();

    if (!validateForm()) {
        return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
        setSubmitState("loading");
        showNotification("Logging in... Please wait", "loading", 0);

        const response = await fetch(LOGIN_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const data = await fetchJsonSafe(response);

        if (!response.ok) {
            const errorMessage = data?.message || data?.error || "Invalid credentials. Please try again.";
            setSubmitState("idle");
            showNotification(errorMessage, "error", 5000);
            return;
        }

        if (!data?.token) {
            setSubmitState("idle");
            showNotification("Login response invalid. Please contact support.", "error", 5000);
            return;
        }

        localStorage.setItem("jwtToken", data.token);

        try {
            const userInfo = await fetchUserInfo(data.token);
            persistUserInfo(userInfo);
            applyImmediateGlobalHooks(userInfo);
        } catch (userInfoError) {
            console.warn("User info fetch after login failed:", userInfoError);
            localStorage.setItem("userAuthorities", JSON.stringify([]));
            localStorage.setItem("loginUserInfo", JSON.stringify({}));
            localStorage.setItem("mdrrmo_profile_photo", "");
        }

        setSubmitState("redirecting");
        showNotification("Login successful!", "success", 900);

        window.setTimeout(() => {
            goToDashboard();
        }, 700);
    } catch (error) {
        console.error("Login failed:", error);
        clearStoredLoginState();
        setSubmitState("idle");

        let errorMessage = "An error occurred. Please check your connection and try again.";

        if (error.name === "TypeError" && String(error.message || "").includes("fetch")) {
            errorMessage = "Unable to connect to the server. Please check your connection.";
        } else if (error.message) {
            errorMessage = error.message;
        }

        showNotification(errorMessage, "error", 5000);
    }
}

function attachInputBehavior(input) {
    if (!input) return;

    input.addEventListener("input", () => {
        setInputInvalidState(input, false);

        if (
            messageElement.classList.contains("error") ||
            messageElement.classList.contains("warning")
        ) {
            hideNotification();
        }
    });
}

function bootstrapLoginPage() {
    clearValidationState();
    setSubmitState("idle");

    if (form) {
        form.addEventListener("submit", handleLoginSubmit);
    }

    attachInputBehavior(emailInput);
    attachInputBehavior(passwordInput);

    // Optional: if already logged in, avoid showing login page again.
    const existingToken = localStorage.getItem("jwtToken");
    if (existingToken) {
        setSubmitState("redirecting");
        goToDashboard();
    }
}

document.addEventListener("DOMContentLoaded", bootstrapLoginPage);