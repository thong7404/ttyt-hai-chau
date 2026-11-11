// Cấu hình địa chỉ kết nối tới AuthApiController ở cổng 8000
const API_CONFIG = {
    LARAVEL_AUTH_URL: "http://127.0.0.1:8000/api"
};

let pendingRegisterPayload = null;
let otpCountdownTimer = null;

/**
 * Khởi chạy hiệu ứng hiển thị mượt (reveal-up) khi trang Đăng nhập / Đăng ký tải xong
 * và tự động điền sẵn Email nếu vừa đăng ký thành công chuyển sang
 */
document.addEventListener("DOMContentLoaded", () => {
    const animatedEls = document.querySelectorAll(".reveal-up, .reveal-left, .reveal-right, .reveal-zoom");
    animatedEls.forEach(el => el.classList.add("is-visible"));

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add("is-visible");
        });
    }, { threshold: 0.1 });
    animatedEls.forEach(el => observer.observe(el));

    // Tự động điền Email vừa đăng ký khi chuyển sang trang login.html
    const savedEmail = sessionStorage.getItem("last_registered_email");
    const loginEmailEl = document.getElementById("login-email");
    if (savedEmail && loginEmailEl) {
        loginEmailEl.value = savedEmail;
        sessionStorage.removeItem("last_registered_email");
    }
});

/**
 * Hàm hiển thị hộp thông báo trạng thái (Thành công màu xanh lá / Báo lỗi màu đỏ)
 */
function showAuthAlert(message, type = "error") {
    const box = document.getElementById("auth-alert-box");
    if (!box) return;

    box.classList.remove("hidden", "bg-red-50", "text-red-700", "border-red-300", "bg-emerald-50", "text-emerald-800", "border-emerald-300");
    if (type === "success") {
        box.classList.add("bg-emerald-50", "text-emerald-800", "border-emerald-300");
        box.innerHTML = `<span class="material-symbols-outlined text-emerald-600 text-xl">check_circle</span><span>${message}</span>`;
    } else {
        box.classList.add("bg-red-50", "text-red-700", "border-red-300");
        box.innerHTML = `<span class="material-symbols-outlined text-red-600 text-xl">error</span><span>${message}</span>`;
    }
}

/**
 * Hàm ẩn / hiện mật khẩu khi người dùng bấm vào biểu tượng con mắt
 */
function togglePassword(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!input) return;
    if (input.type === "password") {
        input.type = "text";
        if (icon) icon.textContent = "visibility_off";
    } else {
        input.type = "password";
        if (icon) icon.textContent = "visibility";
    }
}

/**
 * Hàm điền nhanh Email và Mật khẩu mẫu (123456) khi bấm vào các nút chọn nhanh tài khoản Demo
 */
function fillQuickDemo(emailOrVneid) {
    const emailEl = document.getElementById("login-email");
    const passEl = document.getElementById("login-password");
    if (emailEl && passEl) {
        emailEl.value = emailOrVneid;
        passEl.value = "123456";
    }
}

/**
 * 1. Hàm xử lý Đăng nhập hệ thống (Gọi POST /api/login tới AuthApiController):
 * Cho phép đăng nhập bằng Email, Số điện thoại hoặc Số định danh VNeID
 */
