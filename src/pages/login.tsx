import { Wordmark } from "../components/Wordmark";

export function LoginPage() {
  return (
    <div class="hn-page">
      <header class="hn-bar">
        <Wordmark size={21} />
      </header>
      <div class="hn-pagehead">
        <h1 class="hn-pagehead__title">What's your email?</h1>
        <p class="hn-pagehead__intro">
          We'll send you a six-digit code — no password to remember.
        </p>
      </div>
      <form method="post" action="/login" class="hn-form">
        <label class="hn-field">
          <span class="hn-field__label">Email</span>
          {/* biome-ignore lint/a11y/noAutofocus: single-purpose page; focus belongs here */}
          <input
            class="hn-input"
            type="email"
            name="email"
            required
            autofocus
            autocomplete="email"
          />
        </label>
        <button class="hn-btn hn-btn--primary hn-btn--full" type="submit">
          Send me a code
        </button>
      </form>
    </div>
  );
}

export function VerifyPage({ email }: { email: string }) {
  return (
    <div class="hn-page">
      <header class="hn-bar">
        <Wordmark size={21} />
      </header>
      <div class="hn-pagehead">
        <h1 class="hn-pagehead__title">Check your email</h1>
        <p class="hn-pagehead__intro">
          If that address is on the family list, a six-digit code is on its way.
          It works for ten minutes.
        </p>
      </div>
      <form method="post" action="/login/verify" class="hn-form">
        <input type="hidden" name="email" value={email} />
        <label class="hn-field">
          <span class="hn-field__label">Code</span>
          {/* biome-ignore lint/a11y/noAutofocus: single-purpose page; focus belongs here */}
          <input
            class="hn-input hn-input--code"
            type="text"
            name="code"
            required
            autofocus
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="[0-9]{6}"
            maxlength={6}
          />
        </label>
        <button class="hn-btn hn-btn--primary hn-btn--full" type="submit">
          Sign in
        </button>
      </form>
    </div>
  );
}

export function VerifyFailedPage({ email }: { email: string }) {
  return (
    <div class="hn-page">
      <header class="hn-bar">
        <Wordmark size={21} />
      </header>
      <div class="hn-pagehead">
        <h1 class="hn-pagehead__title">That code didn't work</h1>
        <p class="hn-pagehead__intro">
          It may have expired or been mistyped. You can ask for a fresh one.
        </p>
      </div>
      <form method="post" action="/login" class="hn-form">
        <input type="hidden" name="email" value={email} />
        <button class="hn-btn hn-btn--primary hn-btn--full" type="submit">
          Send a new code
        </button>
      </form>
    </div>
  );
}
