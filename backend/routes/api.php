<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\TableManagerApiController;

// Nhóm Route Quản lý & Nhập dữ liệu cho 22 bảng CSDL
Route::get('/tables-summary', [TableManagerApiController::class, 'summary']);

Route::prefix('tables-manager')->controller(TableManagerApiController::class)->group(function () {
    Route::get('/{table}', 'show');
    Route::post('/{table}', 'store');
    Route::put('/{table}/{pkCol}/{id}', 'update');
    Route::delete('/{table}/{pkCol}/{id}', 'destroy');
});