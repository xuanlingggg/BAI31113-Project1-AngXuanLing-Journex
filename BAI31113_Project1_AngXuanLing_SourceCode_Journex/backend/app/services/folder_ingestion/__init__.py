"""
Local Folder Ingestion Package.
Provides automated scanning and ingestion of accounting documents from a local folder.
"""

from app.services.folder_ingestion.folder_service import LocalFolderIngestionService
from app.services.folder_ingestion.background_worker import (
    LocalFolderBackgroundWorker,
    folder_worker_singleton,
)

__all__ = [
    "LocalFolderIngestionService",
    "LocalFolderBackgroundWorker",
    "folder_worker_singleton",
]
