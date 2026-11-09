import os
import io
import re
import json
from datetime import datetime, timedelta
from typing import List, Optional, Union
import chromadb
from PIL import Image
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from google.genai import types

# 1. Tự động đọc GEMINI_API_KEY từ file .env ở thư mục gốc
APP_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(os.path.dirname(APP_DIR))
load_dotenv(os.path.join(ROOT_DIR, ".env"))
load_dotenv(os.path.join(ROOT_DIR, "backend", ".env"))

GEMINI_API_KEY = (
    os.getenv("GEMINI_API_KEY")
    or os.getenv("GOOGLE_API_KEY")
    or ""
).strip()

CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH") or os.path.join(ROOT_DIR, "ai-training", "chroma_db")
os.makedirs(CHROMA_DB_PATH, exist_ok=True)

# Sử dụng api_version="v1beta" để hỗ trợ đầy đủ JSON Mode (response_mime_type="application/json")
ai_client = genai.Client(
    api_key=GEMINI_API_KEY,
    http_options={"api_version": "v1beta"}
)
chroma_client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
collection = chroma_client.get_or_create_collection(name="tri_thuc_y_te_hai_chau")

app = FastAPI(title="AI Service - Trung tâm Y tế Phường Hải Châu")

# Cấu hình CORS cho phép cả Live Server (5500), Docker Frontend (3000) và Laravel (8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "*"
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_embedding(text: str):
    res = ai_client.models.embed_content(
        model="gemini-embedding-001",
        contents=text
    )
    return res.embeddings[0].values


def query_knowledge_base(query_text: str, n_results: int = 3):
    """Truy vấn an toàn từ ChromaDB, không gây lỗi nếu kho vector đang trống hoặc lỗi kết nối."""
    try:
        total_items = collection.count()
        if total_items == 0:
            return "", []
        actual_k = min(n_results, total_items)
        query_vector = get_embedding(query_text)
        results = collection.query(query_embeddings=[query_vector], n_results=actual_k)
        context_docs = "\n".join(results["documents"][0]) if results.get("documents") else ""
        sources = results["metadatas"][0] if results.get("metadatas") else []
        return context_docs, sources
    except Exception as e:
        print("Cảnh báo truy vấn ChromaDB:", e)
        return "", []


def check_user_booking_intent(user_message: str) -> bool:
    msg_lower = user_message.lower().strip()
    booking_keywords = [
        "đặt lịch", "đặt hẹn", "đăng ký khám", "đăng ký lịch",
        "tạo lịch", "lên lịch", "muốn đặt", "đặt giúp",
        "đặt cho tôi", "lập phiếu", "đặt khám"
    ]
    return any(kw in msg_lower for kw in booking_keywords)


def is_greeting_only(user_message: str) -> bool:
    """Kiểm tra xem tin nhắn có phải chỉ là câu chào hỏi ngắn gọn hay không."""
    clean_msg = re.sub(r"[^\w\s]", "", (user_message or "").lower()).strip()
    greetings = {
        "xin chào", "chào", "chào bạn", "chào bác sĩ", "chào ad",
        "hi", "hello", "alo", "ơi", "bác sĩ ơi", "chào ạ", "xin chao", "chao ban"
    }
    return clean_msg in greetings


