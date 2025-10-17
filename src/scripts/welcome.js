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

const root = document.querySelector("[data-default-auth]");
const body = document.body;

const modals = {
  login: document.querySelector("#modal-login"),
  signup: document.querySelector("#modal-signup"),
};

const forms = {
  login: document.querySelector("#modal-login-form"),
  signup: document.querySelector("#modal-signup-form"),
};

const feedback = {
  login: document.querySelector('[data-auth-feedback="login"]'),
  signup: document.querySelector('[data-auth-feedback="signup"]'),
};

const openers = document.querySelectorAll("[data-open-auth]");
openers.forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    const key = trigger.getAttribute("data-open-auth");
    if (key !== "login" && key !== "signup") return;
    if (trigger.tagName === "A") {
      event.preventDefault();
    }
    openModal(key);
  });
});

document
  .querySelectorAll("[data-close-auth]")
  .forEach((btn) => btn.addEventListener("click", () => closeAll()));

Object.values(modals).forEach((modal) => {
  if (!modal) return;
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeAll();
    }
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeAll();
  }
});

const params = new URLSearchParams(window.location.search);
const paramAuth = params.get("auth");
const suppressDefault = paramAuth === "none";
const defaultAuth = root?.dataset.defaultAuth ?? "";

if (paramAuth === "login" || paramAuth === "signup") {
  openModal(paramAuth, { updateUrl: false });
} else if (
  !suppressDefault &&
  (defaultAuth === "login" || defaultAuth === "signup")
) {
  openModal(defaultAuth);
}

function openModal(key, { updateUrl = true } = {}) {
  const modal = modals[key];
  if (!modal) return;

  Object.entries(modals).forEach(([otherKey, otherModal]) => {
    if (otherKey !== key && otherModal) {
      otherModal.classList.add("hidden");
      otherModal.classList.remove("flex");
    }
  });

  modal.classList.remove("hidden");
  modal.classList.add("flex");
  body.classList.add("overflow-hidden");

  window.setTimeout(() => {
    const firstInput = modal.querySelector("input");
    if (firstInput) {
      firstInput.focus();
    }
  }, 60);

  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set("auth", key);
    window.history.replaceState({}, "", url);
  }
}

function closeAll() {
  let wasOpen = false;
  Object.values(modals).forEach((modal) => {
    if (!modal) return;
    if (!modal.classList.contains("hidden")) {
      wasOpen = true;
    }
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  });

  if (wasOpen) {
    body.classList.remove("overflow-hidden");
    const url = new URL(window.location.href);
    if (url.searchParams.has("auth")) {
      url.searchParams.delete("auth");
      window.history.replaceState({}, "", url);
    }
  }
}

function showMessage(key, message, type = "info") {
  const el = feedback[key];
  if (!el) return;
  const base = "min-h-[1.5rem] text-center text-sm";
  const color =
    type === "error"
      ? "text-rose-600"
      : type === "success"
      ? "text-emerald-600"
      : "text-slate-600";
  el.textContent = message;
  el.className = `${base} ${color}`;
}

function setSubmitting(form, isSubmitting) {
  const submit = form.querySelector("[data-auth-submit]");
  if (submit instanceof HTMLButtonElement) {
    submit.disabled = isSubmitting;
    submit.classList.toggle("opacity-70", isSubmitting);
  }
}

async function persistSessionCookies(session) {
  if (!session) {
    throw new Error("Session Supabase absente après l'authentification");
  }

  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
    }),
    credentials: "include",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Impossible de synchroniser la session (${response.status}): ${details}`
    );
  }
}

function redirectAfterAuth(message = "Redirection...") {
  showMessage("login", message, "success");
  showMessage("signup", message, "success");
  closeAll();
  window.location.href = "/app";
}

const loginForm = forms.login;
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    if (!email || !password) {
      showMessage("login", "Email et mot de passe sont requis.", "error");
      return;
    }

    try {
      showMessage("login", "Connexion en cours...");
      setSubmitting(loginForm, true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      await persistSessionCookies(data.session);
      redirectAfterAuth();
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error ? error.message : "Connexion impossible.";
      showMessage("login", message, "error");
    } finally {
      setSubmitting(loginForm, false);
    }
  });
}

const signupForm = forms.signup;
if (signupForm) {
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(signupForm);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    if (!email || !password) {
      showMessage("signup", "Email et mot de passe sont requis.", "error");
      return;
    }

    try {
      showMessage("signup", "Création du compte...");
      setSubmitting(signupForm, true);
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      if (!data.session) {
        showMessage(
          "signup",
          "Compte créé ! Vérifiez votre boîte mail pour confirmer.",
          "success"
        );
        return;
      }

      await persistSessionCookies(data.session);
      redirectAfterAuth("Compte créé, redirection...");
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error
          ? error.message
          : "Impossible de créer le compte.";
      showMessage("signup", message, "error");
    } finally {
      setSubmitting(signupForm, false);
    }
  });
}
