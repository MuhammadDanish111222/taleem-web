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
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setLoading(false);
      } else {
        try {
          // Sign in anonymously on first load
          await signInAnonymously(auth);
        } catch (error) {
          console.error("Anonymous sign-in failed:", error);
          setLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const linkGoogle = async () => {
    if (!auth.currentUser) return;

    const provider = new GoogleAuthProvider();
    try {
      await linkWithPopup(auth.currentUser, provider);
    } catch (error: any) {
      if (error.code === 'auth/credential-already-in-use') {
        // Fallback to sign in if the credential is already linked to another account
        const credential = GoogleAuthProvider.credentialFromError(error);
        if (credential) {
          await signInWithPopup(auth, provider);
        }
      } else {
        console.error("Failed to link Google account:", error);
        throw error;
      }
    }
  };

  return { user, uid: user?.uid, loading, linkGoogle };
}
