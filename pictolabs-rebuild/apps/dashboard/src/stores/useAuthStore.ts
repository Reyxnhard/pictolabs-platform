import { create } from 'zustand';
import axios from 'axios';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role?: string;
}

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  initialize: () => void;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('pictolabs_auth_token'),
  user: localStorage.getItem('pictolabs_auth_user')
    ? JSON.parse(localStorage.getItem('pictolabs_auth_user')!)
    : null,
  isAuthenticated: !!localStorage.getItem('pictolabs_auth_token'),
  isLoading: false,
  error: null,

  initialize: () => {
    const token = localStorage.getItem('pictolabs_auth_token');
    const userStr = localStorage.getItem('pictolabs_auth_user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        set({ token, user, isAuthenticated: true });
      } catch {
        localStorage.removeItem('pictolabs_auth_token');
        localStorage.removeItem('pictolabs_auth_user');
        set({ token: null, user: null, isAuthenticated: false });
      }
    }
  },

  login: async (email: string, pass: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        email,
        password: pass,
      });

      const { accessToken, user } = response.data;
      localStorage.setItem('pictolabs_auth_token', accessToken);
      localStorage.setItem('pictolabs_auth_user', JSON.stringify(user));

      set({
        token: accessToken,
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      return { success: true };
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'Gagal masuk. Periksa email dan kata sandi Anda.';
      set({ isLoading: false, error: message });
      return { success: false, error: message };
    }
  },

  logout: () => {
    localStorage.removeItem('pictolabs_auth_token');
    localStorage.removeItem('pictolabs_auth_user');
    set({ token: null, user: null, isAuthenticated: false, error: null });
  },
}));
