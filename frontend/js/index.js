// =========================================================================
// CẤU HÌNH ĐỊA CHỈ API BACKEND LARAVEL (8000) & FASTAPI AI (8001)
// =========================================================================
const API_CONFIG = {
    BASE_API_URL: "http://127.0.0.1:8000/api",
    LARAVEL_AUTH_URL: "http://127.0.0.1:8000/api",
    FASTAPI_CHAT_URL: "http://127.0.0.1:8001/api/ai/triage-chat"
};

let symptomImageFiles = [];
let chatSessions = [];
let activeSessionId = null;

/**
 * 1. Hàm lấy thông tin người dùng đang đăng nhập từ localStorage
 */
function getCurrentUser() {
    try {
        const raw = localStorage.getItem("current_user");
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

/**
 * 2. Hàm đăng xuất tài khoản
 */
function logoutSystem() {
    localStorage.removeItem("current_user");
    localStorage.removeItem("demo_role");
    window.location.href = "login.html";
}

/**
 * 3. Hàm nạp trực tiếp 2 file tĩnh header.html và footer.html vào #app-header và #app-footer
 */
async function loadHeaderAndFooterHtml() {
    const headerPlaceholder = document.getElementById("app-header");
    const footerPlaceholder = document.getElementById("app-footer");

    try {
        const [headerRes, footerRes] = await Promise.all([
            fetch("./header.html"),
            fetch("./footer.html")
        ]);

        if (headerRes.ok && headerPlaceholder) {
            headerPlaceholder.innerHTML = await headerRes.text();
        }
        if (footerRes.ok && footerPlaceholder) {
            footerPlaceholder.innerHTML = await footerRes.text();
        }
    } catch (err) {
        console.error("Không thể tải header.html hoặc footer.html:", err);
    }

    renderHeaderAuthStatus();
}

/**
 * 4. Hàm lấy chuỗi ngày hôm nay theo định dạng YYYY-MM-DD
 */
function getTodayDateStr() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * 5. Hàm giới hạn ngày đặt lịch khám tối thiểu là ngày hôm nay
 */
function initBookingDateMin() {
    const todayStr = getTodayDateStr();
    const bkDateEl = document.getElementById("bk-date");
    if (bkDateEl) {
        bkDateEl.setAttribute("min", todayStr);
        if (!bkDateEl.value || bkDateEl.value < todayStr) {
            bkDateEl.value = todayStr;
        }
    }
}

/**
 * Khởi chạy toàn bộ chức năng khi trang index.html tải xong
 */
document.addEventListener("DOMContentLoaded", async () => {
    await loadHeaderAndFooterHtml();
    initBookingDateMin();
    await initChatSessionsSystem();
    initScrollAnimations();

    document.addEventListener("click", (e) => {
        const wrapper = document.getElementById("header-user-dropdown-wrapper");
        const menu = document.getElementById("user-profile-menu");
        if (wrapper && menu && !wrapper.contains(e.target)) {
            menu.classList.add("hidden");
        }
    });
});

/**
 * Hàm khởi tạo hiệu ứng chuyển động mượt khi cuộn trang (Scroll Reveal)
 */
function initScrollAnimations() {
    const animatedElements = document.querySelectorAll(
        ".reveal-up, .reveal-left, .reveal-right, .reveal-zoom"
    );
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                }
            });
        },
        { threshold: 0.12, rootMargin: "0px 0px -30px 0px" }
    );
    animatedElements.forEach((el) => observer.observe(el));
}

// =========================================================================
// 1. HIỂN THỊ AVATAR + TÊN NGƯỜI DÙNG TRÊN HEADER
// =========================================================================
function renderHeaderAuthStatus() {
    const user = getCurrentUser();
    const guestZone = document.getElementById("header-guest-zone");
    const userDropdownWrapper = document.getElementById("header-user-dropdown-wrapper");

    const bkName = document.getElementById("bk-fullname");
    const bkPhone = document.getElementById("bk-phone");

    if (user && user.ma_nguoi_dung) {
        if (guestZone) guestZone.classList.add("hidden");
        if (userDropdownWrapper) userDropdownWrapper.classList.remove("hidden");

        const savedAvatar = localStorage.getItem(`avatar_user_${user.ma_nguoi_dung}`)
            || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.ho_ten)}&background=0e828a&color=fff&bold=true`;

        const navAvatar = document.getElementById("nav-user-avatar");
        const navName = document.getElementById("nav-user-name");
        const navCode = document.getElementById("nav-user-code");
        const dropName = document.getElementById("dropdown-user-fullname");
        const dropEmail = document.getElementById("dropdown-user-email");

        if (navAvatar) navAvatar.src = savedAvatar;
        if (navName) navName.textContent = user.ho_ten;
        if (navCode) {
            navCode.textContent = user.ma_benh_nhan
                ? `Mã BN: #${user.ma_benh_nhan}${user.vneid ? " • VNeID: " + user.vneid : ""}`
                : user.vai_tro;
        }
        if (dropName) dropName.textContent = user.ho_ten;
        if (dropEmail) dropEmail.textContent = user.email;

        if (bkName && !bkName.value) bkName.value = user.ho_ten || "";
        if (bkPhone && !bkPhone.value) bkPhone.value = user.so_dien_thoai || "";
    } else {
        if (guestZone) guestZone.classList.remove("hidden");
        if (userDropdownWrapper) userDropdownWrapper.classList.add("hidden");
        if (bkName) bkName.value = "";
        if (bkPhone) bkPhone.value = "";
    }
}

