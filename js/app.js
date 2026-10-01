(function () {
  const LIMITS = { people: [1, 12], days: [1, 21], nights: [0, 20], rooms: [1, 8], perRoom: [1, 8] };
  const CATS = {
    charging: "Charging",
    toll: "Toll",
    stay: "Stay",
    food: "Food",
    parking: "Parking",
    other: "Other",
    ev: "On the car",
  };
  const KINDS = { start: "Start", charge: "Charge", food: "Food", stay: "Stay", sight: "Stop", end: "Arrive" };

  let db = null;
  let lastNote = "";
  let toastTimer = 0;
  const tripMemory = {};
  const plan = {
    from: "",
    to: "",
    distance: 280,
    people: 2,
    days: 2,
    nights: 1,
    rooms: 1,
    roomsAuto: true,
    perRoom: 2,
    food: 600,
    hotel: 2800,
    rate: 3.5,
    tolls: 400,
  };

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function inr(value) {
    return "₹" + Math.round(Number(value) || 0).toLocaleString("en-IN");
  }

  function rateLabel(value) {
    return "₹" + (Math.round(Number(value) * 10) / 10).toLocaleString("en-IN") + " / km";
  }

  function snap(value, step) {
    return Math.round((Number(value) || 0) / step) * step;
  }

  function clampKey(value, key) {
    const lim = LIMITS[key];
    return SafarCalc.clamp(value, lim[0], lim[1]);
  }

  function setting(key, fallback) {
    const value = db && db.settings ? String(db.settings[key] || "").trim() : "";
    return value || fallback || "";
  }

  function consultPrice() {
    const n = SafarData.num(setting("consult_price"));
    return n > 0 ? Math.round(n) : 500;
  }

  function waNumber() {
    let digits = String(setting("whatsapp")).replace(/\D/g, "");
    if (digits.length === 10) digits = "91" + digits;
    return digits;
  }

  function ofTrip(list, trip) {
    return (list || []).filter(function (item) {
      return item.trip_id === trip.trip_id;
    });
  }

  function paragraphs(text) {
    return String(text || "")
      .split(/\n+/)
      .map(function (part) {
        return part.trim();
      })
      .filter(Boolean)
      .map(function (part) {
        return "<p>" + esc(part) + "</p>";
      })
      .join("");
  }

  function routeHtml(from, to) {
    if (from && to) {
      return '<p class="route"><span>' + esc(from) + "</span><i></i><span>" + esc(to) + "</span></p>";
    }
    if (to || from) return '<p class="route"><span>' + esc(to || from) + "</span></p>";
    return "";
  }

  function findTrip(slug) {
    return (db.trips || []).find(function (trip) {
      return trip.slug === slug;
    });
  }

  function currentRoute() {
    const raw = decodeURIComponent((location.hash || "#/").replace(/^#/, "") || "/");
    const parts = raw.split("/").filter(Boolean);
    const name = parts[0] || "home";
    if (name === "trip") return { name: "trip", id: parts[1] || "" };
    if (name === "trips" || name === "plan" || name === "consult") return { name: name };
    return { name: "home" };
  }

  function tripLink(trip) {
    return location.origin + location.pathname + "#/trip/" + encodeURIComponent(trip.slug);
  }

  function stateFor(trip) {
    if (!tripMemory[trip.slug]) {
      const base = SafarCalc.planTrip(trip, ofTrip(db.costs, trip), ofTrip(db.changes, trip), null);
      tripMemory[trip.slug] = {
        people: clampKey(trip.party || 2, "people"),
        days: clampKey(trip.days || 1, "days"),
        nights: clampKey(trip.nights || 0, "nights"),
        rooms: SafarCalc.roomsFor(trip.party || 2, trip.per_room),
        roomsAuto: true,
        food: snap(base.recordedFood || 0, 10),
        off: {},
        extras: [],
      };
    }
    return tripMemory[trip.slug];
  }

  function modelFor(trip) {
    return SafarCalc.planTrip(trip, ofTrip(db.costs, trip), ofTrip(db.changes, trip), stateFor(trip));
  }

  function detailFor(line, ctx) {
    const cat = CATS[line.category] || "Cost";
    let how = "for the car";
    if (line.basis === "person") how = "× " + ctx.people + " people";
    if (line.basis === "person_day") how = "× " + ctx.people + " × " + ctx.days + " days";
    if (line.basis === "room_night") {
      const rooms = line.rooms || ctx.rooms;
      const roomWord = rooms === 1 ? "1 room" : rooms + " rooms";
      const nights = ctx.nights === 1 ? "1 night" : ctx.nights + " nights";
      const fit = line.per_room || ctx.per_room || 2;
      how = roomWord + " × " + nights + " · " + fit + " people fit in one room";
    }
    return cat + " · " + how;
  }

  function basisWords(basis) {
    if (basis === "person") return "per person";
    if (basis === "person_day") return "per person / day";
    if (basis === "room_night") return "per room / night";
    return "for the car";
  }

  function liveTrips() {
    return db.trips.filter(function (trip) {
      return trip.status !== "soon";
    });
  }

  function soonTrips() {
    return db.trips.filter(function (trip) {
      return trip.status === "soon";
    });
  }

  function hasMoney(trip) {
    if (ofTrip(db.costs, trip).length) return true;
    return ofTrip(db.changes, trip).some(function (row) {
      return row.cost;
    });
  }

  function chips(trip) {
    const bits = [];
    const date = SafarData.formatDate(trip.trip_date);
    if (date) bits.push(date);
    if (trip.distance_km) bits.push(trip.distance_km.toLocaleString("en-IN") + " km");
    if (trip.ev_model) bits.push(trip.ev_model);
    if (trip.days) bits.push(trip.days === 1 ? "1 day" : trip.days + " days");
    if (trip.nights) bits.push(trip.nights === 1 ? "1 night" : trip.nights + " nights");
    return '<div class="chips">' + bits.map(function (bit) {
      return "<span>" + esc(bit) + "</span>";
    }).join("") + "</div>";
  }

  function coverTag(url, alt) {
    const src = SafarData.imageUrl(url, 1600);
    if (!src) return "";
    const ref = src.indexOf("http") === 0 ? ' referrerpolicy="no-referrer"' : "";
    return '<img src="' + esc(src) + '" alt="' + esc(alt || "") + '"' + ref + ' onerror="safarImgFail(this)">';
  }

  function proofLink(url, caption) {
    const img = SafarData.imageUrl(url, 800);
    const view = SafarData.driveView(url) || SafarData.external(url) || img;
    if (!view) return "";
    return (
      '<a class="proof" href="' + esc(view) + '" target="_blank" rel="noopener" data-act="zoom" data-src="' +
      esc(img || "") + '" data-cap="' + esc(caption || "Proof") + '">' +
      (img ? coverTag(url, caption) : "") +
      "<span>Proof</span></a>"
    );
  }

  function stepper(scope, key, value, label, id) {
    const extra = id ? ' data-id="' + esc(id) + '"' : "";
    return (
      '<div class="stepper"><button type="button" data-act="step" data-scope="' + scope + '" data-key="' + key +
      extra + '" data-dir="-1" aria-label="Fewer ' + label + '">−</button><span><strong data-stepcount="' + key + '">' +
      value + "</strong> " + label + '</span><button type="button" data-act="step" data-scope="' + scope +
      '" data-key="' + key + extra + '" data-dir="1" aria-label="More ' + label + '">+</button></div>'
    );
  }

  function fitCount(trip) {
    return Math.max(1, Number(trip && trip.per_room) || 2);
  }

  function roomRule(fit) {
    const low = fit + 1;
    const high = fit * 2;
    return "One room fits " + fit + ". " + low + " to " + high + " people need 2 rooms, so the hotel bill rises.";
  }

  function brand() {
    return (
      '<a class="brand" href="#/"><img src="assets/logo.png" alt="" width="48" height="48"><span>Safar <em>Electrified</em></span></a>'
    );
  }

  function shell(active, body) {
    const yt = SafarData.external(setting("youtube_url"));
    const ig = instagramUrl();
    const warn = db.warning ? '<p class="warn wrap">' + esc(db.warning) + "</p>" : "";
    return (
      '<button type="button" class="skip" data-act="skip">Skip to content</button>' +
      '<header class="site-header"><div class="wrap header-bar">' +
      brand() +
      '<nav class="site-nav">' +
      navItem("#/trips", "trips", "Trips", active) +
      navItem("#/plan", "plan", "Plan", active) +
      navItem("#/consult", "consult", "Consult", active) +
      "</nav>" +
      '<a class="nav-cta" href="#/consult">' + inr(consultPrice()) + " consult</a>" +
      '<button type="button" class="nav-toggle" data-act="menu" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>' +
      "</div></header>" +
      warn +
      '<main id="main" tabindex="-1">' + body + "</main>" +
      '<footer class="site-footer"><div class="wrap footer-grid"><div>' +
      brand() +
      "<p class=\"fine\">" + esc(setting("tagline", "Travel · Charge · Explore")) + ". Real EV roads, with the bill attached.</p></div>" +
      '<div class="footer-links"><a href="#/trips">Trips</a><a href="#/plan">Plan a budget</a><a href="#/consult">Consult</a>' +
      (yt ? '<a href="' + esc(yt) + '" target="_blank" rel="noopener">YouTube</a>' : "") +
      (ig ? '<a href="' + esc(ig) + '" target="_blank" rel="noopener">Instagram</a>' : "") +
      "</div></div></footer>"
    );
  }

  function navItem(href, name, label, active) {
    return '<a href="' + href + '"' + (active === name ? ' aria-current="page"' : "") + ">" + label + "</a>";
  }

  function instagramUrl() {
    const raw = setting("instagram_url");
    if (!raw) return "";
    if (raw.charAt(0) === "@") return "https://instagram.com/" + encodeURIComponent(raw.slice(1));
    return SafarData.external(raw);
  }

  function card(trip) {
    const soon = trip.status === "soon";
    const money = !soon && hasMoney(trip);
    const rec = money ? SafarCalc.planTrip(trip, ofTrip(db.costs, trip), ofTrip(db.changes, trip), null).recorded : null;
    const src = SafarData.imageUrl(trip.cover_url, 1200);
    const ribbon = soon ? '<span class="ribbon">Coming soon</span>' : trip.is_sample ? '<span class="ribbon">Example</span>' : "";
    const cover = src
      ? '<div class="tcard-cover">' + coverTag(trip.cover_url, "") + ribbon + (trip.youtube_url ? '<span class="play">Play</span>' : "") + "</div>"
      : '<div class="tcard-cover is-empty">' + routeHtml(trip.from_place, trip.to_place) + ribbon + "</div>";
    const price = soon
      ? '<p class="price">Details after the drive<span>Film, stops, and the bill open on this page</span></p>'
      : money
        ? '<p class="price">' + inr(rec.perPerson) + "<span>per person, from a group of " + esc(trip.party || 2) + "</span></p>"
        : '<p class="price">Open the film<span>Stops and bills are added on the detail page</span></p>';
    return (
      '<a class="tcard" href="#/trip/' + esc(trip.slug) + '">' + cover +
      '<div class="tcard-body">' + routeHtml(trip.from_place, trip.to_place) +
      "<h3>" + esc(trip.title) + "</h3>" +
      '<p class="meta">' + esc([SafarData.formatDate(trip.trip_date), trip.ev_model].filter(Boolean).join(" · ")) + "</p>" +
      (trip.summary ? '<p class="sum">' + esc(trip.summary) + "</p>" : "") +
      price +
      "</div></a>"
    );
  }

  function emptyTrips() {
    return (
      '<div class="empty"><h2>The first road is on its way.</h2>' +
      "<p>Trip films, stops, and bills will show up here. You can still price a drive for your own group.</p>" +
      '<a class="btn btn-green" href="#/plan">Plan a budget</a></div>'
    );
  }

  function pageHome() {
    const title = setting("home_title", "See the trip. Then price it for your car.");
    const text = setting("home_text", "Watch the road, then check what it actually cost.");
    const about = setting("about");
    const first = liveTrips()[0];
    let ticket = '<aside class="ticket"><p class="calc-kicker">Plan</p><p class="big">Your group</p><p>Price a drive before you start the car.</p><p style="margin-top:14px"><a href="#/plan">Open the planner</a></p></aside>';
    if (first) {
      const money = hasMoney(first);
      const rec = money ? SafarCalc.planTrip(first, ofTrip(db.costs, first), ofTrip(db.changes, first), null).recorded : null;
      ticket =
        '<aside class="ticket"><p class="calc-kicker">' + (first.youtube_url ? "Now playing" : "Latest trip") + "</p>" +
        routeHtml(first.from_place, first.to_place) +
        "<h2>" + esc(first.title) + "</h2>" +
        (money ? '<p class="big">' + inr(rec.total) + "</p><p>" + inr(rec.perPerson) + " per person</p>" : "<p>The film is up. Stops and the bill open on the trip page as they are added.</p>") +
        '<p style="margin-top:14px"><a href="#/trip/' + esc(first.slug) + '">Open details</a></p></aside>';
    }
    const list = liveTrips().length ? '<div class="tcards">' + liveTrips().map(card).join("") + "</div>" : emptyTrips();
    return (
      '<section class="hero"><img src="assets/banner.jpg" width="1920" height="720" alt="Safar Electrified — Travel, Charge, Explore. An electric car on a mountain road beside a lake."></section>' +
      '<div class="wrap"><div class="intro-grid"><div><p class="eyebrow">' + esc(setting("tagline", "Travel · Charge · Explore")) +
      "</p><h1>" + esc(title) + '</h1><p class="lede">' + esc(text) + '</p><div class="cta-row">' +
      '<a class="btn btn-green" href="#/trips">Watch trips</a><a class="btn btn-sun" href="#/plan">Plan a budget</a>' +
      '<a class="btn btn-ghost" href="#/consult">Ask for ' + inr(consultPrice()) + "</a></div></div>" +
      ticket + "</div>" +
      '<ul class="points"><li><strong>Watch</strong><span>The YouTube film, or the Google Drive file, sits on the trip page.</span></li>' +
      "<li><strong>Check</strong><span>Stops, problems, changes on the car, and the bill — with room for a photo of the proof.</span></li>" +
      "<li><strong>Price</strong><span>Add or remove people, and slide what you want to spend on food.</span></li></ul>" +
      comingSoonBand() +
      '<div class="section-head"><h2>Trips</h2><a href="#/trips">All trips</a></div>' + list +
      (about ? '<section class="about"><h2>The notebook</h2>' + paragraphs(about) + "</section>" : "") +
      consultBand() + "</div>"
    );
  }

  function comingSoonBand() {
    const next = soonTrips()[0];
    if (!next) return "";
    return (
      '<a class="soon" href="#/trip/' + esc(next.slug) + '"><span class="soon-kicker">Coming soon</span><div><p class="eyebrow">Next road</p><h2>' +
      esc(next.title) + "</h2><p>" + esc(next.summary || "The film, the stops, and the bill go up after the drive.") +
      '</p></div><span class="btn btn-sun">Open the page</span></a>'
    );
  }

  function consultBand() {
    return (
      '<section class="consult-band"><div><p class="eyebrow">Consultation</p><h2>Ask before you leave.</h2>' +
      "<p>Your EV, your route, and the question you actually have. I reply with a charging plan and a budget for your group.</p></div>" +
      '<div><p class="price">' + inr(consultPrice()) + '</p><a class="btn btn-sun" href="#/consult">Book a consult</a></div></section>'
    );
  }

  function pageTrips() {
    const list = liveTrips().length ? '<div class="tcards">' + liveTrips().map(card).join("") + "</div>" : emptyTrips();
    const soon = soonTrips().length ? '<div class="tcards" style="margin-top:18px">' + soonTrips().map(card).join("") + "</div>" : "";
    return '<div class="wrap page"><div class="page-head"><div><p class="eyebrow">Trips</p><h1>On the road</h1><p class="page-lead">Open a trip for the film. Stops and bills open inside that page — tap a checkpoint to read it.</p></div></div>' + list + soon + "</div>";
  }

  function shareBar(trip) {
    return (
      '<div class="sharebar"><button type="button" class="btn btn-sun" data-act="wa-trip" data-id="' + esc(trip.slug) +
      '">WhatsApp</button><button type="button" class="btn btn-ghost" data-act="copy-link" data-id="' + esc(trip.slug) +
      '">Copy link</button><button type="button" class="btn btn-ghost" data-act="native-share" data-id="' + esc(trip.slug) +
      '">Instagram & more</button></div>'
    );
  }

  function videos(trip) {
    const yt = SafarData.youtubeId(trip.youtube_url);
    const preview = SafarData.drivePreview(trip.drive_video_url);
    const drive = SafarData.driveView(trip.drive_video_url);
    if (!yt && !preview) return "";
    let html = '<section class="block"><h2>Watch</h2>';
    if (yt) {
      html += '<div class="video-frame"><iframe src="https://www.youtube-nocookie.com/embed/' + esc(yt) +
        '" title="' + esc(trip.title) + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe></div>';
    }
    if (preview) {
      html += '<div class="video-frame"><iframe src="' + esc(preview) + '" title="Google Drive video" allow="autoplay" allowfullscreen loading="lazy"></iframe></div>';
    }
    html += '<div class="video-links">';
    if (yt) html += '<a class="text-link" href="' + esc(SafarData.external(trip.youtube_url)) + '" target="_blank" rel="noopener">Open on YouTube</a>';
    if (drive) html += '<a class="text-link" href="' + esc(drive) + '" target="_blank" rel="noopener">Open in Drive</a>';
    return html + "</div></section>";
  }

  function stopsBlock(trip) {
    const stops = ofTrip(db.stops, trip);
    if (!stops.length) {
      return '<section class="block"><h2>Checkpoints</h2><p class="wait">Stops will line up here, under the film. Tap one and the note, the battery, and the money at that stop open.</p></section>';
    }
    const items = stops.map(function (stop, index) {
      const photo = SafarData.imageUrl(stop.photo_url, 1000);
      const view = SafarData.driveView(stop.photo_url) || photo;
      const open = index === 0;
      const bits = [];
      if (stop.km !== "") bits.push(stop.km + " km");
      if (stop.amount) bits.push(inr(stop.amount));
      return (
        '<li class="' + (open ? "is-open" : "") + '"><span class="pin pin-' + esc(stop.kind || "sight") + '"></span><div>' +
        '<button type="button" class="stop-toggle" data-act="toggle-stop" aria-expanded="' + (open ? "true" : "false") + '"><span><strong>' +
        esc(stop.name || "Stop") + '</strong><small>' + esc(KINDS[stop.kind] || "Stop") + "</small></span><span class=\"stop-money\">" +
        esc(bits.join(" · ")) + '</span></button><div class="stop-detail">' +
        (stop.amount ? "<p><strong>" + inr(stop.amount) + "</strong> at this stop</p>" : "") +
        (stop.battery ? "<p>" + esc(stop.battery) + "</p>" : "") +
        (stop.notes ? "<p>" + esc(stop.notes) + "</p>" : "<p>No note on this stop yet.</p>") +
        (photo ? '<a class="stop-photo" href="' + esc(view) + '" target="_blank" rel="noopener" data-act="zoom" data-src="' + esc(photo) + '" data-cap="' + esc(stop.name) + '">' + coverTag(stop.photo_url, stop.name) + "</a>" : "") +
        "</div></div></li>"
      );
    }).join("");
    return '<section class="block"><h2>Checkpoints</h2><p class="wait">Tap a stop. The note, the battery, and the money at that stop open underneath.</p><ol class="road">' + items + "</ol></section>";
  }

  function unitNote(row, trip) {
    if (row.basis === "room_night") {
      const fit = row.per_room || fitCount(trip);
      return "per room / night · " + fit + " people fit in one room";
    }
    return basisWords(row.basis);
  }

  function proofText(url) {
    const view = SafarData.driveView(url) || SafarData.external(url);
    if (!view) return "";
    return ' <a class="text-link" href="' + esc(view) + '" target="_blank" rel="noopener">Proof</a>';
  }

  function billRows(trip) {
    return ofTrip(db.costs, trip).map(function (row) {
      return {
        group: CATS[row.category] || "Cost",
        label: row.label || "Cost",
        note: unitNote(row, trip),
        amount: row.amount,
        proof: row.proof_url,
      };
    });
  }

  function billList(trip) {
    return billRows(trip).map(function (row) {
      return (
        '<li><span class="k">' + esc(row.group) + '</span><span><strong>' + esc(row.label) +
        '</strong><small>' + esc(row.note) + proofText(row.proof) + "</small></span><b>" + inr(row.amount) + "</b></li>"
      );
    }).join("");
  }

  function spentBlock(trip) {
    const rows = billRows(trip);
    if (!rows.length) return "";
    return (
      '<section class="spend"><h2>Under the film</h2><p class="wait">These are the bills from the drive. Charging stays with the car. The room price is for one room. Food is per person.</p><ul class="subs">' +
      billList(trip) + "</ul></section>"
    );
  }

  function problemsBlock(trip) {
    const rows = ofTrip(db.problems, trip);
    if (!rows.length) return "";
    const html = rows.map(function (row) {
      return '<article class="problem"><div><h3>' + esc(row.title) + "</h3>" + (row.detail ? '<p class="notes">' + esc(row.detail) + "</p>" : "") + "</div><div>" + proofLink(row.proof_url, row.title) + "</div></article>";
    }).join("");
    return '<section class="block"><h2>What went wrong</h2>' + html + "</section>";
  }

  function changesBlock(trip) {
    const rows = ofTrip(db.changes, trip);
    if (!rows.length) return "";
    const html = rows.map(function (row) {
      return (
        '<article class="change"><div><p class="kicker">On the car</p><h3>' + esc(row.title) + "</h3>" +
        (row.place ? '<p class="notes">' + esc(row.place) + "</p>" : "") +
        (row.notes ? '<p class="notes">' + esc(row.notes) + "</p>" : "") +
        "</div><div class=\"change-side\"><strong>" + inr(row.cost) + "</strong>" + proofLink(row.proof_url, row.title) + "</div></article>"
      );
    }).join("");
    return '<section class="block"><h2>What changed on the EV</h2>' + html + "</section>";
  }

  function costsBlock(trip) {
    const rows = ofTrip(db.costs, trip);
    if (!rows.length) return "";
    const html = rows.map(function (row) {
      return (
        '<article class="bill"><div><p class="kicker">' + esc(CATS[row.category] || "Cost") + "</p><h3>" + esc(row.label) + "</h3>" +
        (row.notes ? '<p class="notes">' + esc(row.notes) + "</p>" : "") +
        "</div><div class=\"bill-side\"><strong>" + inr(row.amount) + "</strong><span>" + esc(basisWords(row.basis)) + "</span>" +
        proofLink(row.proof_url, row.label) + "</div></article>"
      );
    }).join("");
    return '<section class="block"><h2>What it cost</h2>' + html + "</section>";
  }

  function galleryBlock(trip) {
    const photos = ofTrip(db.gallery, trip);
    if (!photos.length) return "";
    const html = photos.map(function (photo) {
      const src = SafarData.imageUrl(photo.photo_url, 1200);
      const view = SafarData.driveView(photo.photo_url) || src;
      return '<button type="button" class="shot" data-act="zoom" data-src="' + esc(src) + '" data-cap="' + esc(photo.caption) + '">' + coverTag(photo.photo_url, photo.caption) + "</button>";
    }).join("");
    return '<section class="block"><h2>Photos</h2><div class="gallery">' + html + "</div></section>";
  }

  function calcInner(trip) {
    const state = stateFor(trip);
    const model = modelFor(trip);
    const planned = model.planned;
    const who = trip.is_sample ? "Example total" : "Spent on this trip";
    const lines = planned.lines.map(function (line) {
      return (
        '<button type="button" class="line' + (line.on ? " is-on" : "") + '" data-act="toggle-line" data-line="' + esc(line.id) +
        '" aria-pressed="' + (line.on ? "true" : "false") + '"><span class="tick"></span><span><strong>' + esc(line.label) +
        '</strong><small data-linedetail="' + esc(line.id) + '">' + esc(detailFor(line, planned)) + '</small></span><b data-lineamt="' +
        esc(line.id) + '">' + inr(line.amount) + "</b></button>"
      );
    }).join("");
    const extras = planned.extras.map(function (extra) {
      return '<div class="extra"><span>' + esc(extra.label) + "</span><b>" + inr(extra.amount) + '</b><button type="button" data-act="remove-extra" data-id="' + esc(extra.id) + '">Remove</button></div>';
    }).join("");
    return (
      '<div class="calc-card"><p class="calc-kicker">Your estimate</p><p class="calc-total" data-out="total">' + inr(planned.total) +
      '</p><p class="calc-each"><span data-out="each">' + inr(planned.perPerson) + "</span> per person, if you split it</p>" +
      '<p class="calc-recorded">' + esc(who) + ": " + inr(model.recorded.total) + " for " + esc(trip.party) + "</p>" +
      '<div class="stepper-row">' + stepper("trip", "people", state.people, "people") + stepper("trip", "rooms", state.rooms, "rooms") + "</div>" +
      '<div class="stepper-row">' + stepper("trip", "days", state.days, "days") + stepper("trip", "nights", state.nights, "nights") + "</div>" +
      '<div class="slider"><div class="slider-top"><span>Food per person / day</span><strong data-rangeread="food">' + inr(state.food) +
      '</strong></div><input type="range" min="0" max="4000" step="10" value="' + state.food + '" data-range="food" aria-label="Food per person per day">' +
      '<div class="slider-scale"><span>₹0</span><span>₹4,000</span></div></div>' +
      '<p class="hint" data-out="foodDetail">' + inr(state.food) + " × " + planned.people + " × " + planned.days + " days = " + inr(planned.foodAmount) + "</p>" +
      lines +
      '<div class="line is-on"><span class="tick"></span><span><strong>Food</strong><small>from the slider</small></span><b data-lineamt="food">' + inr(planned.foodAmount) + "</b></div>" +
      extras +
      '<form id="add-cost" class="add-cost"><input name="label" type="text" maxlength="40" placeholder="Extra for the car" aria-label="Extra cost name"><input name="amount" inputmode="numeric" placeholder="₹" aria-label="Extra cost amount"><button type="submit">Add</button></form>' +
      '<p class="hint">' + esc(roomRule(fitCount(trip))) + " Food follows the slider. Charging stays with the car.</p>" +
      '<div class="sharebar"><button type="button" class="btn btn-sun" data-act="wa-trip" data-id="' + esc(trip.slug) + '">Share this estimate</button>' +
      '<button type="button" class="linkish" data-act="reset-calc" data-id="' + esc(trip.slug) + '">Reset to this trip</button></div></div>'
    );
  }

  function pageSoon(trip) {
    return (
      '<div class="wrap page"><p class="eyebrow">Coming soon</p>' + routeHtml(trip.from_place, trip.to_place) +
      "<h1>" + esc(trip.title) + "</h1>" +
      '<p class="lede">' + esc(trip.summary || "This drive is next. The film, the stops, and the bill will open here after the trip.") + "</p>" +
      '<div class="soon-grid"><article><h2>What will open here</h2><ul class="offer"><li>The YouTube film</li><li>Checkpoints — tap one for the note and photo</li><li>What went wrong, with proof</li><li>What changed on the EV, and what it cost</li><li>A calculator for your own group</li></ul></article>' +
      '<aside class="ticket"><p class="calc-kicker">Next</p><p class="big">After the drive</p><p>Nothing is filled in yet, so this page will not invent a bill.</p></aside></div></div>'
    );
  }

  function pageTrip(slug) {
    const trip = findTrip(slug);
    if (!trip) {
      return '<div class="wrap page"><h1>That trip is not on the sheet.</h1><p><a class="text-link" href="#/trips">Back to trips</a></p></div>';
    }
    if (trip.status === "soon") return pageSoon(trip);
    const cover = SafarData.imageUrl(trip.cover_url, 1800);
    const money = hasMoney(trip);
    return (
      '<div class="wrap page"><p class="eyebrow">Trip</p>' + routeHtml(trip.from_place, trip.to_place) +
      "<h1>" + esc(trip.title) + "</h1>" + chips(trip) +
      (trip.is_sample ? '<p class="sample-note">Example trip. The numbers show how a page works. Replace this row in the sheet, or set published to no.</p>' : "") +
      (cover && !trip.youtube_url ? '<figure class="trip-cover">' + coverTag(trip.cover_url, trip.title) + "</figure>" : "") +
      videos(trip) +
      spentBlock(trip) +
      '<div class="trip-layout' + (money ? "" : " is-single") + '"><div class="trip-main">' + shareBar(trip) +
      (trip.story ? '<section class="block story"><h2>What we did</h2>' + paragraphs(trip.story) + "</section>" : "") +
      stopsBlock(trip) + problemsBlock(trip) + changesBlock(trip) + galleryBlock(trip) +
      (money ? "" : '<section class="block"><h2>The bill</h2><p class="wait">Charging, hotel, food, and tolls will show here, each one opening with its proof photo.</p></section>') +
      shareBar(trip) + "</div>" +
      (money ? '<aside class="calc-wrap" id="calc" data-trip="' + esc(trip.slug) + '">' + calcInner(trip) + "</aside>" : "") +
      "</div></div>"
    );
  }

  function planModel() {
    const people = clampKey(plan.people, "people");
    const days = clampKey(plan.days, "days");
    const nights = clampKey(plan.nights, "nights");
    const rooms = clampKey(plan.rooms, "rooms");
    const distance = Math.max(0, SafarData.num(plan.distance));
    const food = Math.max(0, Number(plan.food) || 0);
    const hotel = Math.max(0, Number(plan.hotel) || 0);
    const rate = Math.max(0, Number(plan.rate) || 0);
    const tolls = Math.max(0, SafarData.num(plan.tolls));
    const charging = rate * distance;
    const stay = hotel * rooms * nights;
    const meals = food * people * days;
    const total = charging + stay + meals + tolls;
    return {
      people: people,
      days: days,
      nights: nights,
      rooms: rooms,
      perRoom: clampKey(plan.perRoom, "perRoom"),
      distance: distance,
      food: food,
      hotel: hotel,
      rate: rate,
      tolls: tolls,
      charging: charging,
      stay: stay,
      meals: meals,
      total: total,
      perPerson: people ? total / people : total,
    };
  }

  function planText() {
    const model = planModel();
    const name = [plan.from.trim(), plan.to.trim()].filter(Boolean).join(" to ") || "EV trip";
    return [
      "Safar Electrified estimate — " + name,
      model.people + " people · " + model.days + " days · " + model.nights + " nights · " + model.rooms + " rooms",
      "Distance: " + model.distance + " km",
      "Charging: " + inr(model.charging) + " (" + rateLabel(model.rate) + ")",
      "Stay: " + inr(model.stay),
      "Food: " + inr(model.meals),
      "Tolls: " + inr(model.tolls),
      "Total " + inr(model.total) + " · " + inr(model.perPerson) + " per person",
      location.origin + location.pathname + "#/plan",
    ].join("\n");
  }

  function sumOn(lines, test) {
    return lines.reduce(function (sum, line) {
      return sum + (line.on && test(line) ? line.amount : 0);
    }, 0);
  }

  function planCard(trip) {
    const href = "#/trip/" + esc(trip.slug);
    if (trip.status === "soon") {
      return (
        '<article class="plan-trip"><p class="eyebrow">Coming soon</p><h2><a href="' + href + '">' + esc(trip.title) +
        "</a></h2><p class=\"wait\">" + esc(trip.summary || "The film and the bill go up after the drive.") + "</p></article>"
      );
    }
    if (!hasMoney(trip)) {
      return (
        '<article class="plan-trip" data-plantrip="' + esc(trip.slug) + '">' + routeHtml(trip.from_place, trip.to_place) +
        '<h2><a href="' + href + '">' + esc(trip.title) + "</a></h2>" +
        '<p class="wait">Charge, room, and food are not written yet. Once they are, anyone can raise the people here and the hotel follows how many fit in one room.</p>' +
        '<p><a class="text-link" href="' + href + '">Open the film</a></p></article>'
      );
    }
    const state = stateFor(trip);
    const planned = modelFor(trip).planned;
    const fit = fitCount(trip);
    const charge = sumOn(planned.lines, function (line) { return line.category === "charging"; });
    const stay = sumOn(planned.lines, function (line) { return line.basis === "room_night"; });
    const stayLine = planned.lines.find(function (line) { return line.on && line.basis === "room_night"; });
    const rooms = stayLine ? stayLine.rooms : state.rooms;
    const roomWord = rooms === 1 ? "1 room" : rooms + " rooms";
    const nightWord = planned.nights === 1 ? "1 night" : planned.nights + " nights";
    let now = "";
    if (ofTrip(db.costs, trip).some(function (row) { return row.category === "charging"; })) {
      now += '<li><span class="k">Now</span><span><strong>Charging</strong><small>stays with the car</small></span><b>' + inr(charge) + "</b></li>";
    }
    if (ofTrip(db.costs, trip).some(function (row) { return row.basis === "room_night"; })) {
      now += '<li><span class="k">Now</span><span><strong>Room</strong><small>' + roomWord + " × " + nightWord + " · " + fit + " per room</small></span><b>" + inr(stay) + "</b></li>";
    }
    if (ofTrip(db.costs, trip).some(function (row) { return row.category === "food"; }) || planned.foodAmount) {
      now += '<li><span class="k">Now</span><span><strong>Food</strong><small>' + inr(state.food) + " × " + planned.people + " × " + planned.days + " days</small></span><b>" + inr(planned.foodAmount) + "</b></li>";
    }
    return (
      '<article class="plan-trip" data-plantrip="' + esc(trip.slug) + '">' + routeHtml(trip.from_place, trip.to_place) +
      '<h2><a href="' + href + '">' + esc(trip.title) + "</a></h2>" +
      '<p class="wait">Prices from this drive. The lines marked Now follow the group below.</p><ul class="subs">' +
      billList(trip) + now + "</ul>" +
      '<div class="stepper-row">' + stepper("card", "people", state.people, "people", trip.slug) + stepper("card", "rooms", state.rooms, "rooms", trip.slug) + "</div>" +
      '<p class="wait">' + esc(roomRule(fit)) + "</p>" +
      '<p class="plan-sum"><strong>' + inr(planned.total) + '</strong><span>' + inr(planned.perPerson) + " per person</span></p>" +
      '<p><a class="text-link" href="' + href + '">Open the film and the checkpoints</a></p></article>'
    );
  }

  function pagePlan() {
    const model = planModel();
    const cards = (db.trips || []).map(planCard).join("");
    return (
      '<div class="wrap page"><p class="eyebrow">Planner</p><h1>Every trip, then your group.</h1>' +
      '<p class="page-lead">Each drive keeps its own charge, room price, and food. Raise the people. If one room cannot hold them, the hotel bill goes up. Charging stays with the car.</p>' +
      '<div class="plan-list">' + cards + "</div>" +
      "<h2>A road that is not on the list yet</h2>" +
      '<p class="page-lead">Use this when the drive has no film yet. Set how many people fit in one room, then add people. Five or six people in a room that fits three means two rooms, and the hotel follows.</p>' +
      '<div id="planner"><div class="plan-grid"><div class="paper"><div class="field-row"><label>From<input type="text" maxlength="40" placeholder="Delhi" value="' + esc(plan.from) + '" data-field="from"></label>' +
      '<label>To<input type="text" maxlength="40" placeholder="Jaipur" value="' + esc(plan.to) + '" data-field="to"></label></div>' +
      '<div class="field-row"><label>Distance (km)<input type="number" min="0" step="10" value="' + esc(plan.distance) + '" data-field="distance"></label>' +
      '<label>Tolls (₹)<input type="number" min="0" step="50" value="' + esc(plan.tolls) + '" data-field="tolls"></label></div>' +
      '<div class="stepper-row">' + stepper("plan", "people", plan.people, "people") + stepper("plan", "perRoom", plan.perRoom, "per room") + "</div>" +
      '<div class="stepper-row">' + stepper("plan", "rooms", plan.rooms, "rooms") + stepper("plan", "days", plan.days, "days") + "</div>" +
      '<div class="stepper-row">' + stepper("plan", "nights", plan.nights, "nights") + "</div>" +
      slider("food", "Food per person / day", inr(plan.food), plan.food, 0, 4000, 10, "₹0", "₹4,000") +
      slider("hotel", "Hotel per room / night", inr(plan.hotel), plan.hotel, 0, 15000, 100, "₹0", "₹15,000") +
      slider("rate", "Charging per km", rateLabel(plan.rate), plan.rate, 0, 15, 0.1, "₹0", "₹15") +
      "</div>" + planResult(model) + "</div></div></div>"
    );
  }

  function slider(key, label, read, value, min, max, step, lo, hi) {
    return (
      '<div class="slider"><div class="slider-top"><span>' + label + '</span><strong data-rangeread="' + key + '">' + read +
      '</strong></div><input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value +
      '" data-range="' + key + '" aria-label="' + esc(label) + '"><div class="slider-scale"><span>' + lo + "</span><span>" + hi + "</span></div></div>"
    );
  }

  function planResult(model) {
    const rooms = model.rooms === 1 ? "1 room" : model.rooms + " rooms";
    const nights = model.nights === 1 ? "1 night" : model.nights + " nights";
    return (
      '<aside class="calc-card"><p class="calc-kicker">Estimate</p><p class="calc-total" data-out="total">' + inr(model.total) +
      '</p><p class="calc-each"><span data-out="each">' + inr(model.perPerson) + "</span> per person</p>" +
      '<div class="line is-on"><span class="tick"></span><span><strong>Charging</strong><small data-out="chargeDetail">' +
      rateLabel(model.rate) + " × " + model.distance + ' km</small></span><b data-out="charging">' + inr(model.charging) + "</b></div>" +
      '<div class="line is-on"><span class="tick"></span><span><strong>Stay</strong><small data-out="stayDetail">' +
      rooms + " × " + nights + " · " + model.perRoom + ' per room</small></span><b data-out="stay">' + inr(model.stay) + "</b></div>" +
      '<div class="line is-on"><span class="tick"></span><span><strong>Food</strong><small data-out="foodDetail">' +
      inr(model.food) + " × " + model.people + " × " + model.days + ' days</small></span><b data-out="meals">' + inr(model.meals) + "</b></div>" +
      '<div class="line is-on"><span class="tick"></span><span><strong>Tolls</strong><small>for the car</small></span><b data-out="tolls">' + inr(model.tolls) + "</b></div>" +
      '<div class="sharebar"><button type="button" class="btn btn-sun" data-act="wa-plan">WhatsApp</button><button type="button" class="btn btn-line" data-act="share-plan">Instagram & more</button></div></aside>'
    );
  }

  function consultForm() {
    return (
      '<form id="consult-form" class="form"><div id="form-errors" class="form-errors" hidden></div>' +
      '<label>Name<input name="name" required autocomplete="name" maxlength="80"></label>' +
      '<label>WhatsApp number<input name="phone" required inputmode="tel" autocomplete="tel" maxlength="20" placeholder="98xxxxxxxx"></label>' +
      '<div class="field-row"><label>City<input name="city" maxlength="40"></label><label>Your EV<input name="ev" maxlength="40" placeholder="Nexon EV"></label></div>' +
      '<label>Route you want to do<input name="route" maxlength="80" placeholder="Delhi to Manali"></label>' +
      '<div class="field-row"><label>When<input name="when" maxlength="40" placeholder="November"></label><label>People<input name="people" inputmode="numeric" value="2" maxlength="2"></label></div>' +
      '<label>What do you want to know?<textarea name="question" required maxlength="1000" placeholder="Range, chargers, stay, food, or a problem you are worried about."></textarea></label>' +
      '<button class="btn btn-green" type="submit">Prepare my ' + inr(consultPrice()) + " consult</button></form>"
    );
  }

  function pageConsult() {
    const price = consultPrice();
    return (
      '<div class="wrap page"><div class="split"><div><p class="eyebrow">Consultation</p><h1>Ask before you leave.</h1>' +
      '<p class="price-line"><span>' + inr(price) + "</span> for a personal reply</p>" +
      "<p>Tell me the car, the road, and what you want to know. I answer on WhatsApp with where to charge and a budget that fits your group.</p>" +
      '<ul class="offer"><li>Whether your EV can do that route</li><li>Where to charge, and where not to risk it</li><li>Stay, food, toll, and charging for your group</li><li>Problems that usually show up on that road</li></ul></div>' +
      '<div class="paper" id="consult-pane">' + consultForm() + "</div></div></div>"
    );
  }

  function setTitle(page) {
    const name = setting("channel_name", "Safar Electrified");
    document.title = page ? page + " · " + name : name + " — Travel, Charge, Explore";
  }

  function render() {
    const route = currentRoute();
    let body = "";
    let active = route.name === "trip" ? "trips" : route.name;
    if (route.name === "home") {
      setTitle("");
      body = pageHome();
    } else if (route.name === "trips") {
      setTitle("Trips");
      body = pageTrips();
    } else if (route.name === "trip") {
      const trip = findTrip(route.id);
      setTitle(trip ? trip.title : "Trip");
      body = pageTrip(route.id);
    } else if (route.name === "plan") {
      setTitle("Plan a budget");
      body = pagePlan();
    } else if (route.name === "consult") {
      setTitle("Consult");
      body = pageConsult();
    }
    document.getElementById("app").innerHTML = shell(active, body);
    window.scrollTo(0, 0);
  }

  function activeTrip() {
    const id = document.getElementById("calc") && document.getElementById("calc").dataset.trip;
    return id ? findTrip(id) : null;
  }

  function fillCalc(trip) {
    const root = document.getElementById("calc");
    if (!root || !trip) return;
    const state = stateFor(trip);
    const planned = modelFor(trip).planned;
    const view = {
      total: inr(planned.total),
      each: inr(planned.perPerson),
      foodDetail: inr(state.food) + " × " + planned.people + " × " + planned.days + " days = " + inr(planned.foodAmount),
    };
    root.querySelectorAll("[data-out]").forEach(function (el) {
      if (view[el.dataset.out] != null) el.textContent = view[el.dataset.out];
    });
    root.querySelectorAll("[data-stepcount]").forEach(function (el) {
      el.textContent = state[el.dataset.stepcount];
    });
    const foodRead = root.querySelector('[data-rangeread="food"]');
    if (foodRead) foodRead.textContent = inr(state.food);
    const foodAmt = root.querySelector('[data-lineamt="food"]');
    if (foodAmt) foodAmt.textContent = inr(planned.foodAmount);
    planned.lines.forEach(function (line) {
      const amt = root.querySelector('[data-lineamt="' + CSS.escape(line.id) + '"]');
      if (amt) amt.textContent = inr(line.amount);
      const detail = root.querySelector('[data-linedetail="' + CSS.escape(line.id) + '"]');
      if (detail) detail.textContent = detailFor(line, planned);
      const row = root.querySelector('[data-line="' + CSS.escape(line.id) + '"]');
      if (row) {
        row.classList.toggle("is-on", line.on);
        row.setAttribute("aria-pressed", line.on ? "true" : "false");
      }
    });
  }

  function refreshPlanCard(trip) {
    const node = document.querySelector('[data-plantrip="' + CSS.escape(trip.slug) + '"]');
    if (!node) return;
    node.outerHTML = planCard(trip);
  }

  function fillPlan() {
    const root = document.getElementById("planner");
    if (!root) return;
    const model = planModel();
    const rooms = model.rooms === 1 ? "1 room" : model.rooms + " rooms";
    const nights = model.nights === 1 ? "1 night" : model.nights + " nights";
    const view = {
      total: inr(model.total),
      each: inr(model.perPerson),
      charging: inr(model.charging),
      stay: inr(model.stay),
      meals: inr(model.meals),
      tolls: inr(model.tolls),
      chargeDetail: rateLabel(model.rate) + " × " + model.distance + " km",
      stayDetail: rooms + " × " + nights + " · " + model.perRoom + " per room",
      foodDetail: inr(model.food) + " × " + model.people + " × " + model.days + " days",
    };
    root.querySelectorAll("[data-out]").forEach(function (el) {
      if (view[el.dataset.out] != null) el.textContent = view[el.dataset.out];
    });
    root.querySelectorAll("[data-stepcount]").forEach(function (el) {
      el.textContent = plan[el.dataset.stepcount];
    });
    root.querySelectorAll("[data-rangeread]").forEach(function (el) {
      const key = el.dataset.rangeread;
      el.textContent = key === "rate" ? rateLabel(plan.rate) : inr(plan[key]);
    });
  }

  function tripShareText(trip) {
    const planned = modelFor(trip).planned;
    const lines = [
      "Safar Electrified — " + trip.from_place + " to " + trip.to_place,
      planned.people + " people · " + planned.days + " days · " + planned.nights + " nights",
    ];
    planned.lines.forEach(function (line) {
      if (line.on) lines.push(line.label + ": " + inr(line.amount));
    });
    lines.push("Food: " + inr(planned.foodAmount));
    planned.extras.forEach(function (extra) {
      lines.push(extra.label + ": " + inr(extra.amount));
    });
    lines.push("Total " + inr(planned.total) + " · " + inr(planned.perPerson) + " per person");
    lines.push(tripLink(trip));
    return lines.join("\n");
  }

  function toast(message) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove("is-on");
    }, 2200);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied");
    } catch (err) {
      toast("Could not copy");
    }
  }

  async function nativeShare(text, title) {
    const urlLine = text.split("\n").pop();
    if (navigator.share) {
      try {
        await navigator.share({ title: title || "Safar Electrified", text: text, url: urlLine });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    await copyText(text);
    toast("Copied. Paste it into Instagram or any app.");
  }

  function openWhatsApp(text, number) {
    const base = number ? "https://wa.me/" + number : "https://wa.me/";
    window.open(base + "?text=" + encodeURIComponent(text), "_blank", "noopener");
  }

  function mountCalc(trip) {
    const el = document.getElementById("calc");
    if (!el) return;
    el.innerHTML = calcInner(trip);
  }

  function openLight(src, caption) {
    const box = document.getElementById("lightbox");
    const img = box.querySelector("img");
    img.src = src;
    img.alt = caption || "Photo";
    box.querySelector("figcaption").textContent = caption || "";
    box.hidden = false;
  }

  function closeLight() {
    const box = document.getElementById("lightbox");
    box.hidden = true;
    box.querySelector("img").removeAttribute("src");
  }

  window.safarImgFail = function (img) {
    const parent = img.parentElement;
    if (parent) {
      parent.classList.add("no-img");
      parent.removeAttribute("data-src");
    }
    img.remove();
  };

  function onClick(event) {
    const btn = event.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "toggle-stop") {
      const item = btn.closest("li");
      if (!item) return;
      const open = item.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      return;
    }
    if (act === "menu") {
      const header = document.querySelector(".site-header");
      const open = header.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      return;
    }
    if (act === "skip") {
      const main = document.getElementById("main");
      if (main) main.focus();
      return;
    }
    if (act === "close-light") {
      closeLight();
      return;
    }
    if (act === "zoom") {
      if (!btn.dataset.src) return;
      event.preventDefault();
      openLight(btn.dataset.src, btn.dataset.cap || "");
      return;
    }
    if (act === "step") {
      const key = btn.dataset.key;
      const dir = Number(btn.dataset.dir);
      if (btn.dataset.scope === "card") {
        const trip = findTrip(btn.dataset.id);
        if (!trip) return;
        const state = stateFor(trip);
        state[key] = clampKey(state[key] + dir, key);
        if (key === "rooms") state.roomsAuto = false;
        if (key === "people" && state.roomsAuto) state.rooms = SafarCalc.roomsFor(state.people, trip.per_room);
        refreshPlanCard(trip);
        return;
      }
      if (btn.dataset.scope === "plan") {
        plan[key] = clampKey(plan[key] + dir, key);
        if (key === "rooms") plan.roomsAuto = false;
        if ((key === "people" || key === "perRoom") && plan.roomsAuto) plan.rooms = SafarCalc.roomsFor(plan.people, plan.perRoom);
        fillPlan();
      } else {
        const trip = activeTrip();
        if (!trip) return;
        const state = stateFor(trip);
        state[key] = clampKey(state[key] + dir, key);
        if (key === "rooms") state.roomsAuto = false;
        if (key === "people" && state.roomsAuto) state.rooms = SafarCalc.roomsFor(state.people, trip.per_room);
        fillCalc(trip);
      }
      return;
    }
    if (act === "toggle-line") {
      const trip = activeTrip();
      if (!trip) return;
      const state = stateFor(trip);
      const id = btn.dataset.line;
      state.off[id] = !state.off[id];
      if (!state.off[id]) delete state.off[id];
      fillCalc(trip);
      return;
    }
    if (act === "remove-extra") {
      const trip = activeTrip();
      if (!trip) return;
      const state = stateFor(trip);
      state.extras = state.extras.filter(function (extra) {
        return extra.id !== btn.dataset.id;
      });
      mountCalc(trip);
      return;
    }
    if (act === "reset-calc") {
      const trip = findTrip(btn.dataset.id) || activeTrip();
      if (!trip) return;
      delete tripMemory[trip.slug];
      mountCalc(trip);
      return;
    }
    if (act === "wa-trip") {
      const trip = findTrip(btn.dataset.id);
      if (trip) openWhatsApp(tripShareText(trip));
      return;
    }
    if (act === "copy-link") {
      const trip = findTrip(btn.dataset.id);
      if (trip) copyText(tripLink(trip));
      return;
    }
    if (act === "native-share") {
      const trip = findTrip(btn.dataset.id);
      if (trip) nativeShare(tripShareText(trip), trip.title);
      return;
    }
    if (act === "wa-plan") {
      openWhatsApp(planText());
      return;
    }
    if (act === "share-plan") {
      nativeShare(planText(), "EV trip estimate");
      return;
    }
    if (act === "copy-text") {
      if (lastNote) copyText(lastNote);
      return;
    }
    if (act === "wa-consult") {
      const number = waNumber();
      if (!number) {
        toast("Add your WhatsApp number in the Settings sheet");
        return;
      }
      openWhatsApp(lastNote, number);
      return;
    }
    if (act === "copy-upi") {
      const upi = setting("upi_id");
      if (upi) copyText(upi);
    }
  }

  function onInput(event) {
    const target = event.target;
    if (target.dataset.range && target.closest("#calc")) {
      const trip = activeTrip();
      if (!trip) return;
      stateFor(trip).food = Number(target.value);
      fillCalc(trip);
      return;
    }
    if (target.closest("#planner")) {
      if (target.dataset.range) {
        plan[target.dataset.range] = Number(target.value);
        fillPlan();
      }
      if (target.dataset.field) {
        if (target.dataset.field === "from" || target.dataset.field === "to") plan[target.dataset.field] = target.value.slice(0, 40);
        else plan[target.dataset.field] = Math.max(0, SafarData.num(target.value));
        fillPlan();
      }
    }
  }

  function onSubmit(event) {
    const form = event.target;
    if (form.id === "add-cost") {
      event.preventDefault();
      const trip = activeTrip();
      if (!trip) return;
      const label = form.label.value.trim();
      const amount = SafarData.num(form.amount.value);
      if (!label || amount <= 0) {
        toast("Add a name and an amount");
        return;
      }
      stateFor(trip).extras.push({ id: "x" + Date.now(), label: label, amount: amount });
      mountCalc(trip);
      return;
    }
    if (form.id === "consult-form") {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const errors = [];
      if (!String(data.name || "").trim()) errors.push("Add your name.");
      if (String(data.phone || "").replace(/\D/g, "").length < 10) errors.push("Add a WhatsApp number with at least 10 digits.");
      if (!String(data.question || "").trim()) errors.push("Write what you want to know.");
      const box = document.getElementById("form-errors");
      if (errors.length) {
        box.hidden = false;
        box.innerHTML = errors.map(function (err) {
          return "<p>" + esc(err) + "</p>";
        }).join("");
        return;
      }
      lastNote = consultNote(data);
      document.getElementById("consult-pane").innerHTML = consultSuccess();
    }
  }

  function consultNote(data) {
    return [
      "Safar Electrified consult (" + inr(consultPrice()) + ")",
      "",
      "Name: " + data.name.trim(),
      "WhatsApp: " + data.phone.trim(),
      "City: " + (data.city.trim() || "—"),
      "EV: " + (data.ev.trim() || "—"),
      "Route: " + (data.route.trim() || "—"),
      "When: " + (data.when.trim() || "—"),
      "People: " + (data.people.trim() || "—"),
      "",
      data.question.trim(),
    ].join("\n");
  }

  function consultSuccess() {
    const upi = setting("upi_id");
    const price = consultPrice();
    let pay = "";
    if (upi && upi.indexOf("@") !== -1) {
      const link = "upi://pay?pa=" + encodeURIComponent(upi) + "&pn=" + encodeURIComponent("Safar Electrified") + "&am=" + price + "&cu=INR&tn=" + encodeURIComponent("Safar Electrified consult");
      pay = '<p class="upi">Pay ' + inr(price) + ' to <button type="button" class="linkish" data-act="copy-upi">' + esc(upi) + "</button></p>" +
        '<a class="btn btn-sun" href="' + esc(link) + '">Pay ' + inr(price) + " on UPI</a>";
    }
    const wa = waNumber()
      ? '<button type="button" class="btn btn-green" data-act="wa-consult">Send on WhatsApp</button>'
      : "<p>Copy the note and send it once WhatsApp is added in the Settings sheet.</p>";
    return (
      '<div class="success"><h2>Send this across.</h2><p>Pay ' + inr(price) + ", then send the note so I know what to answer.</p>" +
      pay + '<pre class="note">' + esc(lastNote) + "</pre>" +
      '<div class="sharebar">' + wa + '<button type="button" class="btn btn-ghost" data-act="copy-text">Copy note</button></div></div>'
    );
  }

  document.addEventListener("click", onClick);
  document.addEventListener("input", onInput);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeLight();
  });
  window.addEventListener("hashchange", render);

  SafarData.load(window.SAFAR_CONFIG || {})
    .then(function (loaded) {
      db = loaded;
      render();
    })
    .catch(function (err) {
      document.getElementById("app").innerHTML =
        '<div class="wrap page"><h1>The trip sheet did not open.</h1><p>' + esc(err && err.message ? err.message : "Try refreshing the page.") + "</p></div>";
    });
})();
