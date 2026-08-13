import { Wordmark } from "../components/Wordmark";

// Placeholder until the owner's home lands in Phase 2.
export function HomePage() {
  return (
    <div class="hn-page">
      <div class="hn-pagehead" style={{ paddingTop: "80px" }}>
        <Wordmark size={52} />
        <p class="hn-pagehead__intro">A place for family wishlists.</p>
        <p class="hn-pagehead__intro">
          <a class="hn-quietlink" href="/login">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