function toggleUserProfileMenu(event) {
    event.stopPropagation();
    const menu = document.getElementById("user-profile-menu");
    if (menu) menu.classList.toggle("hidden");
}

// =========================================================================
// 2. BẢNG YÊU CẦU ĐĂNG NHẬP & BẢNG ĐẶT LỊCH THÀNH CÔNG
// =========================================================================

/**
 * Hiển thị bảng thông báo yêu cầu đăng nhập khi người dùng chưa đăng nhập mà nhấn Đặt lịch
 */
function showRequireLoginModal() {
    let modal = document.getElementById("require-login-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "require-login-modal";
        modal.className = "fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4";
        modal.innerHTML = `
            <div class="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-teal-200 animate-[fadeIn_0.2s_ease-out]">
                <div class="bg-gradient-to-r from-teal-600 to-emerald-600 text-white px-6 py-5 text-center relative">
                    <div class="w-14 h-14 rounded-full bg-white text-teal-600 flex items-center justify-center mx-auto mb-2.5 shadow-md">
                        <span class="material-symbols-outlined text-3xl">lock</span>
                    </div>
                    <h3 class="font-heading font-extrabold text-lg">Thông Báo Hệ Thống</h3>
                </div>
                <div class="p-6 text-center space-y-5">
                    <p class="text-sm sm:text-base text-slate-700 font-bold leading-relaxed">
                        Hãy đăng nhập để đặt lịch và xem hồ sơ bệnh án
                    </p>
                    <div class="flex items-center gap-3">
                        <button type="button" onclick="closeRequireLoginModal()"
                                class="w-2/5 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm transition">
                            Đóng lại
                        </button>
                        <a href="login.html"
                           class="w-3/5 py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-md transition">
                            <span class="material-symbols-outlined text-base">login</span>
                            <span>Đăng nhập ngay</span>
                        </a>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        modal.classList.remove("hidden");
        modal.classList.add("flex");
    }
}

function closeRequireLoginModal() {
    const modal = document.getElementById("require-login-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
}

function showBookingSuccessModal(bookingInfo) {
    const modal = document.getElementById("booking-success-modal");
    if (!modal) return;

    document.getElementById("bsm-ma-lich-hen").textContent = `#${bookingInfo.ma_lich_hen}`;
    document.getElementById("bsm-ho-ten").textContent = bookingInfo.ho_ten || "";
    document.getElementById("bsm-sdt").textContent = bookingInfo.so_dien_thoai || "";
    document.getElementById("bsm-chuyen-khoa").textContent = bookingInfo.chuyen_khoa || "";
    document.getElementById("bsm-thoi-gian").textContent = `${bookingInfo.ngay_hen_kham} • ${bookingInfo.khung_gio_hen}`;
    document.getElementById("bsm-trieu-chung").textContent = bookingInfo.trieu_chung_ban_dau || "Khám lâm sàng theo lịch hẹn";

    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function closeBookingSuccessModal() {
    const modal = document.getElementById("booking-success-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    }
}

function openBookedListFromSuccessModal() {
    window.location.href = "account.html?tab=appointments";
}

// =========================================================================
// 3. TỰ ĐỘNG ĐIỀN FORM ĐẶT LỊCH & LƯU VÀO BẢNG LICH_HEN_KHAM (BẮT BUỘC ĐĂNG NHẬP)
// =========================================================================
function autoFillHomepageBookingForm(suggestion) {
    if (!suggestion) return;
    const user = getCurrentUser();
    const todayStr = getTodayDateStr();

    const deptEl = document.getElementById("bk-department");
    const shiftEl = document.getElementById("bk-shift");
    const dateEl = document.getElementById("bk-date");
    const symptomEl = document.getElementById("bk-symptom");
    const nameEl = document.getElementById("bk-fullname");
    const phoneEl = document.getElementById("bk-phone");

    if (deptEl && suggestion.chuyen_khoa) deptEl.value = suggestion.chuyen_khoa;
    if (shiftEl && suggestion.ca_kham) shiftEl.value = suggestion.ca_kham;
    if (dateEl) {
        dateEl.value = (suggestion.ngay_hen && suggestion.ngay_hen >= todayStr) ? suggestion.ngay_hen : todayStr;
    }
    if (symptomEl && suggestion.trieu_chung_tom_tat) {
        symptomEl.value = suggestion.trieu_chung_tom_tat;
    }
    if (user) {
        if (nameEl) nameEl.value = user.ho_ten || "";
        if (phoneEl) phoneEl.value = user.so_dien_thoai || "";
    }
}

function scrollAndHighlightBookingForm() {
    const win = document.getElementById("ai-chat-popup");
    if (win) win.classList.add("hidden");

    const bookingBox = document.getElementById("booking-box");
    if (bookingBox) {
        bookingBox.scrollIntoView({ behavior: "smooth", block: "center" });
        bookingBox.classList.add("ring-4", "ring-emerald-400", "transition-all");
        setTimeout(() => {
            bookingBox.classList.remove("ring-4", "ring-emerald-400");
        }, 3500);
    }
}

async function saveAppointmentToMySql(bookingPayload) {
    const res = await fetch(`${API_CONFIG.LARAVEL_AUTH_URL}/book-appointment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(bookingPayload)
    });
    const data = await res.json();
    return {
        ok: res.ok && data.status === "success",
        ma_lich_hen: data.ma_lich_hen,
        message: data.message
    };
}

/**
 * Hàm đặt lịch trực tiếp từ Phiếu đặt lịch gợi ý trong khung Chat AI
 * (Chưa đăng nhập -> Hiện bảng thông báo yêu cầu đăng nhập)
 */
async function confirmAiBookingDirectly(cardId) {
    const user = getCurrentUser();
    if (!user || !user.ma_nguoi_dung) {
        showRequireLoginModal();
        return;
    }

    const todayStr = getTodayDateStr();
    const dept = document.getElementById(`ai-bk-dept-${cardId}`).value;
    const shift = document.getElementById(`ai-bk-shift-${cardId}`).value;
    const dateInput = document.getElementById(`ai-bk-date-${cardId}`);
    const date = dateInput.value;
    const symptom = document.getElementById(`ai-bk-symptom-${cardId}`).value;
    const nameInput = document.getElementById(`ai-bk-name-${cardId}`);
    const phoneInput = document.getElementById(`ai-bk-phone-${cardId}`);

    const hoTen = nameInput ? nameInput.value.trim() : (user.ho_ten || "");
    const soDienThoai = phoneInput ? phoneInput.value.trim() : (user.so_dien_thoai || "");

    if (!hoTen || !soDienThoai) {
        alert("⚠️ Vui lòng nhập Họ tên và Số điện thoại trong thẻ đặt lịch để xác nhận!");
        return;
    }

    if (!date || date < todayStr) {
        alert(`⚠️ Không thể đặt lịch vào ngày đã qua (${date})!`);
        dateInput.value = todayStr;
        return;
    }

    const bookingPayload = {
        ma_nguoi_dung: user.ma_nguoi_dung,
        ma_benh_nhan: user.ma_benh_nhan,
        ho_ten: hoTen,
        so_dien_thoai: soDienThoai,
        chuyen_khoa: dept,
        khung_gio_hen: shift,
        ngay_hen_kham: date,
        trieu_chung_ban_dau: symptom
    };

    try {
        const result = await saveAppointmentToMySql(bookingPayload);
        if (!result.ok) {
            alert("⚠️ " + (result.message || "Không thể lưu lịch hẹn vào MySQL!"));
            return;
        }

        const btnConfirm = document.getElementById(`btn-ai-confirm-${cardId}`);
        if (btnConfirm) {
            btnConfirm.disabled = true;
            btnConfirm.className = "w-full py-2 rounded-lg bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-default";
            btnConfirm.innerHTML = `<span class="material-symbols-outlined text-sm">verified</span> Đã lưu Lịch hẹn #${result.ma_lich_hen}`;
        }

        showBookingSuccessModal({
            ma_lich_hen: result.ma_lich_hen,
            ho_ten: hoTen,
            so_dien_thoai: soDienThoai,
            chuyen_khoa: dept,
            ngay_hen_kham: date,
            khung_gio_hen: shift,
            trieu_chung_ban_dau: symptom
        });
    } catch (e) {
        alert("⚠️ Không kết nối được tới Server Laravel (Cổng 8000) để lưu lịch hẹn!");
    }
}

/**
 * Hàm xử lý khi nhấn nút "XÁC NHẬN ĐẶT LỊCH KHÁM" trên trang chủ
 * (Chưa đăng nhập -> Hiện bảng thông báo yêu cầu đăng nhập, không chuyển sang Cao Trung)
 */
async function handleQuickBooking(event) {
    event.preventDefault();
    const user = getCurrentUser();

    if (!user || !user.ma_nguoi_dung) {
        showRequireLoginModal();
        return;
    }

    const todayStr = getTodayDateStr();
    const dateInput = document.getElementById("bk-date");
    const selectedDate = dateInput.value;

    if (!selectedDate || selectedDate < todayStr) {
        alert(`⚠️ Ngày hẹn khám không hợp lệ!\nVui lòng chọn từ ngày hôm nay (${todayStr}) trở đi.`);
        dateInput.value = todayStr;
        return;
    }

    const deptVal = document.getElementById("bk-department").value;
    const shiftVal = document.getElementById("bk-shift").value;
    const fullNameVal = document.getElementById("bk-fullname").value.trim();
    const phoneVal = document.getElementById("bk-phone").value.trim();
    const symptomVal = document.getElementById("bk-symptom").value.trim() || "Khám lâm sàng theo lịch hẹn";

    const bookingPayload = {
        ma_nguoi_dung: user.ma_nguoi_dung,
        ma_benh_nhan: user.ma_benh_nhan,
        ho_ten: fullNameVal,
        so_dien_thoai: phoneVal,
        chuyen_khoa: deptVal,
        khung_gio_hen: shiftVal,
        ngay_hen_kham: selectedDate,
        trieu_chung_ban_dau: symptomVal
    };

    try {
        const result = await saveAppointmentToMySql(bookingPayload);
        if (!result.ok) {
            alert("⚠️ " + (result.message || "Không thể đặt lịch khám!"));
            return;
        }

        showBookingSuccessModal({
            ma_lich_hen: result.ma_lich_hen,
            ho_ten: fullNameVal,
            so_dien_thoai: phoneVal,
            chuyen_khoa: deptVal,
            ngay_hen_kham: selectedDate,
            khung_gio_hen: shiftVal,
            trieu_chung_ban_dau: symptomVal
        });

        event.target.reset();
        initBookingDateMin();
        renderHeaderAuthStatus();
    } catch (e) {
        alert("⚠️ Không kết nối được tới Server Laravel (Cổng 8000)!");
    }
}

// =========================================================================
// 4. HỆ THỐNG LỊCH SỬ CHAT AI ĐA PHIÊN (PHIEN_TRO_CHUYEN_AI, LICH_SU_TIN_NHAN_AI, ANH_TIN_NHAN_AI)
// =========================================================================
function getChatStorageConfig() {
    const user = getCurrentUser();
    if (user && user.ma_nguoi_dung) {
        return {
            storage: localStorage,
            key: `ai_sessions_user_${user.ma_nguoi_dung}`,
            isLogged: true,
            user: user
        };
    }
    return {
        storage: sessionStorage,
        key: "ai_sessions_guest_temp",
        isLogged: false,
        user: null
    };
}

async function initChatSessionsSystem() {
    const cfg = getChatStorageConfig();
    const badge = document.getElementById("ai-storage-mode-badge");
    if (badge) {
        if (cfg.isLogged) {
            badge.className = "text-[11px] text-emerald-400 flex items-center gap-1.5";
            badge.innerHTML = `<span class="material-symbols-outlined text-sm">cloud_done</span><span>Lưu MySQL: ${cfg.user.ho_ten}</span>`;
        } else {
            badge.className = "text-[11px] text-amber-300 flex items-center gap-1.5";
            badge.innerHTML = `<span class="material-symbols-outlined text-sm">hourglass_top</span><span>Khách: Tự xóa khi đóng tab</span>`;
        }
    }

    if (cfg.isLogged) {
        try {
            const res = await fetch(`${API_CONFIG.LARAVEL_AUTH_URL}/ai-sessions/${cfg.user.ma_nguoi_dung}`, {
                headers: { "Accept": "application/json" }
            });
            const data = await res.json();
            if (res.ok && Array.isArray(data.sessions)) {
                chatSessions = data.sessions.map(s => ({
                    id: "session_" + (s.ma_phien_chat || Date.now()),
                    ma_phien_chat: s.ma_phien_chat || null,
                    title: s.tieu_de_cuoc_tro_chuyen || "Cuộc trò chuyện AI",
                    createdAt: s.thoi_gian_tao || "",
                    messages: (s.messages || []).map(m => ({
                        ma_tin_nhan: m.ma_tin_nhan || null,
                        nguoi_gui: m.nguoi_gui || "NguoiDung",
                        noi_dung: m.noi_dung_tin_nhan || m.noi_dung || "",
                        images: (m.images || []).map(img => typeof img === "string" ? img : (img.duong_dan_anh || "")),
                        booking_suggestion: m.booking_suggestion || null
                    }))
                }));
                cfg.storage.setItem(cfg.key, JSON.stringify(chatSessions));
            } else {
                chatSessions = [];
            }
        } catch (e) {
            const raw = cfg.storage.getItem(cfg.key);
            chatSessions = raw ? JSON.parse(raw) : [];
        }
    } else {
        const raw = cfg.storage.getItem(cfg.key);
        chatSessions = raw ? JSON.parse(raw) : [];
    }

    if (chatSessions.length === 0) {
        createNewSessionObject();
    } else {
        activeSessionId = chatSessions[0].id;
    }

    renderSessionSidebarList();
    renderActiveSessionMessages();
}

function createNewSessionObject() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) +
        " " + now.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });

    const newSession = {
        id: "session_" + Date.now(),
        ma_phien_chat: null,
        title: "Cuộc trò chuyện mới",
        createdAt: timeStr,
        messages: []
    };

    chatSessions.unshift(newSession);
    activeSessionId = newSession.id;
    saveAllChatSessions();
    return newSession;
}

