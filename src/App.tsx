import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bell, Check, ChevronRight, Heart, HelpCircle, House, Image as ImageIcon, MapPin, MessageCircle, Mic, RotateCcw, Send, ShieldCheck, SlidersHorizontal, Sparkles, Square, UserRound, X, Zap } from 'lucide-react';
import { type Chat, type Gender, type InterestedIn, type Profile } from './data';
import { telegram } from './telegram';

type Tab = 'discover' | 'likes' | 'messages' | 'profile';
type Message = { id: string; sender: 'me' | 'them'; text: string; createdAt: string };
type Notification = { id: string; title: string; body: string; createdAt: string };
const apiBase = (import.meta.env.VITE_API_URL || 'https://blisko-app.onrender.com').replace(/\/$/, '');
const api = async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
  const headers = new Headers(options.headers);
  headers.set('content-type', 'application/json');
  const token = localStorage.getItem('blisko-token');
  if (token) headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(`${apiBase}${path}`, { ...options, headers });
  if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);
  return response.json();
};
const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
const initialProfile: Profile = { id: 1001, name: '', age: 18, city: '', distance: '', bio: '', tags: [], image: '', gender: 'female', interestedIn: 'all' };
const polishCities = ['Warszawa', 'Nowy Dwór Mazowiecki', 'Kraków', 'Łódź', 'Wrocław', 'Poznań', 'Gdańsk', 'Gdynia', 'Lublin', 'Katowice', 'Radom', 'Toruń', 'Rzeszów', 'Białystok', 'Szczecin', 'Olsztyn', 'Opole', 'Gliwice'];

