// Kept in its own module so both the document renderer and the chart renderer
// can escape without importing each other.
export const html = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
