# Design Brief — Family Wishlist App

*A rich description of the product for design exploration. Written 2026-08-13. Companion to `tech-and-hosting-research.md` (feature research and data model).*

## What this is

A small, private web app where family members and close friends keep wishlists for each other — birthdays, Christmas, whenever. A person signs in, keeps one or more lists, and shares them with the people who might give them something. Gift-givers open a shared link — no account, no app install — and simply browse the list. That's it: the app is a beautiful, always-current answer to "what does she actually want?" Who gives what gets sorted out where it always has been — the family group chat.

It is deliberately not a commercial product: no ads, no upsells, no marketing emails, no data harvesting, no registry integrations. It exists because the commercial alternatives are spammy and the moment deserves better. It should feel like something made with care for people you love.

## The feeling

**Warm and cozy, all year round.** The emotional register is generosity, anticipation, and quiet thoughtfulness — the pleasure of finding the right gift, the fun of keeping a secret. Think hygge: candlelight warmth, wool-sock comfort, a handwritten tag on brown paper. But — and this is a hard constraint — **fully occasion-neutral**: no Christmas theming, no birthday confetti, no seasonal skins, ever. A list used in July for a birthday and in December for Christmas looks equally at home. Dates, list names, and the gifts themselves carry the occasion; the design never does. The warmth must come from timeless things — color, type, texture, spacing, language — not from holiday iconography.

The app should feel **small and personal**, like a well-made object, not a platform. It's used by at most a few dozen people who all know each other.

## Two users, equal care

The app has two genuinely different experiences that deserve equal design investment:

### The list owner — "the workbench"
Signs in. Curates one or more lists (e.g. "My birthday", "Kitchen stuff", a list for each of their kids). Adds items by pasting a product URL — the app fetches title, image, and price — or by typing them in by hand (a first-class path, not a fallback: some items are "wool socks, any color" with no URL). Reorders, sets priority ("really want this"), adds notes ("size medium", "the blue one"). Shares a list by copying a link into the family group chat.

The owner experience should feel like tending something — satisfying, quick, a little tactile. Fast item entry matters most: paste, watch the card fill itself in, done.

### The gift-giver — "the visit"
Taps a link in a group chat, very possibly on a phone, very possibly age 8 or 78. No login, no account, no name-and-email wall — and no actions to learn, because there are none. They see the person's list: what's wanted, what matters most, the note about sizes, the link to the shop. They read, they decide, they follow the product link or screenshot the item into the group chat. The page is purely for looking.

The giver experience should feel like browsing a tiny, personal shop window that exists just for this one person — welcoming, legible at arm's length, nothing to figure out. This is the design's showpiece: a read-only page has to carry all the warmth on presentation alone.

## Core objects and flows

- **User / list** — a signed-in user owns one or more lists. A list has a name, an optional occasion *label* (plain text — carries no styling), and items.
- **Item** — title, optional image, optional price, optional URL, optional note, priority flag. Item cards are the app's atomic visual unit, in two renderings: the owner's editable card and the giver's read-only card.
- **The list's URL is public.** Every list lives at an unguessable URL; anyone who has it can view. There is no separate share-token entity, no revocation machinery, no viewer accounts, and no viewer actions — sharing a list means copying its address. (Grouping concepts like a shared family space are explicitly out of scope; if they ever return, they're a browsing convenience, not an access model.)

Key flows to design:
1. Owner: sign in → my lists → open a list → paste URL → item card auto-fills → tweak → done.
2. Owner: manual item entry ("wool socks") — as pleasant as the URL path.
3. Owner: share a list (copy link; maybe QR for in-person).
4. Giver: open link → recognize whose list this is → browse comfortably → follow a product link out.
5. Empty states: a brand-new list (owner), a shared list with nothing on it yet (giver).
6. Owner sign-in (email/password or Google) — the only "app-like" surface; keep it human.

## Name

No name yet. Candidates (all deliberately warm, neutral, un-corporate — final call open, and the design can influence it):

1. **Hinted** — a wishlist is really a list of hints; warm, knowing, occasion-free. (`hinted.family`, `hinted.gift`)
2. **Wishwell** — wishing well + "wish well"; gentle and storybook-warm. (`wishwell.app`)
3. **Ribbon** — the quiet, year-round symbol of a gift; elegant, visual, logo-friendly. (`ribbon.family`)
4. **Ønske** — "wish" in Danish; personal heritage angle, distinctive, needs the ø to sing. (`onske.app`, `ønske.dk`)

Design explorations may pick whichever name best fits the direction (or use "Wishlist" as a placeholder) — but each direction should commit to one, since the name and wordmark anchor the identity.

## Design principles

1. **Warmth without occasion.** Cozy is the baseline, not a theme. If removing a visual element would make the app feel like a spreadsheet, keep it; if it says "December", cut it.
2. **The gifts are the heroes.** Product images and item titles carry the visual interest; the chrome around them stays quiet and warm.
3. **Legible at arm's length, for every age.** Givers include kids and grandparents on phones: generous type, high contrast, big touch targets, one primary action per card.
4. **Two rooms, one house.** Owner and giver experiences may differ in density and mood (workbench vs. visit) but must be unmistakably the same product.
5. **Fast is part of the feeling.** The app is edge-rendered and loads instantly; the design should ride that — no skeleton-screen theater, no gratuitous motion. The one micro-moment that deserves delight is a card filling itself in from a pasted URL; everything else stays calm.
6. **Words are warm too.** Copy is human and plainspoken: "Sofie really wants this one", "Nothing here yet — paste a link to get started." Never "item added successfully."

## Practical constraints

- Mobile-first, responsive web (installable PWA); the giver experience is overwhelmingly phone-based.
- Server-rendered HTML (Hono JSX + CSS; light JS sprinkles) — designs should be achievable with HTML/CSS craft, not heavy client-side machinery.
- Light and dark themes both matter (evening couch browsing is the primary giver context).
- Product images are cached copies of merchant photos: mixed quality, mixed aspect ratios, sometimes missing — cards must look good with a bad photo or none at all.
- Prices are optional and approximate; never make the app feel like a store checkout.
- Accessibility: WCAG AA contrast minimum, real focus states, works with large system font sizes.

## What we're asking for

A handful (3–5) of distinct design directions, each staying inside "warm & cozy, occasion-neutral" but interpreting it differently — e.g. paper-and-craft tactility vs. soft-editorial Scandinavian vs. evening-warmth dark-first vs. storybook illustration. For each direction:

- Name choice + wordmark treatment
- Palette (light + dark), type pairing, and the texture/feel decisions that make it warm
- The **item card** in both renderings (owner's editable card / giver's read-only card), including the no-image and priority variants
- Two key screens: the giver's list view (phone) and the owner's list editor (phone + desktop)
- One micro-moment: what pasting a URL and watching the card fill itself in feels like

The winning direction should make someone's grandmother smile when the link opens, and make the list's owner a little proud to share it.
