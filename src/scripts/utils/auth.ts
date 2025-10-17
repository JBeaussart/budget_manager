import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";

export async function requireUser(): Promise<User> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) {
    throw new Error("Utilisateur introuvable. Connectez-vous.");
  }
  return user;
}

export async function requireSession(): Promise<Session> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session) {
    throw new Error("Session introuvable. Connectez-vous.");
  }
  return session;
}
