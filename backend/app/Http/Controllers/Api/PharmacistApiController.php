<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Carbon\Carbon;

class PharmacistApiController extends Controller
{
    /**
     * Lọc chỉ giữ các cột thực tế tồn tại trong bảng MySQL
     */
    private function filterValidColumns(string $table, array $data): array
    {
        try {
            $columns = Schema::getColumnListing($table);
            if (empty($columns)) return $data;
            $colMap = array_flip(array_map('strtolower', $columns));
            $filtered = [];
            foreach ($data as $key => $val) {
                if (isset($colMap[strtolower($key)])) {
                    $filtered[$key] = $val;
                }
            }
            return $filtered;
        } catch (\Throwable $e) {
            return $data;
        }
    }

    /**
     * Tự động sinh mã khóa chính Chữ + Số tiếp theo (TH026, DT006...)
     */
    private function generateNextCode(string $table, string $pkCol, string $prefix, int $padLength = 3): string
    {
        $rows = DB::table($table)->pluck($pkCol);
        $maxNum = 0;
        foreach ($rows as $code) {
            if (preg_match('/(\d+)$/', (string) $code, $matches)) {
                $num = (int) $matches[1];
                if ($num > $maxNum) {
                    $maxNum = $num;
                }
            }
        }
        return $prefix . str_pad((string) ($maxNum + 1), $padLength, '0', STR_PAD_LEFT);
    }

    /**
     * Tìm mã nhân viên Dược sĩ (VD: NV26112005) từ ma_nhan_vien hoặc ma_nguoi_dung
     */
    private function resolveMaNhanVien($idOrUserId, $default = 'NV26112005')
    {
        if (!$idOrUserId) {
            return DB::table('NHAN_VIEN')->where('chuc_vu', 'DuocSi')->value('ma_nhan_vien')
                ?: (DB::table('NHAN_VIEN')->value('ma_nhan_vien') ?: $default);
        }
        $val = trim((string) $idOrUserId);
        $byNv = DB::table('NHAN_VIEN')->where('ma_nhan_vien', $val)->value('ma_nhan_vien');
        if ($byNv) return $byNv;

        $byNd = DB::table('NHAN_VIEN')->where('ma_nguoi_dung', $val)->value('ma_nhan_vien');
        if ($byNd) return $byNd;

        return DB::table('NHAN_VIEN')->where('chuc_vu', 'DuocSi')->value('ma_nhan_vien')
            ?: (DB::table('NHAN_VIEN')->value('ma_nhan_vien') ?: $default);
    }

