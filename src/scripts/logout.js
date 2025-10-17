import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

function readSupabaseConfig() {
  const { dataset } = document.body;
  return {
    url: dataset?.supabaseUrl || "",
    anonKey: dataset?.supabaseAnonKey || "",
  };
}

const cfg = readSupabaseConfig();

if (!cfg.url || !cfg.anonKey) {
  console.error(
    "Configuration Supabase manquante : vérifiez PUBLIC_SUPABASE_URL et PUBLIC_SUPABASE_ANON_KEY."
  );
}

const supabase = createClient(cfg.url, cfg.anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

async function signOut() {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (error) {
    console.error("Erreur de déconnexion", error);
  } finally {
    try {
      await fetch("/api/auth/session", {
        method: "DELETE",
        credentials: "include",
      });
    } catch (error) {
      console.error(
        "Impossible de nettoyer la session côté serveur",
        error
      );
    }
    window.location.href = "/login?auth=none";
  }
}

signOut();
