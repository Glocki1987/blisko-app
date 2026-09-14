import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bell, Check, ChevronRight, Heart, HelpCircle, House, Image as ImageIcon, MapPin, MessageCircle, Mic, RotateCcw, Send, ShieldCheck, Shuffle, SlidersHorizontal, Sparkles, Square, UserRound, X, Zap } from 'lucide-react';
import { type Chat, type DatingMode, type Gender, type InterestedIn, type Profile } from './data';
import { telegram } from './telegram';

type Tab = 'discover' | 'random' | 'likes' | 'messages' | 'profile';
type Message = { id: string; sender: 'me' | 'them'; text: string; createdAt: string };
type Notification = { id: string; title: string; body: string; createdAt: string };
type RandomMatch = { id: number; city: string; online: boolean };
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
const uniqueProfiles = (items: Profile[]) => [...new Map(items.map(item => [item.id, item])).values()];
const initialProfile: Profile = { id: 1001, name: '', age: 18, city: '', distance: '', bio: '', tags: [], image: '', gender: 'female', interestedIn: 'all', datingMode: 'friends' };
const polishCities = ['Warszawa', 'Nowy Dwór Mazowiecki', 'Kraków', 'Łódź', 'Wrocław', 'Poznań', 'Gdańsk', 'Gdynia', 'Lublin', 'Katowice', 'Radom', 'Toruń', 'Rzeszów', 'Białystok', 'Szczecin', 'Olsztyn', 'Opole', 'Gliwice'];
const interestOptions = ['Спорт', 'Плавание', 'Учёба', 'Книги', 'Музыка', 'Кино', 'Путешествия', 'Игры', 'Кофе', 'Искусство', 'Языки', 'Фотография', 'Готовка', 'Танцы', 'Природа'];
const datingModes: { value: DatingMode; label: string; icon: string; description: string }[] = [
  { value: 'hot', label: 'Горячие предложения', icon: '🔥', description: 'Открыт(а) к яркой взаимной симпатии' },
  { value: 'quick', label: 'Быстрые знакомства', icon: '⚡', description: 'Лёгкое общение без долгих ожиданий' },
  { value: 'friends', label: 'Новые друзья', icon: '🤝', description: 'Ищу дружбу и приятную компанию' },
  { value: 'relationship', label: 'Ищу отношения', icon: '💜', description: 'Хочу построить настоящую связь' },
  { value: 'casual', label: 'Не ищу отношений', icon: '🙂', description: 'Просто общение и новые впечатления' },
  { value: 'company', label: 'Ищу компанию', icon: '🫶', description: 'Для прогулок, хобби и событий' },
];

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
  const [randomMatch, setRandomMatch] = useState<RandomMatch | null>(null);
  const [randomLoading, setRandomLoading] = useState(false);
  const [randomError, setRandomError] = useState('');

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
      setProfile({ ...initialProfile, ...auth.profile, datingMode: auth.profile?.datingMode || 'friends', tags: Array.isArray(auth.profile?.tags) ? auth.profile.tags : [] });
      setOnboarded(true);
      localStorage.setItem('blisko-onboarded', '1');
      const [feed, likes, matchData, conversationData, noteData] = await Promise.all([
        api<{ profiles: Profile[] }>('/api/discover'),
        api<{ likes: number[] }>('/api/likes'),
        api<{ matches: Profile[] }>('/api/matches'),
        api<{ conversations: Chat[] }>('/api/conversations'),
        api<{ notifications: Notification[] }>('/api/notifications'),
      ]);
      setDiscover(uniqueProfiles(feed.profiles));
      setLiked(likes.likes);
      setMatches(uniqueProfiles(matchData.matches));
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
  const findRandomMatch = async () => {
    setRandomLoading(true);
    setRandomError('');
    try {
      const result = await api<{ match: RandomMatch }>('/api/random-match');
      setRandomMatch(result.match);
    } catch (error) {
      setRandomMatch(null);
      setRandomError(error instanceof Error ? error.message.replace(/^API \d+: /, '') : 'Не удалось найти собеседника');
    } finally {
      setRandomLoading(false);
    }
  };
  useEffect(() => { if (tab === 'random' && !randomMatch) findRandomMatch(); }, [tab, randomMatch]);
  useEffect(() => {
    if (!onboarded) return;
    const sendPresence = () => { api<{ online: boolean }>('/api/presence', { method: 'POST' }).catch(error => console.error('Не удалось обновить статус сети', error)); };
    sendPresence();
    const timer = window.setInterval(sendPresence, 60_000);
    return () => window.clearInterval(timer);
  }, [onboarded]);
  const saveProfile = async (next: Profile) => {
    if (savingProfile) return;
    setSavingProfile(true);
    try {
      const result = await api<{ profile: Profile }>('/api/profile', { ...json(next), method: 'PUT' });
      setProfile({ ...initialProfile, ...result.profile, datingMode: result.profile.datingMode || 'friends', tags: Array.isArray(result.profile.tags) ? result.profile.tags : [] });
      setOnboarded(true);
      localStorage.setItem('blisko-onboarded', '1');
      setOnline(true);
      await refresh();
    } catch (error) {
      console.error('Не удалось сохранить анкету', error);
      throw error;
    } finally {
      setSavingProfile(false);
    }
  };
  const deleteProfile = async () => {
    await api<{ deleted: boolean }>('/api/profile', { method: 'DELETE' });
    localStorage.removeItem('blisko-onboarded');
    localStorage.removeItem('blisko-token');
    setProfile({ ...initialProfile, id: telegram.user.id });
    setOnboarded(false);
    setDiscover([]);
    setMatches([]);
    setChats([]);
    setLiked([]);
    setOnline(false);
  };
  const logout = async () => {
    try { await api<{ loggedOut: boolean }>('/api/auth/logout', { method: 'POST' }); } finally {
      localStorage.removeItem('blisko-onboarded');
      localStorage.removeItem('blisko-token');
      setProfile({ ...initialProfile, id: telegram.user.id });
      setOnboarded(false);
      setOnline(false);
    }
  };
  const act = async (id: number, action: 'like' | 'skip') => {
    setDiscover(items => items.filter(item => item.id !== id));
    if (action === 'like') setLiked(items => items.includes(id) ? items : [...items, id]);
    try {
      const result = await api<{ matched?: boolean }>(action === 'like' ? '/api/likes' : '/api/discover/skip', json({ profileId: id }));
      await refresh();
      return Boolean(result.matched);
    } catch (error) {
      console.error('Действие не сохранено', error);
      return false;
    }
  };
  const openRandomChat = () => {
    if (!randomMatch) return;
    setChats(items => items.some(chat => chat.id === randomMatch.id) ? items : [...items, { id: randomMatch.id, name: 'Аноним', avatar: '', last: 'Анонимный чат', time: 'сейчас', online: randomMatch.online }]);
    setSelectedChat(randomMatch.id);
  };
  if (loading) return <LaunchScreen />;
  if (loadError) return <div className="loading-screen error-screen"><div><h2>Не удалось войти</h2><p>{loadError}</p><button className="primary" onClick={refresh}>Повторить</button></div></div>;
  if (!onboarded) return <Onboarding profile={profile} onDone={saveProfile} saving={savingProfile} />;
  const current = discover[0];
  const activeChat = chats.find(chat => chat.id === selectedChat);
  return <div className="app-shell">
    <header className="topbar"><div className="brand">bli<span>s</span>ko</div></header>
    {selectedChat && activeChat ? <ChatView chat={activeChat} onBack={() => setSelectedChat(null)} onSent={refresh} /> : <main className="main-content">
      {tab === 'discover' && (current ? <Discover profile={current} onOpen={() => setViewed(current)} onLike={async () => { if (await act(current.id, 'like')) setMatchNotice(current); }} onSkip={() => act(current.id, 'skip')} /> : <FeedEmpty onRefresh={refresh} />)}
      {tab === 'random' && <RandomDating match={randomMatch} loading={randomLoading} error={randomError} onFind={findRandomMatch} onChat={openRandomChat} />}
      {tab === 'likes' && <Likes matches={matches} onOpen={() => setTab('discover')} onOpenChat={setSelectedChat} />}
      {tab === 'messages' && <Messages chats={chats} onOpen={setSelectedChat} />}
      {tab === 'profile' && <ProfileView profile={profile} online={online} onSave={saveProfile} onDelete={deleteProfile} onLogout={logout} onOpenUtility={setUtility} />}
    </main>}
    {!selectedChat && <nav className="bottom-nav">{([['discover', House, 'Лента'], ['random', Shuffle, 'Рандом'], ['likes', Heart, 'Лайки'], ['messages', MessageCircle, 'Чаты'], ['profile', UserRound, 'Профиль']] as const).map(([key, Icon, label]) => <button key={key} className={tab === key ? 'nav-item active random-nav-item' : 'nav-item random-nav-item'} onClick={() => { setTab(key); if (key === 'random') setRandomMatch(null); }}><Icon size={21} fill={tab === key && key === 'likes' ? 'currentColor' : 'none'} /><span>{label}</span></button>)}</nav>}
    {viewed && <ProfileDetail profile={viewed} onClose={() => setViewed(null)} onLike={() => { act(viewed.id, 'like'); setViewed(null); }} onMessage={async () => { const matched = await act(viewed.id, 'like'); setViewed(null); if (matched) setSelectedChat(viewed.id); }} />}
    {utility && <UtilityModal type={utility} notifications={notifications} onClose={() => setUtility(null)} />}
    {matchNotice && <div className="match-overlay" onClick={() => setMatchNotice(null)}><div className="match-glow" /><div className="match-particles">✦ ✧ ✦ ✧ ✦</div><div className="match-avatars"><img src={profile.image} alt="" /><Heart fill="currentColor" /><img src={matchNotice.image} alt={matchNotice.name} /></div><p className="eyebrow">НОВАЯ СИМПАТИЯ</p><h2>Вы понравились<br />друг другу</h2><button className="primary wide" onClick={() => { setMatchNotice(null); setSelectedChat(matchNotice.id); }}>Написать сейчас <MessageCircle size={18} /></button><button className="match-dismiss" onClick={() => setMatchNotice(null)}>Продолжить просмотр</button></div>}
  </div>;
}