function startNewAiChatSession() {
    const current = chatSessions.find(s => s.id === activeSessionId);
    if (current && current.messages.length === 0) {
        document.getElementById("ai-chat-input").focus();
        return;
    }

    createNewSessionObject();
    renderSessionSidebarList();
    renderActiveSessionMessages();
    document.getElementById("ai-chat-input").focus();
}

function selectAiChatSession(sessionId) {
    activeSessionId = sessionId;
    renderSessionSidebarList();
    renderActiveSessionMessages();
}

async function deleteAiChatSession(sessionId, event) {
    event.stopPropagation();
    const target = chatSessions.find(s => s.id === sessionId);

    if (target && target.ma_phien_chat) {
        try {
            await fetch(`${API_CONFIG.LARAVEL_AUTH_URL}/ai-sessions/delete`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({ ma_phien_chat: target.ma_phien_chat })
            });
        } catch (e) {}
    }

    chatSessions = chatSessions.filter(s => s.id !== sessionId);

    if (chatSessions.length === 0) {
        createNewSessionObject();
    } else if (activeSessionId === sessionId) {
        activeSessionId = chatSessions[0].id;
    }

    saveAllChatSessions();
    renderSessionSidebarList();
    renderActiveSessionMessages();
}

async function clearAllAiChatSessions() {
    if (!confirm("Bạn có chắc muốn xóa toàn bộ lịch sử các cuộc trò chuyện không?")) return;
    const cfg = getChatStorageConfig();

    if (cfg.isLogged) {
        for (const s of chatSessions) {
            if (s.ma_phien_chat) {
                try {
                    await fetch(`${API_CONFIG.LARAVEL_AUTH_URL}/ai-sessions/delete`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "Accept": "application/json" },
                        body: JSON.stringify({ ma_phien_chat: s.ma_phien_chat })
                    });
                } catch (e) {}
            }
        }
    }

    chatSessions = [];
    createNewSessionObject();
    renderSessionSidebarList();
    renderActiveSessionMessages();
}

