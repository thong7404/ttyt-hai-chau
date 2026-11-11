<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\TableApiController;
use App\Http\Controllers\Api\AuthApiController;
use App\Http\Controllers\Api\AdminApiController;

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

};

Route::prefix('admin')->controller(AdminApiController::class)->group($adminRoutes);
Route::prefix('v1/admin')->controller(AdminApiController::class)->group($adminRoutes);

// Thống kê số lượng bản ghi của 22 bảng và tải file/ảnh từ máy tính
Route::get('/tables-summary', [TableApiController::class, 'summary']);
Route::post('/tables-manager-upload', [TableApiController::class, 'uploadFile']);

// Nhóm Route Thêm - Xem - Sửa - Xóa dữ liệu cho 22 bảng CSDL
Route::prefix('tables-manager')->controller(TableApiController::class)->group(function () {
    Route::get('/{table}', 'show');
    Route::post('/{table}', 'store');
    Route::put('/{table}/{pkCol}/{id}', 'update');
    Route::delete('/{table}/{pkCol}/{id}', 'destroy');
});