function LaunchScreen() {
  return <div className="loading-screen" aria-label="BLISKO запускается">
    <div className="launch-aura" />
    <div className="launch-mark"><span className="launch-ring ring-one" /><span className="launch-ring ring-two" /><span className="launch-ring ring-three" /><span className="launch-core">b</span><i className="launch-dot dot-one" /><i className="launch-dot dot-two" /><i className="launch-dot dot-three" /></div>
    <div className="launch-brand">bli<span>s</span>ko</div>
    <div className="launch-progress"><i /></div>
  </div>;
}

function Onboarding({ profile, onDone, saving }: { profile: Profile; onDone: (profile: Profile) => void; saving: boolean }) {
  const [form, setForm] = useState(profile);
  const [step, setStep] = useState(1);
  const [genderSelected, setGenderSelected] = useState(false);
  const [interestedSelected, setInterestedSelected] = useState(false);
  const locationLoading = false;
  const locationError = '';
  const detectLocation = () => undefined;
  const setPhoto = (file?: File) => { if (!file || !file.type.startsWith('image/') || file.size > 5_000_000) return; const reader = new FileReader(); reader.onload = () => setForm({ ...form, image: String(reader.result) }); reader.readAsDataURL(file); };
  const next = () => setStep(current => Math.min(7, current + 1));
  const back = () => setStep(current => Math.max(1, current - 1));
  const canContinue = (step === 1 && form.name.trim() && form.age >= 18) || (step === 2 && genderSelected) || (step === 3 && interestedSelected) || (step === 4 && Boolean(form.city)) || (step === 5 && Boolean(form.image)) || (step === 6 && Boolean(form.datingMode)) || step === 7;
  const titles = ['О тебе', 'Твой пол', 'Кого ищешь', 'Локация', 'Твоё фото', 'Твой формат', 'О себе и интересы'];
  const subtitles = ['Начнём с самых простых вещей.', 'Это помогает подобрать подходящие анкеты.', 'Выбери, кого хочешь видеть в ленте.', 'Можно выбрать город вручную или по геолокации.', 'Добавь настоящее фото — без демонстрационных изображений.', 'Расскажи, какого общения хочется сейчас.', 'Добавь интересы, чтобы находить близких по духу людей.'];
  return <div className="onboarding"><div className="onboard-panel"><div className="onboard-top"><div className="brand">bli<span>s</span>ko</div><span className="onboard-counter">{step} / 7</span></div><div className="onboarding-progress"><i style={{ width: `${step * (100 / 7)}%` }} /></div><div className="onboard-heading"><span className="onboard-kicker">ШАГ {step}</span><h1>{titles[step - 1]}</h1><p>{subtitles[step - 1]}</p></div>  <form className="onboard-form" onSubmit={event => { event.preventDefault(); if (step === 7) onDone(form); else next(); }}>{step === 1 && <div className="onboard-fields"><label>Имя<input autoFocus required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Например, Анна" /></label><label>Возраст<input required type="number" min="18" max="100" value={form.age} onChange={event => setForm({ ...form, age: Number(event.target.value) })} /></label></div>}{step === 2 && <div className="choice-grid single-choice"><span className="choice-label">Как тебя представить?</span><button type="button" className={form.gender === 'female' ? 'choice selected' : 'choice'} onClick={() => { setForm({ ...form, gender: 'female' }); setGenderSelected(true); }}>Девушка</button><button type="button" className={form.gender === 'male' ? 'choice selected' : 'choice'} onClick={() => { setForm({ ...form, gender: 'male' }); setGenderSelected(true); }}>Парень</button></div>}{step === 3 && <div className="choice-grid single-choice"><span className="choice-label">Кого хочешь встретить?</span><button type="button" className={form.interestedIn === 'female' ? 'choice selected' : 'choice'} onClick={() => { setForm({ ...form, interestedIn: 'female' }); setInterestedSelected(true); }}>Девушек</button><button type="button" className={form.interestedIn === 'male' ? 'choice selected' : 'choice'} onClick={() => { setForm({ ...form, interestedIn: 'male' }); setInterestedSelected(true); }}>Парней</button><button type="button" className={form.interestedIn === 'all' ? 'choice selected' : 'choice'} onClick={() => { setForm({ ...form, interestedIn: 'all' }); setInterestedSelected(true); }}>Всех</button></div>}{step === 4 && <div className="location-step"><label>Город<select autoFocus required value={form.city} onChange={event => setForm({ ...form, city: event.target.value })}><option value="">Выбери город в Польше</option>{polishCities.map(city => <option key={city}>{city}</option>)}</select></label><button type="button" className="location-button" onClick={detectLocation} disabled={locationLoading}><MapPin size={17} />{locationLoading ? 'Определяем…' : 'Определить по местоположению'}</button>{locationError && <small className="location-error">{locationError}</small>}</div>  }{step === 5 && <div className="photo-step"><label className={`photo-picker ${form.image ? 'has-photo' : ''}`}><div className="photo-upload-glow" /><div className="photo-orbit"><span /><span /><span /><span /></div>{form.image ? <><img src={form.image} alt="Фото профиля" /><div className="photo-preview-badge"><Check size={16} /> Фото готово</div></> : <div className="photo-placeholder"><div className="photo-placeholder-icon"><ImageIcon size={28} /></div><b>Твоё фото появится здесь</b><small>Нажми, чтобы выбрать JPG или PNG до 5 МБ</small><span className="photo-pulse-label">Ожидаем фото</span></div>}<input aria-label="Добавить фото профиля" type="file" accept="image/*" onChange={event => setPhoto(event.target.files?.[0])} /></label><small className="form-tip">Только твоё фото. Демо-аватары больше не используются.</small></div>  }{step === 6 && <div className="mode-grid">{datingModes.map(mode => <button type="button" key={mode.value} className={form.datingMode === mode.value ? 'mode-card selected' : 'mode-card'} onClick={() => setForm({ ...form, datingMode: mode.value })}><span>{mode.icon}</span><div><b>{mode.label}</b><small>{mode.description}</small></div></button>)}</div>}{step === 7 && <div className="about-step"><label>О себе<textarea autoFocus maxLength={500} value={form.bio} onChange={event => setForm({ ...form, bio: event.target.value })} placeholder="Пара слов о себе" /></label><div className="interest-picker"><span className="choice-label">Твои интересы</span><div className="interest-grid">{interestOptions.map(tag => <button type="button" key={tag} className={form.tags.includes(tag) ? 'interest selected' : 'interest'} onClick={() => setForm({ ...form, tags: form.tags.includes(tag) ? form.tags.filter(item => item !== tag) : [...form.tags, tag] })}>{tag}</button>)}</div><small className="form-tip">Выбери то, что действительно тебе нравится.</small></div></div>}<div className="onboarding-actions">{step > 1 && <button type="button" className="secondary" onClick={back} disabled={saving || locationLoading}>Назад</button>}  <button className="primary wide" type="submit" disabled={!canContinue || saving || locationLoading}>{saving ? 'Сохраняем…' : step === 7 ? 'Готово' : 'Продолжить'} {!saving && <ChevronRight size={19} />}</button></div></form></div></div>;
}

function ProfileForm({ form, setForm, setPhoto, submit, submitLabel }: { form: Profile; setForm: (profile: Profile) => void; setPhoto: (file?: File) => void; submit: (event: FormEvent) => void; submitLabel: string }) {
  return <form onSubmit={submit} className="onboard-form profile-edit-form"><label className={`photo-picker edit-photo-picker ${form.image ? 'has-photo' : ''}`}><div className="photo-upload-glow" /><div className="photo-orbit"><span /><span /><span /><span /></div>{form.image ? <><img src={form.image} alt="Фото профиля" /><div className="photo-preview-badge"><Check size={16} /> Фото готово</div></> : <div className="photo-placeholder"><div className="photo-placeholder-icon"><ImageIcon size={28} /></div><b>Добавь фото профиля</b><small>Нажми, чтобы выбрать JPG или PNG</small><span className="photo-pulse-label">Ожидаем фото</span></div>}<input aria-label="Изменить фото профиля" type="file" accept="image/*" onChange={event => setPhoto(event.target.files?.[0])} /></label><input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Как тебя зовут?" /><input required type="number" min="18" max="100" value={form.age} onChange={event => setForm({ ...form, age: Number(event.target.value) })} placeholder="Возраст" /><div className="form-grid"><select required value={form.gender} onChange={event => setForm({ ...form, gender: event.target.value as Gender })}><option value="female">Я девушка</option><option value="male">Я парень</option></select><select required value={form.interestedIn} onChange={event => setForm({ ...form, interestedIn: event.target.value as InterestedIn })}><option value="female">Ищу девушек</option><option value="male">Ищу парней</option><option value="all">Ищу всех</option></select></div><select required value={form.city} onChange={event => setForm({ ...form, city: event.target.value })}><option value="">Выбери город в Польше</option>{polishCities.map(city => <option key={city}>{city}</option>)}</select><select required value={form.datingMode} onChange={event => setForm({ ...form, datingMode: event.target.value as DatingMode })}>{datingModes.map(mode => <option key={mode.value} value={mode.value}>{mode.icon} {mode.label}</option>)}</select><div className="interest-picker"><span className="choice-label">Интересы</span><div className="interest-grid">{interestOptions.map(tag => <button type="button" key={tag} className={form.tags.includes(tag) ? 'interest selected' : 'interest'} onClick={() => setForm({ ...form, tags: form.tags.includes(tag) ? form.tags.filter(item => item !== tag) : [...form.tags, tag] })}>{tag}</button>)}</div></div><textarea maxLength={500} value={form.bio} onChange={event => setForm({ ...form, bio: event.target.value })} placeholder="Расскажи о себе (до 500 символов)" /><button className="primary wide" type="submit">{submitLabel} <ChevronRight size={19} /></button></form>;
}

function RandomDating({ match, loading, error, onFind, onChat }: { match: RandomMatch | null; loading: boolean; error: string; onFind: () => void; onChat: () => void }) {
  return <section className="random-page"><div className="section-heading"><div><p className="eyebrow">BLISKO / RANDOM</p><h2>Анонимные знакомства</h2><p className="location-label">Без имён, фото и лишних данных</p></div><Shuffle className="random-heading-icon" /></div><div className="random-orb"><div className="random-orb-core"><Shuffle size={34} /></div><span /><span /><span /></div>{loading ? <div className="random-state"><b>Ищем случайного собеседника…</b><small>Подбираем человека для лёгкого анонимного общения</small></div> : error ? <div className="random-state"><b>Пока никого не нашли</b><small>{error}</small></div> : match ? <div className="random-match-card"><span className="anonymous-avatar">?</span><p className="eyebrow">СЛУЧАЙНЫЙ СОБЕСЕДНИК</p><h3>Аноним</h3><p><MapPin size={15} /> {match.city}</p><small><i className={match.online ? 'online-dot-small' : 'recent-dot-small'} /> {match.online ? 'сейчас в сети' : 'был(а) недавно'}</small><button className="primary wide" onClick={onChat}><MessageCircle size={18} /> Начать анонимный чат</button></div> : null}<div className="random-actions"><button className="secondary" onClick={onFind} disabled={loading}><Shuffle size={17} /> Найти другого</button><small>Ты сам(а) решаешь, когда открыть личность и перейти к обычному знакомству.</small></div></section>;
}

function Discover({ profile, onOpen, onLike, onSkip }: { profile: Profile; onOpen: () => void; onLike: () => void; onSkip: () => void }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef(0);
  const finishDrag = (value: number) => { setDragging(false); if (Math.abs(value) > 90) { value > 0 ? onLike() : onSkip(); } else setOffset(0); };
  const mode = datingModes.find(item => item.value === profile.datingMode) || datingModes[2];
  return <section className="discover"><div className="section-heading"><div><p className="eyebrow">DISCOVER / 01</p><h2>Кто рядом</h2><p className="location-label"><MapPin size={13} /> {profile.city}</p></div><button className="filter" onClick={onOpen}><SlidersHorizontal size={18} /></button></div><div className="card-wrap"><article className={`profile-card swipe-card ${dragging ? 'is-dragging' : ''}`} style={{ transform: `translateX(${offset}px) rotate(${offset / 18}deg)` }} onPointerDown={event => { start.current = event.clientX; setDragging(true); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (dragging) setOffset(event.clientX - start.current); }} onPointerUp={() => finishDrag(offset)} onClick={event => { if (Math.abs(offset) < 8) onOpen(); }}><div className={`swipe-signal ${offset > 20 ? 'positive' : offset < -20 ? 'negative' : ''}`}>{offset > 20 ? 'LIKE' : offset < -20 ? 'PASS' : ''}</div><img src={profile.image} alt={profile.name} /><div className="shade" /><div className="online-dot" /><div className="card-info"><div className="card-name"><h2>{profile.name}, {profile.age}</h2><span><Check size={14} /></span></div><p><MapPin size={14} /> {profile.distance || profile.city}</p><span className="mode-badge">{mode.icon} {mode.label}</span><p className="bio">{profile.bio}</p><div className="tags">{profile.tags.map(tag => <span key={tag}>#{tag}</span>)}</div></div></article></div><div className="actions"><button className="round-btn utility" onClick={() => setOffset(0)}><RotateCcw /></button><button className="round-btn skip" onClick={onSkip}><X /></button><button className="round-btn like" onClick={onLike}><Heart fill="currentColor" /></button><button className="round-btn utility" onClick={onLike}><Zap /></button></div></section>;
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
  return <main className="chat-view"><header className="chat-head"><button className="back" onClick={onBack}><ArrowLeft /></button>{chat.avatar ? <img src={chat.avatar} alt="" /> : <span className="anonymous-chat-avatar">?</span>}<div><b>{chat.name}</b><small><i className="status-dot" /> {chat.online ? 'в сети' : 'был(а) недавно'}</small></div></header><div className="messages">{items.map(item => <div className={`bubble ${item.sender === 'me' ? 'mine' : 'theirs'}`} key={item.id}>{renderMessage(item)}<time>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>)}{sending && <div className="typing-indicator" aria-label="Отправка сообщения"><i /><i /><i /></div>}<div ref={messagesEnd} /></div><form className="composer" onSubmit={send}><input ref={fileInput} hidden type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (file) sendAttachment(file); event.target.value = ''; }} /><button type="button" className="chat-tool" onClick={() => fileInput.current?.click()} aria-label="Отправить фото"><ImageIcon size={19} /></button><input value={message} onChange={event => setMessage(event.target.value)} placeholder={recording ? 'Идёт запись голоса…' : 'Написать сообщение...'} disabled={recording} /><button type="button" className={`chat-tool wingman ${wingmanLoading ? 'is-loading' : ''}`} onClick={generateWingman} aria-label="AI Wingman"><Sparkles size={18} /></button><button type="button" className={`chat-tool ${recording ? 'recording' : ''}`} onClick={toggleRecording} aria-label={recording ? 'Остановить запись' : 'Записать голосовое'}>{recording ? <Square size={16} /> : <Mic size={19} />}</button><button type="submit" disabled={sending || recording}><Send size={18} /></button></form></main>;
}

function ProfileView({ profile, online, onSave, onDelete, onLogout, onOpenUtility }: { profile: Profile; online: boolean; onSave: (profile: Profile) => Promise<void>; onDelete: () => Promise<void>; onLogout: () => Promise<void>; onOpenUtility: (type: 'notifications' | 'privacy' | 'help') => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(profile);
  const [section, setSection] = useState<'account' | 'preferences' | 'support'>('account');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [deleteState, setDeleteState] = useState<'idle' | 'deleting' | 'error'>('idle');
  const setPhoto = (file?: File) => { if (!file || !file.type.startsWith('image/') || file.size > 5_000_000) return; const reader = new FileReader(); reader.onload = () => setForm({ ...form, image: String(reader.result) }); reader.readAsDataURL(file); };
  const openSettings = (type: 'notifications' | 'privacy' | 'help') => onOpenUtility(type);
  const saveChanges = async (event: FormEvent) => {
    event.preventDefault();
    setSaveState('saving');
    try { await onSave(form); setEditing(false); setSaveState('saved'); window.setTimeout(() => setSaveState('idle'), 2400); }
    catch { setSaveState('error'); }
  };
  const removeProfile = async () => {
    if (!window.confirm('Удалить профиль и все связанные данные? Это действие нельзя отменить.')) return;
    setDeleteState('deleting');
    try { await onDelete(); } catch { setDeleteState('error'); }
  };
  return <section className="settings-page">
    <div className="settings-heading"><div><p className="eyebrow">ACCOUNT / SETTINGS</p><h2>Настройки</h2><p>Управляй профилем и приватностью в одном месте.</p></div><div className="sync-badge"><i />{online ? 'Синхронизировано' : 'Офлайн'}</div></div>
    <div className="profile-hero"><img src={profile.image} alt={profile.name} /><button className="edit" onClick={() => { setForm(profile); setEditing(!editing); }}>{editing ? 'Отмена' : 'Изменить профиль'}</button><h2>{profile.name}, {profile.age}</h2><p><MapPin size={14} /> {profile.city}</p><div className="profile-badges"><span className="mode-badge">{(datingModes.find(item => item.value === profile.datingMode) || datingModes[2]).icon} {(datingModes.find(item => item.value === profile.datingMode) || datingModes[2]).label}</span>{profile.tags.slice(0, 5).map(tag => <span className="profile-tag" key={tag}>#{tag}</span>)}</div></div>
    <div className="settings-tabs" role="tablist"><button type="button" role="tab" aria-selected={section === 'account'} className={section === 'account' ? 'active' : ''} onClick={() => setSection('account')}>Аккаунт</button><button type="button" role="tab" aria-selected={section === 'preferences'} className={section === 'preferences' ? 'active' : ''} onClick={() => setSection('preferences')}>Приватность</button><button type="button" role="tab" aria-selected={section === 'support'} className={section === 'support' ? 'active' : ''} onClick={() => setSection('support')}>Поддержка</button></div>
    {editing ? <><ProfileForm form={form} setForm={setForm} setPhoto={setPhoto} submit={saveChanges} submitLabel={saveState === 'saving' ? 'Сохраняем…' : 'Сохранить изменения'} /><div className={`save-status ${saveState}`}>{saveState === 'saved' ? 'Изменения сохранены' : saveState === 'error' ? 'Не удалось сохранить. Попробуй ещё раз.' : saveState === 'saving' ? 'Синхронизируем данные…' : 'Все поля можно изменить позже.'}</div></> : <div className="settings-groups">
      {section === 'account' && <div className="settings-group"><p className="settings-label">ПРОФИЛЬ</p><button className="setting" onClick={() => { setForm(profile); setEditing(true); }}><span><UserRound /></span><div><b>Личные данные</b><small>Имя, фото, город и описание</small></div><ChevronRight className="push" size={18} /></button><button className="setting" onClick={() => openSettings('notifications')}><span><Bell /></span><div><b>Уведомления</b><small>Мэтчи, сообщения и активность</small></div><ChevronRight className="push" size={18} /></button></div>}
      {section === 'preferences' && <div className="settings-group"><p className="settings-label">БЕЗОПАСНОСТЬ И ДАННЫЕ</p><button className="setting" onClick={() => openSettings('privacy')}><span><ShieldCheck /></span><div><b>Как защищаются данные</b><small>Видимость, хранение и безопасность профиля</small></div><ChevronRight className="push" size={18} /></button><button className="setting" onClick={() => openSettings('privacy')}><span><SlidersHorizontal /></span><div><b>Параметры ленты</b><small>Город и предпочтения поиска</small></div><ChevronRight className="push" size={18} /></button><button className="setting" onClick={() => void onLogout()}><span><ArrowLeft /></span><div><b>Выйти из аккаунта</b><small>Завершить текущую Telegram-сессию</small></div><ChevronRight className="push" size={18} /></button><button className="setting danger-setting" onClick={removeProfile} disabled={deleteState === 'deleting'}><span><X /></span><div><b>{deleteState === 'deleting' ? 'Удаляем профиль…' : 'Удалить профиль'}</b><small>{deleteState === 'error' ? 'Не удалось удалить. Попробуй ещё раз.' : 'Удалит анкету, лайки, чаты и уведомления'}</small></div><ChevronRight className="push" size={18} /></button></div>}
      {section === 'support' && <div className="settings-group"><p className="settings-label">BLISKO CARE</p><div className="support-info"><b>Мы рядом, если что-то не работает</b><p>Напиши, если не загружается профиль, пропали сообщения или нужна помощь с входом. Укажи имя и коротко опиши проблему.</p><span>Обычно отвечаем в течение рабочего дня.</span></div><a className="setting support-link" href="https://t.me/bllisko_bot" target="_blank" rel="noreferrer"><span><MessageCircle /></span><div><b>Открыть поддержку в Telegram</b><small>@bllisko_bot · написать сообщение</small></div><ChevronRight className="push" size={18} /></a><button className="setting" onClick={() => openSettings('help')}><span><HelpCircle /></span><div><b>Частые вопросы</b><small>Безопасность, профиль и сообщения</small></div><ChevronRight className="push" size={18} /></button></div>}
    </div>}
  </section>;
}
function ProfileDetail({ profile, onClose, onLike, onMessage }: { profile: Profile; onClose: () => void; onLike: () => void; onMessage: () => void | Promise<void> }) { const mode = datingModes.find(item => item.value === profile.datingMode) || datingModes[2]; return <div className="profile-modal" onClick={onClose}><article onClick={event => event.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><img src={profile.image} alt={profile.name} /><div className="modal-copy"><p className="eyebrow">ПРОФИЛЬ</p><h2>{profile.name}, {profile.age}</h2><p><MapPin size={14} /> {profile.city} <span className={profile.online ? 'modal-online' : 'modal-recent'}>● {profile.online ? 'в сети' : 'был(а) недавно'}</span></p><span className="mode-badge">{mode.icon} {mode.label}</span><p className="modal-bio">{profile.bio || 'Пока без описания.'}</p><div className="modal-interests">{profile.tags.length ? profile.tags.map(tag => <span key={tag}>#{tag}</span>) : <small>Интересы пока не добавлены</small>}</div><button className="primary wide" onClick={onLike}><Heart size={18} fill="currentColor" /> Нравится</button><button className="secondary wide" onClick={onMessage}><MessageCircle size={18} /> Написать</button></div></article></div>; }
function Empty({ icon, title, text, action, onClick }: { icon: ReactNode; title: string; text: string; action: string; onClick: () => void }) { return <div className="empty"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{text}</p><button className="primary" onClick={onClick}>{action}</button></div>; }
function FeedEmpty({ onRefresh }: { onRefresh: () => void }) { return <div className="feed-empty"><div className="feed-empty-art"><span /><span /><Sparkles size={24} /></div><p className="eyebrow">ЛЕНТА ОБНОВЛЯЕТСЯ</p><h2>Пока всё просмотрено</h2><p>Новые анкеты появятся здесь совсем скоро. Можно обновить ленту или заглянуть в «Рандом».</p><button className="primary compact-action" onClick={onRefresh}>Обновить ленту <RotateCcw size={15} /></button></div>; }
function UtilityModal({ type, notifications, onClose }: { type: 'notifications' | 'privacy' | 'help'; notifications: Notification[]; onClose: () => void }) { const titles = { notifications: 'Уведомления', privacy: 'Конфиденциальность', help: 'Помощь и поддержка' }; const descriptions = { privacy: 'Твои данные видны только тем, кому ты показываешься в ленте. Мы не публикуем профиль вне BLISKO.', help: 'Если что-то работает не так, напиши нам через поддержку. Мы отвечаем в течение рабочего дня.', notifications: 'Здесь появятся события о новых мэтчах и сообщениях.' }; return <div className="profile-modal" onClick={onClose}><article className="utility-card" onClick={event => event.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><div className="modal-copy"><p className="eyebrow">BLISKO / SYSTEM</p><h2>{titles[type]}</h2>{type === 'notifications' && notifications.length ? <div className="notification-list">{notifications.map(item => <div className="notification-item" key={item.id}><b>{item.title}</b><span>{item.body}</span></div>)}</div> : <p className="modal-bio">{descriptions[type]}</p>}<button className="primary wide" onClick={onClose}>Готово</button></div></article></div>; }
export default App;
