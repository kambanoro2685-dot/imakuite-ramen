import { useCallback, useRef } from 'react';
import { fetchMe } from './account';
import { Post, useStore } from './store';
import { SYNC_DONE, syncPost } from './sync';

/** 投稿をサーバへ同期し、成功したらサーバのポイント・信頼度で端末の表示を置き換える */
export function useSyncer() {
  const { signedIn, update } = useStore();
  const running = useRef(new Set<number>());

  return useCallback(
    async (post: Post): Promise<{ r: 'done' | 'pending' | 'failed'; msg?: string }> => {
      if (!signedIn || !post.sync || post.sync.step >= SYNC_DONE) return { r: 'done' };
      if (running.current.has(post.id)) return { r: 'pending' };
      running.current.add(post.id);
      try {
        await syncPost(post, (sy) =>
          update((s) => ({ ...s, posts: s.posts.map((p) => (p.id === post.id ? { ...p, sync: sy } : p)) })),
        );
        const me = await fetchMe();
        if (me) update((s) => ({ ...s, pt: me.ikp, trust: Math.round(me.trust_score / 10) }));
        return { r: 'done' };
      } catch (e: any) {
        // ネットワーク断・認証切れ・一時的な不調は後で再送。入力エラー（制約違反・権限）は再送しても直らない
        const code = String(e?.code ?? '');
        const permanent = /^(22|23|42|P0)/.test(code) && code !== '23505';
        console.warn('[imakuite] sync error', e);
        const msg = `${e?.message ?? e}${code ? ` [${code}]` : ''}`;
        return { r: permanent ? 'failed' : 'pending', msg };
      } finally {
        running.current.delete(post.id);
      }
    },
    [signedIn, update],
  );
}