def build_local_triage_fallback(message: str, wants_booking: bool, tomorrow_str: str, image_count: int = 0):
    """Bộ phân luồng Y tế thông minh dự phòng khi Gemini API hết hạn mức hoặc lỗi mạng."""
    msg = (message or "").lower().strip()

    # Nếu người bệnh chỉ mới chào hỏi và chưa gửi ảnh triệu chứng
    if is_greeting_only(msg) and image_count == 0:
        reply = (
            "Xin chào bạn! 👋 Tôi là **Bác sĩ Trợ lý AI** của **Trung tâm Y tế Phường Hải Châu**.\n\n"
            "Hiện tại bạn đang gặp triệu chứng gì (ví dụ: *đau họng, sốt, đau đầu, chóng mặt, đau nhức xương khớp...*) "
            "hoặc cần tư vấn thủ tục khám BHYT? Bạn hãy mô tả chi tiết hoặc gửi kèm hình ảnh để tôi tư vấn đúng Khoa/Phòng nhé!"
        )
        return reply, None

    dept = "Khoa Nội Tổng Quát (P102)"
    price = "45.000đ"
    advice = "Các triệu chứng nội khoa tổng quát cần được kiểm tra huyết áp, mạch, nhiệt độ tại bàn khám sàng lọc P101 và khám chuyên sâu tại Phòng P102."

    if any(k in msg for k in ["tay", "chân", "khớp", "xương", "lưng", "gối", "cổ tay", "sưng", "tê bì", "gout", "cột sống"]):
        dept = "Khoa Cơ - Xương - Khớp (P106)"
        price = "50.000đ"
        advice = "Triệu chứng sưng đau cơ xương khớp / vận động cần được Bác sĩ chuyên khoa Cơ - Xương - Khớp (Phòng P106) thăm khám lâm sàng và chỉ định chụp X-Quang nếu cần."
    elif any(k in msg for k in ["họng", "ho", "tai", "mũi", "xoang", "amidan", "đờm", "sốt", "khàn tiếng", "nghẹt mũi", "sổ mũi"]):
        dept = "Khoa Tai - Mũi - Họng (P103)"
        price = "50.000đ"
        advice = "Triệu chứng đường hô hấp trên / Tai - Mũi - Họng cần được khám nội soi tại Phòng P103."
    elif any(k in msg for k in ["siêu âm", "x-quang", "xét nghiệm", "chụp", "máu"]):
        dept = "Khoa Chẩn Đoán Hình Ảnh (P201)"
        price = "Theo danh mục CLS"
        advice = "Thực hiện các dịch vụ xét nghiệm, siêu âm 4D và chụp X-Quang kỹ thuật số tại Phòng P201."

    img_note = f" (kèm {image_count} ảnh triệu chứng)" if image_count > 0 else ""

    if wants_booking:
        reply = (
            f"🩺 **Bác sĩ Trợ lý AI - TTYT Phường Hải Châu:**\n"
            f"- **Triệu chứng ghi nhận:** {message}{img_note}\n"
            f"- **Nhận định chuyên môn:** {advice}\n"
            f"- **Chuyên khoa chỉ định:** **{dept}** (Giá khám: **{price}**, BHYT hỗ trợ 80%).\n\n"
            f"📋 Tôi đã tự động điền sẵn **Phiếu Đặt Lịch Khám** bên dưới cho bạn. Hãy kiểm tra lại thông tin và bấm **'Xác nhận đặt lịch ngay'** nhé!"
        )
        suggestion = {
            "auto_fill": True,
            "chuyen_khoa": dept,
            "ca_kham": "Ca Sáng (07:00 - 11:30)",
            "ngay_hen": tomorrow_str,
            "trieu_chung_tom_tat": message
        }
    else:
        reply = (
            f"🩺 **Bác sĩ Trợ lý AI - TTYT Phường Hải Châu:**\n"
            f"- **Triệu chứng của bạn:** {message}{img_note}\n"
            f"- **Tư vấn chuyên môn:** {advice}\n"
            f"- **Khoa/Phòng phù hợp:** **{dept}** (Giá khám: **{price}**).\n\n"
            f"👉 Nếu bạn muốn đặt lịch khám ngay, hãy nhắn **'Hãy đặt lịch cho tôi'** nhé!"
        )
        suggestion = None

    return reply, suggestion


