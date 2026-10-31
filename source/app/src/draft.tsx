import React, { createContext, useContext, useState } from 'react';
import { Stamp } from './weather';

export type Draft = {
  venue: string | null;
  dish: string;
  sat: number;
  vals: Record<string, string>;
  stamp: Stamp | null;
  rouletteId: string | null;
  /** 添付する写真（最大3枚）。url があればアップロード済み */
  photos: DraftPhoto[];
};

export type DraftPhoto = { id: string; uri: string; url?: string; busy?: boolean; error?: string };

export const emptyDraft = (): Draft => ({ venue: null, dish: '', sat: 0, vals: {}, stamp: null, rouletteId: null, photos: [] });

type Ctx = { D: Draft; setD: React.Dispatch<React.SetStateAction<Draft>>; clear: () => void };
const DraftCtx = createContext<Ctx>(null as unknown as Ctx);
export const useDraft = () => useContext(DraftCtx);

export function DraftProvider({ children }: { children: React.ReactNode }) {
  const [D, setD] = useState<Draft>(emptyDraft);
  return <DraftCtx.Provider value={{ D, setD, clear: () => setD(emptyDraft()) }}>{children}</DraftCtx.Provider>;
}