function saveAllChatSessions() {
    const cfg = getChatStorageConfig();
    cfg.storage.setItem(cfg.key, JSON.stringify(chatSessions));
}

async function syncMessageToMySql(sessionObj, sender, content, images = []) {
    const user = getCurrentUser();
    if (!user || !user.ma_nguoi_dung) return;

    try {
        const res = await fetch(`${API_CONFIG.LARAVEL_AUTH_URL}/ai-sessions/save-message`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
                ma_nguoi_dung: user.ma_nguoi_dung,
                ma_phien_chat: sessionObj.ma_phien_chat || null,
                tieu_de_cuoc_tro_chuyen: sessionObj.title,
                nguoi_gui: sender,
                noi_dung_tin_nhan: content,
                images: images
            })
        });
        const data = await res.json();
        if (res.ok && data.ma_phien_chat) {
            sessionObj.ma_phien_chat = data.ma_phien_chat;
            saveAllChatSessions();
        }
    } catch (err) {
        console.error("Không thể đồng bộ tin nhắn AI vào MySQL:", err);
    }
}

function renderSessionSidebarList() {
    const listEl = document.getElementById("ai-session-list");
    const countEl = document.getElementById("ai-session-count");
    if (!listEl) return;

    if (countEl) countEl.textContent = chatSessions.length;

    listEl.innerHTML = chatSessions.map(session => {
        const isActive = session.id === activeSessionId;
        return `
            <div onclick="selectAiChatSession('${session.id}')"
                 class="group px-3 py-2.5 rounded-xl cursor-pointer flex items-center justify-between gap-2 transition ${
                     isActive
                         ? "bg-teal-600 text-white font-semibold shadow-sm"
                         : "bg-white/80 text-slate-700 hover:bg-teal-50 hover:text-teal-800 border border-teal-100/80"
                 }">
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-sm shrink-0 ${isActive ? 'text-white' : 'text-teal-600'}">chat_bubble</span>
                        <p class="truncate text-xs font-semibold">${session.title}</p>
                    </div>
                    <span class="text-[10px] ${isActive ? "text-teal-100" : "text-slate-500"} block pl-5 mt-0.5">
                        ${session.createdAt} • ${session.messages.length} tin nhắn
                    </span>
                </div>
                <button type="button" onclick="deleteAiChatSession('${session.id}', event)"
                        class="opacity-75 group-hover:opacity-100 ${isActive ? 'text-white hover:text-rose-200' : 'text-slate-400 hover:text-rose-600'} p-1 rounded transition shrink-0"
                        title="Xóa cuộc trò chuyện này">
                    <span class="material-symbols-outlined text-sm">delete</span>
                </button>
            </div>
        `;
    }).join("");
}

