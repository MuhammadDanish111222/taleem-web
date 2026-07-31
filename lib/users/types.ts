export type StudentAuthProvider = "anonymous" | "google";

export interface StudentUserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  authProvider: StudentAuthProvider;
  subscriptionActive: boolean;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  schemaVersion: 1;
}

export interface StudentUserDto {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  authProvider: StudentAuthProvider;
  subscriptionActive: boolean;
  createdAt: string;
  updatedAt: string;
}
