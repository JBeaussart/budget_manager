import { clearRulePatternCache, fetchRules, type Rule } from "../../lib/rules";

type Listener = (rules: Rule[]) => void;

let cache: Rule[] = [];
let loaded = false;
let loading: Promise<Rule[]> | null = null;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) {
    try {
      listener(cache);
    } catch (err) {
      console.error("[rulesStore] listener error", err);
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("rules:updated"));
  }
}

async function load(): Promise<Rule[]> {
  const rules = await fetchRules();
  cache = rules;
  loaded = true;
  clearRulePatternCache();
  notify();
  return rules;
}

async function ensure(force = false): Promise<Rule[]> {
  if (loaded && !force) return cache;
  if (!loading) {
    loading = load().finally(() => {
      loading = null;
    });
  }
  return loading;
}

export const rulesStore = {
  async ensure(force = false) {
    return ensure(force);
  },
  async refresh() {
    loaded = false;
    return ensure(true);
  },
  get() {
    return cache;
  },
  isLoaded() {
    return loaded;
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    if (loaded) {
      listener(cache);
    }
    return () => {
      listeners.delete(listener);
    };
  },
};
