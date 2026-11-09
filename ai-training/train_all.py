import os
import glob
import chromadb
from dotenv import load_dotenv
from google import genai

# Tự động đọc GEMINI_API_KEY từ file .env ở thư mục gốc
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
load_dotenv(os.path.join(ROOT_DIR, ".env"))

# Nếu bạn điền trực tiếp key vào đây thì ưu tiên lấy key ở đây, nếu không sẽ lấy từ .env
GEMINI_API_KEY = os.getenv("", "").strip()

client = genai.Client(api_key=GEMINI_API_KEY)
CHROMA_PATH = os.path.join(BASE_DIR, "chroma_db")
DATASETS_PATH = os.path.join(BASE_DIR, "datasets")

chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
collection = chroma_client.get_or_create_collection(name="tri_thuc_y_te_hai_chau")

def get_embedding(text: str):
    response = client.models.embed_content(
        model="gemini-embedding-001",
        contents=text
    )
    return response.embeddings[0].values

def train_knowledge_base():
    search_pattern = os.path.join(DATASETS_PATH, "**", "*.txt")
    files = glob.glob(search_pattern, recursive=True)
    
    if not files:
        print("Không tìm thấy file .txt nào trong thư mục datasets!")
        return

    doc_ids, documents, embeddings, metadatas = [], [], [], []

    for idx, filepath in enumerate(files):
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read().strip()
            if not content:
                continue
            doc_ids.append(f"doc_{idx + 1}")
            documents.append(content)
            embeddings.append(get_embedding(content))
            metadatas.append({"source": os.path.basename(filepath)})

    collection.upsert(
        ids=doc_ids,
        documents=documents,
        embeddings=embeddings,
        metadatas=metadatas
    )
    print(f"THÀNH CÔNG: Đã nạp {len(doc_ids)} tài liệu vào ChromaDB tại: {CHROMA_PATH}")

if __name__ == "__main__":
    train_knowledge_base()