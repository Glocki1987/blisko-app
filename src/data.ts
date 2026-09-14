export type Gender = 'male' | 'female';
export type InterestedIn = 'male' | 'female' | 'all';
export type Profile = { id: number; name: string; age: number; city: string; distance: string; bio: string; tags: string[]; image: string; gender: Gender; interestedIn: InterestedIn; online?: boolean };
export type Chat = { id: number; name: string; avatar: string; last: string; time: string; unread?: number; online?: boolean };
