FROM python:3.12-slim

# Install system dependencies including tzdata for zoneinfo support (Europe/London cutoff)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Create a non-root user for security
RUN useradd --create-home appuser

# Copy only the required backend files (not the entire project root)
COPY requirements.txt .

# Install Python dependencies into /app (keeps image lean)
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend source code
COPY . .

# Expose the port FastAPI will listen on (configureable via PORT env var, default 8000)
EXPOSE 8000

# Support configurable PORT environment variable, defaulting to 8000
ENV PORT=8000

# Start FastAPI using Uvicorn, listening on 0.0.0.0 so the container is accessible
# The PORT env var allows override at runtime (e.g., docker run -e PORT=8080)
CMD uvicorn main:app --host 0.0.0.0 --port $PORT --log-level warning