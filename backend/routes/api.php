<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\TableApiController;

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