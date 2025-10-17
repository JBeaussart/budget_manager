export type FeedbackType = "info" | "success" | "error";

type FeedbackOptions = {
  baseClass?: string;
  colorClasses?: Partial<Record<FeedbackType, string>>;
};

const defaultColors: Record<FeedbackType, string> = {
  info: "text-slate-600",
  success: "text-emerald-600",
  error: "text-rose-600",
};

export function createFeedbackController(
  element: HTMLElement | null,
  options: FeedbackOptions = {}
) {
  const baseClass =
    options.baseClass ?? (element?.className ? element.className : "");
  const colors = { ...defaultColors, ...options.colorClasses };

  const apply = (message: string, type: FeedbackType) => {
    if (!element) return;
    const classes = [baseClass, colors[type]].filter(Boolean).join(" ").trim();
    element.className = classes;
    element.textContent = message;
  };

  return {
    set(message: string, type: FeedbackType = "info") {
      apply(message, type);
    },
    clear() {
      apply("", "info");
    },
  };
}
