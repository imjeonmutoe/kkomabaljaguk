FROM python:3.11-slim

WORKDIR /app

# System libs required by OpenCV and EasyOCR
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# EasyOCR downloads models on first use; pre-download at build time so the
# first request isn't slow and Railway's ephemeral FS doesn't re-download.
RUN python -c "import easyocr; easyocr.Reader(['ko', 'en'], gpu=False)"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]