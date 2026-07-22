import { calculateDeficit, calculateTargets } from '../server/domain/nutrition';
import { calorieBudget, preference, rankFoods } from '../server/domain/recommendation';
import { mealContext } from '../server/domain/meal-planning';
import { withPortion } from '../server/domain/portion';
import type { FoodCandidate, NutritionProfile } from '../server/domain/types';
import { parseAdminAllowlist, requireRole, roleFor, trustedEmail, trustedName } from '../server/security/identity';
import { publicProfile, safeError, securityHeaders } from '../server/security/privacy';
import { validateFood, validateProfile } from '../server/domain/validation';

type Env = { DB: D1Database; ASSETS: Fetcher; ADMIN_EMAILS?: string; FOOD_DATA_URL?: string };
type User = NutritionProfile & { id: number; email: string; nickname: string; role: 'user' | 'admin'; allergens: string };

const schema = [
  `CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT NOT NULL UNIQUE,email TEXT UNIQUE,nickname TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user',age INTEGER,gender TEXT,height REAL,weight REAL,allergens TEXT DEFAULT '',calorie_goal REAL DEFAULT 2000,activity_level TEXT NOT NULL DEFAULT 'light',goal_type TEXT NOT NULL DEFAULT 'maintain',is_admin INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS foods(id INTEGER PRIMARY KEY AUTOINCREMENT,source_code TEXT UNIQUE,name TEXT NOT NULL,category TEXT,description TEXT,aliases TEXT DEFAULT '',unit TEXT DEFAULT '100g',calorie REAL DEFAULT 0,protein REAL DEFAULT 0,fat REAL DEFAULT 0,carb REAL DEFAULT 0,fiber REAL DEFAULT 0,allergens TEXT DEFAULT '',serving_g REAL,serving_label TEXT DEFAULT '1 份',serving_source TEXT,status INTEGER DEFAULT 0,uploader_id INTEGER,source_updated_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS records(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,food_id INTEGER NOT NULL,record_time TEXT DEFAULT CURRENT_TIMESTAMP,meal_type TEXT,portion REAL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS sync_state(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_records_user_time ON records(user_id,record_time)`,
  `CREATE INDEX IF NOT EXISTS idx_food_status ON foods(status)`
];
let initialized = false;
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: securityHeaders() });

async function initialize(db: D1Database) {
  if (initialized) return;
  await db.batch(schema.map(sql => db.prepare(sql)));
  const columns = (await db.prepare('PRAGMA table_info(foods)').all<{ name: string }>()).results.map(column => column.name);
  for (const [name, definition] of [['serving_g', 'REAL'], ['serving_label', "TEXT DEFAULT '1 份'"], ['serving_source', 'TEXT']] as const) if (!columns.includes(name)) await db.prepare(`ALTER TABLE foods ADD COLUMN ${name} ${definition}`).run();
  initialized = true;
}

async function currentUser(req: Request, env: Env): Promise<User | null> {
  const email = trustedEmail(req);
  if (!email) return null;
  const role = roleFor(email, parseAdminAllowlist(env.ADMIN_EMAILS));
  let user = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first<User>();
  if (!user) {
    await env.DB.prepare('INSERT INTO users(code,email,nickname,role,is_admin) VALUES(?,?,?,?,?)')
      .bind(email, email, trustedName(req, email), role, role === 'admin' ? 1 : 0).run();
  } else if (user.role !== role) {
    await env.DB.prepare('UPDATE users SET role=?,is_admin=? WHERE id=?').bind(role, role === 'admin' ? 1 : 0, user.id).run();
  }
  user = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first<User>();
  return user;
}

const requireUser = (user: User | null) => requireRole(user?.role, 'user');
const requireAdmin = (user: User | null) => requireRole(user?.role, 'admin');

async function recordSummary(db: D1Database, userId: number, date: string) {
  const items = (await db.prepare("SELECT r.id,r.portion,r.meal_type,r.record_time,f.id food_id,f.name,f.category,f.unit,f.calorie,f.protein,f.fat,f.carb,f.fiber FROM records r JOIN foods f ON f.id=r.food_id WHERE r.user_id=? AND date(r.record_time)=? ORDER BY r.record_time DESC").bind(userId, date).all<any>()).results;
  const total = { calorie: 0, protein: 0, fat: 0, carb: 0, fiber: 0 };
  for (const item of items) {
    const base = Number(String(item.unit || '100').match(/[\d.]+/)?.[0] || 100);
    const ratio = Number(item.portion || 0) / base;
    for (const key of Object.keys(total)) total[key as keyof typeof total] += Number(item[key] || 0) * ratio;
  }
  return { items, total };
}

