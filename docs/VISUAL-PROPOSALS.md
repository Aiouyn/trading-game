# Avalon OS: three restrained visual directions

Implemented in the game at `/`, with an optional direct entry at `/concepts`. Choose **Appearance** or **3 visual directions** on the home screen. These are actual React interfaces, with no generated-image assets or external image dependencies.

## The proposals

| Direction | Visual formula | Why try it |
| --- | --- | --- |
| Carbon (default) | Neutral charcoal, silver controls, sans-serif typography, monochrome icons | A precise and focused personal operating system |
| Platinum | Cool white, graphite typography, thin borders, clean controls | A restrained and legible light alternative |
| Obsidian | Near-black surfaces, controlled violet accents, the same compact layout | A more technical atmosphere without bright decoration |

The first pastel, illustrated direction was rejected by Mathis as too jolly and unserious. This revision replaces the room wallpaper, editorial serif headings, colored app tiles, rounded toy-like surfaces, and motivational slogans. The home screen now presents capital and the next rank alongside real market snapshots and world activity. Existing color keys are retained internally for compatibility; appearance preferences use v2 so the earlier rejected palette does not remain selected.

The phone version is a home screen with widgets and an app grid. Apps open full screen, with a back-to-home control and persistent dock. The desktop has a system bar, launcher, dock, and independent movable, maximizable, minimizable windows. Markets and Portfolio share one financial workspace to avoid duplicating trades or position views.

All appearances use the same real account, quotes, fills, price history, cash, positions, portfolio analytics, and market news. Switching appearances remounts the financial charts so their canvases read the new inherited palette. Theme and lifestyle display preferences persist separately from the game save.

## Make wealth feel useful

The design hypothesis is **earn → picture a goal → personalize it → live with it → share a story**. Money should buy new experiences and new ways to express yourself. Engagement is not established by these mocks and needs player testing.

### Cars

- One favorite on the home screen; the whole collection lives in the garage.
- Choose paint and presentation, preview a coastal drive, make a collection portrait.
- Later: player car meets, curated garage tours, collections by era or manufacturer, a trophy cabinet for events, and remembering the first car rather than replacing it anonymously.
- The drive should be a short optional pleasure, not a second game players must grind to earn money.

### Homes

- One active personal residence changes the desktop setting. Other properties can be rentals or other places to visit.
- Each room has a purpose: study, garage, gallery, guest space, garden. Purchases appear in the room rather than only in a table.
- Multiple homes can hold different collections or host different occasions. Saved room arrangements and visits make them distinct.
- Later: invite friends, read-only public tours, housewarming events, room portraits, and an archive of how the first room became an estate.

### What the current lifestyle interface does

`My life` is explicitly a **design preview**. Car selection, paint, a moving drive vignette, portrait composition, a displayed wishlist goal, room selection, and art switching work locally. A wishlist compares the proposed catalog price with real net worth; it does not claim that net worth is spendable cash.

No purchase occurs, no asset is granted, and no game money is deducted. The current engine has no lifestyle ownership/economy. Social hosting, multiplayer tours, exportable photos, real property inventories, depreciation, and upkeep need separate implementation. The code should connect to those systems only once their contracts exist.

## Proposed player test

Give new players the same starting account and task under each direction: place a small trade, find their cash, return home, and choose a future purchase. Observe time to first successful trade, navigation errors, which purchase they remember, and voluntary return after a session. Then test whether using owned items improves return interest compared with a catalog-only version. Do not infer retention from screenshots or from one player's preference.

## Validation

The existing financial E2E paths were adapted to open Markets from the new home screen. Keep trade caps, fill behavior, save/reload, portfolio analytics, phone trade-sheet geometry, and credits checks. `desktop-os.spec.ts` adds appearance persistence, preservation of the account across theme changes, window behavior, lifestyle preview isolation, and narrow-screen navigation. `scripts/preview-design.mjs` captures local visual QA of the three themes and the real apps.

Verified on 2026-10-10: production build succeeded; 90 unit tests passed; 24 browser tests passed against the production server, with four intentional device-specific skips. Visual QA covered all three home screens on desktop and phone plus Markets and the garage preview, with no page errors or horizontal document overflow.
