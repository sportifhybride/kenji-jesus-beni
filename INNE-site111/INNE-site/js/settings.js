/* INNÉ — site settings. Edit this file only; no other code needs to change.
   ---------------------------------------------------------------------------
   contactEmail       : contact address (forms, checkout, Wise requests).
   paypal             : PayPal.Me address. The amount and currency are added
                        automatically from the price of the chosen offer.
   formEndpoint       : optional URL that receives the "Begin" form (POST, JSON).
                        Empty = the visitor's email app opens with the message.
   newsletterEndpoint : optional URL that receives community sign-ups.
   social             : full profile URLs. An empty value hides the icon.
   analytics          : called ONLY after the visitor accepts audience
                        measurement in the cookie banner.                      */
window.INNE_CONFIG = {
  contactEmail: "beharykenji@gmail.com",
  paypal: "https://www.paypal.me/KenjiBehary",
  formEndpoint: "",
  newsletterEndpoint: "",
  social: { instagram: "https://www.instagram.com/kenjibfit", youtube: "" },
  consentMonths: 6,
  analytics: function () { /* no audience tool installed yet */ }
};
