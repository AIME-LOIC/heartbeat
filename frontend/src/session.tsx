import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './config';

type SessionState = {
  ready: boolean;
  userId: string | null;
  userEmail: string | null;
  username: string | null;
  setUsername: (u: string | null) => void;
};

function getUsernameFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const prefix = email.split('@')[0]?.trim();
  return prefix ? prefix : null;
}

function usernameStorageKey(userId: string): string {
  return `hb_username:${userId}`;
}

function loadUsername(userId: string): string | null {
  const v = localStorage.getItem(usernameStorageKey(userId));
  return v?.trim() ? v.trim() : null;
}

function saveUsername(userId: string, username: string): void {
  localStorage.setItem(usernameStorageKey(userId), username.trim());
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [username, setUsernameState] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      setUserId(user?.id ?? null);
      setUserEmail(user?.email ?? null);
      const metaUsername = (user?.user_metadata as { username?: unknown } | undefined)?.username;
      const fromMeta = typeof metaUsername === 'string' && metaUsername.trim() ? metaUsername.trim() : null;
      const fromLocal = user?.id ? loadUsername(user.id) : null;
      const fromEmail = getUsernameFromEmail(user?.email);
      setUsernameState(fromMeta ?? fromLocal ?? fromEmail);
      setReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      setUserId(user?.id ?? null);
      setUserEmail(user?.email ?? null);
      const metaUsername = (user?.user_metadata as { username?: unknown } | undefined)?.username;
      const fromMeta = typeof metaUsername === 'string' && metaUsername.trim() ? metaUsername.trim() : null;
      const fromLocal = user?.id ? loadUsername(user.id) : null;
      const fromEmail = getUsernameFromEmail(user?.email);
      setUsernameState(fromMeta ?? fromLocal ?? fromEmail);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const setUsername = (u: string | null) => {
    setUsernameState(u);
    if (userId && u && u.trim()) saveUsername(userId, u);
  };

  const value = useMemo<SessionState>(
    () => ({ ready, userId, userEmail, username, setUsername }),
    [ready, userId, userEmail, username],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const v = useContext(Ctx);
  if (!v) throw new Error('SessionProvider missing');
  return v;
}

