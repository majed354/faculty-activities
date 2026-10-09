import { createHmac, timingSafeEqual } from 'node:crypto';
import { normalizeProfile } from './cv-schema.mjs';

const COOKIE = 'academic_cv_session';
const MAX_BYTES = 250000;
const equal = (a, b) => {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && timingSafeEqual(left, right);
};
const json = (body, status = 200, extra = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', ...extra } });

export function createCvHandler({ openStore, roster, getEnv, now = () => Date.now() }) {
  const ids = new Set(roster);
  const sign = data => createHmac('sha256', getEnv('CV_SESSION_SECRET')).update(data).digest('base64url');
  const session = request => {
    const match = (request.headers.get('cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`));
    if (!match) return null;
    const [payload, signature] = match.slice(COOKIE.length + 1).split('.');
    if (!payload || !signature || !equal(signature, sign(payload))) return null;
    try {
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString());
      return ids.has(parsed.id) && parsed.expires > now() ? parsed : null;
    } catch { return null; }
  };

  return async request => {
    if (!['GET', 'POST'].includes(request.method)) return json({ message: 'طريقة الطلب غير مدعومة.' }, 405, { Allow: 'GET, POST' });
    if (!getEnv('CV_SESSION_SECRET') || !getEnv('CV_LOGIN_PASSWORD') || !getEnv('CV_ADMIN_PASSWORD')) {
      return json({ message: 'خدمة حفظ السير غير مهيأة بعد.' }, 503);
    }
    try {
      if (request.method === 'POST') {
        const origin = request.headers.get('origin');
        if (origin && origin !== new URL(request.url).origin) return json({ message: 'الطلب من مصدر غير مسموح.' }, 403);
        if (Number(request.headers.get('content-length') || 0) > MAX_BYTES) return json({ message: 'حجم السيرة أكبر من الحد المسموح.' }, 413);
        const raw = await request.text();
        if (Buffer.byteLength(raw) > MAX_BYTES) return json({ message: 'حجم السيرة أكبر من الحد المسموح.' }, 413);
        let body;
        try { body = JSON.parse(raw); } catch { return json({ message: 'بيانات الطلب غير صالحة.' }, 400); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ message: 'بيانات الطلب غير صالحة.' }, 400);
        if (body.action === 'login') {
          const id = String(body.employeeId || '').trim();
          if (!ids.has(id) || !equal(body.password, getEnv('CV_LOGIN_PASSWORD'))) return json({ message: 'رقم العضو أو كلمة مرور الدخول غير صحيحة.' }, 401);
          const payload = Buffer.from(JSON.stringify({ id, expires: now() + 8 * 3600000 })).toString('base64url');
          const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
          return json({ ok: true, employeeId: id }, 200, { 'Set-Cookie': `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure}` });
        }
        if (body.action === 'logout') {
          return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` });
        }
        const actor = session(request);
        if (!actor) return json({ message: 'أعد تسجيل الدخول لتفعيل بيانات السيرة المحفوظة.' }, 401);
        if (body.action !== 'save') return json({ message: 'عملية غير مدعومة.' }, 400);
        const id = String(body.employeeId || '').trim();
        if (!ids.has(id)) return json({ message: 'العضو غير موجود في السجل.' }, 400);
        if (actor.id !== id && !equal(body.privilegePassword, getEnv('CV_ADMIN_PASSWORD'))) {
          return json({ message: 'حفظ سيرة عضو آخر يتطلب كلمة مرور الصلاحيات.' }, 403);
        }
        let profile;
        try { profile = normalizeProfile(body.profile); } catch (error) { return json({ message: error.message }, 400); }
        profile.updatedAt = new Date(now()).toISOString();
        const expected = String(body.expectedEtag || '');
        const store = openStore();
        const saved = await store.setJSON(`member-${id}`, { profile, updatedBy: actor.id }, expected ? { onlyIfMatch: expected } : { onlyIfNew: true });
        if (!saved.modified) return json({ message: 'تغيرت السيرة المحفوظة منذ فتحها. حمّل النسخة الأحدث قبل الحفظ لتجنب استبدال تعديل آخر.' }, 409);
        return json({ ok: true, employeeId: id, profile, etag: saved.etag });
      }
      const actor = session(request);
      if (!actor) return json({ message: 'أعد تسجيل الدخول لتفعيل بيانات السيرة المحفوظة.' }, 401);
      const requested = [...new Set((new URL(request.url).searchParams.get('ids') || '').split(',').filter(Boolean))];
      if (requested.length > 100 || requested.some(id => !ids.has(id))) return json({ message: 'قائمة الأعضاء غير صالحة.' }, 400);
      const store = openStore();
      const records = await Promise.all(requested.map(async id => {
        const record = await store.getWithMetadata(`member-${id}`, { type: 'json' });
        return { employeeId: id, profile: record ? normalizeProfile(record.data.profile) : normalizeProfile(), etag: record?.etag || '' };
      }));
      return json({ ok: true, employeeId: actor.id, records });
    } catch (error) {
      console.error('Academic CV storage error:', error.message);
      return json({ message: 'تعذر الاتصال بحفظ السير. لم يتم تأكيد الحفظ؛ احتفظ بتعديلاتك وأعد المحاولة.' }, 503);
    }
  };
}
