<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Carbon\Carbon;

class AccountantApiController extends Controller
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
     * Tự động sinh mã khóa chính Chữ + Số tiếp theo (HD006, CTHD008...)
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
     * Tìm mã nhân viên Kế toán (VD: NV26112004) từ ma_nhan_vien hoặc ma_nguoi_dung
     */
    private function resolveMaNhanVien($idOrUserId, $default = 'NV26112004')
    {
        if (!$idOrUserId) {
            return DB::table('NHAN_VIEN')->where('chuc_vu', 'KeToan')->value('ma_nhan_vien')
                ?: (DB::table('NHAN_VIEN')->value('ma_nhan_vien') ?: $default);
        }
        $val = trim((string) $idOrUserId);
        $byNv = DB::table('NHAN_VIEN')->where('ma_nhan_vien', $val)->value('ma_nhan_vien');
        if ($byNv) return $byNv;

        $byNd = DB::table('NHAN_VIEN')->where('ma_nguoi_dung', $val)->value('ma_nhan_vien');
        if ($byNd) return $byNd;

        return DB::table('NHAN_VIEN')->where('chuc_vu', 'KeToan')->value('ma_nhan_vien')
            ?: (DB::table('NHAN_VIEN')->value('ma_nhan_vien') ?: $default);
    }

    /**
     * 1. TẢI DỮ LIỆU KẾ TOÁN & THU NGÂN VIỆN PHÍ (PHÒNG P104)
     */
    public function getDashboardData()
    {
        try {
            $clsOrders = DB::table('CHI_DINH_CAN_LAM_SANG as cd')
                ->join('HO_SO_KHAM_BENH as hs', 'cd.ma_ho_so_kham', '=', 'hs.ma_ho_so_kham')
                ->join('BENH_NHAN as bn', 'hs.ma_benh_nhan', '=', 'bn.ma_benh_nhan')
                ->leftJoin('NGUOI_DUNG as nd_bn', 'bn.ma_nguoi_dung', '=', 'nd_bn.ma_nguoi_dung')
                ->join('DANH_MUC_CAN_LAM_SANG as dm', 'cd.ma_dich_vu_cls', '=', 'dm.ma_dich_vu_cls')
                ->leftJoin('PHONG as pcls', 'dm.ma_phong', '=', 'pcls.ma_phong')
                ->orderByRaw("FIELD(cd.trang_thai_nop_tien, 'ChuaNop', 'DaNop')")
                ->orderByDesc('cd.ma_chi_dinh_cls')
                ->select(
                    'cd.*',
                    'dm.ten_dich_vu_cls',
                    'dm.don_gia_cls',
                    'pcls.so_phong as phong_thuc_hien',
                    'hs.so_thu_tu_kham',
                    'hs.thoi_gian_tiep_nhan',
                    'bn.ma_benh_nhan',
                    'bn.so_the_bhyt',
                    'bn.stk_ngan_hang',
                    'nd_bn.vneid',
                    'nd_bn.ho_ten as ten_benh_nhan',
                    'nd_bn.so_dien_thoai'
                )
                ->get();

            $invoices = DB::table('HOA_DON_VIEN_PHI as hd')
                ->join('HO_SO_KHAM_BENH as hs', 'hd.ma_ho_so_kham', '=', 'hs.ma_ho_so_kham')
                ->join('BENH_NHAN as bn', 'hs.ma_benh_nhan', '=', 'bn.ma_benh_nhan')
                ->leftJoin('NGUOI_DUNG as nd_bn', 'bn.ma_nguoi_dung', '=', 'nd_bn.ma_nguoi_dung')
                ->leftJoin('NHAN_VIEN as nv_bs', 'hs.ma_nhan_vien', '=', 'nv_bs.ma_nhan_vien')
                ->leftJoin('NGUOI_DUNG as nd_bs', 'nv_bs.ma_nguoi_dung', '=', 'nd_bs.ma_nguoi_dung')
                ->leftJoin('KHOA as k', 'nv_bs.ma_khoa', '=', 'k.ma_khoa')
                ->leftJoin('PHONG as p', function ($join) {
                    $join->on('k.ma_khoa', '=', 'p.ma_khoa')->where('p.loai_phong', '=', 'PhongKhamBS');
                })
                ->orderByRaw("FIELD(hd.trang_thai_thu, 'ChuaThu', 'DaThu')")
                ->orderByDesc('hd.ma_hoa_don')
                ->select(
                    'hd.*',
                    'hs.so_thu_tu_kham',
                    'hs.ket_luan_chan_doan',
                    'hs.thoi_gian_tiep_nhan',
                    'p.so_phong',
                    'k.ten_khoa',
                    'nd_bs.ho_ten as ten_bac_si',
                    'bn.ma_benh_nhan',
                    'bn.so_the_bhyt',
                    'bn.stk_ngan_hang',
                    'nd_bn.vneid',
                    'nd_bn.ho_ten as ten_benh_nhan',
                    'nd_bn.so_dien_thoai'
                )
                ->get();

            foreach ($invoices as $inv) {
                $inv->items = DB::table('CHI_TIET_HOA_DON')
                    ->where('ma_hoa_don', $inv->ma_hoa_don)
                    ->get();
            }

            return response()->json([
                'status'     => 'success',
                'cls_orders' => $clsOrders,
                'invoices'   => $invoices
            ], 200);
        } catch (\Throwable $e) {
            return response()->json(['status' => 'error', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * 2. THU PHÍ DỊCH VỤ CẬN LÂM SÀNG (ĐỢT 1) -> ĐẨY SANG PHÒNG CLS
     */
    public function collectClsPayment(Request $request)
    {
        $maChiDinh = trim((string) ($request->ma_chi_dinh_cls ?? ''));
        $maHoSo = trim((string) ($request->ma_ho_so_kham ?? ''));
        $maKeToanNv = $this->resolveMaNhanVien($request->ma_ke_toan, 'NV26112004');
        $phuongThuc = trim((string) ($request->phuong_thuc_thanh_toan ?: 'ChuyenKhoan_VietQR'));
        $stkBenhVien = trim((string) ($request->stk_benh_vien ?: '0041000888999 - Vietcombank (TTYT Phường Hải Châu)'));
        $maGiaoDich = trim((string) ($request->ma_giao_dich_ngan_hang ?: ('VCB-FT' . date('YmdHis'))));

        DB::beginTransaction();
        try {
            $query = DB::table('CHI_DINH_CAN_LAM_SANG as cd')
                ->join('DANH_MUC_CAN_LAM_SANG as dm', 'cd.ma_dich_vu_cls', '=', 'dm.ma_dich_vu_cls')
                ->where('cd.trang_thai_nop_tien', 'ChuaNop');

            if ($maChiDinh !== '') {
                $query->where('cd.ma_chi_dinh_cls', $maChiDinh);
            } elseif ($maHoSo !== '') {
                $query->where('cd.ma_ho_so_kham', $maHoSo);
            } else {
                return response()->json(['status' => 'error', 'message' => 'Thiếu mã chỉ định CLS hoặc mã hồ sơ khám!'], 400);
            }

            $unpaidList = $query->select('cd.*', 'dm.ten_dich_vu_cls', 'dm.don_gia_cls')->get();
            if ($unpaidList->isEmpty()) {
                return response()->json(['status' => 'error', 'message' => 'Chỉ định CLS này đã được thu phí trước đó!'], 400);
            }

            $targetHoSoId = $unpaidList[0]->ma_ho_so_kham;
            $hoSo = DB::table('HO_SO_KHAM_BENH as hs')
                ->join('BENH_NHAN as bn', 'hs.ma_benh_nhan', '=', 'bn.ma_benh_nhan')
                ->where('hs.ma_ho_so_kham', $targetHoSoId)
                ->select('hs.*', 'bn.so_the_bhyt')
                ->first();

            if ($hoSo && $request->filled('stk_ngan_hang')) {
                DB::table('BENH_NHAN')
                    ->where('ma_benh_nhan', $hoSo->ma_benh_nhan)
                    ->update($this->filterValidColumns('BENH_NHAN', [
                        'stk_ngan_hang' => trim((string) $request->stk_ngan_hang)
                    ]));
            }

            $tyLeBhyt = ($hoSo && !empty($hoSo->so_the_bhyt)) ? 0.8 : 0.0;
            $tongTienGoc = 0;

            foreach ($unpaidList as $item) {
                $tongTienGoc += (float) $item->don_gia_cls;
                DB::table('CHI_DINH_CAN_LAM_SANG')
                    ->where('ma_chi_dinh_cls', $item->ma_chi_dinh_cls)
                    ->update($this->filterValidColumns('CHI_DINH_CAN_LAM_SANG', [
                        'trang_thai_nop_tien' => 'DaNop'
                    ]));
            }

            $tienBhyt = round($tongTienGoc * $tyLeBhyt);
            $tienBn = $tongTienGoc - $tienBhyt;

            $maHoaDon = $this->generateNextCode('HOA_DON_VIEN_PHI', 'ma_hoa_don', 'HD', 3);
            DB::table('HOA_DON_VIEN_PHI')->insert($this->filterValidColumns('HOA_DON_VIEN_PHI', [
                'ma_hoa_don'             => $maHoaDon,
                'ma_ho_so_kham'          => $targetHoSoId,
                'ma_nhan_vien'           => $maKeToanNv,
                'loai_hoa_don'           => 'Dot1_ThuTienCLS',
                'tong_tien_goc'          => $tongTienGoc,
                'tien_bhyt_chi_tra'      => $tienBhyt,
                'tien_benh_nhan_tra'     => $tienBn,
                'phuong_thuc_thanh_toan' => $phuongThuc,
                'trang_thai_thu'         => 'DaThu',
                'thoi_gian_thu'          => Carbon::now('Asia/Ho_Chi_Minh'),
                'stk_benh_vien'          => $stkBenhVien,
                'ma_giao_dich_ngan_hang' => $maGiaoDich
            ]));

            $cthdCols = Schema::getColumnListing('CHI_TIET_HOA_DON');
            $cthdPk = in_array('ma_chi_tiet_hd', $cthdCols)
                ? 'ma_chi_tiet_hd'
                : (in_array('ma_ct_hoa_don', $cthdCols) ? 'ma_ct_hoa_don' : null);

            foreach ($unpaidList as $item) {
                $gia = (float) $item->don_gia_cls;
                $rowCthd = [
                    'ma_hoa_don'    => $maHoaDon,
                    'loai_hang_muc' => 'DichVuCLS',
                    'ten_hang_muc'  => $item->ten_dich_vu_cls,
                    'so_luong'      => 1,
                    'don_gia'       => $gia,
                    'thanh_tien'    => $gia
                ];
                if ($cthdPk) {
                    $rowCthd[$cthdPk] = $this->generateNextCode('CHI_TIET_HOA_DON', $cthdPk, 'CTHD', 3);
                }
                DB::table('CHI_TIET_HOA_DON')->insert($this->filterValidColumns('CHI_TIET_HOA_DON', $rowCthd));
            }

            DB::table('HO_SO_KHAM_BENH')
                ->where('ma_ho_so_kham', $targetHoSoId)
                ->update($this->filterValidColumns('HO_SO_KHAM_BENH', [
                    'trang_thai_hang_doi' => 'ChoLamCLS'
                ]));

            DB::commit();

            return response()->json([
                'status'     => 'success',
                'ma_hoa_don' => $maHoaDon,
                'message'    => "Đã xác nhận thu phí Cận lâm sàng (Mã hóa đơn: #{$maHoaDon}) và chuyển bệnh nhân sang Phòng Cận lâm sàng!"
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['status' => 'error', 'message' => 'Lỗi thu phí CLS: ' . $e->getMessage()], 400);
        }
    }

    /**
     * 3. THU VIỆN PHÍ KHÁM LÂM SÀNG & ĐƠN THUỐC (ĐỢT 2) -> MỞ KHÓA QUẦY DƯỢC P105
     */
    public function collectInvoicePayment(Request $request)
    {
        $maHoaDon = trim((string) $request->ma_hoa_don);
        $maKeToanNv = $this->resolveMaNhanVien($request->ma_ke_toan, 'NV26112004');
        $phuongThuc = trim((string) ($request->phuong_thuc_thanh_toan ?: 'ChuyenKhoan_VietQR'));
        $stkBenhVien = trim((string) ($request->stk_benh_vien ?: '0041000888999 - Vietcombank (TTYT Phường Hải Châu)'));
        $maGiaoDich = trim((string) ($request->ma_giao_dich_ngan_hang ?: ('VCB-FT' . date('YmdHis'))));

        DB::beginTransaction();
        try {
            $hoaDon = DB::table('HOA_DON_VIEN_PHI')->where('ma_hoa_don', $maHoaDon)->first();
            if (!$hoaDon) {
                return response()->json(['status' => 'error', 'message' => 'Không tìm thấy hóa đơn viện phí!'], 404);
            }

            if ($request->filled('stk_ngan_hang') && $hoaDon->ma_ho_so_kham) {
                $hs = DB::table('HO_SO_KHAM_BENH')->where('ma_ho_so_kham', $hoaDon->ma_ho_so_kham)->first();
                if ($hs) {
                    DB::table('BENH_NHAN')
                        ->where('ma_benh_nhan', $hs->ma_benh_nhan)
                        ->update($this->filterValidColumns('BENH_NHAN', [
                            'stk_ngan_hang' => trim((string) $request->stk_ngan_hang)
                        ]));
                }
            }

            DB::table('HOA_DON_VIEN_PHI')
                ->where('ma_hoa_don', $maHoaDon)
                ->update($this->filterValidColumns('HOA_DON_VIEN_PHI', [
                    'ma_nhan_vien'           => $maKeToanNv,
                    'phuong_thuc_thanh_toan' => $phuongThuc,
                    'trang_thai_thu'         => 'DaThu',
                    'thoi_gian_thu'          => Carbon::now('Asia/Ho_Chi_Minh'),
                    'stk_benh_vien'          => $stkBenhVien,
                    'ma_giao_dich_ngan_hang' => $maGiaoDich
                ]));

            if ($hoaDon->ma_ho_so_kham) {
                DB::table('DON_THUOC')
                    ->where('ma_ho_so_kham', $hoaDon->ma_ho_so_kham)
                    ->update($this->filterValidColumns('DON_THUOC', [
                        'trang_thai_thanh_toan' => 'DaThu'
                    ]));
            }

            DB::commit();

            return response()->json([
                'status'  => 'success',
                'message' => "Đã xác nhận thu viện phí Hóa đơn #{$maHoaDon} ({$phuongThuc}) và mở khóa cấp phát thuốc tại Quầy Dược P105!"
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['status' => 'error', 'message' => 'Lỗi thu viện phí: ' . $e->getMessage()], 400);
        }
    }
}