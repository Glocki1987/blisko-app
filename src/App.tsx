import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { ArrowLeft, Bell, Check, ChevronRight, Heart, HelpCircle, House, MapPin, MessageCircle, MoreHorizontal, Send, ShieldCheck, SlidersHorizontal, Sparkles, UserRound, X } from 'lucide-react';
import { type Chat, type Gender, type InterestedIn, type Profile } from './data';
import { telegram } from './telegram';

type Tab = 'discover' | 'likes' | 'messages' | 'profile';
type Message = { id: string; sender: 'me' | 'them'; text: string; createdAt: string };
type Notification = { id: string; title: string; body: string; createdAt: string };
const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
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

  const refresh = async () => {
    try {
      const auth = await api<{ accessToken: string; profile: Profile | null }>('/api/auth/telegram', json({ userId: telegram.user.id }));
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
      setOnline(false);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { telegram.init(); refresh(); }, []);
  const saveProfile = async (next: Profile) => {
    try {
      const result = await api<{ profile: Profile }>('/api/profile', { ...json(next), method: 'PUT' });
      setProfile(result.profile);
      setOnboarded(true);
      localStorage.setItem('blisko-onboarded', '1');
      setOnline(true);
      await refresh();
    } catch (error) {
      console.error('Не удалось сохранить анкету', error);
    }
  };
  const act = async (id: number, action: 'like' | 'skip') => {
    setDiscover(items => items.filter(item => item.id !== id));
    if (action === 'like') setLiked(items => items.includes(id) ? items : [...items, id]);
    await api(action === 'like' ? '/api/likes' : '/api/discover/skip', json({ profileId: id })).then(refresh).catch(error => console.error('Действие не сохранено', error));
  };
  if (loading) return <div className="loading-screen">Загружаем твою анкету…</div>;
  if (!onboarded) return <Onboarding profile={profile} onDone={saveProfile} />;
  const current = discover[0];
  const activeChat = chats.find(chat => chat.id === selectedChat);
  return <div className="app-shell">
    <header className="topbar"><div className="brand">bli<span>s</span>ko</div><button className="icon-btn" onClick={() => setTab('profile')}><SlidersHorizontal size={20} /></button></header>
    {selectedChat && activeChat ? <ChatView chat={activeChat} onBack={() => setSelectedChat(null)} onSent={refresh} /> : <main className="main-content">
      {tab === 'discover' && (current ? <Discover profile={current} onOpen={() => setViewed(current)} onLike={() => act(current.id, 'like')} onSkip={() => act(current.id, 'skip')} /> : <Empty icon={<Sparkles />} title="Лента закончилась" text="Измени фильтр или загляни позже." action="Обновить" onClick={refresh} />)}
      {tab === 'likes' && <Likes liked={liked} matches={matches} onOpen={() => setTab('discover')} onOpenChat={setSelectedChat} />}
      {tab === 'messages' && <Messages chats={chats} onOpen={setSelectedChat} />}
      {tab === 'profile' && <ProfileView profile={profile} online={online} onSave={saveProfile} onOpenUtility={setUtility} />}
    </main>}
    {!selectedChat && <nav className="bottom-nav">{([['discover', House, 'Лента'], ['likes', Heart, 'Лайки'], ['messages', MessageCircle, 'Чаты'], ['profile', UserRound, 'Профиль']] as const).map(([key, Icon, label]) => <button key={key} className={tab === key ? 'nav-item active' : 'nav-item'} onClick={() => setTab(key)}><Icon size={21} fill={tab === key && key === 'likes' ? 'currentColor' : 'none'} /><span>{label}</span></button>)}</nav>}
    {viewed && <ProfileDetail profile={viewed} onClose={() => setViewed(null)} onLike={() => { act(viewed.id, 'like'); setViewed(null); }} onMessage={() => { act(viewed.id, 'like'); setSelectedChat(viewed.id); setViewed(null); }} />}
    {utility && <UtilityModal type={utility} notifications={notifications} onClose={() => setUtility(null)} />}
  </div>;
}

function Onboarding({ profile, onDone }: { profile: Profile; onDone: (profile: Profile) => void }) {
  const [form, setForm] = useState(profile);
  const setPhoto = (file?: File) => { if (!file || !file.type.startsWith('image/') || file.size > 5_000_000) return; const reader = new FileReader(); reader.onload = () => setForm({ ...form, image: String(reader.result) }); reader.readAsDataURL(file); };
  return <div className="onboarding"><div className="onboard-art"><div className="blob blob-a" /><div className="blob blob-b" /><Heart className="onboard-heart" fill="white" size={48} /></div><div className="onboard-copy"><div className="brand big">bli<span>s</span>ko</div><h1>Создай свою анкету</h1><p>Заполни профиль, чтобы видеть подходящих людей рядом.</p><ProfileForm form={form} setForm={setForm} setPhoto={setPhoto} submit={event => { event.preventDefault(); onDone(form); }} submitLabel="Создать анкету" /></div></div>;
}

