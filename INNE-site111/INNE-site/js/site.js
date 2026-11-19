/* INNÉ — interactions: language, navigation, reveal, forms, cookie consent */
(function () {
  "use strict";
  var CFG = window.INNE_CONFIG || {};
  var DICT = window.INNE_I18N || {};
  var LANGS = ["en", "es", "fr", "sv", "de", "it"];
  var doc = document, root = doc.documentElement;

  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) { return null; }
  }
  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }

  /* ---------- Language ---------- */
  function detect() {
    /* English is the default. Another language is used only once the visitor picks it. */
    var saved = store("inne_language");
    return (saved && LANGS.indexOf(saved) > -1) ? saved : "en";
  }
  var lang = detect(), updateCheckout;
  function fillEmail() {
    $$("[data-contact-email]").forEach(function (el) {
      if (!CFG.contactEmail) return;
      el.textContent = CFG.contactEmail;
      if (el.tagName === "A") el.href = "mailto:" + CFG.contactEmail;
    });
  }
  function t(key) {
    var d = DICT[lang] || {};
    return d[key] !== undefined ? d[key] : (DICT.en || {})[key];
  }
  function applyLang() {
    root.lang = lang;
    $$("[data-i18n]").forEach(function (el) {
      var v = t(el.getAttribute("data-i18n"));
      if (v !== undefined) el.innerHTML = v;
    });
    $$("[data-i18n-ph]").forEach(function (el) {
      var v = t(el.getAttribute("data-i18n-ph"));
      if (v !== undefined) el.setAttribute("placeholder", v);
    });
    $$("[data-i18n-aria]").forEach(function (el) {
      var v = t(el.getAttribute("data-i18n-aria"));
      if (v !== undefined) el.setAttribute("aria-label", v);
    });
    var tk = root.getAttribute("data-title");
    if (tk && t(tk)) doc.title = t(tk).replace(/<[^>]+>/g, "") + " — INNÉ";
    $$("[data-legal]").forEach(function (el) { el.hidden = el.getAttribute("data-legal") !== lang; });
    $$("[data-legal-note]").forEach(function (el) { el.hidden = (lang === "fr"); });
    fillEmail();
    if (typeof updateCheckout === "function") updateCheckout();
    var sel = $("#lang");
    if (sel) sel.value = lang;
    fitNav();
  }
  /* Collapse the menu to the burger whenever the labels of the current language do not fit on one line */
  function fitNav() {
    var wrap = $(".site-header .wrap"), b = $(".burger");
    if (!wrap) return;
    root.classList.remove("nav-compact");
    if (wrap.scrollWidth > wrap.clientWidth + 1) root.classList.add("nav-compact");
    else if (window.innerWidth > 1080 && root.classList.contains("nav-open")) {
      root.classList.remove("nav-open");
      if (b) b.setAttribute("aria-expanded", "false");
    }
  }
  window.addEventListener("resize", fitNav);
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(fitNav);
  applyLang();
  var sel = $("#lang");
  if (sel) sel.addEventListener("change", function () {
    lang = sel.value; store("inne_language", lang); applyLang();
  });

  /* ---------- Header & mobile menu ---------- */
  var header = $(".site-header");
  function onScroll() { if (header) header.classList.toggle("scrolled", window.scrollY > 30); }
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  var burger = $(".burger");
  if (burger) {
    burger.addEventListener("click", function () {
      var open = root.classList.toggle("nav-open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    $$(".nav a").forEach(function (a) {
      a.addEventListener("click", function () { root.classList.remove("nav-open"); burger.setAttribute("aria-expanded", "false"); });
    });
    doc.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { root.classList.remove("nav-open"); burger.setAttribute("aria-expanded", "false"); }
    });
  }

  /* ---------- Reveal on scroll ---------- */
  var reveals = $$(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- Social links (hidden until configured) ---------- */
  $$("[data-social]").forEach(function (a) {
    var url = (CFG.social || {})[a.getAttribute("data-social")];
    if (url) {
      a.href = url; a.hidden = false;
      var h = $("[data-social-handle]", a), seg = url.replace(/\/+$/, "").split("/").pop();
      if (h && seg) h.textContent = "@" + seg.replace(/^@/, "");
    } else { a.hidden = true; }
  });

  /* ---------- "About" sub-menu ---------- */
  $$(".sub-toggle").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = btn.parentNode.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });
  doc.addEventListener("click", function () {
    $$(".has-sub.open").forEach(function (el) { el.classList.remove("open"); $(".sub-toggle", el).setAttribute("aria-expanded", "false"); });
  });

  /* ---------- Forms ---------- */
  var pre = /[?&]path=([a-z]+)/.exec(location.search);
  var pathSel = $("#f-path");
  if (pre && pathSel) pathSel.value = pre[1];

  function show(form, key, extra) {
    var box = $(".form-msg", form.parentNode) || $(".form-msg", form);
    if (!box) return;
    box.hidden = false;
    box.innerHTML = t(key) + (extra || "");
    box.setAttribute("data-i18n-live", key);
  }
  $$("form[data-form]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var kind = form.getAttribute("data-form");
      var url = kind === "newsletter" ? CFG.newsletterEndpoint : CFG.formEndpoint;
      var data = { lang: lang, form: kind };
      $$("input,select,textarea", form).forEach(function (f) {
        if (!f.name) return;
        data[f.name] = f.type === "checkbox" ? f.checked : f.value;
      });
      if (!url) {
        var mail = CFG.contactEmail ? ' <a href="mailto:' + CFG.contactEmail + '">' + CFG.contactEmail + "</a>." : "";
        if (kind === "contact" && CFG.contactEmail) {
          var body = [data.name, data.email, "Path: " + (data.path || ""), "", data.message || ""].join("\n");
          show(form, "form.mail", mail);
          try { window.location.href = "mailto:" + CFG.contactEmail + "?subject=" + encodeURIComponent("INNÉ — " + (data.name || "")) + "&body=" + encodeURIComponent(body); } catch (err) {}
        } else {
          show(form, "form.pending", mail);
        }
        return;
      }
      var btn = $("button[type=submit]", form);
      if (btn) btn.disabled = true;
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(data) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); show(form, "form.sent"); form.reset(); })
        .catch(function () { show(form, "form.error"); })
        .then(function () { if (btn) btn.disabled = false; });
    });
  });

  /* ---------- Checkout (PayPal.Me link built from the chosen offer and language) ---------- */
  var KEYS = { foundation: "f", reconnection: "r", "private": "x" };
  var co = $("#checkout");
  if (co) {
    var pay = $("#co-pay"), msg = $("#co-msg"), boxes = [$("#co-terms"), $("#co-waive")];
    var wanted = (location.hash || "").replace("#", "") || (pre && pre[1]) || "foundation";
    if (!KEYS[wanted]) wanted = "foundation";
    $$("input[name=path]", co).forEach(function (r) { r.checked = r.value === wanted; });
    var vset = $("#co-version"), vmsg = $("#co-vmsg"), vnote = $("#co-vnote"), vtext = $("#co-vtext");
    function needsVersion() { var sel = $("input[name=path]:checked", co); return !!vset && sel && sel.value === "foundation"; }
    function versionKey() { var v = $("input[name=version]:checked", co); return v ? v.value : ""; }
    updateCheckout = function () {
      var sel = $("input[name=path]:checked", co), k = KEYS[sel ? sel.value : "foundation"];
      var guide = needsVersion(), v = versionKey();
      if (vset) vset.hidden = !guide;
      var vok = !guide || !!v;
      var ok = boxes[0].checked && boxes[1].checked && vok && !!CFG.paypal;
      $("#co-total").textContent = t("price." + k);
      if (vnote) {
        vnote.hidden = !(guide && v);
        if (guide && v) vtext.textContent = t("co.guide") + " — " + t(v === "women" ? "co.women" : "co.men");
      }
      pay.href = ok ? CFG.paypal.replace(/\/$/, "") + "/" + t("pay." + k) : "#";
      pay.setAttribute("aria-disabled", ok ? "false" : "true");
      if (ok) { msg.hidden = true; if (vmsg) vmsg.hidden = true; }
      if (vok && vmsg) vmsg.hidden = true;
    };
    $$("input", co).forEach(function (i) { i.addEventListener("change", updateCheckout); });
    pay.addEventListener("click", function (e) {
      if (pay.getAttribute("aria-disabled") === "true") {
        e.preventDefault();
        var vmissing = needsVersion() && !versionKey();
        if (vmsg) vmsg.hidden = !vmissing;
        msg.hidden = !(!boxes[0].checked || !boxes[1].checked);
      }
    });
    updateCheckout();
  }

  /* ---------- Cookie consent (CNIL: refuse as easy as accept, no tracker before consent) ---------- */
  var banner = $("#cookie");
  function readConsent() {
    try {
      var c = JSON.parse(store("inne_consent") || "null");
      if (!c || !c.date) return null;
      var limit = new Date(c.date);
      limit.setMonth(limit.getMonth() + (CFG.consentMonths || 6));
      return limit > new Date() ? c : null;
    } catch (e) { return null; }
  }
  function runConsented(c) {
    if (c && c.analytics && typeof CFG.analytics === "function" && !window.__inneAnalytics) {
      window.__inneAnalytics = true;
      try { CFG.analytics(); } catch (e) {}
    }
  }
  function saveConsent(analytics) {
    var c = { v: 1, analytics: !!analytics, date: new Date().toISOString() };
    store("inne_consent", JSON.stringify(c));
    if (banner) banner.hidden = true;
    runConsented(c);
  }
  if (banner) {
    var current = readConsent();
    var opts = $("#cookie-opts"), chk = $("#ck-analytics");
    if (current) runConsented(current); else banner.hidden = false;
    $("#ck-accept").addEventListener("click", function () { saveConsent(true); });
    $("#ck-refuse").addEventListener("click", function () { saveConsent(false); });
    $("#ck-custom").addEventListener("click", function () {
      opts.hidden = !opts.hidden;
      $("#ck-save").hidden = opts.hidden;
    });
    $("#ck-save").addEventListener("click", function () { saveConsent(chk.checked); });
    $$("[data-cookie-open]").forEach(function (b) {
      b.addEventListener("click", function () {
        var c = readConsent();
        chk.checked = !!(c && c.analytics);
        opts.hidden = false; $("#ck-save").hidden = false;
        banner.hidden = false;
        banner.focus();
      });
    });
  }
})();
