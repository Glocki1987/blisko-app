export type Gender = 'male' | 'female';
export type InterestedIn = 'male' | 'female' | 'all';
export type Profile = { id: number; name: string; age: number; city: string; distance: string; bio: string; tags: string[]; image: string; gender: Gender; interestedIn: InterestedIn; online?: boolean };
export type Chat = { id: number; name: string; avatar: string; last: string; time: string; unread?: number; online?: boolean };

export const profiles: Profile[] = [
  { id: 1, name: 'Лера', age: 25, city: 'Москва', distance: '2 км от вас', bio: 'Люблю маленькие кофейни, большие планы и спонтанные поездки.', tags: ['кофе', 'путешествия', 'йога'], image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&q=85', gender: 'female', interestedIn: 'all', online: true },
  { id: 2, name: 'Илья', age: 28, city: 'Москва', distance: '4 км от вас', bio: 'Дизайнер, бегун и фанат хорошей музыки. Ищу человека для приключений.', tags: ['бег', 'дизайн', 'музыка'], image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&q=85', gender: 'male', interestedIn: 'all' },
  { id: 3, name: 'Маша', age: 24, city: 'Москва', distance: '6 км от вас', bio: 'Собираю винил и места, в которых хочется остаться подольше.', tags: ['винил', 'кино', 'вино'], image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&q=85', gender: 'female', interestedIn: 'all' }
];
export const chats: Chat[] = [
  { id: 1, name: 'Лера', avatar: profiles[0].image, last: 'Тогда до встречи в субботу ☕', time: '12:42', unread: 2, online: true },
  { id: 2, name: 'Аня', avatar: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=200&q=80', last: 'Привет! Как твой день?', time: 'Вчера' },
  { id: 3, name: 'Маша', avatar: profiles[2].image, last: 'Это звучит прекрасно!', time: 'Пн' }
];
