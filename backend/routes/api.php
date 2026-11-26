<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\TableApiController;
use App\Http\Controllers\Api\AuthApiController;
use App\Http\Controllers\Api\AdminApiController;
use App\Http\Controllers\Api\StaffApiController;
use App\Http\Controllers\Api\DoctorApiController;
use App\Http\Controllers\Api\AccountantApiController;
use App\Http\Controllers\Api\PharmacistApiController;
use App\Http\Controllers\Api\NotificationApiController;

// 1. Nhóm Route Xác thực (Đăng nhập, Đăng ký OTP, Hồ sơ bệnh nhân, Đặt lịch & Lịch sử AI)
Route::controller(AuthApiController::class)->group(function () {
    Route::post('/send-otp', 'sendRegisterOtp');
    Route::post('/verify-register', 'verifyOtpAndRegister');
    Route::post('/login', 'login');

    Route::get('/profile/{maNguoiDung}', 'getProfile');
    Route::post('/update-profile', 'updateProfile');
    Route::post('/change-password', 'changePassword');

    Route::post('/book-appointment', 'bookAppointment');
    Route::post('/cancel-appointment', 'cancelAppointment');
    Route::get('/patient-portal-data/{maNguoiDung}', 'getPatientPortalData');

    Route::get('/ai-sessions/{maNguoiDung}', 'getAiChatSessions');
    Route::post('/ai-sessions/save-message', 'saveAiChatMessage');
    Route::post('/ai-sessions/delete', 'deleteAiChatSession');
});

// 2. Nhóm Route Trang Quản Trị Viên (Admin)
$adminRoutes = function () {
    Route::get('/overview-data', 'getOverviewData');
    Route::post('/save-user', 'saveUser');
    Route::post('/toggle-user-status', 'toggleUserStatus');
    Route::delete('/delete-user/{id}', 'deleteUser');

    Route::post('/save-department', 'saveDepartment');
    Route::delete('/delete-department/{id}', 'deleteDepartment');

    Route::post('/save-room', 'saveRoom');
    Route::delete('/delete-room/{id}', 'deleteRoom');

    Route::post('/save-medicine', 'saveMedicine');
    Route::delete('/delete-medicine/{id}', 'deleteMedicine');

    Route::post('/save-cls-service', 'saveClsService');
    Route::delete('/delete-cls-service/{id}', 'deleteClsService');

    // Phân công lịch làm việc 3 ca (Bảng Ma Trận Admin)
    Route::post('/toggle-single-shift', 'toggleSingleShift');
    Route::post('/bulk-assign-week', 'bulkAssignWeek');
    Route::post('/auto-generate-week', 'autoGenerateWeek');
    Route::post('/copy-previous-week', 'copyPreviousWeek');
    Route::post('/save-schedule', 'saveSchedule');
    Route::delete('/delete-schedule/{id}', 'deleteSchedule');
};

// 3. Nhóm Route Cổng Nghiệp Vụ Nhân Viên Y Tế (Staff)
$staffRoutes = function () {
    Route::get('/dashboard-data', 'getDashboardData');
    Route::post('/receive-patient', 'receivePatient');
    Route::post('/save-vitals', 'saveVitalSigns');
    Route::post('/upload-cls-result', 'uploadClsResult');
};

// 4. Nhóm Route Phân hệ Bác Sĩ (Doctor)
$doctorRoutes = function () {
    Route::get('/dashboard-data', 'getDashboardData');
    Route::post('/order-cls', 'orderClsServices');
    Route::post('/complete-exam', 'completeExamination');
    Route::get('/patient-history/{maBenhNhan}', 'getPatientHistory');
};

// 5. Nhóm Route Phân hệ Kế Toán - Thu Ngân Viện Phí (Accountant)
$accountantRoutes = function () {
    Route::get('/dashboard-data', 'getDashboardData');
    Route::post('/collect-cls', 'collectClsPayment');
    Route::post('/collect-invoice', 'collectInvoicePayment');
};

// 6. Nhóm Route Phân hệ Dược Sĩ - Cấp Phát Thuốc BHYT (Pharmacist)
$pharmacistRoutes = function () {
    Route::get('/dashboard-data', 'getDashboardData');
    Route::post('/dispense', 'dispensePrescription');
    Route::post('/save-medicine', 'saveMedicineStock');
};

// 7. Nhóm Route Hệ Thống Thông Báo & Gửi Gmail (Nhắc lịch hẹn trước 1 ngày / Ưu đãi)
Route::prefix('notifications')->controller(NotificationApiController::class)->group(function () {
    Route::get('/user/{maNguoiDung}', 'getUserNotifications');
    Route::post('/scan-reminders', 'scanAndSendAppointmentReminders');
    Route::post('/send', 'sendCustomOrPromoNotification');
});

// 8. Nhóm Route Xem Lịch Làm Việc Cá Nhân cho Nhân sự (NVYT, Bác sĩ, Kế toán, Dược sĩ)
Route::get('/schedules/staff/{id}', [AdminApiController::class, 'getStaffSchedules']);
Route::get('/v1/schedules/staff/{id}', [AdminApiController::class, 'getStaffSchedules']);

Route::prefix('pharmacist')->controller(PharmacistApiController::class)->group($pharmacistRoutes);
Route::prefix('v1/pharmacist')->controller(PharmacistApiController::class)->group($pharmacistRoutes);

Route::prefix('accountant')->controller(AccountantApiController::class)->group($accountantRoutes);
Route::prefix('v1/accountant')->controller(AccountantApiController::class)->group($accountantRoutes);

Route::prefix('doctor')->controller(DoctorApiController::class)->group($doctorRoutes);
Route::prefix('v1/doctor')->controller(DoctorApiController::class)->group($doctorRoutes);

Route::prefix('staff')->controller(StaffApiController::class)->group($staffRoutes);
Route::prefix('v1/staff')->controller(StaffApiController::class)->group($staffRoutes);

Route::prefix('admin')->controller(AdminApiController::class)->group($adminRoutes);
Route::prefix('v1/admin')->controller(AdminApiController::class)->group($adminRoutes);

// Thống kê số lượng bản ghi của các bảng và tải file/ảnh từ máy tính
Route::get('/tables-summary', [TableApiController::class, 'summary']);
Route::post('/tables-manager-upload', [TableApiController::class, 'uploadFile']);

Route::get('/schedules/weekly-board', [AdminApiController::class, 'getWeeklyScheduleBoard']);
Route::get('/v1/schedules/weekly-board', [AdminApiController::class, 'getWeeklyScheduleBoard']);

// Nhóm Route Thêm - Xem - Sửa - Xóa dữ liệu cho các bảng CSDL
Route::prefix('tables-manager')->controller(TableApiController::class)->group(function () {
    Route::get('/{table}', 'show');
    Route::post('/{table}', 'store');
    Route::put('/{table}/{pkCol}/{id}', 'update');
    Route::delete('/{table}/{pkCol}/{id}', 'destroy');
});