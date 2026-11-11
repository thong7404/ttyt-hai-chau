// =========================================================================
// 0.1. CHẶN LIVE SERVER TỰ ĐỘNG RELOAD TRANG LIÊN TỤC KHI GỌI API LARAVEL/AI
// =========================================================================
(function stopLiveServerInfiniteReload() {
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = function (url, protocols) {
        const ws = protocols ? new NativeWebSocket(url, protocols) : new NativeWebSocket(url);
        if (url && (url.includes(":5500") || url.includes("/ws"))) {
            ws.addEventListener("message", function (event) {
                if (event.data === "reload" || event.data === "refreshcss") {
                    event.stopImmediatePropagation();
                    console.log("🛡️ Đã chặn Live Server tự động reload trang khi gọi API.");
                }
            }, true);
        }
        return ws;
    };
    window.WebSocket.prototype = NativeWebSocket.prototype;
    window.WebSocket.CONNECTING = NativeWebSocket.CONNECTING;
    window.WebSocket.OPEN = NativeWebSocket.OPEN;
    window.WebSocket.CLOSING = NativeWebSocket.CLOSING;
    window.WebSocket.CLOSED = NativeWebSocket.CLOSED;
})();

// =========================================================================
// 0.2. CÔ LẬP PHIÊN ĐĂNG NHẬP ĐỘC LẬP CHO TỪNG TAB (TAB ADMIN & TAB BỆNH NHÂN RIÊNG BIỆT)
// =========================================================================
(function isolateUserSessionPerTab() {
    const nativeGetItem = Storage.prototype.getItem;
    const nativeSetItem = Storage.prototype.setItem;
    const nativeRemoveItem = Storage.prototype.removeItem;

    const TAB_USER_KEY = "__tab_isolated_current_user__";
    const TAB_ROLE_KEY = "__tab_isolated_demo_role__";

    // Chỉ nhận dữ liệu chuyển tiếp từ localStorage nếu Tab hiện tại chưa có phiên đăng nhập riêng
    const existingTabUser = nativeGetItem.call(sessionStorage, TAB_USER_KEY);
    const pendingLoginUser = nativeGetItem.call(localStorage, "current_user");

    if (pendingLoginUser !== null) {
        if (!existingTabUser) {
            nativeSetItem.call(sessionStorage, TAB_USER_KEY, pendingLoginUser);
        }
        nativeRemoveItem.call(localStorage, "current_user");
    }

    const existingTabRole = nativeGetItem.call(sessionStorage, TAB_ROLE_KEY);
    const pendingLoginRole = nativeGetItem.call(localStorage, "demo_role");

    if (pendingLoginRole !== null) {
        if (!existingTabRole) {
            nativeSetItem.call(sessionStorage, TAB_ROLE_KEY, pendingLoginRole);
        }
        nativeRemoveItem.call(localStorage, "demo_role");
    }

    // Khi đọc thông tin tài khoản: Chỉ đọc từ sessionStorage của đúng Tab hiện tại
    Storage.prototype.getItem = function (key) {
        if (this === window.localStorage) {
            if (key === "current_user") {
                return nativeGetItem.call(sessionStorage, TAB_USER_KEY);
            }
            if (key === "demo_role") {
                return nativeGetItem.call(sessionStorage, TAB_ROLE_KEY);
            }
        }
        return nativeGetItem.call(this, key);
    };

    // Khi lưu thông tin tài khoản: Lưu thẳng vào sessionStorage của riêng Tab hiện tại
    Storage.prototype.setItem = function (key, value) {
        if (this === window.localStorage) {
            if (key === "current_user") {
                nativeSetItem.call(sessionStorage, TAB_USER_KEY, value);
                nativeRemoveItem.call(localStorage, "current_user");
                return;
            }
            if (key === "demo_role") {
                nativeSetItem.call(sessionStorage, TAB_ROLE_KEY, value);
                nativeRemoveItem.call(localStorage, "demo_role");
                return;
            }
        }
        return nativeSetItem.call(this, key, value);
    };

    // Khi Đăng xuất: Xóa sạch ở cả sessionStorage của Tab hiện tại lẫn localStorage
    Storage.prototype.removeItem = function (key) {
        if (this === window.localStorage) {
            if (key === "current_user") {
                nativeRemoveItem.call(sessionStorage, TAB_USER_KEY);
                nativeRemoveItem.call(localStorage, "current_user");
                return;
            }
            if (key === "demo_role") {
                nativeRemoveItem.call(sessionStorage, TAB_ROLE_KEY);
                nativeRemoveItem.call(localStorage, "demo_role");
                return;
            }
        }
        return nativeRemoveItem.call(this, key);
    };
})();

// =========================================================================
// 1. CẤU HÌNH BẢNG MÀU CHUẨN CỦA TTYT PHƯỜNG HẢI CHÂU CHO TAILWIND
// =========================================================================
if (typeof tailwind !== "undefined") {
    tailwind.config = {
        darkMode: "class",
        theme: {
            extend: {
                colors: {
                    primary: "#00676e",
                    "primary-container": "#0e828a",
                    secondary: "#4059aa",
                    tertiary: "#006a49",
                    "tertiary-container": "#00865d",
                    surface: "#f7f9fb",
                    "surface-lowest": "#ffffff",
                    "surface-low": "#f0f4f7",
                    "outline-variant": "#cbd5e1",
                    error: "#ba1a1a",
                    "error-container": "#ffdad6"
                },
                fontFamily: {
                    heading: ["Plus Jakarta Sans", "sans-serif"],
                    body: ["Inter", "sans-serif"]
                }
            }
        }
    };
}

// =========================================================================
// 2. HÀM QUẢN LÝ PHIÊN NGƯỜI DÙNG & PHÂN QUYỀN TRANG ADMIN / TRANG CHỦ
// =========================================================================
function getCurrentUser() {
    try {
        return JSON.parse(localStorage.getItem("current_user") || "null");
    } catch (e) {
        return null;
    }
}

function logoutSystem() {
    localStorage.removeItem("current_user");
    localStorage.removeItem("demo_role");
    window.location.href = "login.html";
}

// Chặn tài khoản Admin không cho về trang chủ Bệnh nhân (index.html)
// và chặn tài khoản Bệnh nhân không cho vào trang Admin (admin.html)
(function enforceRolePageAccess() {
    const user = getCurrentUser();
    const path = window.location.pathname.toLowerCase();

    if (user && user.vai_tro === "QuanTri") {
        if (path.endsWith("/index.html") || path.endsWith("/account.html")) {
            window.location.replace("admin.html");
        }
    }
})();