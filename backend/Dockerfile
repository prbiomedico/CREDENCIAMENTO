FROM python:3.11-slim

WORKDIR /app

# tesseract-ocr (+ pacote de idioma português) e poppler-utils (rasterização
# de PDF via pdf2image) — necessários pro pipeline de OCR de vencimento de
# documentos.
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-por \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
