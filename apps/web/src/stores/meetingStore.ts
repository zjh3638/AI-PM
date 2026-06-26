import { create } from 'zustand';
import { meetingApi, type Meeting, type BoardData } from '../api/meeting';

interface MeetingState {
  meeting: Meeting | null;
  boardData: BoardData | null;
  loading: boolean;
  boardLoading: boolean;
  fetchMeeting: (id: string) => Promise<void>;
  fetchBoard: (meetingId: string, workspaceId: string) => Promise<void>;
  addNote: (
    meetingId: string,
    who: string,
    text: string,
    noteType?: string,
  ) => Promise<void>;
  closeMeeting: (meetingId: string) => Promise<void>;
  reset: () => void;
}

export const useMeetingStore = create<MeetingState>((set, get) => ({
  meeting: null,
  boardData: null,
  loading: false,
  boardLoading: false,

  fetchMeeting: async (id) => {
    set({ loading: true });
    try {
      set({ meeting: await meetingApi.get(id) });
    } finally {
      set({ loading: false });
    }
  },

  fetchBoard: async (meetingId, workspaceId) => {
    set({ boardLoading: true });
    try {
      set({ boardData: await meetingApi.getBoard(meetingId, workspaceId) });
    } finally {
      set({ boardLoading: false });
    }
  },

  addNote: async (meetingId, who, text, noteType = 'speech') => {
    const updated = await meetingApi.addNote(meetingId, {
      who,
      text,
      note_type: noteType,
    });
    set({ meeting: updated });
  },

  closeMeeting: async (meetingId) => {
    const updated = await meetingApi.close(meetingId);
    set({ meeting: updated });
  },

  reset: () => set({ meeting: null, boardData: null }),
}));