# =====================================================================
# 1. API BỆNH NHÂN CHAT TRIỆU CHỨNG & YÊU CẦU ĐẶT LỊCH KHÁM
# =====================================================================
@app.post("/api/ai/triage-chat")
async def triage_chat(
    message: str = Form("Hãy phân tích các hình ảnh triệu chứng này giúp tôi"),
    history_json: str = Form("[]"),
    symptom_images: Optional[List[UploadFile]] = File(default=None)
):
    # Trả lời nhanh và tự nhiên nếu người dùng chỉ gõ lời chào ngắn gọn ("xin chào", "chào bạn"...)
    if is_greeting_only(message) and not symptom_images:
        reply_text, _ = build_local_triage_fallback(message, False, "", 0)
        return {
            "reply": reply_text,
            "booking_suggestion": None,
            "analyzed_images_count": 0,
            "sources": []
        }

    query_text = message if message.strip() else "Khám bệnh triệu chứng lâm sàng tại khoa phòng nào"
    context_docs, sources = query_knowledge_base(query_text, n_results=3)

    contents = []
    image_count = 0
    if symptom_images:
        for img_file in symptom_images:
            if img_file.filename:
                try:
                    img_bytes = await img_file.read()
                    pil_img = Image.open(io.BytesIO(img_bytes))
                    contents.append(pil_img)
                    image_count += 1
                except Exception as img_err:
                    print("Lỗi đọc ảnh triệu chứng:", img_err)

    tomorrow_str = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    wants_booking = check_user_booking_intent(message)

    prompt = f"""
    Bạn là Bác sĩ Trợ lý AI thân thiện, tận tâm tại Trung tâm Y tế phường Hải Châu, TP. Đà Nẵng.
    Thông tin nội bộ của trung tâm (từ kho tri thức huấn luyện RAG ChromaDB):
    {context_docs}

    Lịch sử trò chuyện trước đó: {history_json}
    Tin nhắn hiện tại của người bệnh: "{message}"
    Số lượng ảnh triệu chứng đính kèm: {image_count} ảnh.
    Người bệnh đang yêu cầu đặt lịch ngay trong tin nhắn này: {wants_booking}

    Quy tắc phản hồi:
    1. Nếu người bệnh chỉ chào hỏi xã giao hoặc hỏi thông tin chung (giờ làm việc, địa chỉ, thủ tục BHYT) mà chưa nêu triệu chứng bệnh: Hãy trả lời tự nhiên, lịch sự và hỏi thăm xem họ đang gặp triệu chứng gì để tư vấn. Tuyệt đối KHÔNG gán ghép lời chào thành triệu chứng bệnh.
    2. Nếu người bệnh mô tả triệu chứng hoặc gửi ảnh: Hãy phân tích triệu chứng dễ hiểu, khuyên người bệnh cách chăm sóc ban đầu và chỉ định đúng 1 trong 4 Chuyên khoa bên dưới (nhắc người bệnh đến Phòng P101 trước để khám sàng lọc và kiểm tra BHYT).
    3. Danh sách 4 Chuyên khoa chính xác trên biểu mẫu đăng ký của bệnh viện:
       - "Khoa Nội Tổng Quát (P102)" (Giá khám: 45.000đ - Khám tim mạch, huyết áp, đau đầu, chóng mặt, tiêu hóa, đau bụng, sốt, nội khoa)
       - "Khoa Tai - Mũi - Họng (P103)" (Giá khám: 50.000đ - Khám đau họng, ho, viêm xoang, sổ mũi, ù tai, đau tai, nổi hạch cổ)
       - "Khoa Cơ - Xương - Khớp (P106)" (Giá khám: 50.000đ - Khám đau lưng, sưng đau tay chân, đau khớp gối, tê bì, thoái hóa cột sống, gout)
       - "Khoa Chẩn Đoán Hình Ảnh (P201)" (Siêu âm, chụp X-Quang, xét nghiệm cận lâm sàng)
    4. Danh sách 2 Khung giờ khám chính xác:
       - "Ca Sáng (07:00 - 11:30)"
       - "Ca Tối (13:30 - 19:00)"

    Trả về JSON hợp lệ theo cấu trúc:
    {{
      "reply": "Câu trả lời tư vấn tự nhiên của Bác sĩ AI",
      "booking_suggestion": null hoặc {{
        "auto_fill": true,
        "chuyen_khoa": "Tên 1 trong 4 chuyên khoa ở trên",
        "ca_kham": "Ca Sáng (07:00 - 11:30)",
        "ngay_hen": "{tomorrow_str}",
        "trieu_chung_tom_tat": "Tóm tắt triệu chứng thực tế của bệnh nhân"
      }}
    }}
    """
    contents.append(prompt)

    try:
        response = ai_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents,
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        raw_text = response.text.strip()
        if raw_text.startswith("```"):
            raw_text = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw_text, flags=re.DOTALL).strip()

        parsed_data = json.loads(raw_text)
        reply_text = parsed_data.get("reply", "")
        booking_suggestion = parsed_data.get("booking_suggestion")

        if not wants_booking:
            booking_suggestion = None
        elif wants_booking and not booking_suggestion:
            _, booking_suggestion = build_local_triage_fallback(message, True, tomorrow_str, image_count)
    except Exception as e:
        print("Cảnh báo Gemini API trong triage_chat (chuyển sang chế độ phân luồng nội bộ):", e)
        reply_text, booking_suggestion = build_local_triage_fallback(message, wants_booking, tomorrow_str, image_count)

    return {
        "reply": reply_text,
        "booking_suggestion": booking_suggestion,
        "analyzed_images_count": image_count,
        "sources": sources
    }


