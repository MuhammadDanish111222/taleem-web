"use client";

import { useState, useEffect } from "react";
import { 
  User, 
  signInAnonymously, 
  GoogleAuthProvider, 
  linkWithPopup, 
  signInWithPopup 
} from "firebase/auth";
import { auth } from "../firebase/client";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInAnonymous = async () => {
    if (auth.currentUser?.isAnonymous) return;
    await signInAnonymously(auth);
  };

  const signInGoogle = async () => {
    const provider = new GoogleAuthProvider();
    if (auth.currentUser?.isAnonymous) {
      try {
        await linkWithPopup(auth.currentUser, provider);
        return;
      } catch (error: any) {
        if (error?.code !== "auth/credential-already-in-use") throw error;
      }
    }
    await signInWithPopup(auth, provider);
  };

  const linkGoogle = async () => {
    if (!auth.currentUser) return;

    const provider = new GoogleAuthProvider();
    try {
      await linkWithPopup(auth.currentUser, provider);
    } catch (error: any) {
      if (error.code === 'auth/credential-already-in-use') {
        throw new Error("This Google account is already registered. Please sign in instead.");
      } else if (error.code === 'auth/popup-closed-by-user') {
        throw new Error("Google sign-in was cancelled.");
      } else {
        console.error("Failed to link Google account:", error);
        throw error;
      }
    }
  };

  return {
    user,
    uid: user?.uid,
    loading,
    signInAnonymous,
    signInGoogle,
    linkGoogle,
  };
}
