export const EMAIL_BRAND_NAME = 'দৈনিক স্বাস্থ্য';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Shared layout for every email. Inline styles only (most mail apps strip
 * <style>), colours from the design tokens (CLAUDE.md §7).
 * `bodyHtml` must already be escaped.
 */
export function wrapEmailHtml(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="bn"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f4f9f7;font-family:'Hind Siliguri',Arial,sans-serif;color:#12302b">
  <div style="max-width:480px;margin:0 auto;padding:24px 16px">
    <div style="font-size:20px;font-weight:700;color:#0f5c5a;margin-bottom:16px">${EMAIL_BRAND_NAME}</div>
    <div style="background:#ffffff;border:1px solid #d3e3dd;border-radius:12px;padding:24px">${bodyHtml}</div>
    <p style="font-size:12px;color:#546b65;margin-top:16px">আপনার প্রতিদিনের ডিজিটাল স্বাস্থ্যসেবা</p>
  </div>
</body></html>`;
}