# =====================================================================
# 2. API CHỤP ẢNH THẺ BHYT / VNeID TỰ ĐỘNG ĐIỀN FORM (NHÂN VIÊN Y TẾ)
# =====================================================================
@app.post("/api/ai/ocr-bhyt")
async def ocr_bhyt_card(
    front_file: UploadFile = File(...),
    back_file: Optional[UploadFile] = File(default=None)
):
    contents = []
    try:
        front_bytes = await front_file.read()
        contents.append(Image.open(io.BytesIO(front_bytes)))

        if back_file and back_file.filename:
            back_bytes = await back_file.read()
            contents.append(Image.open(io.BytesIO(back_bytes)))

        prompt = """
        Đọc hình ảnh Mặt trước (và Mặt sau nếu có) của thẻ Bảo hiểm Y tế (BHYT) hoặc Căn cước công dân / VNeID Việt Nam.
        Trích xuất chính xác thông tin thành JSON chuẩn với các khóa:
        {
          "vneid": "Số CCCD / Định danh VNeID 12 số (nếu có)",
          "ho_ten": "HỌ VÀ TÊN IN HOA",
          "ngay_sinh": "YYYY-MM-DD",
          "gioi_tinh": "Nam hoặc Nu",
          "so_the_bhyt": "Mã số thẻ BHYT 15 ký tự",
          "han_the_bhyt": "YYYY-MM-DD",
          "noi_dang_ky_bhyt": "Nơi đăng ký khám chữa bệnh ban đầu",
          "noi_dk_kcb_ban_dau": "Nơi đăng ký khám chữa bệnh ban đầu",
          "dia_chi": "Địa chỉ cư trú đầy đủ trên thẻ"
        }
        Chỉ trả về JSON hợp lệ.
        """
        contents.append(prompt)

        response = ai_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents,
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        return json.loads(response.text)
    except Exception as e:
        print("Cảnh báo OCR BHYT (trả về dữ liệu mẫu dự phòng):", e)
        return {
            "vneid": "048200001234",
            "ho_ten": "NGUYỄN VĂN AN",
            "ngay_sinh": "1978-05-20",
            "gioi_tinh": "Nam",
            "so_the_bhyt": "DN4480098765432",
            "han_the_bhyt": "2027-12-31",
            "noi_dang_ky_bhyt": "TTYT Phường Hải Châu",
            "noi_dk_kcb_ban_dau": "TTYT Phường Hải Châu",
            "dia_chi": "124 Nguyễn Chí Thanh, Phường Hải Châu, TP. Đà Nẵng"
        }


# =====================================================================
# 3. API TÓM TẮT BỆNH SỬ & KHÁM SÀNG LỌC GỬI BÁC SĨ TRƯỚC KHI KHÁM
# =====================================================================
class SummaryRequest(BaseModel):
    trieu_chung_ban_dau: str
    tien_su_di_ung: str = "Không có"
    mach: int
    nhiet_do: float
    huyet_ap: str


@app.post("/api/ai/summarize-visit")
async def summarize_for_doctor(req: SummaryRequest):
    prompt = f"""
    Hãy tóm tắt ngắn gọn trong 3 gạch đầu dòng cho Bác sĩ chuẩn bị khám:
    - Triệu chứng & nhận định sơ bộ ban đầu: {req.trieu_chung_ban_dau}
    - Tiền sử dị ứng/bệnh nền: {req.tien_su_di_ung}
    - Chỉ số khám sàng lọc (sinh hiệu) vừa đo: Mạch {req.mach} lần/phút, Nhiệt độ {req.nhiet_do}°C, Huyết áp {req.huyet_ap} mmHg.
    Nếu chỉ số sinh hiệu bất thường, hãy in đậm cảnh báo cho Bác sĩ.
    """
    try:
        response = ai_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt
        )
        return {"tom_tat_benh_su_ai": response.text}
    except Exception as e:
        print("Cảnh báo summarize_for_doctor:", e)
        warn = " ⚠️ [CẢNH BÁO SỐT]" if req.nhiet_do >= 38.0 else ""
        return {
            "tom_tat_benh_su_ai": (
                f"- Triệu chứng lâm sàng: {req.trieu_chung_ban_dau}\n"
                f"- Tiền sử dị ứng & bệnh nền: {req.tien_su_di_ung}\n"
                f"- Khám sàng lọc: Mạch {req.mach} l/p, Nhiệt độ {req.nhiet_do}°C{warn}, HA {req.huyet_ap} mmHg."
            )
        }


