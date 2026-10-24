from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health():
    """Backend health check."""
    return {"status": "ok"}
