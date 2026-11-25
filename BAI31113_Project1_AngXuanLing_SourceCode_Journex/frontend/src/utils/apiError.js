/**
 * Safely parses API error responses from FastAPI / Pydantic into human-readable strings.
 * Prevents raw [object Object] from displaying when FastAPI returns validation error lists.
 */
export function formatApiError(data, fallback = 'Operation failed. Please check your inputs.') {
  if (!data) return fallback;
  if (typeof data === 'string') return data;
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail)) {
    return data.detail
      .map(item => {
        if (typeof item === 'string') return item;
        const loc = Array.isArray(item.loc)
          ? item.loc.filter(l => l !== 'body' && l !== 'query').join(' ')
          : '';
        const fieldName = loc ? loc.replace(/_/g, ' ') : '';
        const msg = item.msg || JSON.stringify(item);
        return fieldName ? `${fieldName}: ${msg}` : msg;
      })
      .join(' | ');
  }
  if (data.detail && typeof data.detail === 'object') {
    return data.detail.message || JSON.stringify(data.detail);
  }
  if (typeof data.message === 'string') return data.message;
  return fallback;
}