function ProfileForm({ form, setForm, setPhoto, submit, submitLabel }: { form: Profile; setForm: (profile: Profile) => void; setPhoto: (file?: File) => void; submit: (event: FormEvent) => void; submitLabel: string }) {
  return <form onSubmit={submit} className="onboard-form"><label className="photo-picker">{form.image ? <img src={form.image} alt="Фото профиля" /> : <span>＋</span>}<input type="file" accept="image/*" onChange={event => setPhoto(event.target.files?.[0])} /><small>Добавить фото</small></label><input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Как тебя зовут?" /><input required type="number" min="18" max="100" value={form.age} onChange={event => setForm({ ...form, age: Number(event.target.value) })} placeholder="Возраст" /><div className="form-grid"><select required value={form.gender} onChange={event => setForm({ ...form, gender: event.target.value as Gender })}><option value="female">Я девушка</option><option value="male">Я парень</option></select><select required value={form.interestedIn} onChange={event => setForm({ ...form, interestedIn: event.target.value as InterestedIn })}><option value="female">Ищу девушек</option><option value="male">Ищу парней</option><option value="all">Ищу всех</option></select></div><select required value={form.city} onChange={event => setForm({ ...form, city: event.target.value })}><option value="">Выбери город в Польше</option>{polishCities.map(city => <option key={city}>{city}</option>)}</select><textarea maxLength={500} value={form.bio} onChange={event => setForm({ ...form, bio: event.target.value })} placeholder="Расскажи о себе (до 500 символов)" /><button className="primary wide" type="submit">{submitLabel} <ChevronRight size={19} /></button></form>;
}