async function submitLoginForm(event) {
    event.preventDefault();
    const loginInput = document.getElementById("login-email").value.trim();
    const mat_khau = document.getElementById("login-password").value;
    const btn = document.getElementById("btn-login-submit");

    btn.disabled = true;
    btn.innerHTML = `<span>Đang kiểm tra tài khoản...</span>`;

    try {
        const res = await fetch(`${API_CONFIG.LARAVEL_AUTH_URL}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
                email: loginInput,
                vneid: loginInput,
                so_dien_thoai: loginInput,
                mat_khau: mat_khau
            })
        });
        const data = await res.json();

        if (!res.ok || data.status === "error") {
            showAuthAlert(data.message || "Thông tin đăng nhập hoặc mật khẩu không chính xác!", "error");
            return;
        }

        // Lưu thông tin phiên đăng nhập vào localStorage (được api-config.js cô lập theo từng Tab)
        localStorage.setItem("current_user", JSON.stringify(data.user));
        localStorage.setItem("demo_role", data.user.vai_tro);

        const redirectMap = {
            QuanTri: "admin.html",
            BenhNhan: "index.html"
        };
        window.location.href = redirectMap[data.user.vai_tro] || "index.html";
    } catch (error) {
        showAuthAlert("Không kết nối được tới Server Laravel (Cổng 8000). Hãy kiểm tra lệnh php artisan serve!", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<span>ĐĂNG NHẬP VÀO HỆ THỐNG</span><span class="material-symbols-outlined text-lg">arrow_forward</span>`;
    }
}

/**
 * 2. Hàm xử lý Đăng ký Bước 1 (Gọi POST /api/send-otp tới AuthApiController):
 * Chỉ gửi mã OTP 6 số về Gmail + lưu bảng MA_XAC_THUC_OTP (Chưa tạo tài khoản trong NGUOI_DUNG)
 */
async function submitRegisterStep1(event) {
    event.preventDefault();

    const matKhau = document.getElementById("reg-password").value;
    const xacNhanMk = document.getElementById("reg-password-confirm").value;

    if (matKhau !== xacNhanMk) {
        showAuthAlert("Mật khẩu nhập lại không khớp! Vui lòng kiểm tra lại.", "error");
        return;
    }

    const diaChiNhap = document.getElementById("reg-address")?.value.trim() || "";
    const vneidInput = (document.getElementById("reg-cccd")?.value || document.getElementById("reg-vneid")?.value || "").trim();
    const bhytInput = document.getElementById("reg-bhyt")?.value.trim() || "";

    pendingRegisterPayload = {
        vneid: vneidInput || null,
        ho_ten: document.getElementById("reg-fullname").value.trim().toUpperCase(),
        gioi_tinh: document.getElementById("reg-gender").value,
        email: document.getElementById("reg-email").value.trim().toLowerCase(),
        so_dien_thoai: document.getElementById("reg-phone").value.trim(),
        ngay_sinh: document.getElementById("reg-dob").value,
        dia_chi: diaChiNhap,
        so_the_bhyt: bhytInput || null,
        mat_khau: matKhau
    };

    const btn = document.getElementById("btn-register-send-otp");
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-lg">progress_activity</span><span>Đang gửi mã OTP về Gmail...</span>`;

    try {
        const res = await fetch(`${API_CONFIG.LARAVEL_AUTH_URL}/send-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify(pendingRegisterPayload)
        });
        const data = await res.json();

        if (!res.ok || data.status === "error") {
            showAuthAlert(data.message || "Không thể gửi mã OTP về Gmail!", "error");
            return;
        }

        const otpCodeFromServer = data.demo_otp || data.otp_demo || "";
        const otpHint = otpCodeFromServer ? ` (Mã OTP trong MySQL: ${otpCodeFromServer})` : "";
        showAuthAlert(`Đã gửi mã xác thực 6 số về Gmail (${pendingRegisterPayload.email})${otpHint}!`, "success");

        const otpSection = document.getElementById("otp-6boxes-section");
        if (otpSection) {
            otpSection.classList.remove("hidden");
            otpSection.scrollIntoView({ behavior: "smooth", block: "center" });
        }

        const sentEmailEl = document.getElementById("otp-sent-email");
        if (sentEmailEl) sentEmailEl.textContent = pendingRegisterPayload.email;

        const wrongWarnEl = document.getElementById("otp-wrong-warning");
        if (wrongWarnEl) wrongWarnEl.classList.add("hidden");

        const boxes = document.querySelectorAll(".otp-digit-box");
        boxes.forEach(box => {
            box.value = "";
            box.classList.remove("border-red-600", "bg-red-50");
        });
        if (boxes[0]) boxes[0].focus();

        startOtpTimer(300);
    } catch (error) {
        showAuthAlert("Không kết nối được tới Server Laravel (Cổng 8000)!", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-symbols-outlined text-lg">forward_to_inbox</span><span>GỬI LẠI MÃ XÁC THỰC VỀ GMAIL</span>`;
    }
}

/**
 * Hàm tự động nhảy con trỏ sang ô OTP tiếp theo khi người dùng gõ 1 chữ số
 */
function handleOtpDigitInput(input, index) {
    input.value = input.value.replace(/[^0-9]/g, "");

    if (input.value !== "") {
        const wrongWarnEl = document.getElementById("otp-wrong-warning");
        if (wrongWarnEl) wrongWarnEl.classList.add("hidden");

        const boxes = document.querySelectorAll(".otp-digit-box");
        boxes.forEach(b => b.classList.remove("border-red-600", "bg-red-50"));

        if (index < boxes.length - 1) {
            boxes[index + 1].focus();
        }
    }
}

/**
 * Hàm lùi con trỏ về ô OTP phía trước khi người dùng nhấn phím Backspace
 */
function handleOtpDigitKeydown(event, index) {
    const boxes = document.querySelectorAll(".otp-digit-box");
    if (event.key === "Backspace" && !boxes[index].value && index > 0) {
        boxes[index - 1].focus();
    }
}

/**
 * Hàm hỗ trợ dán (Paste) nhanh cả chuỗi 6 chữ số OTP vào 6 ô cùng lúc
 */
function handleOtpDigitPaste(event) {
    event.preventDefault();
    const pasted = (event.clipboardData || window.clipboardData).getData("text").replace(/[^0-9]/g, "").slice(0, 6);
    const boxes = document.querySelectorAll(".otp-digit-box");
    for (let i = 0; i < pasted.length; i++) {
        boxes[i].value = pasted[i];
    }
    if (pasted.length > 0) {
        boxes[Math.min(pasted.length, 5)].focus();
    }
}

/**
 * Hàm đếm ngược thời gian hiệu lực 05:00 của mã xác thực OTP
 */
function startOtpTimer(seconds) {
    clearInterval(otpCountdownTimer);
    let remaining = seconds;
    const timerEl = document.getElementById("otp-countdown");

    otpCountdownTimer = setInterval(() => {
        const m = String(Math.floor(remaining / 60)).padStart(2, "0");
        const s = String(remaining % 60).padStart(2, "0");
        if (timerEl) timerEl.textContent = `${m}:${s}`;
        if (remaining <= 0) {
            clearInterval(otpCountdownTimer);
            if (timerEl) timerEl.textContent = "Hết hạn";
        }
        remaining--;
    }, 1000);
}

/**
 * 3. Hàm xử lý Xác nhận 6 số OTP ở Bước 2:
 * Khi mã OTP chính xác mới chính thức tạo tài khoản vào NGUOI_DUNG & BENH_NHAN
 */
async function submitVerifyOtpStep2(event) {
    if (event) event.preventDefault();
    const boxes = document.querySelectorAll(".otp-digit-box");
    const otpCode = Array.from(boxes).map(b => b.value.trim()).join("");
    const warningEl = document.getElementById("otp-wrong-warning");
    const warningText = document.getElementById("otp-wrong-text");
    const boxesWrapper = document.getElementById("otp-boxes-container");

    if (otpCode.length < 6) {
        if (warningText) warningText.textContent = "Vui lòng nhập đủ 6 chữ số xác thực từ Gmail!";
        if (warningEl) warningEl.classList.remove("hidden");
        return;
    }

    const currentFormPayload = pendingRegisterPayload || {
        vneid: (document.getElementById("reg-cccd")?.value || document.getElementById("reg-vneid")?.value || "").trim() || null,
        ho_ten: document.getElementById("reg-fullname")?.value.trim().toUpperCase() || "",
        gioi_tinh: document.getElementById("reg-gender")?.value || "Nam",
        email: document.getElementById("reg-email")?.value.trim().toLowerCase() || "",
        so_dien_thoai: document.getElementById("reg-phone")?.value.trim() || "",
        ngay_sinh: document.getElementById("reg-dob")?.value || "2000-01-01",
        dia_chi: document.getElementById("reg-address")?.value.trim() || "",
        so_the_bhyt: document.getElementById("reg-bhyt")?.value.trim() || null,
        mat_khau: document.getElementById("reg-password")?.value || "123456"
    };

    const btn = document.getElementById("btn-verify-otp-submit");
    btn.disabled = true;
    btn.textContent = "Đang kiểm tra mã OTP...";

    try {
        const res = await fetch(`${API_CONFIG.LARAVEL_AUTH_URL}/verify-register`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
                ...currentFormPayload,
                ma_xac_thuc: otpCode,
                ma_otp: otpCode
            })
        });
        const data = await res.json();

        if (!res.ok || data.status !== "success") {
            if (warningText) warningText.textContent = data.message || "Mã xác thực OTP không chính xác! Vui lòng kiểm tra lại.";
            if (warningEl) warningEl.classList.remove("hidden");
            if (boxesWrapper) {
                boxesWrapper.classList.remove("shake-error");
                void boxesWrapper.offsetWidth;
                boxesWrapper.classList.add("shake-error");
            }
            boxes.forEach(b => {
                b.value = "";
                b.classList.add("border-red-600", "bg-red-50");
            });
            if (boxes[0]) boxes[0].focus();
            return;
        }

        clearInterval(otpCountdownTimer);

        // Hiện bảng thông báo Đã đăng ký thành công kèm nút chuyển sang trang Đăng nhập
        showRegisterSuccessModal(data.user);
    } catch (error) {
        if (warningText) warningText.textContent = "Lỗi kết nối Server khi xác thực mã OTP!";
        if (warningEl) warningEl.classList.remove("hidden");
    } finally {
        btn.disabled = false;
        btn.textContent = "XÁC NHẬN MÃ OTP & HOÀN TẤT ĐĂNG KÝ";
    }
}

