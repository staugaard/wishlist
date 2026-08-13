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
