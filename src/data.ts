export type Gender = 'male' | 'female';
export type InterestedIn = 'male' | 'female' | 'all';
export type DatingMode = 'hot' | 'quick' | 'friends' | 'relationship' | 'casual' | 'company';
export type Profile = { id: number; name: string; age: number; city: string; distance: string; bio: string; tags: string[]; image: string; gender: Gender; interestedIn: InterestedIn; datingMode: DatingMode; online?: boolean };
export type Chat = { id: number; name: string; avatar: string; last: string; time: string; unread?: number; online?: boolean };