async function recommendations(db: D1Database, user: User, date: string, mealCount: number, category: string, hour: number) {
  const recommended = calculateTargets(user), summary = await recordSummary(db, user.id, date);
  const deficit = calculateDeficit(recommended, summary.total as any);
  const history = (await db.prepare("SELECT f.protein,f.fat,f.carb,f.fiber,f.category FROM records r JOIN foods f ON f.id=r.food_id WHERE r.user_id=? AND r.record_time>=datetime('now','-30 days')").bind(user.id).all<FoodCandidate>()).results;
  const eaten = [...new Set(summary.items.map((item: any) => String(item.meal_type)))];
  const context = mealContext(hour, eaten, deficit.calories), budget = calorieBudget(deficit.calories, mealCount);
  const raw = (await db.prepare("SELECT id,name,category,unit,calorie,protein,fat,carb,fiber,allergens,serving_g,serving_label,serving_source FROM foods WHERE status=1 AND (?='' OR category=?) ORDER BY RANDOM() LIMIT 240").bind(category, category).all<FoodCandidate>()).results.map(withPortion);
  return { recommended, consumed: summary.total, deficit, context, foods: rankFoods(raw, user.allergens.split(','), preference(history), 24, budget) };
}

async function syncCatalog(env: Env, force = false) {
  if (!env.FOOD_DATA_URL) return;
  const last = await env.DB.prepare("SELECT updated_at FROM sync_state WHERE key='last_catalog_check'").first<{ updated_at: string }>();
  if (!force && last && Date.now() - Date.parse(last.updated_at + 'Z') < 6 * 3600000) return;
  await env.DB.prepare("INSERT INTO sync_state(key,value,updated_at) VALUES('last_catalog_check','checked',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run();
  const remote = await fetch(env.FOOD_DATA_URL, { headers: { accept: 'application/json' } });
  if (!remote.ok) throw new Error(`catalog fetch failed: ${remote.status}`);
  const data: any = await remote.json();
  if (!Array.isArray(data.foods) || !data.source_sha256) throw new Error('invalid normalized catalog');
  const known = await env.DB.prepare("SELECT value FROM sync_state WHERE key='food_source_sha256'").first<{ value: string }>();
  if (known?.value === data.source_sha256) return;
  for (let offset = 0; offset < data.foods.length; offset += 80) {
    const statements = data.foods.slice(offset, offset + 80).map((f: any) => { const portion = withPortion(f); return env.DB.prepare("INSERT INTO foods(source_code,name,category,description,aliases,unit,calorie,protein,fat,carb,fiber,allergens,serving_g,serving_label,serving_source,status,source_updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?) ON CONFLICT(source_code) DO UPDATE SET name=excluded.name,category=excluded.category,description=excluded.description,aliases=excluded.aliases,unit=excluded.unit,calorie=excluded.calorie,protein=excluded.protein,fat=excluded.fat,carb=excluded.carb,fiber=excluded.fiber,allergens=excluded.allergens,serving_g=COALESCE(foods.serving_g,excluded.serving_g),serving_label=COALESCE(foods.serving_label,excluded.serving_label),serving_source=COALESCE(foods.serving_source,excluded.serving_source),status=1,source_updated_at=excluded.source_updated_at")
      .bind(f.source_code, f.name, f.category, f.description || '', f.aliases || '', f.unit || '100g', +f.calorie || 0, +f.protein || 0, +f.fat || 0, +f.carb || 0, +f.fiber || 0, f.allergens || '', portion.serving_g, portion.serving_label, portion.serving_source, data.generated_at); });
    await env.DB.batch(statements);
  }
  await env.DB.prepare("INSERT INTO sync_state(key,value,updated_at) VALUES('food_source_sha256',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(data.source_sha256).run();
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      await initialize(env.DB);
      ctx.waitUntil(syncCatalog(env).catch(console.error));
      const path = url.pathname.slice(4), user = await currentUser(req, env);
      if (path === '/session') return response(user ? { authenticated: true, email: user.email, name: user.nickname, role: user.role } : { authenticated: false, signin: '/signin-with-chatgpt?return_to=/' });
      if (path === '/categories') return response((await env.DB.prepare("SELECT DISTINCT category FROM foods WHERE status=1 AND category<>'' ORDER BY category").all()).results.map((x: any) => x.category));
      if (path === '/foods' && req.method === 'GET') {
        const query = `%${url.searchParams.get('q') || ''}%`, category = url.searchParams.get('category') || '', pageSize = 36, page = Math.max(1, Math.floor(Number(url.searchParams.get('page')) || 1)), offset = (page - 1) * pageSize;
        const where = "status=1 AND (?='' OR category=?) AND (name LIKE ? OR aliases LIKE ?)", bindings = [category, category, query, query];
        const total = Number((await env.DB.prepare(`SELECT COUNT(*) count FROM foods WHERE ${where}`).bind(...bindings).first<any>())?.count || 0);
        const items = (await env.DB.prepare(`SELECT id,name,category,description,aliases,unit,calorie,protein,fat,carb,fiber,allergens,serving_g,serving_label,serving_source FROM foods WHERE ${where} ORDER BY name LIMIT ? OFFSET ?`).bind(...bindings, pageSize, offset).all<FoodCandidate>()).results.map(withPortion);
        return response({ items, pagination: { page, page_size: pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) } });
      }
      if (path === '/foods' && req.method === 'POST') {
        requireUser(user); const body = validateFood(await req.json());
        const portion = withPortion(body);
        await env.DB.prepare('INSERT INTO foods(name,category,description,unit,calorie,protein,fat,carb,fiber,allergens,serving_g,serving_label,serving_source,uploader_id,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)').bind(body.name, body.category, body.description, body.unit, body.calorie, body.protein, body.fat, body.carb, body.fiber, body.allergens, portion.serving_g, portion.serving_label, body.serving_g ? '使用者提供' : portion.serving_source, user!.id).run();
        return response({ ok: true }, 201);
      }
      if (path === '/foods/mine') { requireUser(user); return response((await env.DB.prepare('SELECT * FROM foods WHERE uploader_id=? ORDER BY created_at DESC').bind(user!.id).all()).results); }
      if (/^\/foods\/\d+$/.test(path) && req.method === 'DELETE') { requireUser(user); await env.DB.prepare('DELETE FROM foods WHERE id=? AND uploader_id=? AND status=0').bind(+path.split('/')[2], user!.id).run(); return response({ ok: true }); }
      if (path === '/profile' && req.method === 'GET') { requireUser(user); return response({ ...publicProfile(user! as any), targets: calculateTargets(user!) }); }
      if (path === '/profile' && req.method === 'PUT') {
        requireUser(user); const body = validateProfile(await req.json());
        await env.DB.prepare('UPDATE users SET nickname=COALESCE(?,nickname),age=?,gender=?,height=?,weight=?,allergens=?,activity_level=?,goal_type=? WHERE id=?').bind(body.nickname, body.age, body.gender, body.height, body.weight, body.allergens, body.activity_level, body.goal_type, user!.id).run();
        const updated = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user!.id).first<User>();
        return response({ ...publicProfile(updated! as any), targets: calculateTargets(updated!) });
      }
      if (path === '/records' && req.method === 'POST') {
        requireUser(user); const body: any = await req.json(), foodId = Number(body.food_id), portion = Number(body.portion ?? 100);
        if (!Number.isInteger(foodId) || foodId < 1 || !Number.isFinite(portion) || portion <= 0 || portion > 5000) throw Object.assign(new Error('飲食紀錄格式不正確'), { status: 400 });
        await env.DB.prepare('INSERT INTO records(user_id,food_id,meal_type,portion) VALUES(?,?,?,?)').bind(user!.id, foodId, String(body.meal_type || '正餐').slice(0, 20), portion).run();
        return response({ ok: true }, 201);
      }
      if (path === '/records' && req.method === 'GET') { requireUser(user); return response(await recordSummary(env.DB, user!.id, url.searchParams.get('date') || new Date().toISOString().slice(0, 10))); }
      if (/^\/records\/\d+$/.test(path) && req.method === 'DELETE') { requireUser(user); await env.DB.prepare('DELETE FROM records WHERE id=? AND user_id=?').bind(+path.split('/')[2], user!.id).run(); return response({ ok: true }); }
      if (path === '/recommendations') { requireUser(user); const hour = Number(url.searchParams.get('hour')); return response(await recommendations(env.DB, user!, url.searchParams.get('date') || new Date().toISOString().slice(0, 10), Math.max(1, +url.searchParams.get('meal_count')! || 1), String(url.searchParams.get('category') || '').slice(0, 50), Number.isFinite(hour) ? hour : new Date().getHours())); }
      if (path === '/review/pending') { requireAdmin(user); return response((await env.DB.prepare('SELECT f.*,u.nickname FROM foods f LEFT JOIN users u ON u.id=f.uploader_id WHERE f.status=0 ORDER BY f.created_at').all()).results); }
      if (/^\/review\/\d+$/.test(path) && req.method === 'PUT') { requireAdmin(user); const body: any = await req.json(); await env.DB.prepare('UPDATE foods SET status=? WHERE id=?').bind(body.status === 1 ? 1 : -1, +path.split('/')[2]).run(); return response({ ok: true }); }
      if (/^\/admin\/foods\/\d+$/.test(path) && req.method === 'DELETE') { requireAdmin(user); const foodId = +path.split('/')[3]; await env.DB.batch([env.DB.prepare('DELETE FROM records WHERE food_id=?').bind(foodId), env.DB.prepare('DELETE FROM foods WHERE id=?').bind(foodId)]); return response({ ok: true }); }
      if (path === '/admin/sync' && req.method === 'POST') { requireAdmin(user); await syncCatalog(env, true); return response({ ok: true }); }
      return response({ error: '找不到此 API' }, 404);
    } catch (error) {
      const safe = safeError(error);
      return response({ error: safe.message }, safe.status);
    }
  }
};
