// config.js - switches that are decided at build time, not by the player.
//
// PAY.live = false  (the default): the game is COMPLETELY FREE and shows no sign of payments. Every career event, every venue, the heraldry editor and every pack's items are open;
//   there is no Store button, no Charter or price text, no "unlock the full game" popup, no daily cap and no Support (donate) button; and the client makes no call to any /pay/* endpoint.
//   All the payment code (src/store.js, src/donate.js, src/upsell.js, src/confirm.js, server/tilt-ranks/pay.js) stays in the build, switched off by this flag.
// PAY.live = true: the store, the locks, the upsell popup and the donate button come back exactly as they were. Flip it only after Stripe is set up and the Worker is deployed
//   (docs/payments-setup.md, "Founders' Season / PAY.live").
export const PAY = { live: false };

// The Discord button in the corner of the main menu. Paste the permanent invite link here; while it is empty the button is not shown at all.
export const DISCORD_URL = '';
// EQUAL_GEAR = true: while there are few players, every horse, harness, helm and lance plays with the SAME stats (the gear is cosmetic: looks and size only).
//   data.js applyEqualGear() overwrites the stat fields of HORSES / ARMOURS / HELMS / LANCES and PHYS.horseKg / armourKg / lance with one standard set the moment it loads,
//   so the sim, the AI and the online peers all read the same numbers; the raw values are kept in RAW_GEAR. The menus hide the stat bars. Set false to bring the differences back.
export const EQUAL_GEAR = true;

// ONLINE_NEEDS_ACCOUNT = true: Play Online asks the player to sign in (Google or Discord) first, so names, ranks and rewards are his. It only bites when the server reports at least one
//   sign-in switched on (src/signin.js): if accounts are not set up yet, or the server cannot be reached, online play stays open as before, with a small note.
//   Single player never needs an account. Set false to make signing in optional everywhere (the main-menu chip stays).
export const ONLINE_NEEDS_ACCOUNT = true;