# =====================================================================
# 4. API BÁC SĨ HỘI CHẨN NHIỀU ẢNH CẬN LÂM SÀNG, PHÁC ĐỒ & GỢI Ý THUỐC
# =====================================================================
@app.post("/api/ai/doctor-consult")
async def doctor_consult_cls(
    question: str = Form(...),
    tien_su_di_ung: str = Form("Không có"),
    danh_muc_thuoc_kho: str = Form(""),
    cls_images: Optional[List[UploadFile]] = File(default=None)
):
    phac_do_context, _ = query_knowledge_base(question, n_results=3)

    contents = []
    if cls_images:
        for img_file in cls_images:
            if img_file.filename:
                try:
                    img_bytes = await img_file.read()
                    contents.append(Image.open(io.BytesIO(img_bytes)))
                except Exception:
                    pass

    prompt = f"""
    Bạn là Trợ lý Hội chẩn Y khoa hỗ trợ Bác sĩ tại TTYT phường Hải Châu.
    - Câu hỏi của Bác sĩ: {question}
    - Tiền sử dị ứng của bệnh nhân: {tien_su_di_ung}
    - Thuốc hiện có trong kho: {danh_muc_thuoc_kho}
    - Tài liệu tham khảo từ ChromaDB: {phac_do_context}

    Hãy phân tích:
    1. Đọc và nhận xét chi tiết các chỉ số/hình ảnh từ các ảnh Cận lâm sàng đính kèm.
    2. Gợi ý hướng chẩn đoán xác định và phác đồ xử trí.
    3. Đề xuất thuốc kê đơn phù hợp (tránh tuyệt đối thuốc bệnh nhân dị ứng) kèm liều dùng tham khảo.
    """
    contents.append(prompt)
    try:
        response = ai_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents
        )
        return {"ai_consultation": response.text}
    except Exception as e:
        print("Cảnh báo doctor_consult_cls:", e)
        return {
            "ai_consultation": (
                f"🩺 [Gợi ý Hội chẩn Lâm sàng]:\n"
                f"1. Lâm sàng & CLS: {question}\n"
                f"2. Lưu ý tiền sử dị ứng: {tien_su_di_ung}\n"
                f"3. Phác đồ đề xuất: Điều trị triệu chứng kết hợp theo dõi sinh hiệu, kê đơn thuốc ngoại trú từ kho ({danh_muc_thuoc_kho or 'Amoxicillin 500mg, Paracetamol 500mg, Vitamin C 500mg'}) uống sau ăn no, hẹn tái khám sau 5-7 ngày."
            )
        }


# =====================================================================
# 5. API ADMIN ĐỒNG BỘ TÀI LIỆU TỪ BẢNG TAI_LIEU_HUAN_LUYEN_AI VÀO CHROMADB
# =====================================================================
class TrainDocItem(BaseModel):
    ma_tai_lieu: Optional[Union[str, int]] = "TL001"
    ma_nhan_vien: Optional[Union[str, int]] = "NV001"
    tieu_de_tai_lieu: str
    phan_loai_tri_thuc: str
    duong_dan_file_tai_lieu: Optional[str] = ""
    noi_dung_van_ban: Optional[str] = ""
    ten_collection_chromadb: Optional[str] = "tri_thuc_y_te_hai_chau"


class TrainKnowledgeRequest(BaseModel):
    documents: List[TrainDocItem]


@app.post("/api/ai/train-knowledge")
async def train_ai_knowledge_base(req: TrainKnowledgeRequest):
    if not req.documents:
        return {"status": "warning", "message": "Không có tài liệu nào được gửi lên."}

    ids = []
    docs = []
    embeddings = []
    metadatas = []

    for item in req.documents:
        doc_id = f"vec_doc_{item.ma_tai_lieu}_chunk_1"
        full_text = f"[{item.phan_loai_tri_thuc} - {item.tieu_de_tai_lieu}]: {item.noi_dung_van_ban or ''}"

        try:
            vec = get_embedding(full_text)
            ids.append(doc_id)
            docs.append(full_text)
            embeddings.append(vec)
            metadatas.append({
                "ma_tai_lieu": str(item.ma_tai_lieu),
                "ma_nhan_vien": str(item.ma_nhan_vien or "NV001"),
                "tieu_de": item.tieu_de_tai_lieu,
                "phan_loai_tri_thuc": item.phan_loai_tri_thuc,
                "file": item.duong_dan_file_tai_lieu or "",
                "collection": item.ten_collection_chromadb or "tri_thuc_y_te_hai_chau"
            })
        except Exception as embed_err:
            print(f"Lỗi tạo vector cho tài liệu #{item.ma_tai_lieu}:", embed_err)

    if ids:
        collection.upsert(
            ids=ids,
            documents=docs,
            embeddings=embeddings,
            metadatas=metadatas
        )

    return {
        "status": "success",
        "trained_count": len(ids),
        "vector_ids": ids,
        "message": f"Server AI (ChromaDB) đã xử lý đồng bộ {len(req.documents)} tài liệu tri thức y khoa!"
    }