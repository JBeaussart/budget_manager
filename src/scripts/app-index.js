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

async function init() {
  const userLabel = document.querySelector("#current-user");
  if (!userLabel) return;

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) throw error;

    if (user?.email) {
      userLabel.textContent = `Connecté en tant que ${user.email}`;
    } else {
      userLabel.textContent = "Utilisateur non identifié";
    }
  } catch (error) {
    console.error("[app/index] getUser failed", error);
    userLabel.textContent = "Utilisateur non identifié";
  }
}

init();
