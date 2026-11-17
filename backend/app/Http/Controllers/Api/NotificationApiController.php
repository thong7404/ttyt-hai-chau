<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Carbon\Carbon;

class NotificationApiController extends Controller
{
    /**
     * Tự động sinh mã khóa chính Chữ + Số tiếp theo (TB001, TB002, TB003...)
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
     * Tự động khởi tạo bảng THONG_BAO với ma_thong_bao và ma_nguoi_dung nếu chưa có
     */
    private function ensureNotificationTableExists(): void
    {
        if (!Schema::hasTable('THONG_BAO')) {
            DB::statement("
                CREATE TABLE IF NOT EXISTS THONG_BAO (
                    ma_thong_bao VARCHAR(20) PRIMARY KEY,
                    ma_nguoi_dung VARCHAR(20) NOT NULL,
                    loai_thong_bao VARCHAR(50) DEFAULT 'NhacLichHen',
                    tieu_de VARCHAR(255) NOT NULL,
                    noi_dung TEXT NOT NULL,
                    ngay_tao DATETIME DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT fk_thongbao_nguoidung
                        FOREIGN KEY (ma_nguoi_dung) REFERENCES NGUOI_DUNG(ma_nguoi_dung)
                        ON DELETE CASCADE ON UPDATE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
        }
    }

    /**
     * Hàm dùng chung: Lưu thông báo vào bảng THONG_BAO (ma_thong_bao, ma_nguoi_dung) và gửi về Gmail
     */
    private function createAndSendEmailNotification(
        string $maNguoiDung,
        string $loaiThongBao,
        string $tieuDe,
        string $noiDungText,
        ?string $emailNguoiNhan = null,
        ?string $hoTenNguoiNhan = null
    ): array {
        $this->ensureNotificationTableExists();

        if (!$emailNguoiNhan || !$hoTenNguoiNhan) {
            $user = DB::table('NGUOI_DUNG')->where('ma_nguoi_dung', $maNguoiDung)->first();
            if ($user) {
                $emailNguoiNhan = $emailNguoiNhan ?: $user->email;
                $hoTenNguoiNhan = $hoTenNguoiNhan ?: $user->ho_ten;
            }
        }

        $emailSent = false;
        $emailError = null;

        if (!empty($emailNguoiNhan) && filter_var($emailNguoiNhan, FILTER_VALIDATE_EMAIL)) {
            try {
                $badgeTitle = $loaiThongBao === 'UuDai'
                    ? '🎁 CHƯƠNG TRÌNH ƯU ĐÃI & CHĂM SÓC SỨC KHỎE'
                    : '⏰ NHẮC NHỞ LỊCH HẸN KHÁM BỆNH';

                $headerBg = $loaiThongBao === 'UuDai'
                    ? 'linear-gradient(135deg, #0284c7 0%, #0d9488 100%)'
                    : 'linear-gradient(135deg, #0d9488 0%, #059669 100%)';

                $htmlBody = "
                <div style='font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #cbe4ec; border-radius: 16px; overflow: hidden; background: #ffffff;'>
                    <div style='background: {$headerBg}; color: #ffffff; padding: 24px; text-align: center;'>
                        <div style='font-size: 11px; font-weight: bold; letter-spacing: 1px; opacity: 0.9;'>{$badgeTitle}</div>
                        <h2 style='margin: 8px 0 4px; font-size: 20px;'>TRUNG TÂM Y TẾ PHƯỜNG HẢI CHÂU</h2>
                        <p style='margin: 0; font-size: 12px; opacity: 0.9;'>Sở Y Tế TP. Đà Nẵng • Đường dây nóng 24/7: (0236) 3822 292</p>
                    </div>
                    <div style='padding: 24px; color: #334155; font-size: 14px; line-height: 1.6;'>
                        <p style='margin-top: 0;'>Xin chào Quý bệnh nhân <b>" . htmlspecialchars($hoTenNguoiNhan ?: 'Quý khách') . "</b>,</p>
                        <div style='padding: 16px; border-radius: 12px; background: #f0fdfa; border-left: 4px solid #0d9488; margin: 16px 0;'>
                            <h3 style='margin: 0 0 8px; color: #0f766e; font-size: 16px;'>" . htmlspecialchars($tieuDe) . "</h3>
                            <div style='white-space: pre-line; color: #1e293b;'>" . nl2br(htmlspecialchars($noiDungText)) . "</div>
                        </div>
                        <p style='font-size: 13px; color: #64748b;'>
                            📍 <b>Địa điểm tiếp đón:</b> Quầy Tiếp Nhận & Khám Sàng Lọc P101 – Trung tâm Y tế Phường Hải Châu, TP. Đà Nẵng.<br/>
                            🪪 <b>Lưu ý khi đi khám:</b> Vui lòng mang theo Thẻ CCCD gắn chip (hoặc ứng dụng VNeID) và Thẻ BHYT (nếu có) để được ưu tiên lấy số nhanh.
                        </p>
                        <hr style='border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;'/>
                        <p style='font-size: 12px; color: #94a3b8; text-align: center; margin-bottom: 0;'>
                            Email này được gửi tự động từ Hệ thống Quản lý Khám chữa bệnh (HIS) - TTYT Phường Hải Châu.
                        </p>
                    </div>
                </div>";

                Mail::html($htmlBody, function ($message) use ($emailNguoiNhan, $hoTenNguoiNhan, $tieuDe) {
                    $message->to($emailNguoiNhan, $hoTenNguoiNhan ?: 'Bệnh nhân')
                            ->subject('[TTYT Phường Hải Châu] ' . $tieuDe);
                });

                $emailSent = true;
            } catch (\Throwable $e) {
                $emailError = $e->getMessage();
            }
        }

        $maThongBao = $this->generateNextCode('THONG_BAO', 'ma_thong_bao', 'TB', 3);

        DB::table('THONG_BAO')->insert([
            'ma_thong_bao'   => $maThongBao,
            'ma_nguoi_dung'  => $maNguoiDung,
            'loai_thong_bao' => $loaiThongBao,
            'tieu_de'        => $tieuDe,
            'noi_dung'       => $noiDungText,
            'ngay_tao'       => Carbon::now('Asia/Ho_Chi_Minh')
        ]);

        return [
            'ma_thong_bao' => $maThongBao,
            'email_sent'   => $emailSent,
            'email'        => $emailNguoiNhan,
            'email_error'  => $emailError
        ];
    }

    /**
     * 1. LẤY DANH SÁCH THÔNG BÁO CỦA NGƯỜI DÙNG (VÀ TỰ ĐỘNG QUÉT NHẮC LỊCH HẸN TRƯỚC 1 NGÀY)
     */
    public function getUserNotifications(Request $request, $maNguoiDung)
    {
        $this->ensureNotificationTableExists();

        $this->scanAndRemindTomorrowAppointments($maNguoiDung);

        $notifications = DB::table('THONG_BAO')
            ->where('ma_nguoi_dung', trim((string) $maNguoiDung))
            ->orderByDesc('ngay_tao')
            ->orderByDesc('ma_thong_bao')
            ->limit(50)
            ->get();

        return response()->json([
            'status'        => 'success',
            'total_count'   => $notifications->count(),
            'notifications' => $notifications
        ]);
    }

    /**
     * 2. QUÉT TẤT CẢ LỊCH HẸN NGÀY MAI (TRƯỚC 1 NGÀY) ĐỂ GỬI GMAIL NHẮC LỊCH HẸN TỰ ĐỘNG
     */
    public function scanAndSendAppointmentReminders(Request $request)
    {
        $this->ensureNotificationTableExists();
        $sentList = $this->scanAndRemindTomorrowAppointments(null);

        return response()->json([
            'status'     => 'success',
            'sent_count' => count($sentList),
            'details'    => $sentList,
            'message'    => 'Đã quét lịch hẹn trước 1 ngày và gửi thông báo nhắc lịch qua Gmail thành công!'
        ]);
    }

    private function scanAndRemindTomorrowAppointments(?string $onlyMaNguoiDung = null): array
    {
        $tomorrowYmd = Carbon::now('Asia/Ho_Chi_Minh')->addDay()->format('Y-m-d');
        $todayYmd = Carbon::now('Asia/Ho_Chi_Minh')->format('Y-m-d');

        $query = DB::table('LICH_HEN_KHAM as lh')
            ->join('BENH_NHAN as bn', 'lh.ma_benh_nhan', '=', 'bn.ma_benh_nhan')
            ->join('NGUOI_DUNG as nd', 'bn.ma_nguoi_dung', '=', 'nd.ma_nguoi_dung')
            ->leftJoin('LICH_LAM_VIEC as llv', 'lh.ma_lich_lam', '=', 'llv.ma_lich_lam')
            ->leftJoin('NHAN_VIEN as nv_bs', 'llv.ma_nhan_vien', '=', 'nv_bs.ma_nhan_vien')
            ->leftJoin('NGUOI_DUNG as nd_bs', 'nv_bs.ma_nguoi_dung', '=', 'nd_bs.ma_nguoi_dung')
            ->leftJoin('PHONG as p', 'llv.ma_phong', '=', 'p.ma_phong')
            ->leftJoin('KHOA as k', 'p.ma_khoa', '=', 'k.ma_khoa')
            ->where('lh.trang_thai_hen', 'ChoTiepNhan')
            ->whereIn(DB::raw('DATE(lh.ngay_hen_kham)'), [$tomorrowYmd, $todayYmd]);

        if ($onlyMaNguoiDung) {
            $query->where('nd.ma_nguoi_dung', trim($onlyMaNguoiDung));
        }

        $appointments = $query->select(
            'lh.*',
            'nd.ma_nguoi_dung',
            'nd.ho_ten as ten_benh_nhan',
            'nd.email',
            'nd_bs.ho_ten as ten_bac_si',
            'p.so_phong',
            'k.ten_khoa'
        )->get();

        $results = [];
        foreach ($appointments as $app) {
            $ngayHen = substr((string) $app->ngay_hen_kham, 0, 10);
            $markerCode = "[#" . $app->ma_lich_hen . "]";

            $alreadyReminded = DB::table('THONG_BAO')
                ->where('ma_nguoi_dung', $app->ma_nguoi_dung)
                ->where('loai_thong_bao', 'NhacLichHen')
                ->where('tieu_de', 'like', '%' . $markerCode . '%')
                ->exists();

            if ($alreadyReminded) {
                continue;
            }

            $isTomorrow = ($ngayHen === $tomorrowYmd);
            $tieuDe = ($isTomorrow ? "Nhắc lịch hẹn khám ngày mai ({$ngayHen}) " : "Nhắc lịch hẹn khám hôm nay ({$ngayHen}) ") . $markerCode;
            $tenKhoa = $app->ten_khoa ?: 'Chuyên khoa';
            $soPhong = $app->so_phong ?: 'P102';
            $tenBacSi = $app->ten_bac_si ?: 'Bác sĩ chuyên khoa';

            $noiDung = "Trung tâm Y tế Phường Hải Châu trân trọng nhắc lịch hẹn khám bệnh của bạn:\n"
                . "• Mã lịch hẹn: #{$app->ma_lich_hen}\n"
                . "• Ngày hẹn khám: {$ngayHen} ({$app->khung_gio_hen})\n"
                . "• Chuyên khoa: {$tenKhoa} (Phòng {$soPhong})\n"
                . "• Bác sĩ phụ trách: {$tenBacSi}\n"
                . "• Triệu chứng đăng ký: " . ($app->trieu_chung_ban_dau ?: 'Khám lâm sàng') . "\n\n"
                . "Quý bệnh nhân vui lòng đến trước giờ hẹn 15 phút tại Quầy Tiếp Nhận P101 để được ưu tiên cấp số thứ tự khám.";

            $res = $this->createAndSendEmailNotification(
                $app->ma_nguoi_dung,
                'NhacLichHen',
                $tieuDe,
                $noiDung,
                $app->email,
                $app->ten_benh_nhan
            );

            $results[] = $res;
        }

        return $results;
    }

    /**
     * 3. GỬI THÔNG BÁO ƯU ĐÃI / CHƯƠNG TRÌNH SỨC KHỎE QUA GMAIL
     */
    public function sendCustomOrPromoNotification(Request $request)
    {
        $this->ensureNotificationTableExists();

        $target = trim((string) ($request->ma_nguoi_dung ?? $request->id_nguoi_dung ?? 'ALL'));
        $loaiThongBao = trim((string) ($request->loai_thong_bao ?: 'UuDai'));
        $tieuDe = trim((string) $request->tieu_de);
        $noiDung = trim((string) $request->noi_dung);

        if ($tieuDe === '' || $noiDung === '') {
            return response()->json([
                'status'  => 'error',
                'message' => 'Vui lòng nhập đầy đủ Tiêu đề và Nội dung thông báo!'
            ], 400);
        }

        $usersQuery = DB::table('NGUOI_DUNG');
        if ($target !== 'ALL') {
            $usersQuery->where('ma_nguoi_dung', $target);
        } else {
            $usersQuery->where('vai_tro', 'BenhNhan');
        }

        $users = $usersQuery->get();
        if ($users->isEmpty()) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Không tìm thấy người dùng nhận thông báo!'
            ], 404);
        }

        $sentCount = 0;
        $emailCount = 0;

        foreach ($users as $u) {
            $res = $this->createAndSendEmailNotification(
                $u->ma_nguoi_dung,
                $loaiThongBao,
                $tieuDe,
                $noiDung,
                $u->email,
                $u->ho_ten
            );
            $sentCount++;
            if ($res['email_sent']) {
                $emailCount++;
            }
        }

        return response()->json([
            'status'      => 'success',
            'sent_count'  => $sentCount,
            'email_count' => $emailCount,
            'message'     => "Đã lưu {$sentCount} thông báo vào bảng THONG_BAO và gửi thành công {$emailCount} email về Gmail người dùng!"
        ]);
    }
}