function Discover({ profile, onOpen, onLike, onSkip }: { profile: Profile; onOpen: () => void; onLike: () => void; onSkip: () => void }) {
  return <section className="discover"><div className="section-heading"><div><p className="eyebrow">ТВОЯ ЛЕНТА</p><h2>Кто рядом</h2><p className="location-label"><MapPin size={13} /> {profile.city}</p></div><button className="filter" onClick={onOpen}><SlidersHorizontal size={18} /></button></div><div className="card-wrap"><article className="profile-card" onClick={onOpen}><img src={profile.image} alt={profile.name} /><div className="shade" /><div className="online-dot" /><div className="card-info"><div className="card-name"><h2>{profile.name}, {profile.age}</h2><span><Check size={14} /></span></div><p><MapPin size={14} /> {profile.distance || profile.city}</p><p className="bio">{profile.bio}</p><div className="tags">{profile.tags.map(tag => <span key={tag}>#{tag}</span>)}</div><small>Нажми, чтобы открыть профиль</small></div></article></div><div className="actions"><button className="round-btn skip" onClick={onSkip}><X /></button><button className="round-btn like" onClick={onLike}><Heart fill="currentColor" /></button></div></section>;
}

function Likes({ liked, matches, onOpen, onOpenChat }: { liked: number[]; matches: Profile[]; onOpen: () => void; onOpenChat: (id: number) => void }) {
  return <section><div className="section-heading"><div><p className="eyebrow">ВЗАИМНОСТЬ</p><h2>Твои лайки <span className="count">{liked.length}</span></h2></div></div>{matches.length ? <div className="match-grid">{matches.map(match => <article className="match-card" key={match.id}><img src={match.image} alt={match.name} /><div><b>{match.name}, {match.age}</b><span>{match.city}</span></div><button className="primary" onClick={() => onOpenChat(match.id)}>Чат</button></article>)}</div> : <Empty icon={<Heart />} title="Пока тихо" text="Взаимные совпадения появятся после ответного лайка." action="Перейти в ленту" onClick={onOpen} />}</section>;
}

function Messages({ chats, onOpen }: { chats: Chat[]; onOpen: (id: number) => void }) { return <section><div className="section-heading"><div><p className="eyebrow">ОБЩЕНИЕ</p><h2>Сообщения</h2></div><MoreHorizontal /></div><div className="chat-list">{chats.map(chat => <button className="chat-row" key={chat.id} onClick={() => onOpen(chat.id)}><div className="avatar-wrap"><img src={chat.avatar} alt="" /></div><div className="chat-text"><div><b>{chat.name}</b><time>{chat.time}</time></div><p>{chat.last}</p></div></button>)}</div></section>; }
function ChatView({ chat, onBack, onSent }: { chat: Chat; onBack: () => void; onSent: () => void }) { const [message, setMessage] = useState(''); const [items, setItems] = useState<Message[]>([]); useEffect(() => { api<{ messages: Message[] }>(`/api/conversations/${chat.id}/messages`).then(result => setItems(result.messages)).catch(console.error); }, [chat.id]); const send = async (event: FormEvent) => { event.preventDefault(); if (!message.trim()) return; const text = message.trim(); setMessage(''); const result = await api<{ message: Message }>(`/api/conversations/${chat.id}/messages`, json({ text })); setItems(items => [...items, result.message]); onSent(); }; return <main className="chat-view"><header className="chat-head"><button className="back" onClick={onBack}><ArrowLeft /></button><img src={chat.avatar} alt="" /><div><b>{chat.name}</b><small>в сети</small></div></header><div className="messages">{items.map(item => <div className={`bubble ${item.sender === 'me' ? 'mine' : 'theirs'}`} key={item.id}>{item.text}</div>)}</div><form className="composer" onSubmit={send}><input value={message} onChange={event => setMessage(event.target.value)} placeholder="Написать сообщение..." /><button><Send size={18} /></button></form></main>; }

function ProfileView({ profile, online, onSave, onOpenUtility }: { profile: Profile; online: boolean; onSave: (profile: Profile) => void; onOpenUtility: (type: 'notifications' | 'privacy' | 'help') => void }) { const [editing, setEditing] = useState(false); const [form, setForm] = useState(profile); const setPhoto = (file?: File) => { if (!file || !file.type.startsWith('image/') || file.size > 5_000_000) return; const reader = new FileReader(); reader.onload = () => setForm({ ...form, image: String(reader.result) }); reader.readAsDataURL(file); }; return <section><div className="profile-hero"><img src={profile.image} alt={profile.name} /><button className="edit" onClick={() => { setForm(profile); setEditing(!editing); }}>{editing ? 'Отмена' : 'Изменить профиль'}</button><h2>{profile.name}, {profile.age}</h2><p><MapPin size={14} /> {profile.city} · {online ? 'синхронизировано' : 'офлайн'}</p></div>{editing ? <ProfileForm form={form} setForm={setForm} setPhoto={setPhoto} submit={event => { event.preventDefault(); onSave(form); setEditing(false); }} submitLabel="Сохранить изменения" /> : <div className="settings"><button className="setting" onClick={() => onOpenUtility('notifications')}><span><Bell /></span>Уведомления<ChevronRight className="push" size={18} /></button><button className="setting" onClick={() => onOpenUtility('privacy')}><span><ShieldCheck /></span>Конфиденциальность<ChevronRight className="push" size={18} /></button><button className="setting" onClick={() => onOpenUtility('help')}><span><HelpCircle /></span>Помощь и поддержка<ChevronRight className="push" size={18} /></button></div>}</section>; }
function ProfileDetail({ profile, onClose, onLike, onMessage }: { profile: Profile; onClose: () => void; onLike: () => void; onMessage: () => void }) { return <div className="profile-modal" onClick={onClose}><article onClick={event => event.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><img src={profile.image} alt={profile.name} /><div className="modal-copy"><p className="eyebrow">ПРОФИЛЬ</p><h2>{profile.name}, {profile.age}</h2><p><MapPin size={14} /> {profile.city}</p><p className="modal-bio">{profile.bio}</p><button className="primary wide" onClick={onLike}><Heart size={18} fill="currentColor" /> Нравится</button><button className="secondary wide" onClick={onMessage}><MessageCircle size={18} /> Написать</button></div></article></div>; }
function Empty({ icon, title, text, action, onClick }: { icon: ReactNode; title: string; text: string; action: string; onClick: () => void }) { return <div className="empty"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{text}</p><button className="primary" onClick={onClick}>{action}</button></div>; }
function UtilityModal({ type, notifications, onClose }: { type: 'notifications' | 'privacy' | 'help'; notifications: Notification[]; onClose: () => void }) { const titles = { notifications: 'Уведомления', privacy: 'Конфиденциальность', help: 'Помощь и поддержка' }; return <div className="profile-modal" onClick={onClose}><article className="utility-card" onClick={event => event.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><div className="modal-copy"><p className="eyebrow">BLISKO</p><h2>{titles[type]}</h2>{type === 'notifications' && notifications.length ? <div className="notification-list">{notifications.map(item => <div className="notification-item" key={item.id}><b>{item.title}</b><span>{item.body}</span></div>)}</div> : <p className="modal-bio">{type === 'notifications' ? 'Пока уведомлений нет.' : 'Настройки будут расширяться по мере развития BLISKO.'}</p>}<button className="primary wide" onClick={onClose}>Понятно</button></div></article></div>; }
export default App;