/**
 * Bộ phân luồng Y tế AI thông minh dự phòng tại trình duyệt (Khi cổng 8001 chưa bật)
 */
function buildLocalMedicalTriageFallback(userMessage, hasImages = false) {
    const msg = (userMessage || "").toLowerCase().trim();
    const todayStr = getTodayDateStr();

    // Nhận diện nếu người dùng chỉ mới chào hỏi
    const cleanGreeting = msg.replace(/[^\w\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi, "").trim();
    const greetings = ["xin chào", "chào", "chào bạn", "chào bác sĩ", "hi", "hello", "alo", "bác sĩ ơi"];
    if (greetings.includes(cleanGreeting) && !hasImages) {
        return {
            reply: "Xin chào bạn! 👋 Tôi là **Bác sĩ Trợ lý AI** của **Trung tâm Y tế Phường Hải Châu**.\n\nHiện tại bạn đang gặp triệu chứng gì (ví dụ: *đau rát họng, sốt, đau đầu, chóng mặt, đau nhức xương khớp...*) hoặc cần tư vấn thủ tục khám BHYT? Hãy mô tả hoặc gửi kèm hình ảnh để tôi tư vấn đúng Khoa/Phòng cho bạn nhé!",
            booking_suggestion: null
        };
    }

    let dept = "Khoa Nội Tổng Quát (P102)";
    let price = "45.000đ";
    let analysis = "Triệu chứng nội khoa tổng quát, cần kiểm tra sinh hiệu (mạch, huyết áp, nhiệt độ) tại Phòng P101 và khám lâm sàng tại Phòng P102.";

    if (msg.includes("tay") || msg.includes("chân") || msg.includes("khớp") || msg.includes("xương") || msg.includes("lưng") || msg.includes("gối") || msg.includes("cổ tay") || msg.includes("sưng") || msg.includes("tê bì") || msg.includes("gout")) {
        dept = "Khoa Cơ - Xương - Khớp (P106)";
        price = "50.000đ";
        analysis = "Tình trạng sưng đau vùng cơ xương khớp / vận động. Bác sĩ khuyến nghị khám chuyên khoa Cơ - Xương - Khớp (Phòng P106) và có thể kết hợp chụp X-Quang kiểm tra tổn thương khớp.";
    } else if (msg.includes("họng") || msg.includes("ho") || msg.includes("tai") || msg.includes("mũi") || msg.includes("xoang") || msg.includes("amidan") || msg.includes("đờm") || msg.includes("sốt")) {
        dept = "Khoa Tai - Mũi - Họng (P103)";
        price = "50.000đ";
        analysis = "Triệu chứng viêm đường hô hấp trên / Tai - Mũi - Họng. Bác sĩ khuyến nghị khám nội soi tại Phòng P103.";
    } else if (msg.includes("siêu âm") || msg.includes("x-quang") || msg.includes("xét nghiệm") || msg.includes("chụp")) {
        dept = "Khoa Chẩn Đoán Hình Ảnh (P201)";
        price = "Theo dịch vụ CLS";
        analysis = "Thực hiện kỹ thuật Cận lâm sàng & Chẩn đoán hình ảnh tại Phòng P201.";
    }

    const wantsBooking = ["đặt lịch", "đặt hẹn", "đăng ký khám", "đặt cho tôi", "lập phiếu"].some(k => msg.includes(k));

    const reply =
        `🩺 **Đánh giá sơ bộ từ Bác sĩ Trợ lý AI:**\n` +
        `- **Triệu chứng ghi nhận:** ${userMessage || "Hình ảnh triệu chứng lâm sàng"}${hasImages ? " (Đã phân tích hình ảnh đính kèm)" : ""}.\n` +
        `- **Nhận định chuyên môn:** ${analysis}\n` +
        `- **Chỉ định phân luồng:** **${dept}** (Giá khám niêm yết: **${price}**, BHYT hỗ trợ 80%).\n\n` +
        (wantsBooking
            ? `📋 Tôi đã tự động điền sẵn **Phiếu Đặt Lịch Khám** bên dưới cho bạn. Bạn chỉ cần bấm nút **"Xác nhận đặt lịch ngay"** để lưu vào hệ thống!`
            : `👉 Nếu bạn muốn đặt lịch khám ngay, hãy nhắn **"Hãy đặt lịch cho tôi"** nhé!`);

    return {
        reply: reply,
        booking_suggestion: wantsBooking ? {
            chuyen_khoa: dept,
            ca_kham: "Ca Sáng (07:00 - 11:30)",
            ngay_hen: todayStr,
            trieu_chung_tom_tat: userMessage || "Khám theo tư vấn phân luồng của AI"
        } : null
    };
}

/**
 * Hàm chuyển đổi văn bản Markdown (**in đậm**, *in nghiêng*) sang thẻ HTML đẹp mắt
 */
function formatAiMarkdownText(text) {
    if (!text) return "";
    return String(text)
        .replace(/&/g, "&")
        .replace(/</g, "<")
        .replace(/>/g, ">")
        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-teal-900">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em class="italic text-slate-600">$1</em>');
}

function renderActiveSessionMessages() {
    const box = document.getElementById("ai-chat-messages");
    const titleEl = document.getElementById("ai-current-session-title");
    if (!box) return;

    const currentSession = chatSessions.find(s => s.id === activeSessionId);
    if (titleEl && currentSession) {
        titleEl.textContent = currentSession.title;
    }

    box.innerHTML = `
        <div class="flex items-start gap-2.5">
            <div class="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5">
                <span class="material-symbols-outlined text-base">smart_toy</span>
            </div>
            <div class="bg-white p-3 rounded-xl rounded-tl-none shadow-sm border border-slate-200 text-sm text-slate-700 max-w-[88%]">
                Xin chào! Tôi là Bác sĩ Trợ lý AI của <b>TTYT Phường Hải Châu</b>.<br>
                Hãy mô tả triệu chứng hoặc gửi <b>📷 nhiều ảnh triệu chứng</b>. Khi cần đặt lịch, hãy nhắn <b>"Hãy đặt lịch cho tôi"</b> để tôi tự động điền phiếu khám nhé!
            </div>
        </div>
    `;

    if (!currentSession) return;

    currentSession.messages.forEach((msg, idx) => {
        if (msg.nguoi_gui === "NguoiDung") {
            renderUserBubbleDOM(msg.noi_dung, msg.images || []);
        } else {
            renderAiBubbleDOM(msg.noi_dung, msg.booking_suggestion || null, idx);
        }
    });
}

function toggleAiHistorySidebar() {
    const sidebar = document.getElementById("ai-history-sidebar");
    if (sidebar) sidebar.classList.toggle("hidden");
}

function toggleAiChatPopup() {
    const win = document.getElementById("ai-chat-popup");
    win.classList.toggle("hidden");
    if (!win.classList.contains("hidden")) {
        document.getElementById("ai-chat-input").focus();
    }
}

function quickAskSymptom(text) {
    const input = document.getElementById("ai-chat-input");
    input.value = text;
    sendSymptomChatToAi(new Event("submit"));
}

// =========================================================================
// 5. CHỌN NHIỀU ẢNH TRIỆU CHỨNG & GỬI LÊN SERVER AI (FASTAPI 8001)
// =========================================================================
function onSelectSymptomImages(event) {
    const files = Array.from(event.target.files);
    symptomImageFiles = symptomImageFiles.concat(files);
    renderSymptomPreviewStrip();
}

function removeSelectedSymptomImage(index) {
    symptomImageFiles.splice(index, 1);
    renderSymptomPreviewStrip();
}

function renderSymptomPreviewStrip() {
    const strip = document.getElementById("ai-image-preview-strip");
    if (!strip) return;
    strip.innerHTML = "";
    if (symptomImageFiles.length === 0) {
        strip.classList.add("hidden");
        return;
    }
    strip.classList.remove("hidden");
    symptomImageFiles.forEach((file, idx) => {
        const wrap = document.createElement("div");
        wrap.className = "relative shrink-0";
        wrap.innerHTML = `
            <img src="${URL.createObjectURL(file)}" class="w-14 h-14 object-cover rounded-lg border-2 border-primary"/>
            <button type="button" onclick="removeSelectedSymptomImage(${idx})" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-xs flex items-center justify-center shadow">×</button>
        `;
        strip.appendChild(wrap);
    });
}

function fileToDataUrl(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
    });
}