    /**
     * 1. TẢI DỮ LIỆU QUẦY DƯỢC P105 & KHO THUỐC BHYT
     */
    public function getDashboardData()
    {
        try {
            $prescriptions = DB::table('DON_THUOC as dt')
                ->join('HO_SO_KHAM_BENH as hs', 'dt.ma_ho_so_kham', '=', 'hs.ma_ho_so_kham')
                ->join('BENH_NHAN as bn', 'hs.ma_benh_nhan', '=', 'bn.ma_benh_nhan')
                ->leftJoin('NGUOI_DUNG as nd_bn', 'bn.ma_nguoi_dung', '=', 'nd_bn.ma_nguoi_dung')
                ->leftJoin('NHAN_VIEN as nv_bs', 'hs.ma_nhan_vien', '=', 'nv_bs.ma_nhan_vien')
                ->leftJoin('NGUOI_DUNG as nd_bs', 'nv_bs.ma_nguoi_dung', '=', 'nd_bs.ma_nguoi_dung')
                ->leftJoin('KHOA as k', 'nv_bs.ma_khoa', '=', 'k.ma_khoa')
                ->leftJoin('PHONG as p', function ($join) {
                    $join->on('k.ma_khoa', '=', 'p.ma_khoa')->where('p.loai_phong', '=', 'PhongKhamBS');
                })
                ->leftJoin('NHAN_VIEN as nv_ds', 'dt.ma_nhan_vien', '=', 'nv_ds.ma_nhan_vien')
                ->leftJoin('NGUOI_DUNG as nd_ds', 'nv_ds.ma_nguoi_dung', '=', 'nd_ds.ma_nguoi_dung')
                ->orderByRaw("FIELD(dt.trang_thai_cap_thuoc, 'ChoCapThuoc', 'DaCapThuoc')")
                ->orderByRaw("FIELD(dt.trang_thai_thanh_toan, 'DaThu', 'ChuaThu')")
                ->orderByDesc('dt.ma_don_thuoc')
                ->select(
                    'dt.*',
                    'hs.so_thu_tu_kham',
                    'hs.ket_luan_chan_doan',
                    'hs.loi_dan_bac_si',
                    'hs.thoi_gian_tiep_nhan',
                    'p.so_phong',
                    'k.ten_khoa',
                    'nd_bs.ho_ten as ten_bac_si',
                    'nd_ds.ho_ten as ten_duoc_si',
                    'bn.ma_benh_nhan',
                    'nd_bn.vneid',
                    'nd_bn.ho_ten as ten_benh_nhan',
                    'nd_bn.so_dien_thoai',
                    'bn.ngay_sinh',
                    'bn.gioi_tinh',
                    'bn.so_the_bhyt',
                    'bn.tien_su_di_ung_benh_nen',
                    'bn.stk_ngan_hang'
                )
                ->get();

            foreach ($prescriptions as $pr) {
                $pr->items = DB::table('CHI_TIET_DON_THUOC as ct')
                    ->leftJoin('DANH_MUC_THUOC as t', 'ct.ma_thuoc', '=', 't.ma_thuoc')
                    ->where('ct.ma_don_thuoc', $pr->ma_don_thuoc)
                    ->select(
                        'ct.*',
                        't.ten_thuoc',
                        't.hoat_chat',
                        't.don_vi_tinh',
                        't.so_luong_ton_kho'
                    )
                    ->get();
            }

            $medicines = DB::table('DANH_MUC_THUOC')
                ->orderBy('ma_thuoc', 'asc')
                ->get();

            return response()->json([
                'status'        => 'success',
                'prescriptions' => $prescriptions,
                'medicines'     => $medicines
            ], 200);
        } catch (\Throwable $e) {
            return response()->json(['status' => 'error', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * 2. XÁC NHẬN CẤP PHÁT THUỐC CHO BỆNH NHÂN
     */
    public function dispensePrescription(Request $request)
    {
        $maDonThuoc = trim((string) $request->ma_don_thuoc);
        $maDuocSiNv = $this->resolveMaNhanVien($request->ma_duoc_si, 'NV26112005');

        try {
            $donThuoc = DB::table('DON_THUOC')->where('ma_don_thuoc', $maDonThuoc)->first();
            if (!$donThuoc) {
                return response()->json(['status' => 'error', 'message' => 'Không tìm thấy đơn thuốc!'], 404);
            }
            if ($donThuoc->trang_thai_thanh_toan !== 'DaThu') {
                return response()->json([
                    'status'  => 'error',
                    'message' => 'Bệnh nhân chưa đóng viện phí tại Quầy Kế toán P104!'
                ], 400);
            }

            DB::table('DON_THUOC')
                ->where('ma_don_thuoc', $maDonThuoc)
                ->update($this->filterValidColumns('DON_THUOC', [
                    'ma_nhan_vien'         => $maDuocSiNv,
                    'trang_thai_cap_thuoc' => 'DaCapThuoc',
                    'thoi_gian_cap_thuoc'  => Carbon::now('Asia/Ho_Chi_Minh')
                ]));

            return response()->json([
                'status'  => 'success',
                'message' => "Đã xác nhận cấp phát thuốc thành công cho Đơn thuốc #{$maDonThuoc}!"
            ]);
        } catch (\Throwable $e) {
            return response()->json(['status' => 'error', 'message' => 'Lỗi cấp thuốc: ' . $e->getMessage()], 400);
        }
    }

    /**
     * 3. QUẢN LÝ KHO THUỐC BHYT (THÊM MỚI, CẬP NHẬT HOẶC NHẬP THÊM TỒN KHO)
     */
    public function saveMedicineStock(Request $request)
    {
        try {
            if ($request->action === 'add_stock' && $request->filled('ma_thuoc')) {
                $maThuoc = trim((string) $request->ma_thuoc);
                $med = DB::table('DANH_MUC_THUOC')->where('ma_thuoc', $maThuoc)->first();
                if (!$med) {
                    return response()->json(['status' => 'error', 'message' => 'Không tìm thấy mã thuốc trong kho!'], 404);
                }

                $addQty = max(1, (int) $request->so_luong_nhap);
                $newStock = (int) ($med->so_luong_ton_kho ?? 0) + $addQty;

                DB::table('DANH_MUC_THUOC')
                    ->where('ma_thuoc', $med->ma_thuoc)
                    ->update($this->filterValidColumns('DANH_MUC_THUOC', [
                        'so_luong_ton_kho' => $newStock
                    ]));

                return response()->json([
                    'status'  => 'success',
                    'message' => "Đã nhập thêm {$addQty} {$med->don_vi_tinh} {$med->ten_thuoc} vào kho (Tồn kho mới: {$newStock})!"
                ]);
            }

            $maThuocInput = trim((string) ($request->ma_thuoc ?? $request->code ?? ''));
            $exists = $maThuocInput !== ''
                ? DB::table('DANH_MUC_THUOC')->where('ma_thuoc', $maThuocInput)->exists()
                : false;

            $data = [
                'ten_thuoc'        => trim((string) $request->ten_thuoc),
                'hoat_chat'        => trim((string) ($request->hoat_chat ?: '')),
                'don_vi_tinh'      => trim((string) ($request->don_vi_tinh ?: 'Viên')),
                'don_gia_thuoc'    => (float) ($request->don_gia_thuoc ?? 0),
                'so_luong_ton_kho' => (int) ($request->so_luong_ton_kho ?? 0),
            ];

            if ($exists) {
                DB::table('DANH_MUC_THUOC')
                    ->where('ma_thuoc', $maThuocInput)
                    ->update($this->filterValidColumns('DANH_MUC_THUOC', $data));
                $msg = "Đã cập nhật thông tin thuốc #{$maThuocInput} ({$data['ten_thuoc']}) trong kho MySQL!";
            } else {
                $newCode = $maThuocInput !== ''
                    ? strtoupper($maThuocInput)
                    : $this->generateNextCode('DANH_MUC_THUOC', 'ma_thuoc', 'TH', 3);
                $data['ma_thuoc'] = $newCode;

                DB::table('DANH_MUC_THUOC')->insert($this->filterValidColumns('DANH_MUC_THUOC', $data));
                $msg = "Đã thêm thuốc mới #{$newCode} ({$data['ten_thuoc']}) vào kho MySQL!";
            }

            return response()->json(['status' => 'success', 'message' => $msg]);
        } catch (\Throwable $e) {
            return response()->json(['status' => 'error', 'message' => 'Lỗi lưu kho thuốc: ' . $e->getMessage()], 400);
        }
    }
}