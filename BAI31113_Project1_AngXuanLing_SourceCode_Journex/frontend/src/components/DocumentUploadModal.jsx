import React, { useState, useRef } from 'react';
import { 
  X, 
  UploadCloud, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  Trash2, 
  Loader2 
} from 'lucide-react';

const MAX_FILES = 5;
const VALID_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'];
const VALID_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];

export default function DocumentUploadModal({ isOpen, onClose, onUploadSuccess }) {
  const [fileQueue, setFileQueue] = useState([]); // [{ id, file, name, size, status: 'PENDING'|'UPLOADING'|'SUCCESS'|'DUPLICATE'|'ERROR', message, duplicateInfo, docData }]
  const [isUploading, setIsUploading] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const validateFiles = (newFiles) => {
    setGlobalError('');
    const validToAdd = [];
    let rejectedCount = 0;

    for (const file of newFiles) {
      const ext = file.name.split('.').pop().toLowerCase();
      const isValidExt = VALID_EXTENSIONS.includes(ext);
      const isValidMime = !file.type || VALID_MIME_TYPES.includes(file.type);

      if (isValidExt && isValidMime) {
        // Prevent adding duplicate identical filename + size in the same queue
        const alreadyInQueue = fileQueue.some(
          (f) => f.name === file.name && f.size === file.size
        );
        if (!alreadyInQueue) {
          validToAdd.push({
            id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
            file,
            name: file.name,
            size: file.size,
            status: 'PENDING',
            message: '',
            duplicateInfo: null,
            docData: null
          });
        }
      } else {
        rejectedCount++;
      }
    }

    if (rejectedCount > 0) {
      setGlobalError(`${rejectedCount} file(s) were skipped (unsupported format). Only PDF, JPG, and PNG are allowed.`);
    }

    const availableSlots = MAX_FILES - fileQueue.length;
    if (validToAdd.length > availableSlots) {
      setGlobalError(`You can upload a maximum of ${MAX_FILES} documents at once. Added first ${Math.max(0, availableSlots)} file(s).`);
      setFileQueue((prev) => [...prev, ...validToAdd.slice(0, Math.max(0, availableSlots))]);
    } else {
      setFileQueue((prev) => [...prev, ...validToAdd]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleRemoveFile = (id) => {
    if (isUploading) return;
    setFileQueue((prev) => prev.filter((f) => f.id !== id));
    setGlobalError('');
  };

  const handleClearAll = () => {
    if (isUploading) return;
    setFileQueue([]);
    setGlobalError('');
  };

  const handleClose = () => {
    if (isUploading) return;
    setFileQueue([]);
    setGlobalError('');
    setIsUploading(false);
    onClose();
  };

  const handleUploadAll = async () => {
    if (fileQueue.length === 0 || isUploading) return;

    setIsUploading(true);
    setGlobalError('');

    const activeCompanyId = localStorage.getItem('active_company_id') || '';
    let successCount = 0;
    let lastUploadedDoc = null;

    for (let i = 0; i < fileQueue.length; i++) {
      const item = fileQueue[i];

      // Skip already uploaded
      if (item.status === 'SUCCESS' || item.status === 'REVIEW' || item.status === 'DUPLICATE' || item.status === 'REJECTED') continue;

      // Mark current as uploading
      setFileQueue((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: 'UPLOADING' } : f))
      );

      const formData = new FormData();
      formData.append('file', item.file);
      if (activeCompanyId) {
        formData.append('company_id', activeCompanyId);
      }

      try {
        const response = await fetch('/api/documents/upload', {
          method: 'POST',
          body: formData
        });

        const resText = await response.text();
        let resJson = null;
        if (resText && resText.trim().length > 0) {
          try {
            resJson = JSON.parse(resText);
          } catch (_) {}
        }

        if (response.status === 409 || (resJson && resJson.duplicate)) {
          const existing = resJson?.existing_document || {};
          setFileQueue((prev) =>
            prev.map((f, idx) =>
              idx === i
                ? {
                    ...f,
                    status: 'DUPLICATE',
                    duplicateInfo: {
                      document_id: existing.document_id || 'N/A',
                      document_type: existing.document_type || 'N/A',
                      identifier: existing.identifier || 'N/A',
                      identifier_label: existing.identifier_label || 'Identifier'
                    },
                    message: resJson?.message || 'Document already exists in the system'
                  }
                : f
            )
          );
        } else if (!response.ok) {
          const detailMsg = resJson?.message || resJson?.detail || resText || `Upload failed with status ${response.status}`;
          const isRejectedEntity = response.status === 422 && (resJson?.company_mismatch || resJson?.rejected);
          setFileQueue((prev) =>
            prev.map((f, idx) =>
              idx === i
                ? {
                    ...f,
                    status: isRejectedEntity ? 'REJECTED' : 'ERROR',
                    message: detailMsg
                  }
                : f
            )
          );
        } else {
          successCount++;
          lastUploadedDoc = resJson;
          const needsReview = resJson?.validation_status === 'Review Required' || (resJson?.validation_errors && resJson.validation_errors.length > 0);
          const reviewDetails = needsReview && resJson?.validation_errors?.length > 0
            ? `Review Required: ${resJson.validation_errors.join(' | ')}`
            : `Extracted as ${resJson.document_type || 'Document'} (${resJson.document_id})`;
          setFileQueue((prev) =>
            prev.map((f, idx) =>
              idx === i
                ? {
                    ...f,
                    status: needsReview ? 'REVIEW' : 'SUCCESS',
                    docData: resJson,
                    message: reviewDetails
                  }
                : f
            )
          );
          try {
            window.dispatchEvent(new CustomEvent('document-uploaded', { detail: resJson }));
          } catch (_) {}
        }
      } catch (err) {
        setFileQueue((prev) =>
          prev.map((f, idx) =>
            idx === i
              ? { ...f, status: 'ERROR', message: err.message || 'Network error' }
              : f
          )
        );
      }
    }

    setIsUploading(false);

    if (successCount > 0 && onUploadSuccess) {
      onUploadSuccess(lastUploadedDoc, successCount);
    }
  };

  const pendingCount = fileQueue.filter((f) => f.status === 'PENDING').length;
  const cleanSuccessCount = fileQueue.filter((f) => f.status === 'SUCCESS').length;
  const reviewCount = fileQueue.filter((f) => f.status === 'REVIEW').length;
  const successCount = cleanSuccessCount + reviewCount;
  const duplicateCount = fileQueue.filter((f) => f.status === 'DUPLICATE').length;
  const rejectedCount = fileQueue.filter((f) => f.status === 'REJECTED').length;
  const errorCount = fileQueue.filter((f) => f.status === 'ERROR' || f.status === 'REJECTED').length;
  const isAllFinished = fileQueue.length > 0 && pendingCount === 0 && !isUploading;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '640px', width: '100%' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>
              Upload Accounting Documents
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Drag & drop up to {MAX_FILES} documents at once (PDF, JPG, PNG)
            </p>
          </div>
          <button 
            onClick={handleClose}
            disabled={isUploading}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: isUploading ? 'not-allowed' : 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
          {globalError && (
            <div style={{ 
              backgroundColor: 'var(--status-error-bg, #FEF2F2)', 
              border: '1px solid rgba(185, 28, 28, 0.3)', 
              color: 'var(--status-error-text, #991B1B)',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{globalError}</span>
            </div>
          )}

          {/* Batch Drag-and-Drop Dropzone */}
          <div 
            className={`upload-dropzone ${isDragOver ? 'drag-over' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              border: isDragOver ? '2px dashed var(--primary-color)' : '2px dashed var(--border-color)',
              backgroundColor: isDragOver ? 'rgba(37, 99, 235, 0.05)' : 'var(--bg-primary)',
              borderRadius: '10px',
              padding: '1.75rem 1rem',
              textAlign: 'center',
              cursor: isUploading ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease-in-out'
            }}
          >
            <UploadCloud size={42} style={{ color: 'var(--primary-color)', marginBottom: '0.5rem' }} />
            <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
              Drag & drop documents here, or <span style={{ color: 'var(--primary-color)', textDecoration: 'underline' }}>browse</span>
            </h4>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.2rem 0' }}>
              Select up to <strong>{MAX_FILES}</strong> files per batch (Max 15MB each)
            </p>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Invoices · Receipts · Orders · Returns · Vouchers · Stock Take
            </div>
            <input 
              ref={fileInputRef}
              type="file" 
              multiple
              accept=".pdf,.jpg,.jpeg,.png"
              style={{ display: 'none' }}
              onChange={handleFileChange}
              disabled={isUploading}
            />
          </div>

          {/* Queue List Header & Action */}
          {fileQueue.length > 0 && (
            <div style={{ marginTop: '1.25rem' }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '0.65rem'
              }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Selected Queue ({fileQueue.length}/{MAX_FILES})
                </div>
                {!isUploading && fileQueue.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      textDecoration: 'underline'
                    }}
                  >
                    Clear queue
                  </button>
                )}
              </div>

              {/* Individual File Items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {fileQueue.map((item, idx) => {
                  let statusBadge = null;
                  let cardBorder = 'var(--border-color)';
                  let cardBg = 'var(--bg-card)';

                  if (item.status === 'UPLOADING') {
                    cardBorder = 'var(--primary-color)';
                    cardBg = 'rgba(37, 99, 235, 0.03)';
                    statusBadge = (
                      <span style={{ fontSize: '0.72rem', color: 'var(--primary-color)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}>
                        <Loader2 size={13} className="spin" /> Extracting...
                      </span>
                    );
                  } else if (item.status === 'SUCCESS') {
                    cardBorder = 'rgba(21, 128, 61, 0.3)';
                    cardBg = 'rgba(240, 253, 244, 0.6)';
                    statusBadge = (
                      <span style={{ fontSize: '0.72rem', color: 'var(--status-success-text, #15803D)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
                        <CheckCircle2 size={13} /> Extracted
                      </span>
                    );
                  } else if (item.status === 'REVIEW') {
                    cardBorder = 'rgba(245, 158, 11, 0.45)';
                    cardBg = 'rgba(255, 251, 235, 0.85)';
                    statusBadge = (
                      <span style={{ fontSize: '0.72rem', color: '#B45309', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
                        <AlertTriangle size={13} /> Review Required
                      </span>
                    );
                  } else if (item.status === 'DUPLICATE') {
                    cardBorder = 'rgba(245, 158, 11, 0.35)';
                    cardBg = 'rgba(255, 251, 235, 0.7)';
                    statusBadge = (
                      <span style={{ fontSize: '0.72rem', color: '#B45309', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
                        <AlertTriangle size={13} /> Duplicate Skipped
                      </span>
                    );
                  } else if (item.status === 'REJECTED') {
                    cardBorder = 'rgba(220, 38, 38, 0.4)';
                    cardBg = 'rgba(254, 242, 242, 0.85)';
                    statusBadge = (
                      <span style={{ fontSize: '0.72rem', color: 'var(--status-error-text, #DC2626)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
                        <AlertCircle size={13} /> Rejected (Entity Mismatch)
                      </span>
                    );
                  } else if (item.status === 'ERROR') {
                    cardBorder = 'rgba(220, 38, 38, 0.3)';
                    cardBg = 'rgba(254, 242, 242, 0.7)';
                    statusBadge = (
                      <span style={{ fontSize: '0.72rem', color: 'var(--status-error-text, #DC2626)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
                        <AlertCircle size={13} /> Failed
                      </span>
                    );
                  } else {
                    statusBadge = (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Ready to process
                      </span>
                    );
                  }

                  return (
                    <div 
                      key={item.id}
                      style={{
                        padding: '0.65rem 0.85rem',
                        backgroundColor: cardBg,
                        border: `1px solid ${cardBorder}`,
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', minWidth: '16px' }}>
                            {idx + 1}.
                          </span>
                          <FileText size={16} style={{ color: 'var(--primary-color)', flexShrink: 0 }} />
                          <span 
                            style={{ 
                              fontSize: '0.82rem', 
                              fontWeight: 600, 
                              color: 'var(--text-primary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                            title={item.name}
                          >
                            {item.name}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                            ({(item.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                          {statusBadge}
                          {item.status === 'PENDING' && !isUploading && (
                            <button
                              type="button"
                              onClick={() => handleRemoveFile(item.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '0.2rem'
                              }}
                              title="Remove from queue"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Detail Message if Success, Duplicate, or Error */}
                      {item.message && (
                        <div style={{ 
                          fontSize: '0.74rem', 
                          paddingLeft: '1.8rem',
                          color: (item.status === 'ERROR' || item.status === 'REJECTED') ? '#DC2626' : ((item.status === 'DUPLICATE' || item.status === 'REVIEW') ? '#B45309' : '#15803D')
                        }}>
                          {item.message}
                          {item.duplicateInfo && (
                            <span style={{ marginLeft: '0.35rem', color: 'var(--text-secondary)' }}>
                              ({item.duplicateInfo.document_type} {item.duplicateInfo.identifier} as ID {item.duplicateInfo.document_id})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Batch Summary when all done */}
          {isAllFinished && (
            <div style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              backgroundColor: errorCount > 0 ? 'rgba(254, 242, 242, 0.9)' : (cleanSuccessCount > 0 && reviewCount === 0 && duplicateCount === 0 ? 'rgba(240, 253, 244, 0.9)' : 'rgba(255, 251, 235, 0.9)'),
              borderRadius: '8px',
              border: `1px solid ${errorCount > 0 ? 'rgba(220, 38, 38, 0.3)' : (cleanSuccessCount > 0 && reviewCount === 0 && duplicateCount === 0 ? 'rgba(21, 128, 61, 0.3)' : 'rgba(245, 158, 11, 0.35)')}`,
              fontSize: '0.82rem',
              color: 'var(--text-primary)'
            }}>
              <strong>Batch Upload Finished:</strong> {cleanSuccessCount} processed
              {reviewCount > 0 ? `, ${reviewCount} need(s) review` : ''}
              {duplicateCount > 0 ? `, ${duplicateCount} duplicate(s) skipped` : ''}
              {rejectedCount > 0 ? `, ${rejectedCount} rejected (entity mismatch)` : ''}
              {(errorCount - rejectedCount) > 0 ? `, ${errorCount - rejectedCount} failed` : ''}.
            </div>
          )}
        </div>

        <div style={{ 
          padding: '1rem 1.5rem', 
          borderTop: '1px solid var(--border-color)', 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {fileQueue.length > 0 && `${fileQueue.length} document(s) in queue (Max ${MAX_FILES})`}
          </div>

          <div style={{ display: 'flex', gap: '0.65rem' }}>
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={handleClose} 
              disabled={isUploading}
            >
              {isAllFinished ? 'Done' : 'Cancel'}
            </button>

            {!isAllFinished ? (
              <button 
                className="btn btn-primary btn-sm" 
                onClick={handleUploadAll}
                disabled={fileQueue.length === 0 || isUploading || pendingCount === 0}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                {isUploading ? (
                  <>
                    <Loader2 size={13} className="spin" />
                    <span>Processing Batch...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud size={14} />
                    <span>Upload & Process ({pendingCount})</span>
                  </>
                )}
              </button>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                onClick={handleClose}
              >
                Close & View Records
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
