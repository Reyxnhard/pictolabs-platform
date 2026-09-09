import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../services/api';

interface BoothStatusUpdate {
  boothId: string;
  status: string;
  isMaintenance: boolean;
  lastSeen?: string;
}

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  lastUpdate: BoothStatusUpdate | null;
  updatesCount: number;
  connect: () => void;
  disconnect: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  lastUpdate: null,
  updatesCount: 0,

  connect: () => {
    if (get().socket) return;

    try {
      const socket = io(API_BASE_URL, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
      });

      socket.on('connect', () => {
        console.log('[SocketStore] Connected to KioskGateway WebSocket:', socket.id);
        set({ isConnected: true });
        // Join dashboards room for real-time broadcast events
        socket.emit('join_room', { room: 'dashboards' });
      });

      socket.on('disconnect', () => {
        console.warn('[SocketStore] Disconnected from WebSocket');
        set({ isConnected: false });
      });

      socket.on('connect_error', (err) => {
        console.warn('[SocketStore] Connection error:', err.message);
        set({ isConnected: false });
      });

      socket.on('booth_status_changed', (data: BoothStatusUpdate) => {
        console.log('[SocketStore] 🔔 Received booth_status_changed:', data);
        set((state) => ({
          lastUpdate: data,
          updatesCount: state.updatesCount + 1,
        }));
      });

      set({ socket });
    } catch (err: any) {
      console.error('[SocketStore] Failed to initialize socket:', err.message);
    }
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false });
    }
  },
}));
