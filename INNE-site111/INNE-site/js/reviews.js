/* INNÉ — client reviews: published feed (sortable) and the review form.
   Talks to /api/reviews (see reviews/worker.js in the repository). */
(function () {
  "use strict";
  var DICT = window.INNE_I18N || {};
  var root = document.documentElement;
  var list = document.getElementById("rv-list");
  if (!list) return;
  var $ = function (id) { return document.getElementById(id); };
  var lang = function () { return DICT[root.lang] ? root.lang : "en"; };
  function t(k) { var d = DICT[lang()] || {}; return d[k] !== undefined ? d[k] : (DICT.en || {})[k] || ""; }
  var OFFER_KEY = { guide: "f.name", program: "r.name", "private": "x.name" };
  var state = { sort: "recent", offer: "", data: null, failed: false };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function stars(n, cls) {
    var s = el("span", "rv-stars" + (cls ? " " + cls : ""));
    s.setAttribute("role", "img");
    s.setAttribute("aria-label", t("rv.stars").replace("{n}", n));
    var full = Math.round(n);
    for (var i = 1; i <= 5; i++) s.appendChild(el("span", i <= full ? "on" : "", "★")).setAttribute("aria-hidden", "true");
    return s;
  }
  function date(iso) {
    try { return new Date(iso).toLocaleDateString(lang(), { year: "numeric", month: "long", day: "numeric" }); }
    catch (e) { return (iso || "").slice(0, 10); }
  }

  function render() {
    var status = $("rv-status"), empty = $("rv-empty"), score = $("rv-score");
    list.textContent = "";
    if (state.failed) { status.hidden = false; status.textContent = t("rv.error"); empty.hidden = true; score.hidden = true; return; }
    if (!state.data) { status.hidden = false; status.textContent = t("rv.loading"); return; }
    status.hidden = true;
    var d = state.data;
    if (!d.count) { empty.hidden = false; score.hidden = true; $("rv-tools").hidden = true; return; }
    empty.hidden = true; $("rv-tools").hidden = false;
    score.hidden = false;
    $("rv-avg").textContent = String(d.average).replace(".", lang() === "en" ? "." : ",");
    var sa = $("rv-stars-avg"); sa.textContent = ""; sa.appendChild(stars(d.average));
    $("rv-count").textContent = d.count + " " + t(d.count > 1 ? "rv.countn" : "rv.count1");
    if (!d.reviews.length) { var none = el("li", "rv-none", t("rv.none")); list.appendChild(none); return; }
    d.reviews.forEach(function (r) {
      var li = el("li", "rv-item");
      var head = el("div", "rv-top");
      var who = el("div", "rv-who");
      var av = el("span", "rv-avatar", (r.name || "?").trim().charAt(0).toUpperCase());
      av.setAttribute("aria-hidden", "true");
      var meta = el("div");
      meta.appendChild(el("b", "rv-name", r.name));
      var sub = el("span", "rv-sub", t(OFFER_KEY[r.offer] || "") + " · " + t("rv.verified"));
      meta.appendChild(sub);
      who.appendChild(av); who.appendChild(meta);
      var right = el("div", "rv-right");
      right.appendChild(stars(r.rating));
      var time = el("time", "rv-date", date(r.published_at)); time.dateTime = r.published_at || "";
      right.appendChild(time);
      head.appendChild(who); head.appendChild(right);
      li.appendChild(head);
      var body = el("p", "rv-body", r.body);
      if (r.lang) body.lang = r.lang;
      li.appendChild(body);
      if (r.reply) {
        var rep = el("div", "rv-reply");
        rep.appendChild(el("b", "", t("rv.reply")));
        rep.appendChild(el("p", "", r.reply));
        li.appendChild(rep);
      }
      list.appendChild(li);
    });
  }

  function load() {
    var q = "?sort=" + encodeURIComponent(state.sort) + (state.offer ? "&offer=" + encodeURIComponent(state.offer) : "");
    state.failed = false;
    fetch("/api/reviews" + q, { headers: { accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { if (!d || !Array.isArray(d.reviews)) throw new Error("bad"); state.data = d; render(); })
      .catch(function () { state.failed = true; render(); });
  }

  var sortSel = $("rv-sort");
  if (sortSel) sortSel.addEventListener("change", function () { state.sort = sortSel.value; load(); });
  Array.prototype.forEach.call(document.querySelectorAll("[data-rv-offer]"), function (b) {
    b.addEventListener("click", function () {
      state.offer = b.getAttribute("data-rv-offer");
      Array.prototype.forEach.call(document.querySelectorAll("[data-rv-offer]"), function (x) {
        x.setAttribute("aria-pressed", x === b ? "true" : "false");
      });
      load();
    });
  });
  var langSel = document.getElementById("lang");
  if (langSel) langSel.addEventListener("change", function () { setTimeout(render, 0); });

  /* ---------- form ---------- */
  var form = $("rv-form");
  if (form) {
    var msg = $("rv-msg");
    function say(key, ok) { msg.hidden = false; msg.textContent = t(key); msg.classList.toggle("ok", !!ok); }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = form.elements;
      var rating = form.querySelector("input[name=rating]:checked");
      var data = {
        code: f.code.value, name: f.name.value, offer: f.offer.value,
        rating: rating ? Number(rating.value) : 0, body: f.body.value,
        consent: f.consent.checked, website: f.website.value, lang: lang()
      };
      if (!data.rating) return say("rv.e_rating");
      if (data.name.trim().length < 2 || !data.offer || data.body.trim().length < 30 || data.code.replace(/[^A-Za-z0-9]/g, "").length < 8) return say("rv.e_invalid");
      if (!data.consent) return say("rv.e_consent");
      var btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      fetch("/api/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (res.ok && res.j.ok) { form.reset(); say("rv.sent", true); return; }
          var err = res.j && res.j.error;
          say(err === "code" ? "rv.e_code" : err === "code_used" ? "rv.e_used" : err === "consent" ? "rv.e_consent" : err === "invalid" ? "rv.e_invalid" : "rv.e_server");
        })
        .catch(function () { say("rv.e_server"); })
        .then(function () { btn.disabled = false; });
    });
    var body = form.elements.body, counter = $("rv-chars");
    if (body && counter) body.addEventListener("input", function () { counter.textContent = body.value.length + " / 2000"; });
  }

  render();
  load();
})();