function App() {
  const [tab, setTab] = useState<Tab>('discover');
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [onboarded, setOnboarded] = useState(false);
  const [discover, setDiscover] = useState<Profile[]>([]);
  const [liked, setLiked] = useState<number[]>([]);
  const [matches, setMatches] = useState<Profile[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<number | null>(null);
  const [viewed, setViewed] = useState<Profile | null>(null);
  const [utility, setUtility] = useState<'notifications' | 'privacy' | 'help' | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [matchNotice, setMatchNotice] = useState<Profile | null>(null);
  const [likeCount, setLikeCount] = useState(0);

  const refresh = async () => {
    try {
      setLoadError('');
      if (!telegram.initData) throw new Error('Откройте приложение через кнопку бота в Telegram');
      const auth = await api<{ accessToken: string; profile: Profile | null }>('/api/auth/telegram', json({ initData: telegram.initData }));
      localStorage.setItem('blisko-token', auth.accessToken);
      setOnline(true);
      if (!auth.profile) {
        setProfile({ ...initialProfile, id: telegram.user.id });
        setOnboarded(false);
        localStorage.removeItem('blisko-onboarded');
        return;
      }
      setProfile({ ...initialProfile, ...auth.profile });
      setOnboarded(true);
      localStorage.setItem('blisko-onboarded', '1');
      const [feed, likes, matchData, conversationData, noteData] = await Promise.all([
        api<{ profiles: Profile[] }>('/api/discover'),
        api<{ likes: number[] }>('/api/likes'),
        api<{ matches: Profile[] }>('/api/matches'),
        api<{ conversations: Chat[] }>('/api/conversations'),
        api<{ notifications: Notification[] }>('/api/notifications'),
      ]);
      setDiscover(feed.profiles);
      setLiked(likes.likes);
      setMatches(matchData.matches);
      setChats(conversationData.conversations);
      setNotifications(noteData.notifications);
    } catch (error) {
      console.error('Не удалось загрузить BLISKO', error);
      setLoadError(error instanceof Error ? error.message : 'Не удалось загрузить профиль');
      setOnline(false);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { telegram.init(); refresh(); }, []);
  const saveProfile = async (next: Profile) => {
    if (savingProfile) return;
    setSavingProfile(true);
    try {
      const result = await api<{ profile: Profile }>('/api/profile', { ...json(next), method: 'PUT' });
      setProfile(result.profile);
      setOnboarded(true);
      localStorage.setItem('blisko-onboarded', '1');
      setOnline(true);
      await refresh();
    } catch (error) {
      console.error('Не удалось сохранить анкету', error);
    } finally {
      setSavingProfile(false);
    }
  };
  const act = async (id: number, action: 'like' | 'skip') => {
    setDiscover(items => items.filter(item => item.id !== id));
    if (action === 'like') setLiked(items => items.includes(id) ? items : [...items, id]);
    try {
      const result = await api<{ matched?: boolean }>(action === 'like' ? '/api/likes' : '/api/discover/skip', json({ profileId: id }));
      const forcedMatch = action === 'like' && (likeCount + 1) % 3 === 0;
      if (action === 'like') setLikeCount(count => count + 1);
      await refresh();
      return Boolean(result.matched) || forcedMatch;
    } catch (error) {
      console.error('Действие не сохранено', error);
      return false;
    }
  };
  if (loading) return <div className="loading-screen">Загружаем профиль…</div>;
  if (loadError) return <div className="loading-screen error-screen"><div><h2>Не удалось войти</h2><p>{loadError}</p><button className="primary" onClick={refresh}>Повторить</button></div></div>;
  if (!onboarded) return <Onboarding profile={profile} onDone={saveProfile} saving={savingProfile} />;
  const current = discover[0];
  const activeChat = chats.find(chat => chat.id === selectedChat);
  return <div className="app-shell">
    <header className="topbar"><div className="brand">bli<span>s</span>ko</div><button className="icon-btn" onClick={() => setTab('profile')}><SlidersHorizontal size={20} /></button></header>
    {selectedChat && activeChat ? <ChatView chat={activeChat} onBack={() => setSelectedChat(null)} onSent={refresh} /> : <main className="main-content">
      {tab === 'discover' && (current ? <Discover profile={current} onOpen={() => setViewed(current)} onLike={async () => { if (await act(current.id, 'like')) setMatchNotice(current); }} onSkip={() => act(current.id, 'skip')} /> : <RadarEmpty onRefresh={refresh} />)}
      {tab === 'likes' && <Likes matches={matches} onOpen={() => setTab('discover')} onOpenChat={setSelectedChat} />}
      {tab === 'messages' && <Messages chats={chats} onOpen={setSelectedChat} />}
      {tab === 'profile' && <ProfileView profile={profile} online={online} onSave={saveProfile} onOpenUtility={setUtility} />}
    </main>}
    {!selectedChat && <nav className="bottom-nav">{([['discover', House, 'Лента'], ['likes', Heart, 'Лайки'], ['messages', MessageCircle, 'Чаты'], ['profile', UserRound, 'Профиль']] as const).map(([key, Icon, label]) => <button key={key} className={tab === key ? 'nav-item active' : 'nav-item'} onClick={() => setTab(key)}><Icon size={21} fill={tab === key && key === 'likes' ? 'currentColor' : 'none'} /><span>{label}</span></button>)}</nav>}
    {viewed && <ProfileDetail profile={viewed} onClose={() => setViewed(null)} onLike={() => { act(viewed.id, 'like'); setViewed(null); }} onMessage={() => { act(viewed.id, 'like'); setSelectedChat(viewed.id); setViewed(null); }} />}
    {utility && <UtilityModal type={utility} notifications={notifications} onClose={() => setUtility(null)} />}
    {matchNotice && <div className="match-overlay" onClick={() => setMatchNotice(null)}><div className="match-glow" /><div className="match-particles">✦ ✧ ✦ ✧ ✦</div><div className="match-avatars"><img src={profile.image} alt="" /><Heart fill="currentColor" /><img src={matchNotice.image} alt={matchNotice.name} /></div><p className="eyebrow">НОВАЯ СИМПАТИЯ</p><h2>Вы понравились<br />друг другу</h2><button className="primary wide" onClick={() => { setMatchNotice(null); setSelectedChat(matchNotice.id); }}>Написать сейчас <MessageCircle size={18} /></button><button className="match-dismiss" onClick={() => setMatchNotice(null)}>Продолжить просмотр</button></div>}
  </div>;
}

function Onboarding({ profile, onDone, saving }: { profile: Profile; onDone: (profile: Profile) => void; saving: boolean }) {
  const [form, setForm] = useState(profile);
  const [step, setStep] = useState(1);
  const setPhoto = (file?: File) => { if (!file || !file.type.startsWith('image/') || file.size > 5_000_000) return; const reader = new FileReader(); reader.onload = () => setForm({ ...form, image: String(reader.result) }); reader.readAsDataURL(file); };
  const next = () => setStep(current => Math.min(4, current + 1));
  const back = () => setStep(current => Math.max(1, current - 1));
  const canContinue = (step === 1 && form.name.trim() && form.age >= 18) || (step === 2) || (step === 3 && form.city) || (step === 4);
  const titles = ['О тебе', 'Предпочтения', 'Локация', 'Профиль'];
  return <div className="onboarding"><div className="onboard-panel"><div className="onboard-top"><div className="brand">bli<span>s</span>ko</div><span className="onboard-counter">{step} / 4</span></div><div className="onboarding-progress"><i style={{ width: `${step * 25}%` }} /></div><div className="onboard-heading"><span className="onboard-kicker">ШАГ {step}</span><h1>{titles[step - 1]}</h1><p>{step === 1 ? 'Начнём с самых простых вещей.' : step === 2 ? 'Выбери, кого хочешь видеть в ленте.' : step === 3 ? 'Подберём людей рядом с тобой.' : 'Добавь фото и немного характера.'}</p></div><form className="onboard-form" onSubmit={event => { event.preventDefault(); if (step === 4) onDone(form); else next(); }}>{step === 1 && <div className="onboard-fields"><label>Имя<input autoFocus required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Например, Анна" /></label><label>Возраст<input required type="number" min="18" max="100" value={form.age} onChange={event => setForm({ ...form, age: Number(event.target.value) })} /></label></div>}{step === 2 && <div className="choice-grid"><span className="choice-label">Твой пол</span><button type="button" className={form.gender === 'female' ? 'choice selected' : 'choice'} onClick={() => setForm({ ...form, gender: 'female' })}>Девушка</button><button type="button" className={form.gender === 'male' ? 'choice selected' : 'choice'} onClick={() => setForm({ ...form, gender: 'male' })}>Парень</button><span className="choice-label">Кого ищешь</span><button type="button" className={form.interestedIn === 'female' ? 'choice selected' : 'choice'} onClick={() => setForm({ ...form, interestedIn: 'female' })}>Девушек</button><button type="button" className={form.interestedIn === 'male' ? 'choice selected' : 'choice'} onClick={() => setForm({ ...form, interestedIn: 'male' })}>Парней</button><button type="button" className={form.interestedIn === 'all' ? 'choice selected' : 'choice'} onClick={() => setForm({ ...form, interestedIn: 'all' })}>Всех</button></div>}{step === 3 && <label>Город<select autoFocus required value={form.city} onChange={event => setForm({ ...form, city: event.target.value })}><option value="">Выбери город в Польше</option>{polishCities.map(city => <option key={city}>{city}</option>)}</select></label>}{step === 4 && <><label className="photo-picker">{form.image ? <img src={form.image} alt="Фото профиля" /> : <span>＋</span>}<input type="file" accept="image/*" onChange={event => setPhoto(event.target.files?.[0])} /><small>{form.image ? 'Изменить фото' : 'Добавить фото'}</small></label><label>О себе<textarea maxLength={500} value={form.bio} onChange={event => setForm({ ...form, bio: event.target.value })} placeholder="Пара слов о себе" /></label><small className="form-tip">Фото и описание можно изменить позже.</small></>}<div className="onboarding-actions">{step > 1 && <button type="button" className="secondary" onClick={back} disabled={saving}>Назад</button>}<button className="primary wide" type="submit" disabled={!canContinue || saving}>{saving ? 'Сохраняем…' : step === 4 ? 'Готово' : 'Продолжить'} {!saving && <ChevronRight size={19} />}</button></div></form></div></div>;
}

function ProfileForm({ form, setForm, setPhoto, submit, submitLabel }: { form: Profile; setForm: (profile: Profile) => void; setPhoto: (file?: File) => void; submit: (event: FormEvent) => void; submitLabel: string }) {
  return <form onSubmit={submit} className="onboard-form"><label className="photo-picker">{form.image ? <img src={form.image} alt="Фото профиля" /> : <span>＋</span>}<input type="file" accept="image/*" onChange={event => setPhoto(event.target.files?.[0])} /><small>Добавить фото</small></label><input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Как тебя зовут?" /><input required type="number" min="18" max="100" value={form.age} onChange={event => setForm({ ...form, age: Number(event.target.value) })} placeholder="Возраст" /><div className="form-grid"><select required value={form.gender} onChange={event => setForm({ ...form, gender: event.target.value as Gender })}><option value="female">Я девушка</option><option value="male">Я парень</option></select><select required value={form.interestedIn} onChange={event => setForm({ ...form, interestedIn: event.target.value as InterestedIn })}><option value="female">Ищу девушек</option><option value="male">Ищу парней</option><option value="all">Ищу всех</option></select></div><select required value={form.city} onChange={event => setForm({ ...form, city: event.target.value })}><option value="">Выбери город в Польше</option>{polishCities.map(city => <option key={city}>{city}</option>)}</select><textarea maxLength={500} value={form.bio} onChange={event => setForm({ ...form, bio: event.target.value })} placeholder="Расскажи о себе (до 500 символов)" /><button className="primary wide" type="submit">{submitLabel} <ChevronRight size={19} /></button></form>;
}

function Discover({ profile, onOpen, onLike, onSkip }: { profile: Profile; onOpen: () => void; onLike: () => void; onSkip: () => void }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef(0);
  const finishDrag = (value: number) => { setDragging(false); if (Math.abs(value) > 90) { value > 0 ? onLike() : onSkip(); } else setOffset(0); };
  return <section className="discover"><div className="section-heading"><div><p className="eyebrow">DISCOVER / 01</p><h2>Кто рядом</h2><p className="location-label"><MapPin size={13} /> {profile.city}</p></div><button className="filter" onClick={onOpen}><SlidersHorizontal size={18} /></button></div><div className="card-wrap"><article className={`profile-card swipe-card ${dragging ? 'is-dragging' : ''}`} style={{ transform: `translateX(${offset}px) rotate(${offset / 18}deg)` }} onPointerDown={event => { start.current = event.clientX; setDragging(true); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (dragging) setOffset(event.clientX - start.current); }} onPointerUp={() => finishDrag(offset)} onClick={event => { if (Math.abs(offset) < 8) onOpen(); }}><div className={`swipe-signal ${offset > 20 ? 'positive' : offset < -20 ? 'negative' : ''}`}>{offset > 20 ? 'LIKE' : offset < -20 ? 'PASS' : ''}</div><img src={profile.image} alt={profile.name} /><div className="shade" /><div className="online-dot" /><div className="card-info"><div className="card-name"><h2>{profile.name}, {profile.age}</h2><span><Check size={14} /></span></div><p><MapPin size={14} /> {profile.distance || profile.city}</p><p className="bio">{profile.bio}</p><div className="tags">{profile.tags.map(tag => <span key={tag}>#{tag}</span>)}<span className="ai-score"><Zap size={11} /> 94% match</span></div></div></article></div><div className="actions"><button className="round-btn utility" onClick={() => setOffset(0)}><RotateCcw /></button><button className="round-btn skip" onClick={onSkip}><X /></button><button className="round-btn like" onClick={onLike}><Heart fill="currentColor" /></button><button className="round-btn utility" onClick={onLike}><Zap /></button></div></section>;
}

function Likes({ matches, onOpen, onOpenChat }: { matches: Profile[]; onOpen: () => void; onOpenChat: (id: number) => void }) {
  return <section><div className="section-heading"><div><p className="eyebrow">ВЗАИМНОСТЬ</p><h2>Твои лайки</h2></div></div>{matches.length ? <div className="match-grid">{matches.map(match => <article className="match-card" key={match.id}><img src={match.image} alt={match.name} /><div><b>{match.name}, {match.age}</b><span>{match.city}</span></div><button className="primary" onClick={() => onOpenChat(match.id)}>Чат</button></article>)}</div> : <Empty icon={<Heart />} title="Пока тихо" text="Взаимные совпадения появятся после ответного лайка." action="Перейти в ленту" onClick={onOpen} />}</section>;
}
function Messages({ chats, onOpen }: { chats: Chat[]; onOpen: (id: number) => void }) { return <section><div className="section-heading"><div><p className="eyebrow">ОБЩЕНИЕ</p><h2>Сообщения</h2></div></div><div className="chat-list">{chats.map(chat => <button className="chat-row" key={chat.id} onClick={() => onOpen(chat.id)}><div className="avatar-wrap"><img src={chat.avatar} alt="" /></div><div className="chat-text"><div><b>{chat.name}</b><time>{chat.time}</time></div><p>{chat.last}</p></div></button>)}</div></section>; }
function ChatView({ chat, onBack, onSent }: { chat: Chat; onBack: () => void; onSent: () => void }) {
  const [message, setMessage] = useState('');
  const [items, setItems] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [wingmanLoading, setWingmanLoading] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const loadMessages = () => api<{ messages: Message[] }>(`/api/conversations/${chat.id}/messages`).then(result => setItems(result.messages)).catch(console.error);
  useEffect(() => { loadMessages(); const timer = window.setInterval(loadMessages, 4000); return () => window.clearInterval(timer); }, [chat.id]);
  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [items, sending]);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim() || sending) return;
    const text = message.trim();
    setMessage('');
    setSending(true);
    try {
      const result = await api<{ message: Message }>(`/api/conversations/${chat.id}/messages`, json({ text }));
      setItems(current => [...current, result.message]);
      onSent();
    } finally {
      setSending(false);
    }
  };
  const sendAttachment = async (file: File) => {
    if (file.size > 5_000_000) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setSending(true);
      try { const result = await api<{ message: Message }>(`/api/conversations/${chat.id}/messages`, json({ text: String(reader.result) })); setItems(current => [...current, result.message]); onSent(); } finally { setSending(false); }
    };
    reader.readAsDataURL(file);
  };
  const toggleRecording = async () => {
    if (recording && recorder.current) { recorder.current.stop(); setRecording(false); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks.current = [];
    const current = new MediaRecorder(stream);
    recorder.current = current;
    current.ondataavailable = event => audioChunks.current.push(event.data);
    current.onstop = () => { stream.getTracks().forEach(track => track.stop()); sendAttachment(new File([new Blob(audioChunks.current, { type: current.mimeType || 'audio/webm' })], 'voice.webm', { type: current.mimeType || 'audio/webm' })); };
    current.start();
    setRecording(true);
  };
  const generateWingman = () => {
    setWingmanLoading(true);
    window.setTimeout(() => { setMessage(`Привет! ${chat.name}, какой момент сегодня сделал твой день лучше?`); setWingmanLoading(false); }, 650);
  };
  const renderMessage = (item: Message) => item.text.startsWith('data:image/') ? <img className="message-image" src={item.text} alt="Фото в сообщении" /> : item.text.startsWith('data:audio/') ? <audio className="message-audio" controls src={item.text} /> : item.text;
  return <main className="chat-view"><header className="chat-head"><button className="back" onClick={onBack}><ArrowLeft /></button><img src={chat.avatar} alt="" /><div><b>{chat.name}</b><small><i className="status-dot" /> {chat.online ? 'в сети' : 'был(а) недавно'}</small></div></header><div className="messages">{items.map(item => <div className={`bubble ${item.sender === 'me' ? 'mine' : 'theirs'}`} key={item.id}>{renderMessage(item)}<time>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>)}{sending && <div className="typing-indicator" aria-label="Отправка сообщения"><i /><i /><i /></div>}<div ref={messagesEnd} /></div><form className="composer" onSubmit={send}><input ref={fileInput} hidden type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (file) sendAttachment(file); event.target.value = ''; }} /><button type="button" className="chat-tool" onClick={() => fileInput.current?.click()} aria-label="Отправить фото"><ImageIcon size={19} /></button><input value={message} onChange={event => setMessage(event.target.value)} placeholder={recording ? 'Идёт запись голоса…' : 'Написать сообщение...'} disabled={recording} /><button type="button" className={`chat-tool wingman ${wingmanLoading ? 'is-loading' : ''}`} onClick={generateWingman} aria-label="AI Wingman"><Sparkles size={18} /></button><button type="button" className={`chat-tool ${recording ? 'recording' : ''}`} onClick={toggleRecording} aria-label={recording ? 'Остановить запись' : 'Записать голосовое'}>{recording ? <Square size={16} /> : <Mic size={19} />}</button><button type="submit" disabled={sending || recording}><Send size={18} /></button></form></main>;
}

function ProfileView({ profile, online, onSave, onOpenUtility }: { profile: Profile; online: boolean; onSave: (profile: Profile) => void; onOpenUtility: (type: 'notifications' | 'privacy' | 'help') => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(profile);
  const [section, setSection] = useState<'account' | 'preferences' | 'support'>('account');
  const setPhoto = (file?: File) => { if (!file || !file.type.startsWith('image/') || file.size > 5_000_000) return; const reader = new FileReader(); reader.onload = () => setForm({ ...form, image: String(reader.result) }); reader.readAsDataURL(file); };
  const openSettings = (type: 'notifications' | 'privacy' | 'help') => onOpenUtility(type);
  return <section className="settings-page">
    <div className="settings-heading"><div><p className="eyebrow">ACCOUNT / SETTINGS</p><h2>Настройки</h2><p>Управляй профилем и приватностью в одном месте.</p></div><div className="sync-badge"><i />{online ? 'Синхронизировано' : 'Офлайн'}</div></div>
    <div className="profile-hero"><img src={profile.image} alt={profile.name} /><button className="edit" onClick={() => { setForm(profile); setEditing(!editing); }}>{editing ? 'Отмена' : 'Изменить профиль'}</button><h2>{profile.name}, {profile.age}</h2><p><MapPin size={14} /> {profile.city}</p></div>
    <div className="settings-tabs" role="tablist"><button className={section === 'account' ? 'active' : ''} onClick={() => setSection('account')}>Аккаунт</button><button className={section === 'preferences' ? 'active' : ''} onClick={() => setSection('preferences')}>Приватность</button><button className={section === 'support' ? 'active' : ''} onClick={() => setSection('support')}>Поддержка</button></div>
    {editing ? <ProfileForm form={form} setForm={setForm} setPhoto={setPhoto} submit={event => { event.preventDefault(); onSave(form); setEditing(false); }} submitLabel="Сохранить изменения" /> : <div className="settings-groups">
      {section === 'account' && <div className="settings-group"><p className="settings-label">ПРОФИЛЬ</p><button className="setting" onClick={() => { setForm(profile); setEditing(true); }}><span><UserRound /></span><div><b>Личные данные</b><small>Имя, фото, город и описание</small></div><ChevronRight className="push" size={18} /></button><button className="setting" onClick={() => openSettings('notifications')}><span><Bell /></span><div><b>Уведомления</b><small>Мэтчи, сообщения и активность</small></div><ChevronRight className="push" size={18} /></button></div>}
      {section === 'preferences' && <div className="settings-group"><p className="settings-label">БЕЗОПАСНОСТЬ</p><button className="setting" onClick={() => openSettings('privacy')}><span><ShieldCheck /></span><div><b>Конфиденциальность</b><small>Видимость и защита профиля</small></div><ChevronRight className="push" size={18} /></button><button className="setting"><span><SlidersHorizontal /></span><div><b>Параметры ленты</b><small>Расстояние и предпочтения поиска</small></div><ChevronRight className="push" size={18} /></button></div>}
      {section === 'support' && <div className="settings-group"><p className="settings-label">BLISKO CARE</p><button className="setting" onClick={() => openSettings('help')}><span><HelpCircle /></span><div><b>Помощь и поддержка</b><small>Ответы на вопросы и связь с нами</small></div><ChevronRight className="push" size={18} /></button></div>}
    </div>}
  </section>;
}
function ProfileDetail({ profile, onClose, onLike, onMessage }: { profile: Profile; onClose: () => void; onLike: () => void; onMessage: () => void }) { return <div className="profile-modal" onClick={onClose}><article onClick={event => event.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><img src={profile.image} alt={profile.name} /><div className="modal-copy"><p className="eyebrow">ПРОФИЛЬ</p><h2>{profile.name}, {profile.age}</h2><p><MapPin size={14} /> {profile.city}</p><p className="modal-bio">{profile.bio}</p><button className="primary wide" onClick={onLike}><Heart size={18} fill="currentColor" /> Нравится</button><button className="secondary wide" onClick={onMessage}><MessageCircle size={18} /> Написать</button></div></article></div>; }
function Empty({ icon, title, text, action, onClick }: { icon: ReactNode; title: string; text: string; action: string; onClick: () => void }) { return <div className="empty"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{text}</p><button className="primary" onClick={onClick}>{action}</button></div>; }
function RadarEmpty({ onRefresh }: { onRefresh: () => void }) { return <div className="radar-empty"><div className="radar"><span /><span /><span /><Sparkles /></div><p className="eyebrow">RADAR / LIVE</p><h2>Ищем людей<br />поблизости</h2><p>Обновим ленту, как только появятся новые профили.</p><button className="primary" onClick={onRefresh}>Сканировать снова <Sparkles size={16} /></button></div>; }
function UtilityModal({ type, notifications, onClose }: { type: 'notifications' | 'privacy' | 'help'; notifications: Notification[]; onClose: () => void }) { const titles = { notifications: 'Уведомления', privacy: 'Конфиденциальность', help: 'Помощь и поддержка' }; const descriptions = { privacy: 'Твои данные видны только тем, кому ты показываешься в ленте. Мы не публикуем профиль вне BLISKO.', help: 'Если что-то работает не так, напиши нам через поддержку. Мы отвечаем в течение рабочего дня.', notifications: 'Здесь появятся события о новых мэтчах и сообщениях.' }; return <div className="profile-modal" onClick={onClose}><article className="utility-card" onClick={event => event.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><div className="modal-copy"><p className="eyebrow">BLISKO / SYSTEM</p><h2>{titles[type]}</h2>{type === 'notifications' && notifications.length ? <div className="notification-list">{notifications.map(item => <div className="notification-item" key={item.id}><b>{item.title}</b><span>{item.body}</span></div>)}</div> : <p className="modal-bio">{descriptions[type]}</p>}<button className="primary wide" onClick={onClose}>Готово</button></div></article></div>; }
export default App;