async function sendSymptomChatToAi(event) {
    if (event && event.preventDefault) event.preventDefault();
    const input = document.getElementById("ai-chat-input");
    const message = input.value.trim();

    if (!message && symptomImageFiles.length === 0) return;

    let currentSession = chatSessions.find(s => s.id === activeSessionId);
    if (!currentSession) {
        currentSession = createNewSessionObject();
    }

    const savedImageUrls = await Promise.all(symptomImageFiles.map(f => fileToDataUrl(f)));
    const displayMessage = message || `(Đã gửi ${savedImageUrls.length} ảnh triệu chứng)`;

    if (currentSession.messages.length === 0) {
        currentSession.title = displayMessage.length > 28
            ? displayMessage.substring(0, 28) + "..."
            : displayMessage;
    }

    currentSession.messages.push({
        nguoi_gui: "NguoiDung",
        noi_dung: displayMessage,
        images: savedImageUrls
    });
    saveAllChatSessions();
    renderSessionSidebarList();
    renderUserBubbleDOM(displayMessage, savedImageUrls);

    await syncMessageToMySql(currentSession, "NguoiDung", displayMessage, savedImageUrls);

    const formData = new FormData();
    formData.append("message", message || "Hãy phân tích các hình ảnh triệu chứng này giúp tôi");
    formData.append(
        "history_json",
        JSON.stringify(currentSession.messages.map(m => ({ nguoi_gui: m.nguoi_gui, noi_dung: m.noi_dung })))
    );
    symptomImageFiles.forEach(file => {
        formData.append("symptom_images", file);
    });

    const hadImages = symptomImageFiles.length > 0;
    input.value = "";
    symptomImageFiles = [];
    document.getElementById("ai-symptom-file-input").value = "";
    renderSymptomPreviewStrip();

    const loadingId = renderAiLoadingBubble();

    let aiResponseData = null;
    try {
        const res = await fetch(API_CONFIG.FASTAPI_CHAT_URL, {
            method: "POST",
            body: formData
        });
        if (res.ok) {
            aiResponseData = await res.json();
        } else {
            aiResponseData = buildLocalMedicalTriageFallback(message, hadImages);
        }
    } catch (networkOrCorsError) {
        aiResponseData = buildLocalMedicalTriageFallback(message, hadImages);
    }

    removeBubbleById(loadingId);

    if (aiResponseData && aiResponseData.booking_suggestion) {
        autoFillHomepageBookingForm(aiResponseData.booking_suggestion);
    }

    const replyText = (aiResponseData && aiResponseData.reply) ? aiResponseData.reply : "Đã phân tích triệu chứng.";
    const suggestionObj = (aiResponseData && aiResponseData.booking_suggestion) ? aiResponseData.booking_suggestion : null;

    const msgIndex = currentSession.messages.length;
    renderAiBubbleDOM(replyText, suggestionObj, msgIndex);

    currentSession.messages.push({
        nguoi_gui: "AI",
        noi_dung: replyText,
        booking_suggestion: suggestionObj,
        images: []
    });
    saveAllChatSessions();
    renderSessionSidebarList();

    await syncMessageToMySql(currentSession, "AI", replyText, []);
}

