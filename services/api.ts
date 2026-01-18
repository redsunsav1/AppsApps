
import { UserProfile, ConstructionUpdate, ProjectData, CalendarEvent, MortgageProgram, ShopItem } from '../types';

// Detect if we are in dev mode (Vite uses port 5173 usually) or prod (same port)
const API_BASE = ''; // Relative path works because we serve frontend from same express server

export const api = {
    // USER
    getUser: async (id: string): Promise<UserProfile | null> => {
        try {
            const res = await fetch(`${API_BASE}/api/user/${id}`);
            if (!res.ok) return null;
            return res.json();
        } catch (e) {
            return null;
        }
    },
    saveUser: async (user: UserProfile) => {
        await fetch(`${API_BASE}/api/user/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(user)
        });
    },

    // NEWS
    getNews: async (): Promise<ConstructionUpdate[]> => {
        const res = await fetch(`${API_BASE}/api/news`);
        return res.json();
    },
    saveNews: async (news: ConstructionUpdate[]) => {
        await fetch(`${API_BASE}/api/news/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(news)
        });
    },

    // PROJECTS
    getProjects: async (): Promise<ProjectData[]> => {
        const res = await fetch(`${API_BASE}/api/projects`);
        return res.json();
    },
    saveProjects: async (projects: ProjectData[]) => {
        await fetch(`${API_BASE}/api/projects/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(projects)
        });
    },

    // EVENTS
    getEvents: async (): Promise<CalendarEvent[]> => {
        const res = await fetch(`${API_BASE}/api/events`);
        return res.json();
    },
    saveEvents: async (events: CalendarEvent[]) => {
        await fetch(`${API_BASE}/api/events/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(events)
        });
    },

    // MORTGAGE
    getMortgage: async (): Promise<MortgageProgram[]> => {
        const res = await fetch(`${API_BASE}/api/mortgage`);
        return res.json();
    },
    saveMortgage: async (programs: MortgageProgram[]) => {
        await fetch(`${API_BASE}/api/mortgage/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(programs)
        });
    },

    // SHOP
    getShop: async (): Promise<ShopItem[]> => {
        const res = await fetch(`${API_BASE}/api/shop`);
        return res.json();
    },
    saveShop: async (items: ShopItem[]) => {
        await fetch(`${API_BASE}/api/shop/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(items)
        });
    }
};
