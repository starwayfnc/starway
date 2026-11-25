// auth.js - Shared Login & Request Interceptor for Starway
(function () {
  const AUTH_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwOXSqV7odExw90aOMLG2dVq-t6P6JAl6BBDzTlF2Ybxdokr3zXP7Q7D5b_ZIDEz_SZIA/exec";
  const SESSION_KEY = "starway_auth_session";
  const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.user || !parsed.pin || Date.now() - parsed.ts > SESSION_TTL_MS) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return parsed;
    } catch (e) {
      return null;
    }
  }

  // Expose session helper & logout globally
  window.getStarwayUser = getSession;
  window.starwayLogout = function () {
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  };

  // Automatically inject user & pin into every Apps Script fetch() call
  const originalFetch = window.fetch;
  window.fetch = function (resource, init) {
    init = init || {};
    const urlStr = typeof resource === "string" ? resource : (resource && resource.url ? resource.url : "");
    const session = getSession();

    if (session && urlStr.includes("script.google.com/macros/s/")) {
      const urlObj = new URL(urlStr);
      urlObj.searchParams.set("user", session.user);
      urlObj.searchParams.set("pin", session.pin);
      resource = urlObj.toString();

      if (init.method && init.method.toUpperCase() === "POST" && typeof init.body === "string") {
        try {
          const bodyObj = JSON.parse(init.body);
          bodyObj.authUser = session.user;
          bodyObj.authPin = session.pin;
          init.body = JSON.stringify(bodyObj);
        } catch (e) {}
      }
    }
    return originalFetch.call(this, resource, init);
  };

  // Lock the page behind the login overlay if no active session exists
  if (!getSession()) {
    document.documentElement.style.overflow = "hidden";

    window.addEventListener("DOMContentLoaded", function () {
      const overlay = document.createElement("div");
      overlay.id = "starway-login-overlay";
      overlay.style.cssText = [
        "position:fixed",
        "inset:0",
        "background:#15191e",
        "z-index:99999",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "padding:16px",
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
      ].join(";");

      overlay.innerHTML = `
        <div style="background:#1e232a; border:1px solid #2b323b; border-radius:16px; padding:28px 24px; width:100%; max-width:360px; box-shadow:0 12px 32px rgba(0,0,0,0.65); color:#ffffff; box-sizing:border-box;">
          <h2 style="margin:0 0 6px 0; color:#00bcd4; text-align:center; font-size:22px; font-weight:700; letter-spacing:0.8px;">STARWAY LOGIN</h2>
          <p style="margin:0 0 22px 0; color:#94a3b8; text-align:center; font-size:13px;">Authorized Personnel Only</p>

          <form id="swLoginForm">
            <div style="margin-bottom:14px;">
              <label for="swUser" style="display:block; font-size:12px; font-weight:600; color:#94a3b8; margin-bottom:6px;">Username</label>
              <input id="swUser" type="text" required autocomplete="username" placeholder="Enter username"
                style="width:100%; padding:11px 12px; border-radius:8px; border:1px solid #2b323b; background:#15191e; color:#ffffff; font-size:14px; box-sizing:border-box; outline:none;">
            </div>

            <div style="margin-bottom:20px;">
              <label for="swPin" style="display:block; font-size:12px; font-weight:600; color:#94a3b8; margin-bottom:6px;">Security PIN</label>
              <input id="swPin" type="password" inputmode="numeric" required autocomplete="current-password" placeholder="••••"
                style="width:100%; padding:11px 12px; border-radius:8px; border:1px solid #2b323b; background:#15191e; color:#ffffff; font-size:16px; letter-spacing:3px; box-sizing:border-box; outline:none;">
            </div>

            <button id="swLoginBtn" type="submit"
              style="width:100%; padding:12px; background:#00bcd4; color:#0f172a; border:none; border-radius:8px; font-size:15px; font-weight:700; cursor:pointer;">
              Unlock System
            </button>

            <div id="swLoginErr" style="margin-top:12px; text-align:center; font-size:13px; color:#f87171; font-weight:600; min-height:18px;"></div>
          </form>
        </div>
      `;

      document.body.appendChild(overlay);
      document.getElementById("swUser").focus();

      document.getElementById("swLoginForm").addEventListener("submit", async function (e) {
        e.preventDefault();
        const btn = document.getElementById("swLoginBtn");
        const err = document.getElementById("swLoginErr");
        const user = document.getElementById("swUser").value.trim();
        const pin = document.getElementById("swPin").value.trim();

        btn.disabled = true;
        btn.textContent = "Verifying...";
        err.textContent = "";

        try {
          const loginUrl = `${AUTH_SCRIPT_URL}?action=login&user=${encodeURIComponent(user)}&pin=${encodeURIComponent(pin)}`;
          const res = await originalFetch(loginUrl);
          const data = await res.json();

          if (data && data.ok) {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({
              user: user,
              pin: pin,
              name: data.user.name,
              role: data.user.role,
              ts: Date.now()
            }));
            location.reload(); // Reloads page cleanly so initial data fetches run with valid credentials
          } else {
            err.textContent = (data && data.error) ? data.error : "Invalid Username or PIN.";
          }
        } catch (ex) {
          err.textContent = "Network error. Check connection and try again.";
        } finally {
          btn.disabled = false;
          btn.textContent = "Unlock System";
        }
      });
    });
  }
})();