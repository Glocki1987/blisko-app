import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { URL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const PORT = Number(process.env.PORT || 8787);
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const TELEGRAM_INIT_DATA_TTL_MS = 60 * 60 * 1000;
const RANDOM_ROOM_TTL_MS = 30 * 60 * 1000;
const AUTH_RATE_LIMIT = 20;
const AUTH_RATE_WINDOW_MS = 5 * 60 * 1000;
const dbFile = new URL('./blisko.local.json', import.meta.url);
const demoProfileIds = new Set(['900000001', '987654']);
const sessions = new Map();
const userProfiles = new Map();
const userState = new Map();
const messages = new Map();
const notifications = new Map();
const randomRooms = new Map();
const requestWindows = new Map();
const authWindows = new Map();
let supabase = null;
let supabaseReady = false;
const conversationKey = (firstId, secondId) => [Number(firstId), Number(secondId)].sort((a, b) => a - b).join(':');
const numericIds = (values) => (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
function cleanupRandomRooms() {
  const now = Date.now();
  const validProfileIds = new Set(allProfiles().map((profile) => String(profile.id)));
  for (const [userId, room] of randomRooms) {
    if (room.expiresAt <= now || !validProfileIds.has(String(userId)) || !validProfileIds.has(String(room.id))) randomRooms.delete(userId);
  }
}
function cleanupRuntimeState() {
  const now = Date.now();
  for (const [token, session] of sessions) if (session.expiresAt <= now) sessions.delete(token);
  for (const [key, timestamps] of requestWindows) {
    const recent = timestamps.filter((timestamp) => now - timestamp < 60_000);
    if (recent.length) requestWindows.set(key, recent); else requestWindows.delete(key);
  }
  for (const [address, timestamps] of authWindows) {
    const recent = timestamps.filter((timestamp) => now - timestamp < AUTH_RATE_WINDOW_MS);
    if (recent.length) authWindows.set(address, recent); else authWindows.delete(address);
  }
}
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
async function remoteProfileById(id) {
  const client = supabaseClient();
  if (!client) return null;
  const { data, error } = await client.from('blisko_profiles').select('*').eq('id', String(id)).maybeSingle();
  if (error) throw new Error(`Supabase blisko_profiles: ${error.message}`);
  if (!data) return null;
  return { ...data, id: Number(data.id), tags: Array.isArray(data.tags) ? data.tags : [], gender: data.gender || 'female', interestedIn: data.interested_in || 'all', datingMode: data.dating_mode || 'friends' };
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
  for (const profile of profileRows) userProfiles.set(String(profile.id), { ...profile, id: Number(profile.id), tags: Array.isArray(profile.tags) ? profile.tags : [], gender: profile.gender || 'female', interestedIn: profile.interested_in || 'all', datingMode: profile.dating_mode || 'friends', updated_at: profile.updated_at || new Date().toISOString() });
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
  if (!supabaseClient()) return;
  await remoteUpsert('blisko_profiles', {
    id: String(profile.id),
    name: profile.name,
    age: Number(profile.age),
    city: profile.city,
    distance: profile.distance || 'рядом с вами',
    bio: profile.bio || '',
    tags: profile.tags || [],
    image: profile.image || '',
    gender: profile.gender,
    interested_in: profile.interestedIn,
    dating_mode: profile.datingMode || 'friends',
    online: profile.online !== false,
    updated_at: new Date().toISOString(),
  });
}
async function remoteDeleteProfile(userId) {
  const client = supabaseClient();
  if (!client) return;
  for (const [table, column] of [['blisko_profiles', 'id'], ['blisko_user_state', 'user_id'], ['blisko_messages', 'user_id'], ['blisko_notifications', 'user_id']]) {
    const { error } = await client.from(table).delete().eq(column, String(userId));
    if (error) throw new Error(`Supabase ${table}: ${error.message}`);
  }
  const { error: relatedMessagesError } = await client.from('blisko_messages').delete().eq('profile_id', String(userId));
  if (relatedMessagesError) throw new Error(`Supabase blisko_messages: ${relatedMessagesError.message}`);
}
async function removeDemoData() {
  const demoIds = [...demoProfileIds];
  const demoNumbers = new Set(demoIds.map(Number));
  for (const id of demoIds) {
    userProfiles.delete(id);
    userState.delete(id);
    notifications.delete(id);
  }
  for (const state of userState.values()) {
    for (const id of [...state.likes]) if (demoNumbers.has(Number(id))) state.likes.delete(id);
    for (const id of [...state.skips]) if (demoNumbers.has(Number(id))) state.skips.delete(id);
  }
  for (const list of notifications.values()) {
    for (let index = list.length - 1; index >= 0; index -= 1) {
      if (demoIds.includes(String(list[index].relatedId))) list.splice(index, 1);
    }
  }
  for (const key of [...messages.keys()]) {
    if (demoIds.some((id) => key.split(':').includes(id))) messages.delete(key);
  }
  if (!supabaseClient()) return;
  for (const id of demoIds) await remoteDeleteProfile(id);
  for (const [userId, state] of userState) await remoteState(userId, state);
  for (const demoId of demoIds) {
    const { error } = await supabase.from('blisko_notifications').delete().eq('related_id', demoId);
    if (error) throw new Error(`Supabase blisko_notifications cleanup: ${error.message}`);
  }
}
async function remoteState(userId, state) {
  if (!supabaseClient()) return;
  await remoteUpsert('blisko_user_state', { user_id: String(userId), likes: [...state.likes], skips: [...state.skips], updated_at: new Date().toISOString() });
}
async function remoteNotification(userId, notification) {
  if (!supabaseClient()) return;
  await remoteUpsert('blisko_notifications', { id: notification.id, user_id: String(userId), type: notification.type, title: notification.title, body: notification.body, related_id: notification.relatedId || null, created_at: notification.createdAt });
}
async function remoteMessage(userId, profileId, message) {
  if (!supabaseClient()) return;
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
function profileFor(user) {
  const profile = userProfiles.get(String(user.id));
  if (!profile || !Number.isInteger(Number(profile.age)) || Number(profile.age) < 18 || Number(profile.age) > 100) return undefined;
  return profile;
}
function validateProfileImage(value) {
  if (value === '') return true;
  if (typeof value !== 'string' || value.length > 1_000_000) return false;
  if (/^https:\/\//i.test(value)) return value.length <= 2_048;
  return /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(value);
}

async function loadDotEnv() {
  try {
    const text = await readFile(new URL('./.env', import.meta.url), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*?)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch { /* optional */ }
}
function allowedOrigins() {
  return new Set([
    process.env.WEB_APP_ORIGIN,
    process.env.TELEGRAM_WEBAPP_URL,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ].filter(Boolean));
}
function json(response, status, body) {
  const origin = response.getHeader('access-control-allow-origin');
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'DELETE,GET,PUT,POST,OPTIONS', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'permissions-policy': 'geolocation=(), camera=(), microphone=()' };
  if (origin) {
    headers['access-control-allow-origin'] = origin;
    headers.vary = 'Origin';
  }
  response.writeHead(status, headers);
  response.end(JSON.stringify(body));
}
function limited(userId, action, maxRequests, windowMs) {
  const key = `${userId}:${action}`;
  const now = Date.now();
  const recent = (requestWindows.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= maxRequests) {
    requestWindows.set(key, recent);
    return true;
  }
  function limitedAuth(request) {
    const address = request.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const recent = (authWindows.get(address) || []).filter((timestamp) => now - timestamp < AUTH_RATE_WINDOW_MS);
    if (recent.length >= AUTH_RATE_LIMIT) {
      authWindows.set(address, recent);
      return true;
    }
    recent.push(now);
    authWindows.set(address, recent);
    return false;
  }
  recent.push(now);
  requestWindows.set(key, recent);
  return false;
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
  const authDate = Number(params.get('auth_date'));
  const authAge = Date.now() - authDate * 1000;
  if (!Number.isInteger(authDate) || authAge < 0 || authAge > TELEGRAM_INIT_DATA_TTL_MS) return null;
  try {
    const user = JSON.parse(params.get('user') || '{}');
    return Number.isSafeInteger(Number(user.id)) && Number(user.id) > 0 ? user : null;
  } catch { return null; }
}
function userFromRequest(request) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}
async function body(request) {
  let raw = ''; for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 1_000_000) return null;
  }
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
async function notifyTelegramMessage(chatId, senderName, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webAppUrl = process.env.TELEGRAM_WEBAPP_URL;
  if (!token || !chatId) return;
  const preview = text.startsWith('data:image/') ? '📷 Фото' : text.startsWith('data:audio/') ? '🎙 Голосовое сообщение' : text.length > 180 ? `${text.slice(0, 177)}...` : text;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `💬 Новое сообщение от ${senderName}\n\n${preview}`,
        reply_markup: webAppUrl ? { inline_keyboard: [[{ text: '💘 Открыть BLISKO', web_app: { url: webAppUrl } }]] } : undefined,
      }),
    });
    const result = await response.json();
    if (!result.ok) console.warn(`Telegram message notification failed: ${result.description || 'unknown error'}`);
  } catch (error) {
    console.warn(`Telegram message notification unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function conversationsFor(user) {
  const state = stateFor(user);
  const likedIds = [...state.likes].map(Number).filter((id) => stateFor({ id }).likes.has(Number(user.id)));
  const messageIds = [...messages.keys()]
    .filter((key) => key.split(':').includes(String(user.id)))
    .map((key) => key.split(':').map(Number).find((id) => id !== Number(user.id)))
    .filter((id) => state.likes.has(id) && stateFor({ id }).likes.has(Number(user.id)));
  const ids = [...new Set([...likedIds, ...messageIds])];
  return ids.map((id) => {
    const p = allProfiles().find((profile) => profile.id === Number(id));
    if (!p) return null;
    return { id: Number(id), profileId: p.id, name: p.name, avatar: p.image, last: (messages.get(conversationKey(user.id, id)) || []).at(-1)?.text || 'Начните общение', time: 'сейчас', unread: 0, online: isRecentlyActive(p) };
  });
}
function allProfiles() {
  const unique = new Map();
  for (const profile of userProfiles.values()) {
    const age = Number(profile.age);
    if (Number.isSafeInteger(Number(profile.id)) && Number(profile.id) > 0 && Number.isInteger(age) && age >= 18 && age <= 100) unique.set(String(profile.id), profile);
  }
  return [...unique.values()];
}
const isRecentlyActive = (profile) => {
  const updatedAt = Date.parse(profile.updated_at || '');
  return Number.isFinite(updatedAt) && Date.now() - updatedAt < 5 * 60 * 1000;
};
const profilesWithPresence = () => allProfiles().map((profile) => ({ ...profile, online: isRecentlyActive(profile) }));
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
  cleanupRuntimeState();
  cleanupRandomRooms();
  const requestOrigin = request.headers.origin;
  if (requestOrigin && allowedOrigins().has(requestOrigin)) response.setHeader('access-control-allow-origin', requestOrigin);
  if (request.method === 'OPTIONS') return json(response, 204, {});
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/api/health') return json(response, 200, { ok: true, service: 'blisko-api' });
  if (request.method === 'GET' && url.pathname === '/api/telegram/status') {
    try { return json(response, 200, await telegramBotInfo()); } catch { return json(response, 503, { configured: true, valid: false }); }
  }
  if (request.method === 'POST' && url.pathname === '/api/auth/telegram') {
    if (limitedAuth(request)) return json(response, 429, { error: 'Too many authentication attempts. Try again shortly.' });
    const payload = await body(request); if (payload === null) return json(response, 400, { error: 'Invalid JSON' });
    if (typeof payload.initData !== 'string' || !payload.initData || payload.initData.length > 10_000) return json(response, 401, { error: 'Invalid Telegram initData' });
    const user = validateInitData(payload.initData || '');
    if (!user) return json(response, 401, { error: 'Invalid Telegram initData' });
    if (!profileFor(user) && supabaseClient()) {
      const storedProfile = await remoteProfileById(user.id);
      if (storedProfile) userProfiles.set(String(user.id), storedProfile);
    }
    const accessToken = randomUUID(); sessions.set(accessToken, { id: user.id, first_name: user.first_name || 'Пользователь', username: user.username, expiresAt: Date.now() + SESSION_TTL_MS });
    return json(response, 200, { accessToken, user, profile: profileFor(user) || null });
  }
  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (token) sessions.delete(token);
    return json(response, 200, { loggedOut: true });
  }
  const user = userFromRequest(request); if (!user) return json(response, 401, { error: 'Authentication required' });
  if (limited(user.id, `${request.method}:${url.pathname}`, 60, 60_000)) return json(response, 429, { error: 'Too many requests. Try again shortly.' });
  const state = stateFor(user);
  const userNotifications = notifications.get(String(user.id)) || [];
  notifications.set(String(user.id), userNotifications);
  if (request.method === 'POST' && url.pathname === '/api/presence') {
    const profile = profileFor(user);
    if (!profile) return json(response, 404, { error: 'Profile not found' });
    profile.online = true;
    profile.updated_at = new Date().toISOString();
    userProfiles.set(String(user.id), profile);
    await saveDatabase();
    await remoteProfile(profile);
    return json(response, 200, { online: true });
  }
  if (url.pathname === '/api/profile' && request.method === 'GET') return json(response, 200, { profile: profileFor(user) || { id: user.id, name: user.first_name || '', age: 18, city: '', distance: '', bio: '', tags: [], image: '', gender: 'female', interestedIn: 'all', datingMode: 'friends' } });
  if (url.pathname === '/api/profile' && ['POST', 'PUT'].includes(request.method)) {
    const payload = await body(request); if (!payload?.name?.trim()) return json(response, 400, { error: 'Name is required' });
    if (payload.name.trim().length > 80) return json(response, 400, { error: 'Name is too long' });
    const age = Number(payload.age);
    if (!Number.isInteger(age) || age < 18 || age > 100) return json(response, 400, { error: 'Age must be between 18 and 100' });
    if (typeof payload.city === 'string' && payload.city.trim().length > 100) return json(response, 400, { error: 'City is too long' });
    if (typeof payload.bio === 'string' && payload.bio.trim().length > 500) return json(response, 400, { error: 'Bio is too long' });
    if (!validateProfileImage(typeof payload.image === 'string' ? payload.image : '')) return json(response, 400, { error: 'Invalid profile image' });
    if (Array.isArray(payload.tags) && payload.tags.some((tag) => typeof tag !== 'string' || tag.length > 40)) return json(response, 400, { error: 'Invalid interests' });
    const modes = ['hot', 'quick', 'friends', 'relationship', 'casual', 'company'];
    const profile = { id: user.id, name: payload.name.trim(), age, city: typeof payload.city === 'string' ? payload.city.trim() : '', distance: 'рядом с вами', bio: typeof payload.bio === 'string' ? payload.bio.trim() : '', tags: Array.isArray(payload.tags) ? payload.tags.map(String).filter(Boolean).slice(0, 15) : [], image: typeof payload.image === 'string' ? payload.image : '', gender: payload.gender === 'male' ? 'male' : 'female', interestedIn: ['male', 'female', 'all'].includes(payload.interestedIn) ? payload.interestedIn : 'all', datingMode: modes.includes(payload.datingMode) ? payload.datingMode : 'friends', online: true, updated_at: new Date().toISOString() };
    userProfiles.set(String(user.id), profile); await saveDatabase(); await remoteProfile(profile); return json(response, 200, { profile });
  }
  if (url.pathname === '/api/profile' && request.method === 'DELETE') {
    userProfiles.delete(String(user.id));
    userState.delete(String(user.id));
    notifications.delete(String(user.id));
    for (const key of [...messages.keys()]) if (key.split(':').includes(String(user.id))) messages.delete(key);
    sessions.forEach((session, token) => { if (String(session.id) === String(user.id)) sessions.delete(token); });
    await saveDatabase();
    await remoteDeleteProfile(user.id);
    return json(response, 200, { deleted: true });
  }
  if (request.method === 'GET' && (url.pathname === '/api/discover' || url.pathname === '/api/profiles')) {
    const ownCity = profileFor(user)?.city;
    const nearby = new Set(['Warszawa', 'Nowy Dwór Mazowiecki']);
    const candidates = [...userProfiles.values()].filter((p) => {
      const sameArea = !ownCity || !p.city || p.city === ownCity || (nearby.has(ownCity) && nearby.has(p.city));
      const genderMatches = !profileFor(user)?.interestedIn || profileFor(user).interestedIn === 'all' || p.gender === profileFor(user).interestedIn;
      return { profile: p, sameArea, genderMatches };
    });
    const eligible = candidates.filter(({ profile, genderMatches }) => Number(profile.id) !== Number(user.id) && genderMatches && !state.skips.has(profile.id) && !state.likes.has(profile.id));
    const nearbyProfiles = eligible.filter(({ sameArea }) => sameArea);
    const visible = (nearbyProfiles.length ? nearbyProfiles : eligible).map(({ profile }) => profile);
    return json(response, 200, { profiles: visible.map((profile) => ({ ...profile, online: isRecentlyActive(profile) })) });
  }
  if (request.method === 'GET' && url.pathname === '/api/random-match') {
    const ownProfile = profileFor(user);
    const candidates = allProfiles().filter((candidate) => {
      const genderMatches = !ownProfile?.interestedIn || ownProfile.interestedIn === 'all' || candidate.gender === ownProfile.interestedIn;
      return Number(candidate.id) !== Number(user.id) && genderMatches;
    });
    if (!candidates.length) return json(response, 404, { error: 'Пока нет доступных собеседников' });
    const candidate = candidates[Math.floor(Math.random() * candidates.length)];
    const expiresAt = Date.now() + RANDOM_ROOM_TTL_MS;
    randomRooms.set(String(user.id), { id: Number(candidate.id), expiresAt });
    randomRooms.set(String(candidate.id), { id: Number(user.id), expiresAt });
    return json(response, 200, { match: { id: Number(candidate.id), city: candidate.city || 'Город не указан', online: isRecentlyActive(candidate) } });
  }
  if (request.method === 'POST' && url.pathname === '/api/discover/skip') {
    const id = Number((await body(request))?.profileId);
    if (!Number.isSafeInteger(id) || id <= 0 || id === Number(user.id) || !profileById(id)) return json(response, 400, { error: 'Invalid profileId' });
    state.skips.add(id); await saveDatabase(); await remoteState(user.id, state); return json(response, 200, { skipped: true, profileId: id });
  }
  if (request.method === 'GET' && url.pathname === '/api/likes') return json(response, 200, { likes: [...state.likes].map(Number), profiles: allProfiles().filter((p) => state.likes.has(p.id)) });
  if (request.method === 'GET' && url.pathname === '/api/notifications') return json(response, 200, { notifications: userNotifications });
  if (request.method === 'POST' && url.pathname === '/api/likes') {
    const id = Number((await body(request))?.profileId);
    const target = profileById(id);
    if (!Number.isSafeInteger(id) || id <= 0 || id === Number(user.id) || !target) return json(response, 400, { error: 'Invalid profileId' });
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
    const matches = profilesWithPresence().filter((candidate) => state.likes.has(candidate.id) && stateFor({ id: candidate.id }).likes.has(Number(user.id)));
    return json(response, 200, { matches });
  }
  if (request.method === 'GET' && url.pathname === '/api/conversations') return json(response, 200, { conversations: conversationsFor(user) });
  const match = url.pathname.match(/^\/api\/conversations\/(\d+)\/messages$/);
  if (match) {
    const id = Number(match[1]);
    const target = profileById(id);
    if (!Number.isSafeInteger(id) || id <= 0 || id === Number(user.id) || !target) return json(response, 404, { error: 'Conversation not found' });
    const room = randomRooms.get(String(user.id));
    const pairedRoom = randomRooms.get(String(id));
    const randomChatAllowed = room && pairedRoom && room.expiresAt > Date.now() && pairedRoom.expiresAt > Date.now() && room.id === id && pairedRoom.id === Number(user.id);
    const mutualLike = state.likes.has(id) && stateFor({ id }).likes.has(Number(user.id));
    const canChat = mutualLike || randomChatAllowed;
    if (!canChat) return json(response, 404, { error: 'Conversation not found' });
    const key = conversationKey(user.id, id); if (!messages.has(key)) messages.set(key, []);
    if (request.method === 'GET') return json(response, 200, { messages: messages.get(key).map((message) => ({ ...message, sender: String(message.senderId) === String(user.id) ? 'me' : 'them' })) });
    if (request.method === 'POST') {
      const payload = await body(request);
      if (typeof payload?.text !== 'string' || !payload.text.trim()) return json(response, 400, { error: 'Message text is required' });
      if (payload.text.trim().length > 2000) return json(response, 400, { error: 'Message is too long' });
      const message = { id: randomUUID(), senderId: String(user.id), text: payload.text.trim(), createdAt: new Date().toISOString() };
      messages.get(key).push(message);
      await saveDatabase();
      await remoteMessage(user.id, id, message);
      const senderName = randomChatAllowed ? 'Анонимный собеседник' : (profileFor(user)?.name || user.first_name || 'Пользователь');
      await notifyTelegramMessage(id, senderName, message.text);
      return json(response, 201, { message: { ...message, sender: 'me' } });
    }
  }
  return json(response, 404, { error: 'Not found' });
}
await loadDotEnv();
await loadDatabase();
try { await loadSupabaseDatabase(); } catch (error) { console.warn(`Supabase unavailable, using local persistence: ${error.message}`); }
try { await removeDemoData(); await saveDatabase(); } catch (error) { console.warn(`Demo data cleanup unavailable: ${error.message}`); }
http.createServer((request, response) => handle(request, response).catch((error) => { console.error(error); json(response, 500, { error: 'Internal server error' }); })).listen(PORT, '0.0.0.0');
