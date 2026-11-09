// Cấu hình địa chỉ kết nối tới AuthApiController ở cổng 8000
const API_CONFIG = {
    LARAVEL_AUTH_URL: "http://127.0.0.1:8000/api"
};

let pendingRegisterPayload = null;
let otpCountdownTimer = null;

/**
 * Khởi chạy hiệu ứng hiển thị mượt (reveal-up) khi trang Đăng nhập / Đăng ký tải xong
 */
document.addEventListener("DOMContentLoaded", () => {
    const animatedEls = document.querySelectorAll(".reveal-up, .reveal-left, .reveal-right, .reveal-zoom");
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add("is-visible");
        });
    }, { threshold: 0.1 });
    animatedEls.forEach(el => observer.observe(el));
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
        icon.textContent = "visibility_off";
    } else {
        input.type = "password";
        icon.textContent = "visibility";
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

        if (!res.ok) {
            showAuthAlert(data.message || "Thông tin đăng nhập hoặc mật khẩu không chính xác!", "error");
            return;
        }

        // Lưu thông tin phiên đăng nhập vào localStorage để hiển thị trên Header trang chủ
        localStorage.setItem("current_user", JSON.stringify(data.user));
        localStorage.setItem("demo_role", data.user.vai_tro);

        window.location.href = "index.html";
    } catch (error) {
        showAuthAlert("Không kết nối được tới Server Laravel (Cổng 8000). Hãy kiểm tra lệnh php artisan serve!", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<span>ĐĂNG NHẬP VÀO HỆ THỐNG</span><span class="material-symbols-outlined text-lg">arrow_forward</span>`;
    }
}

/**
 * 2. Hàm xử lý Đăng ký Bước 1 (Gọi POST /api/send-otp tới AuthApiController):
 * Tạo bản ghi người dùng trạng thái ChoXacThuc và gửi mã OTP 6 số vào bảng MA_XAC_THUC_OTP + Gmail
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
    const vneidInput = document.getElementById("reg-cccd")?.value.trim() || "";
    const bhytInput = document.getElementById("reg-bhyt")?.value.trim() || "";

    pendingRegisterPayload = {
        vneid: vneidInput || null,
        ho_ten: document.getElementById("reg-fullname").value.trim().toUpperCase(),
        gioi_tinh: document.getElementById("reg-gender").value,
        email: document.getElementById("reg-email").value.trim(),
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

        if (!res.ok) {
            showAuthAlert(data.message || "Không thể gửi mã OTP về Gmail!", "error");
            return;
        }

        // Hiển thị thông báo kèm mã OTP thực tế trong trường hợp máy local chưa cấu hình SMTP Gmail
        const otpHint = data.demo_otp ? ` (Mã OTP trong MySQL: ${data.demo_otp})` : "";
        showAuthAlert(`Đã gửi mã xác thực 6 số về Gmail (${pendingRegisterPayload.email})${otpHint}!`, "success");

        const otpSection = document.getElementById("otp-6boxes-section");
        otpSection.classList.remove("hidden");
        document.getElementById("otp-sent-email").textContent = pendingRegisterPayload.email;
        document.getElementById("otp-wrong-warning").classList.add("hidden");

        const boxes = document.querySelectorAll(".otp-digit-box");
        boxes.forEach(box => {
            box.value = "";
            box.classList.remove("border-red-600", "bg-red-50");
        });
        boxes[0].focus();
        otpSection.scrollIntoView({ behavior: "smooth", block: "center" });

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
 * (Chỉ ẩn cảnh báo lỗi khi người dùng thực sự gõ chữ số mới vào ô)
 */
function handleOtpDigitInput(input, index) {
    input.value = input.value.replace(/[^0-9]/g, "");

    if (input.value !== "") {
        document.getElementById("otp-wrong-warning").classList.add("hidden");
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
 * 3. Hàm xử lý Xác nhận 6 số OTP ở Bước 2
 */
async function submitVerifyOtpStep2(event) {
    if (event) event.preventDefault();
    const boxes = document.querySelectorAll(".otp-digit-box");
    const otpCode = Array.from(boxes).map(b => b.value).join("");
    const warningEl = document.getElementById("otp-wrong-warning");
    const warningText = document.getElementById("otp-wrong-text");
    const boxesWrapper = document.getElementById("otp-boxes-container");

    if (otpCode.length < 6) {
        warningText.textContent = "Vui lòng nhập đủ 6 chữ số xác thực từ Gmail!";
        warningEl.classList.remove("hidden");
        return;
    }

    const emailToVerify = pendingRegisterPayload
        ? pendingRegisterPayload.email
        : document.getElementById("reg-email").value.trim();

    const btn = document.getElementById("btn-verify-otp-submit");
    btn.disabled = true;
    btn.textContent = "Đang kiểm tra mã OTP...";

    try {
        const res = await fetch(`${API_CONFIG.LARAVEL_AUTH_URL}/verify-register`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
                email: emailToVerify,
                ma_xac_thuc: otpCode
            })
        });
        const data = await res.json();

        // Kiểm tra cả !res.ok lẫn data.status !== "success"
        if (!res.ok || data.status !== "success") {
            warningText.textContent = data.message || "Mã xác thực OTP không chính xác! Vui lòng kiểm tra lại.";
            warningEl.classList.remove("hidden");
            boxesWrapper.classList.remove("shake-error");
            void boxesWrapper.offsetWidth;
            boxesWrapper.classList.add("shake-error");
            boxes.forEach(b => {
                b.value = "";
                b.classList.add("border-red-600", "bg-red-50");
            });
            boxes[0].focus();
            return;
        }

        const maBn = data.user?.ma_benh_nhan ? `#${data.user.ma_benh_nhan}` : "";
        alert(`🎉 ${data.message}\nMã Bệnh nhân của bạn trong MySQL là: ${maBn}\nBây giờ bạn sẽ được chuyển sang trang Đăng nhập!`);
        window.location.href = "login.html";
    } catch (error) {
        warningText.textContent = "Lỗi kết nối Server khi xác thực mã OTP!";
        warningEl.classList.remove("hidden");
    } finally {
        btn.disabled = false;
        btn.textContent = "XÁC NHẬN MÃ OTP & HOÀN TẤT ĐĂNG KÝ";
    }
}