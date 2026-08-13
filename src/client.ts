// The app's entire client-side JS: the copy-share-link sprinkle and the
// settle-in poll for a just-pasted item. Everything else is server-rendered.

// — Copy share link —
document.addEventListener("click", (event) => {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
    "[data-copy]",
  );
  if (!button) return;
  const url = button.dataset.copy;
  if (!url) return;
  const original = button.textContent;
  navigator.clipboard
    ?.writeText(url)
    .then(() => {
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = original;
      }, 2000);
    })
    .catch(() => {
      // No clipboard access — show the address itself so it can be copied by hand.
      button.textContent = url;
    });
});

// — The magic paste settles in —
// The row is real from the first frame; we only swap values into fields the
// owner hasn't touched. No spinners, no skeletons (design law).
const enrichForm = document.querySelector<HTMLFormElement>("form[data-enrich]");
if (enrichForm) {
  const itemId = enrichForm.dataset.enrich;
  const fields: Record<string, HTMLInputElement | null> = {
    title: enrichForm.querySelector('input[name="title"]'),
    price: enrichForm.querySelector('input[name="price"]'),
  };
  const initial: Record<string, string> = {};
  const touched = new Set<string>();
  for (const [name, input] of Object.entries(fields)) {
    if (!input) continue;
    initial[name] = input.value;
    input.addEventListener("input", () => touched.add(name), { once: true });
  }

  const swapValue = (name: string, value: string | null) => {
    const input = fields[name];
    if (!input || !value || touched.has(name) || input.value !== initial[name])
      return;
    input.classList.add("hn-settle");
    input.value = value;
    initial[name] = value;
    // Move the server-side baseline too: after a swap, clearing or editing
    // this field is a deliberate change and must be persisted by Done.
    const hidden = enrichForm.querySelector<HTMLInputElement>(
      `input[name="initial${name.charAt(0).toUpperCase()}${name.slice(1)}"]`,
    );
    if (hidden) hidden.value = value;
  };

  let tries = 0;
  const poll = async () => {
    tries += 1;
    try {
      const res = await fetch(`/items/${itemId}.json`);
      if (res.ok) {
        const data = (await res.json()) as {
          title: string;
          price: string | null;
          imageKey: string | null;
        };
        swapValue("title", data.title);
        swapValue("price", data.price);
        if (data.imageKey) {
          const slot = enrichForm.querySelector("[data-photo-slot]");
          if (slot && !slot.querySelector("img")) {
            const img = document.createElement("img");
            img.className = "hn-photo hn-settle";
            img.src = `/img/${data.imageKey}`;
            img.alt = "";
            img.style.height = "80px";
            img.style.objectFit = "cover";
            slot.replaceChildren(img);
          }
        }
        // Everything that can settle has settled — stop early.
        if (data.price && data.imageKey) return;
      }
    } catch {
      // Transient — the next tick may succeed; values also appear on reload.
    }
    if (tries < 10) setTimeout(poll, 1000);
  };
  setTimeout(poll, 800);
}

// — Theme toggle (Auto → Light → Dark) —
// The pre-paint script in the renderer applies the stored choice; this
// cycles it. State lives in memory (storage is persistence only, so the
// toggle keeps working in private mode).
{
  const KEY = "hinted-theme";
  const COLORS: Record<string, string> = { light: "#e8e0d1", dark: "#211c15" };
  const label = (m: string) =>
    `Theme: ${m === "light" ? "Light" : m === "dark" ? "Dark" : "Auto"}`;
  let mode = "auto";
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark") mode = stored;
  } catch {
    // Fine — we just start from auto.
  }
  const metas = document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  for (const m of metas) m.dataset.default = m.content;
  const apply = () => {
    if (mode === "light" || mode === "dark") {
      document.documentElement.dataset.theme = mode;
      for (const m of metas) m.content = COLORS[mode] ?? m.content;
    } else {
      delete document.documentElement.dataset.theme;
      for (const m of metas) m.content = m.dataset.default ?? m.content;
    }
    try {
      if (mode === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, mode);
    } catch {
      // Private mode etc. — the choice just won't persist.
    }
    for (const b of document.querySelectorAll("[data-theme-toggle]")) {
      b.textContent = label(mode);
    }
  };
  for (const b of document.querySelectorAll("[data-theme-toggle]")) {
    b.textContent = label(mode);
  }
  document.addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest(
      "[data-theme-toggle]",
    );
    if (!button) return;
    const order = ["auto", "light", "dark"];
    mode = order[(order.indexOf(mode) + 1) % order.length] ?? "auto";
    apply();
  });
}
