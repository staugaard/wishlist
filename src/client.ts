// The app's entire client-side JS: the copy-share-link sprinkle.
// Everything else is server-rendered HTML and CSS.
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
