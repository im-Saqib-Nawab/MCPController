import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api.js';

const AuthContext = createContext(null);

async function fetchCurrentUser(retryCount = 0) {
  try {
    const { data } = await api.get('/auth/me');
    return data.user;
  } catch (error) {
    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      return null;
    }

    if (retryCount < 2) {
      await new Promise((resolve) => setTimeout(resolve, 400 * (retryCount + 1)));
      return fetchCurrentUser(retryCount + 1);
    }

    throw error;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const userRef = useRef(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const refreshUser = useCallback(async () => {
    setError('');
    try {
      const nextUser = await fetchCurrentUser();
      setUser(nextUser);
      return nextUser;
    } catch (err) {
      setError(err?.message || 'Unable to verify session.');
      return userRef.current;
    }
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const nextUser = await fetchCurrentUser();
        if (active) {
          setUser(nextUser);
        }
      } catch (err) {
        if (active) {
          setError(err?.message || 'Unable to verify session.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      setUser(null);
    });

    return () => {
      api.setUnauthorizedHandler(null);
    };
  }, []);

  useEffect(() => {
    api
      .get('/health')
      .then(({ data }) => {
        if (!data?.publicUrl || loading) {
          return;
        }

        const publicOrigin = new URL(data.publicUrl).origin;
        if (window.location.origin !== publicOrigin) {
          const nextUrl = `${data.publicUrl}${window.location.pathname}${window.location.search}${window.location.hash}`;
          window.location.replace(nextUrl);
        }
      })
      .catch(() => {});
  }, [loading]);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      setUser,
      refreshUser,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin'
    }),
    [user, loading, error, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
