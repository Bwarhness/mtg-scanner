from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from scanner import scan_image

app = FastAPI(title="MTG Card Scanner API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MIME_MAP = {
    "image/jpeg": "image/jpeg",
    "image/png": "image/png",
    "image/webp": "image/webp",
}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/scan")
async def scan(image: UploadFile = File(...)):
    image_bytes = await image.read()
    content_type = MIME_MAP.get(image.content_type, "image/jpeg")
    result = scan_image(image_bytes, content_type)
    return result
