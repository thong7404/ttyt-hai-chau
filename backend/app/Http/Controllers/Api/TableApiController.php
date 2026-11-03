<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TableApiController extends Controller
{
    /**
     * Danh sách 22 bảng chuẩn của Database ttyt_haichau_db
     */
    private array $allowedTables = [
        'KHOA', 'PHONG', 'NGUOI_DUNG', 'MA_XAC_THUC_OTP', 'NHAN_VIEN', 'BENH_NHAN',
        'LICH_LAM_VIEC', 'LICH_HEN_KHAM', 'HO_SO_KHAM_BENH', 'CHI_SO_SINH_HIEU',
        'DANH_MUC_CAN_LAM_SANG', 'CHI_DINH_CAN_LAM_SANG', 'ANH_KET_QUA_CLS',
        'DANH_MUC_THUOC', 'DON_THUOC', 'CHI_TIET_DON_THUOC', 'HOA_DON_VIEN_PHI',
        'CHI_TIET_HOA_DON', 'PHIEN_TRO_CHUYEN_AI', 'LICH_SU_TIN_NHAN_AI',
        'ANH_TIN_NHAN_AI', 'TAI_LIEU_HUAN_LUYEN_AI'
    ];

    /**
     * 1. Lấy thống kê số lượng bản ghi của toàn bộ 22 bảng
     */
    public function summary()
    {
        $summary = [];
        foreach ($this->allowedTables as $table) {
            try {
                $count = DB::table($table)->count();
                $summary[] = [
                    'table' => $table,
                    'count' => $count,
                    'valid' => $count >= 5
                ];
            } catch (\Exception $e) {
                $summary[] = [
                    'table' => $table,
                    'count' => 0,
                    'valid' => false,
                    'error' => $e->getMessage()
                ];
            }
        }

        return response()->json($summary);
    }

    /**
     * 2. Lấy danh sách cột và dữ liệu của 1 bảng cụ thể
     */
    public function show(string $table)
    {
        $tableUpper = strtoupper($table);
        if (!in_array($tableUpper, $this->allowedTables)) {
            return response()->json(['status' => 'error', 'message' => 'Bảng không hợp lệ!'], 400);
        }

        $columns = DB::select("SHOW COLUMNS FROM {$tableUpper}");
        $rows = DB::table($tableUpper)->limit(100)->get();

        return response()->json([
            'status'  => 'success',
            'table'   => $tableUpper,
            'count'   => count($rows),
            'columns' => $columns,
            'rows'    => $rows
        ]);
    }

    /**
     * 3. Thêm mới 1 bản ghi từ Form vào bảng
     */
    public function store(Request $request, string $table)
    {
        $tableUpper = strtoupper($table);
        if (!in_array($tableUpper, $this->allowedTables)) {
            return response()->json(['status' => 'error', 'message' => 'Bảng không hợp lệ!'], 400);
        }

        $data = $request->except(['_token']);
        $filtered = array_filter($data, fn($v) => $v !== null && $v !== '');

        if ($tableUpper === 'NGUOI_DUNG' && !empty($filtered['mat_khau']) && !str_starts_with($filtered['mat_khau'], '$2y$')) {
            $filtered['mat_khau'] = bcrypt($filtered['mat_khau']);
        }

        try {
            DB::table($tableUpper)->insert($filtered);
            return response()->json([
                'status'  => 'success',
                'message' => "Đã thêm bản ghi mới vào bảng {$tableUpper} thành công!"
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Lỗi thêm dữ liệu: ' . $e->getMessage()
            ], 422);
        }
    }

    /**
     * 4. Cập nhật 1 bản ghi trong bảng
     */
    public function update(Request $request, string $table, string $pkCol, string $id)
    {
        $tableUpper = strtoupper($table);
        if (!in_array($tableUpper, $this->allowedTables)) {
            return response()->json(['status' => 'error', 'message' => 'Bảng không hợp lệ!'], 400);
        }

        $data = $request->except(['_token', $pkCol]);
        $filtered = array_filter($data, fn($v) => $v !== null && $v !== '');

        if ($tableUpper === 'NGUOI_DUNG' && !empty($filtered['mat_khau']) && !str_starts_with($filtered['mat_khau'], '$2y$')) {
            $filtered['mat_khau'] = bcrypt($filtered['mat_khau']);
        }

        try {
            DB::table($tableUpper)->where($pkCol, $id)->update($filtered);
            return response()->json([
                'status'  => 'success',
                'message' => "Đã cập nhật bản ghi #{$id} trong bảng {$tableUpper}!"
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Lỗi cập nhật dữ liệu: ' . $e->getMessage()
            ], 422);
        }
    }

    /**
     * 5. Xóa 1 bản ghi khỏi bảng
     */
    public function destroy(string $table, string $pkCol, string $id)
    {
        $tableUpper = strtoupper($table);
        if (!in_array($tableUpper, $this->allowedTables)) {
            return response()->json(['status' => 'error', 'message' => 'Bảng không hợp lệ!'], 400);
        }

        try {
            DB::table($tableUpper)->where($pkCol, $id)->delete();
            return response()->json([
                'status'  => 'success',
                'message' => "Đã xóa bản ghi #{$id} khỏi bảng {$tableUpper}!"
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Không thể xóa bản ghi đang có khóa ngoại tham chiếu: ' . $e->getMessage()
            ], 422);
        }
    }

    /**
     * 6. Nhận tệp hình ảnh / tài liệu chọn từ máy tính và lưu vào public/uploads
     */
    public function uploadFile(Request $request)
    {
        if (!$request->hasFile('file')) {
            return response()->json(['status' => 'error', 'message' => 'Chưa chọn tệp!'], 400);
        }

        $file = $request->file('file');
        $fileName = time() . '_' . preg_replace('/\s+/', '_', $file->getClientOriginalName());
        $file->move(public_path('uploads'), $fileName);

        return response()->json([
            'status' => 'success',
            'url'    => url('uploads/' . $fileName)
        ]);
    }
}