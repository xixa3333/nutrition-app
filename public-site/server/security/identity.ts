export type Role = 'user' | 'admin';
export function trustedEmail(request: Request) { return (request.headers.get('oai-authenticated-user-email') || '').trim().toLowerCase(); }
export function trustedName(request: Request, email: string) { const raw = request.headers.get('oai-authenticated-user-full-name'); if (raw && request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') { try { return decodeURIComponent(raw).slice(0, 80); } catch {} } return email.split('@')[0]; }
export function parseAdminAllowlist(value?: string) { return new Set((value || '').split(',').map(x => x.trim().toLowerCase()).filter(x => /^[-.\w]+@[-.\w]+\.[a-z]{2,}$/i.test(x))); }
export function roleFor(email: string, allowlist: Set<string>): Role { return email && allowlist.has(email.toLowerCase()) ? 'admin' : 'user'; }
export function requireRole(current: Role | undefined, required: Role) { if (!current) throw Object.assign(new Error('請先使用可信登入'), { status: 401 }); if (required === 'admin' && current !== 'admin') throw Object.assign(new Error('只有管理者可執行此操作'), { status: 403 }); }