/**
 * Hàm hiển thị Bảng thông báo Đã đăng ký tài khoản thành công
 * và nút chuyển sang trang Đăng nhập (login.html)
 */
function showRegisterSuccessModal(user) {
    // Đảm bảo không tự động đăng nhập sẵn trước khi người dùng bấm sang trang Đăng nhập
    localStorage.removeItem("current_user");
    localStorage.removeItem("demo_role");

    // Lưu tạm email vừa đăng ký để tự động điền sẵn ô Email bên trang login.html
    if (user && user.email) {
        sessionStorage.setItem("last_registered_email", user.email);
    }

    const maBenhNhan = (user && user.ma_benh_nhan) ? `#${user.ma_benh_nhan}` : "#BN008";
    const hoTen = (user && user.ho_ten) ? user.ho_ten : "Bệnh nhân";
    const email = (user && user.email) ? user.email : "";

    let modal = document.getElementById("register-success-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "register-success-modal";
        modal.className = "fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4";
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-teal-200 animate-[fadeIn_0.2s_ease-out]">
            <div class="bg-gradient-to-r from-teal-600 to-emerald-600 text-white px-6 py-6 text-center">
                <div class="w-16 h-16 rounded-full bg-white text-emerald-600 flex items-center justify-center mx-auto mb-3 shadow-md">
                    <span class="material-symbols-outlined text-4xl">verified</span>
                </div>
                <h3 class="font-heading font-extrabold text-xl">Đã Đăng Ký Thành Công!</h3>
                <p class="text-xs text-teal-100 mt-1">Tài khoản của bạn đã được xác thực OTP và kích hoạt</p>
            </div>

            <div class="p-6 space-y-4 text-sm">
                <div class="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200 space-y-2 text-xs sm:text-sm">
                    <div class="flex items-center justify-between">
                        <span class="text-slate-500 font-medium">Mã Bệnh nhân (MySQL):</span>
                        <span class="px-2.5 py-0.5 rounded-md bg-emerald-600 text-white font-bold">${maBenhNhan}</span>
                    </div>
                    <div class="flex items-center justify-between">
                        <span class="text-slate-500 font-medium">Họ và tên:</span>
                        <span class="font-bold text-slate-800">${hoTen}</span>
                    </div>
                    ${email ? `
                    <div class="flex items-center justify-between">
                        <span class="text-slate-500 font-medium">Email đăng nhập:</span>
                        <span class="font-semibold text-teal-700">${email}</span>
                    </div>
                    ` : ""}
                </div>

                <p class="text-xs text-center text-slate-500 leading-relaxed">
                    Vui lòng nhấn nút <b>Đăng nhập</b> bên dưới để chuyển sang trang đăng nhập vào hệ thống.
                </p>

                <button type="button" onclick="window.location.href='login.html'"
                        class="w-full py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-sm shadow-md flex items-center justify-center gap-2 transition">
                    <span class="material-symbols-outlined text-lg">login</span>
                    <span>ĐĂNG NHẬP NGAY</span>
                </button>
            </div>
        </div>
    `;

    modal.classList.remove("hidden");
    modal.classList.add("flex");
}