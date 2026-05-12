import { auth, onAuthStateChanged, signOut } from "./firebase-config.js";

console.log("🔒 Auth Guard Initialized");

onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log(`✅ User authenticated: ${user.email}`);
        // User is signed in.
    } else {
        console.log("⚠️ User not authenticated. Redirecting to login...");
        // No user is signed in.
        // If we are NOT on the login page or landing page, redirect.
        const path = window.location.pathname;
        if (!path.includes("login.html") && !path.includes("index.html") && path !== "/") {
            window.location.href = "login.html";
        }
    }
});

// Expose Logout Function Globally (for UI usage)
window.logout = async () => {
    try {
        await signOut(auth);
        localStorage.removeItem("finos_logged_in");
        localStorage.removeItem("finos_auth_method");
        window.location.href = "index.html";
    } catch (error) {
        console.error("Logout Failed:", error);
    }
};
