import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { URL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const PORT = Number(process.env.PORT || 8787);
const dbFile = new URL('./blisko.local.json', import.meta.url);
const testProfile = {
  id: 900000001,
  name: 'София',
  age: 26,
  city: 'Warszawa',
  distance: 'рядом с вами',
  bio: 'Тестовый профиль BLISKO для проверки ленты, лайков и чата.',
  tags: ['кофе', 'путешествия', 'музыка'],
  image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&q=85',
  gender: 'female',
  interestedIn: 'all',
  online: true,
};
const profiles = [testProfile];
const sessions = new Map();
const userProfiles = new Map();
const userState = new Map();
const messages = new Map();
const notifications = new Map();
let supabase = null;
let supabaseReady = false;
const conversationKey = (firstId, secondId) => [Number(firstId), Number(secondId)].sort((a, b) => a - b).join(':');
const numericIds = (values) => (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
function supabaseClient() {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return supabase;
}
async function remoteRows(table, query = {}) {
  const client = supabaseClient();
  if (!client) return null;
  const { data, error } = await client.from(table).select(query.select || '*').match(query.match || {}).order(query.order || 'updated_at', { ascending: false });
  if (error) throw new Error(`Supabase ${table}: ${error.message}`);
  return data || [];
}
async function remoteUpsert(table, value) {
  const client = supabaseClient();
  if (!client) return false;
  const { error } = await client.from(table).upsert(value);
  if (error) throw new Error(`Supabase ${table}: ${error.message}`);
  return true;
}
async function loadSupabaseDatabase() {
  if (!supabaseClient()) return;
  const [profileRows, stateRows, messageRows, notificationRows] = await Promise.all([
    remoteRows('blisko_profiles'),
    remoteRows('blisko_user_state'),
    remoteRows('blisko_messages', { order: 'created_at' }),
    remoteRows('blisko_notifications', { order: 'created_at' }),
  ]);
  for (const profile of profileRows) userProfiles.set(String(profile.id), { ...profile, id: Number(profile.id), tags: Array.isArray(profile.tags) ? profile.tags : [], gender: profile.gender || 'female', interestedIn: profile.interested_in || 'all', updated_at: undefined });
  for (const row of stateRows) userState.set(String(row.user_id), { likes: new Set(numericIds(row.likes)), skips: new Set(numericIds(row.skips)) });
  for (const row of messageRows) {
    const key = conversationKey(row.user_id, row.profile_id);
    if (!messages.has(key)) messages.set(key, []);
    messages.get(key).push({ id: row.id, senderId: String(/^\d+$/.test(String(row.sender)) ? row.sender : row.user_id), text: row.text, createdAt: row.created_at });
  }
  for (const row of notificationRows) {
    const key = String(row.user_id);
    if (!notifications.has(key)) notifications.set(key, []);
    notifications.get(key).push({ id: row.id, type: row.type, title: row.title, body: row.body, relatedId: row.related_id, createdAt: row.created_at });
  }
  supabaseReady = true;
}
async function remoteProfile(profile) {
  if (!supabaseReady) return;
  await remoteUpsert('blisko_profiles', { ...profile, id: String(profile.id), tags: profile.tags || [], gender: profile.gender, interested_in: profile.interestedIn, updated_at: new Date().toISOString() });
}
async function remoteState(userId, state) {
  if (!supabaseReady) return;
  await remoteUpsert('blisko_user_state', { user_id: String(userId), likes: [...state.likes], skips: [...state.skips], updated_at: new Date().toISOString() });
}
async function remoteNotification(userId, notification) {
  if (!supabaseReady) return;
  await remoteUpsert('blisko_notifications', { id: notification.id, user_id: String(userId), type: notification.type, title: notification.title, body: notification.body, related_id: notification.relatedId || null, created_at: notification.createdAt });
}
async function remoteMessage(userId, profileId, message) {
  if (!supabaseReady) return;
  await remoteUpsert('blisko_messages', { id: message.id, user_id: String(userId), profile_id: String(profileId), sender: message.senderId, text: message.text, created_at: message.createdAt });
}
async function loadDatabase() {
  try {
    const saved = JSON.parse(await readFile(dbFile, 'utf8'));
    for (const [key, profile] of Object.entries(saved.userProfiles || {})) userProfiles.set(key, profile);
    for (const [key, value] of Object.entries(saved.userState || {})) userState.set(key, { likes: new Set(numericIds(value.likes)), skips: new Set(numericIds(value.skips)) });
    for (const [key, value] of Object.entries(saved.messages || {})) messages.set(key, value);
    for (const [key, value] of Object.entries(saved.notifications || {})) notifications.set(key, value);
  } catch { /* first run creates the local database */ }
}
function saveDatabase() {
  return writeFile(dbFile, JSON.stringify({
    userProfiles: Object.fromEntries(userProfiles),
    userState: Object.fromEntries([...userState].map(([key, value]) => [key, { likes: [...value.likes], skips: [...value.skips] }])),
    messages: Object.fromEntries(messages),
    notifications: Object.fromEntries(notifications),
  }, null, 2), 'utf8');
}
const stateFor = (user) => {
  const key = String(user.id);
  if (!userState.has(key)) userState.set(key, { likes: new Set(), skips: new Set() });
  return userState.get(key);
};
const profileFor = (user) => userProfiles.get(String(user.id));

async function loadDotEnv() {
  try {
    const text = await readFile(new URL('./.env', import.meta.url), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*?)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch { /* optional */ }
}
function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET,PUT,POST,OPTIONS' });
  response.end(JSON.stringify(body));
}
function validateInitData(initData) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || typeof initData !== 'string' || !initData) return null;
  const params = new URLSearchParams(initData); const receivedHash = params.get('hash');
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const expected = createHmac('sha256', secret).update(check).digest('hex');
  if (!timingSafeEqual(Buffer.from(receivedHash, 'hex'), Buffer.from(expected, 'hex'))) return null;
  if (Math.abs(Date.now() / 1000 - Number(params.get('auth_date'))) > 86400) return null;
  try { return JSON.parse(params.get('user') || '{}'); } catch { return null; }
}
const userFromRequest = (request) => sessions.get(request.headers.authorization?.replace(/^Bearer\s+/i, ''));
async function body(request) {
  let raw = ''; for await (const chunk of request) raw += chunk;
  if (!raw) return {}; try { return JSON.parse(raw); } catch { return null; }
}
async function telegramBotInfo() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { configured: false };
  const result = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const payload = await result.json();
  if (!payload.ok) return { configured: true, valid: false };
  return { configured: true, valid: true, id: payload.result.id, username: payload.result.username };
}
function conversationsFor(user) {
  const state = stateFor(user);
  const likedIds = [...state.likes].map(Number);
  const messageIds = [...messages.keys()]
    .filter((key) => key.split(':').includes(String(user.id)))
    .map((key) => key.split(':').map(Number).find((id) => id !== Number(user.id)));
  const ids = [...new Set([testProfile.id, ...likedIds, ...messageIds])];
  return ids.map((id) => {
    const p = [...profiles, ...userProfiles.values()].find((profile) => profile.id === Number(id));
    if (!p) return null;
    return { id: Number(id), profileId: p.id, name: p.name, avatar: p.image, last: (messages.get(conversationKey(user.id, id)) || []).at(-1)?.text || 'Начните общение', time: 'сейчас', unread: 0, online: p.online };
  });
}
function allProfiles() {
  return [...profiles, ...userProfiles.values()];
}
function profileById(id) {
  return allProfiles().find((profile) => Number(profile.id) === Number(id));
}
function notificationFor(userId) {
  const key = String(userId);
  if (!notifications.has(key)) notifications.set(key, []);
  return notifications.get(key);
}
function hasNotification(userId, type, relatedId) {
  return notificationFor(userId).some((item) => item.type === type && item.relatedId === String(relatedId));
}
async function addNotification(userId, notification) {
  const list = notificationFor(userId);
  list.unshift(notification);
  await remoteNotification(userId, notification);
}
async function handle(request, response) {
  if (request.method === 'OPTIONS') return json(response, 204, {});
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/api/health') return json(response, 200, { ok: true, service: 'blisko-api' });
  if (request.method === 'GET' && url.pathname === '/api/telegram/status') {
    try { return json(response, 200, await telegramBotInfo()); } catch { return json(response, 503, { configured: true, valid: false }); }
  }
  if (request.method === 'POST' && url.pathname === '/api/auth/telegram') {
    const payload = await body(request); if (payload === null) return json(response, 400, { error: 'Invalid JSON' });
    if (typeof payload.initData !== 'string' || !payload.initData) return json(response, 401, { error: 'Telegram initData is required' });
    const user = payload.initData ? validateInitData(payload.initData) : { id: payload.userId || 1001, first_name: 'Алекс', username: 'demo' };
    if (!user) return json(response, 401, { error: 'Invalid Telegram initData' });
    const accessToken = randomUUID(); sessions.set(accessToken, { id: user.id, first_name: user.first_name || 'Пользователь', username: user.username });
    return json(response, 200, { accessToken, user, profile: profileFor(user) || null });
  }
  const user = userFromRequest(request); if (!user) return json(response, 401, { error: 'Authentication required' });
  const state = stateFor(user);
  const userNotifications = notifications.get(String(user.id)) || [];
  notifications.set(String(user.id), userNotifications);
  if (url.pathname === '/api/profile' && request.method === 'GET') return json(response, 200, { profile: profileFor(user) || { id: user.id, name: user.first_name, age: 27, city: 'Москва', bio: '', tags: [], image: '' } });
  if (url.pathname === '/api/profile' && ['POST', 'PUT'].includes(request.method)) {
    const payload = await body(request); if (!payload?.name?.trim()) return json(response, 400, { error: 'Name is required' });
    const profile = { id: user.id, name: payload.name.trim(), age: Number(payload.age) || 18, city: payload.city || 'Москва', distance: 'рядом с вами', bio: payload.bio || '', tags: Array.isArray(payload.tags) ? payload.tags : String(payload.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean), image: payload.image || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=85', gender: payload.gender === 'male' ? 'male' : 'female', interestedIn: ['male', 'female', 'all'].includes(payload.interestedIn) ? payload.interestedIn : 'all', online: true };
    userProfiles.set(String(user.id), profile); await saveDatabase(); await remoteProfile(profile); return json(response, 200, { profile });
  }
  if (request.method === 'GET' && (url.pathname === '/api/discover' || url.pathname === '/api/profiles')) {
    const ownCity = profileFor(user)?.city;
    const nearby = new Set(['Warszawa', 'Nowy Dwór Mazowiecki']);
    const visible = [...profiles, ...userProfiles.values()].filter((p) => {
      const sameArea = !ownCity || !p.city || p.city === ownCity || (nearby.has(ownCity) && nearby.has(p.city));
      const genderMatches = !profileFor(user)?.interestedIn || profileFor(user).interestedIn === 'all' || p.gender === profileFor(user).interestedIn;
      const isTestProfile = Number(p.id) === testProfile.id;
      return Number(p.id) !== Number(user.id) && (isTestProfile || (sameArea && genderMatches)) && !state.skips.has(p.id) && !state.likes.has(p.id);
    });
    return json(response, 200, { profiles: visible });
  }
  if (request.method === 'POST' && url.pathname === '/api/discover/skip') { const id = Number((await body(request))?.profileId); state.skips.add(id); await saveDatabase(); await remoteState(user.id, state); return json(response, 200, { skipped: true, profileId: id }); }
  if (request.method === 'GET' && url.pathname === '/api/likes') return json(response, 200, { likes: [...state.likes].map(Number), profiles: allProfiles().filter((p) => state.likes.has(p.id)) });
  if (request.method === 'GET' && url.pathname === '/api/notifications') return json(response, 200, { notifications: userNotifications });
  if (request.method === 'POST' && url.pathname === '/api/likes') {
    const id = Number((await body(request))?.profileId);
    const target = profileById(id);
    if (!target) return json(response, 400, { error: 'Unknown profileId' });
    state.likes.add(id);
    const now = new Date().toISOString();
    const ownNotification = { id: randomUUID(), type: 'like', title: 'Лайк сохранён', body: 'Профиль добавлен в твои лайки', relatedId: String(id), createdAt: now };
    if (!hasNotification(user.id, 'like', id)) await addNotification(user.id, ownNotification);
    const targetState = stateFor({ id });
    const matched = targetState.likes.has(Number(user.id));
    if (targetState && !hasNotification(id, 'like_received', user.id)) {
      await addNotification(id, { id: randomUUID(), type: matched ? 'match' : 'like_received', title: matched ? 'Взаимная симпатия' : 'Новый лайк', body: matched ? `У вас взаимная симпатия с ${profileFor(user)?.name || 'пользователем'}` : `${profileFor(user)?.name || 'Кто-то'} отметил твою анкету`, relatedId: String(user.id), createdAt: now });
    }
    if (matched && !hasNotification(user.id, 'match', id)) {
      await addNotification(user.id, { id: randomUUID(), type: 'match', title: 'Взаимная симпатия', body: `У вас взаимная симпатия с ${target.name}`, relatedId: String(id), createdAt: now });
    }
    await saveDatabase();
    await remoteState(user.id, state);
    if (matched) await remoteState(id, targetState);
    return json(response, 201, { liked: true, matched, profileId: id });
  }
  if (request.method === 'GET' && url.pathname === '/api/matches') {
    const matches = allProfiles().filter((candidate) => state.likes.has(candidate.id) && stateFor({ id: candidate.id }).likes.has(Number(user.id)));
    return json(response, 200, { matches });
  }
  if (request.method === 'GET' && url.pathname === '/api/conversations') return json(response, 200, { conversations: conversationsFor(user) });
  const match = url.pathname.match(/^\/api\/conversations\/(\d+)\/messages$/);
  if (match) {
    const id = Number(match[1]); if (!state.likes.has(id)) return json(response, 404, { error: 'Conversation not found' });
    const key = conversationKey(user.id, id); if (!messages.has(key)) messages.set(key, []);
    if (request.method === 'GET') return json(response, 200, { messages: messages.get(key).map((message) => ({ ...message, sender: String(message.senderId) === String(user.id) ? 'me' : 'them' })) });
    if (request.method === 'POST') { const payload = await body(request); if (!payload?.text?.trim()) return json(response, 400, { error: 'Message text is required' }); const message = { id: randomUUID(), senderId: String(user.id), text: payload.text.trim(), createdAt: new Date().toISOString() }; messages.get(key).push(message); await saveDatabase(); await remoteMessage(user.id, id, message); return json(response, 201, { message: { ...message, sender: 'me' } }); }
  }
  return json(response, 404, { error: 'Not found' });
}
await loadDotEnv();
await loadDatabase();
try { await loadSupabaseDatabase(); console.log('BLISKO Supabase persistence enabled'); } catch (error) { console.warn(`Supabase unavailable, using local persistence: ${error.message}`); }
http.createServer((request, response) => handle(request, response).catch((error) => { console.error(error); json(response, 500, { error: 'Internal server error' }); })).listen(PORT, '0.0.0.0', () => console.log(`BLISKO API listening on http://127.0.0.1:${PORT}`));
