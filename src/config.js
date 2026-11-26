// config.js - switches that are decided at build time, not by the player.
//
// PAY.live = false  (the default): the game is COMPLETELY FREE and shows no sign of payments. Every career event, every venue, the heraldry editor and every pack's items are open;
//   there is no Store button, no Charter or price text, no "unlock the full game" popup, no daily cap and no Support (donate) button; and the client makes no call to any /pay/* endpoint.
//   All the payment code (src/store.js, src/donate.js, src/upsell.js, src/confirm.js, server/tilt-ranks/pay.js) stays in the build, switched off by this flag.
// PAY.live = true: the store, the locks, the upsell popup and the donate button come back exactly as they were. Flip it only after Stripe is set up and the Worker is deployed
//   (docs/payments-setup.md, "Founders' Season / PAY.live").
export const PAY = { live: false };