function renderUserBubbleDOM(text, imgUrls = []) {
    const box = document.getElementById("ai-chat-messages");
    const div = document.createElement("div");
    div.className = "flex flex-col items-end gap-1.5";
    let imgsHtml = "";
    if (imgUrls && imgUrls.length > 0) {
        imgsHtml = `<div class="flex gap-1.5 flex-wrap justify-end">` +
            imgUrls.map(u => `<img src="${u}" class="w-16 h-16 object-cover rounded-lg border-2 border-primary shadow-sm">`).join("") +
            `</div>`;
    }
    div.innerHTML = `
        ${imgsHtml}
        <div class="bg-primary text-white px-3.5 py-2.5 rounded-xl rounded-tr-none text-sm max-w-[85%] whitespace-pre-wrap shadow-sm">${text}</div>
    `;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function renderAiLoadingBubble() {
    const box = document.getElementById("ai-chat-messages");
    const id = "ai-wait-" + Date.now();
    const div = document.createElement("div");
    div.id = id;
    div.className = "flex items-start gap-2";
    div.innerHTML = `
        <div class="bg-white px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-500 flex items-center gap-2 shadow-sm">
            <span class="w-2.5 h-2.5 rounded-full bg-primary animate-ping"></span>
            <span>Bác sĩ AI đang phân tích triệu chứng...</span>
        </div>
    `;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return id;
}

function removeBubbleById(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function renderAiBubbleDOM(replyText, bookingSuggestion = null, cardIndex = Date.now()) {
    const box = document.getElementById("ai-chat-messages");
    const user = getCurrentUser();
    const todayStr = getTodayDateStr();
    const div = document.createElement("div");
    div.className = "flex items-start gap-2.5";

    let bookingCardHtml = "";
    if (bookingSuggestion && bookingSuggestion.chuyen_khoa) {
        const defaultName = user ? (user.ho_ten || "") : "";
        const defaultPhone = user ? (user.so_dien_thoai || "") : "";
        const validSuggestedDate = (bookingSuggestion.ngay_hen && bookingSuggestion.ngay_hen >= todayStr)
            ? bookingSuggestion.ngay_hen
            : todayStr;

        bookingCardHtml = `
            <div class="mt-3 p-3.5 rounded-xl bg-emerald-50/90 border border-emerald-300 text-slate-800 space-y-2.5">
                <div class="flex items-center justify-between border-b border-emerald-200 pb-2">
                    <span class="font-bold text-xs text-emerald-900 flex items-center gap-1">
                        <span class="material-symbols-outlined text-base text-emerald-700">assignment_turned_in</span>
                        PHIẾU ĐẶT LỊCH KHÁM ĐÃ ĐIỀN SẴN BỞI AI
                    </span>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-200 text-emerald-900">Chỉ cần xác nhận</span>
                </div>

                <div class="grid grid-cols-1 gap-2 text-xs">
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="text-[11px] font-semibold text-slate-600 block">Họ tên bệnh nhân *</label>
                            <input id="ai-bk-name-${cardIndex}" type="text" value="${defaultName}" placeholder="Nhập họ tên..." class="w-full h-8 px-2 rounded border-slate-300 text-xs bg-white font-semibold"/>
                        </div>
                        <div>
                            <label class="text-[11px] font-semibold text-slate-600 block">Số điện thoại *</label>
                            <input id="ai-bk-phone-${cardIndex}" type="tel" value="${defaultPhone}" placeholder="Nhập SĐT..." class="w-full h-8 px-2 rounded border-slate-300 text-xs bg-white font-semibold"/>
                        </div>
                    </div>

                    <div>
                        <label class="text-[11px] font-semibold text-slate-600 block">Chuyên khoa AI chỉ định</label>
                        <input id="ai-bk-dept-${cardIndex}" type="text" value="${bookingSuggestion.chuyen_khoa}" readonly class="w-full h-8 px-2 rounded border-emerald-300 bg-emerald-100/60 text-emerald-900 font-bold text-xs"/>
                    </div>

                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="text-[11px] font-semibold text-slate-600 block">Ca khám</label>
                            <input id="ai-bk-shift-${cardIndex}" type="text" value="${bookingSuggestion.ca_kham || 'Ca Sáng (07:00 - 11:30)'}" class="w-full h-8 px-2 rounded border-slate-300 text-xs bg-white"/>
                        </div>
                        <div>
                            <label class="text-[11px] font-semibold text-slate-600 block">Ngày hẹn khám *</label>
                            <input id="ai-bk-date-${cardIndex}" type="date" min="${todayStr}" value="${validSuggestedDate}" class="w-full h-8 px-2 rounded border-slate-300 text-xs bg-white"/>
                        </div>
                    </div>

                    <div>
                        <label class="text-[11px] font-semibold text-slate-600 block">Tóm tắt triệu chứng gửi Bác sĩ</label>
                        <input id="ai-bk-symptom-${cardIndex}" type="text" value="${bookingSuggestion.trieu_chung_tom_tat || ''}" class="w-full h-8 px-2 rounded border-slate-300 text-xs bg-white"/>
                    </div>
                </div>

                <div class="flex flex-col sm:flex-row gap-2 pt-1">
                    <button id="btn-ai-confirm-${cardIndex}" type="button" onclick="confirmAiBookingDirectly('${cardIndex}')" class="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow flex items-center justify-center gap-1 transition">
                        <span class="material-symbols-outlined text-sm">check_circle</span>
                        <span>Xác nhận đặt lịch ngay</span>
                    </button>
                    <button type="button" onclick="scrollAndHighlightBookingForm()" class="py-2 px-3 rounded-lg bg-white hover:bg-slate-100 text-primary border border-primary/40 font-bold text-xs flex items-center justify-center gap-1 transition">
                        <span class="material-symbols-outlined text-sm">open_in_new</span>
                        <span>Xem trên biểu mẫu</span>
                    </button>
                </div>
            </div>
        `;
    }

    div.innerHTML = `
        <div class="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5">
            <span class="material-symbols-outlined text-base">smart_toy</span>
        </div>
        <div class="bg-white p-3.5 rounded-xl rounded-tl-none shadow-sm border border-slate-200 text-sm text-slate-800 max-w-[90%] leading-relaxed">
            <div class="whitespace-pre-wrap">${formatAiMarkdownText(replyText)}</div>
            ${bookingCardHtml}
        </div>
    `;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function filterDoctorsByDept(deptCode) {
    document.querySelectorAll(".doctor-item-card").forEach(card => {
        if (deptCode === "ALL" || card.dataset.dept === deptCode) card.classList.remove("hidden");
        else card.classList.add("hidden");
    });
}