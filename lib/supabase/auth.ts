import { createClient } from "./server";
import { redirect } from "next/navigation";

export async function getCurrentUser() {
  const supabase = await createClient();
  
  // Try getUser first
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  
  if (user) {
    return user;
  }
  
  // If getUser fails, try getSession as fallback
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  
  return session?.user || null;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth");
  }
  return user;
}
