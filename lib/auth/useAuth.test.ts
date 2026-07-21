// @vitest-environment jsdom
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuth } from './useAuth';
import { auth } from '../firebase/client';
import { signInAnonymously, linkWithPopup, GoogleAuthProvider } from 'firebase/auth';

vi.mock('../firebase/client', () => ({
  auth: {
    onAuthStateChanged: vi.fn(),
    currentUser: { uid: 'anon123' }
  }
}));

vi.mock('firebase/auth', () => {
  return {
    signInAnonymously: vi.fn(),
    linkWithPopup: vi.fn(),
    GoogleAuthProvider: class {}
  };
});

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('signs in anonymously on first load if no user', async () => {
    let callback: any;
    (auth.onAuthStateChanged as any).mockImplementation((cb: any) => {
      callback = cb;
      return vi.fn(); // unsubscribe
    });

    renderHook(() => useAuth());
    
    // Simulate no user
    await act(async () => {
      callback(null);
    });

    expect(signInAnonymously).toHaveBeenCalledWith(auth);
  });

  it('sets user when auth state changes', async () => {
    let callback: any;
    (auth.onAuthStateChanged as any).mockImplementation((cb: any) => {
      callback = cb;
      return vi.fn(); // unsubscribe
    });

    const { result } = renderHook(() => useAuth());
    
    act(() => {
      callback({ uid: 'testuid' });
    });

    expect(result.current.user).toEqual({ uid: 'testuid' });
    expect(result.current.uid).toBe('testuid');
    expect(result.current.loading).toBe(false);
  });

  it('successfully links google account preserving UID', async () => {
    let callback: any;
    (auth.onAuthStateChanged as any).mockImplementation((cb: any) => {
      callback = cb;
      return vi.fn();
    });

    const { result } = renderHook(() => useAuth());
    
    act(() => {
      callback({ uid: 'anon123' });
    });

    (linkWithPopup as any).mockResolvedValueOnce({ user: { uid: 'anon123' } });

    await act(async () => {
      await result.current.linkGoogle();
    });

    expect(linkWithPopup).toHaveBeenCalled();
    expect(result.current.uid).toBe('anon123');
  });

  it('throws graceful error when credential already in use', async () => {
    let callback: any;
    (auth.onAuthStateChanged as any).mockImplementation((cb: any) => {
      callback = cb;
      return vi.fn();
    });

    const { result } = renderHook(() => useAuth());
    
    act(() => {
      callback({ uid: 'anon123' });
    });

    (linkWithPopup as any).mockRejectedValueOnce({ code: 'auth/credential-already-in-use' });

    await expect(result.current.linkGoogle()).rejects.toThrow('This Google account is already registered. Please sign in instead.');
  });

  it('throws error when popup closed', async () => {
    let callback: any;
    (auth.onAuthStateChanged as any).mockImplementation((cb: any) => {
      callback = cb;
      return vi.fn();
    });

    const { result } = renderHook(() => useAuth());
    
    act(() => {
      callback({ uid: 'anon123' });
    });

    (linkWithPopup as any).mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' });

    await expect(result.current.linkGoogle()).rejects.toThrow('Google sign-in was cancelled.');
  });
});
