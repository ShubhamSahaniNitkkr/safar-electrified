(function () {
  function num(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const n = parseFloat(String(value ?? "").replace(/,/g, "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cur = "";
    let quoted = false;
    const src = String(text || "").replace(/^\uFEFF/, "");
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (quoted) {
        if (c === '"') {
          if (src[i + 1] === '"') {
            cur += '"';
            i++;
          } else quoted = false;
        } else cur += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") {
        row.push(cur);
        cur = "";
      } else if (c === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else if (c !== "\r") cur += c;
    }
    if (cur.length || row.length) {
      row.push(cur);
      rows.push(row);
    }
    return rows.filter(function (cells) {
      return cells.some(function (cell) {
        return String(cell).trim() !== "";
      });
    });
  }

  function rowsToObjects(rows) {
    if (!rows.length) return [];
    const head = rows[0].map(function (cell) {
      return String(cell).trim();
    });
    return rows.slice(1).map(function (cells) {
      const obj = {};
      head.forEach(function (key, index) {
        if (key) obj[key] = String(cells[index] ?? "").trim();
      });
      return obj;
    }).filter(function (obj) {
      return Object.values(obj).some(function (value) {
        return value !== "";
      });
    });
  }

  function normRow(row) {
    const obj = {};
    Object.keys(row || {}).forEach(function (key) {
      const clean = String(key).trim();
      if (!clean) return;
      const value = row[key];
      obj[clean] = typeof value === "string" ? value.trim() : value == null ? "" : value;
    });
    return obj;
  }

  function isNo(value) {
    return ["no", "n", "false", "0", "hide", "hidden", "draft"].indexOf(String(value ?? "").trim().toLowerCase()) !== -1;
  }

  function isYes(value) {
    return ["yes", "y", "true", "1"].indexOf(String(value ?? "").trim().toLowerCase()) !== -1;
  }

  function slug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function driveId(url) {
    const text = String(url || "");
    const match = text.match(/\/d\/([a-zA-Z0-9_-]+)/) || text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return match ? match[1] : "";
  }

  function external(url) {
    const text = String(url || "").trim();
    if (/^https?:\/\//i.test(text)) return text;
    return "";
  }

  function safeAsset(url) {
    const text = String(url || "").trim();
    if (/^assets\/[a-zA-Z0-9._/-]+$/.test(text)) return text;
    return "";
  }

  function imageUrl(url, size) {
    const id = driveId(url);
    if (id) return "https://drive.google.com/thumbnail?id=" + id + "&sz=w" + (size || 1600);
    return external(url) || safeAsset(url);
  }

  function driveView(url) {
    const id = driveId(url);
    if (id) return "https://drive.google.com/file/d/" + id + "/view";
    return external(url);
  }

  function drivePreview(url) {
    const id = driveId(url);
    if (id) return "https://drive.google.com/file/d/" + id + "/preview";
    return "";
  }

  function youtubeId(url) {
    try {
      const parsed = new URL(String(url || "").trim());
      const host = parsed.hostname.replace(/^www\./, "");
      if (host === "youtu.be") {
        const id = parsed.pathname.split("/").filter(Boolean)[0] || "";
        return /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : "";
      }
      if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
        const watch = parsed.searchParams.get("v");
        if (watch && /^[A-Za-z0-9_-]{6,}$/.test(watch)) return watch;
        const match = parsed.pathname.match(/\/(embed|shorts|live)\/([A-Za-z0-9_-]{6,})/);
        if (match) return match[2];
      }
    } catch (err) {
      return "";
    }
    return "";
  }

  function formatDate(value) {
    const text = String(value || "").trim();
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!iso) return text;
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (Number.isNaN(date.getTime())) return text;
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  const BASES = ["trip", "person", "person_day", "room_night"];

  function normalize(raw) {
    const settings = {};
    (raw.settings || []).forEach(function (row) {
      const key = String(row.key || "").trim();
      if (key) settings[key] = String(row.value ?? "").trim();
    });

    const trips = (raw.trips || [])
      .map(function (row) {
        const tripId = String(row.trip_id || "").trim();
        const title = String(row.title || "").trim();
        if (!tripId || !title || isNo(row.published)) return null;
        const status = String(row.status || row.published || "").trim().toLowerCase() === "soon" ? "soon" : "live";
        return {
          trip_id: tripId,
          slug: slug(tripId) || slug(title),
          is_sample: isYes(row.is_sample),
          status: status,
          title: title,
          from_place: String(row.from_place || "").trim(),
          to_place: String(row.to_place || "").trim(),
          trip_date: String(row.trip_date || "").trim(),
          days: num(row.days),
          nights: Math.max(0, num(row.nights)),
          distance_km: num(row.distance_km),
          ev_model: String(row.ev_model || "").trim(),
          party: String(row.party ?? "").trim() === "" ? 0 : Math.max(1, num(row.party)),
          per_room: Math.max(0, num(row.per_room)),
          cover_url: String(row.cover_url || "").trim(),
          youtube_url: String(row.youtube_url || "").trim(),
          drive_video_url: String(row.drive_video_url || "").trim(),
          summary: String(row.summary || "").trim(),
          story: String(row.story || "").trim(),
        };
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return String(b.trip_date).localeCompare(String(a.trip_date));
      });

    const known = {};
    trips.forEach(function (trip) {
      known[trip.trip_id] = true;
    });

    function keep(row) {
      return known[String(row.trip_id || "").trim()];
    }

    const stops = (raw.stops || []).filter(keep).map(function (row) {
      return {
        trip_id: String(row.trip_id).trim(),
        stop_order: num(row.stop_order),
        name: String(row.name || "").trim(),
        km: String(row.km ?? "").trim(),
        kind: String(row.kind || "sight").trim().toLowerCase(),
        battery: String(row.battery || "").trim(),
        notes: String(row.notes || "").trim(),
        amount: num(row.amount),
        photo_url: String(row.photo_url || "").trim(),
      };
    }).sort(function (a, b) {
      return a.stop_order - b.stop_order;
    });

    const costs = (raw.costs || []).filter(keep).map(function (row) {
      const basis = String(row.basis || "trip").trim();
      return {
        trip_id: String(row.trip_id).trim(),
        category: String(row.category || "other").trim().toLowerCase(),
        label: String(row.label || "").trim(),
        amount: num(row.amount),
        basis: BASES.indexOf(basis) === -1 ? "trip" : basis,
        per_room: Math.max(0, num(row.per_room)),
        notes: String(row.notes || "").trim(),
        proof_url: String(row.proof_url || "").trim(),
      };
    }).filter(function (row) {
      return row.label || row.amount;
    });

    const changes = (raw.changes || []).filter(keep).map(function (row) {
      return {
        trip_id: String(row.trip_id).trim(),
        title: String(row.title || "").trim(),
        cost: num(row.cost),
        place: String(row.place || "").trim(),
        notes: String(row.notes || "").trim(),
        proof_url: String(row.proof_url || "").trim(),
      };
    }).filter(function (row) {
      return row.title;
    });

    const problems = (raw.problems || []).filter(keep).map(function (row) {
      return {
        trip_id: String(row.trip_id).trim(),
        title: String(row.title || "").trim(),
        detail: String(row.detail || "").trim(),
        proof_url: String(row.proof_url || "").trim(),
      };
    }).filter(function (row) {
      return row.title || row.detail;
    });

    const gallery = (raw.gallery || []).filter(keep).map(function (row) {
      return {
        trip_id: String(row.trip_id).trim(),
        caption: String(row.caption || "").trim(),
        photo_url: String(row.photo_url || "").trim(),
      };
    }).filter(function (row) {
      return imageUrl(row.photo_url);
    });

    return {
      settings: settings,
      trips: trips,
      stops: stops,
      costs: costs,
      changes: changes,
      problems: problems,
      gallery: gallery,
      source: raw.source || "excel",
      warning: raw.warning || "",
    };
  }

  async function fetchGoogleTab(id, name) {
    const url =
      "https://docs.google.com/spreadsheets/d/" +
      encodeURIComponent(id) +
      "/gviz/tq?tqx=out:csv&sheet=" +
      encodeURIComponent(name);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Could not read " + name);
    const text = await res.text();
    if (!text || text.trim().charAt(0) === "<") throw new Error("Sheet is not public: " + name);
    return rowsToObjects(parseCsv(text));
  }

  async function loadGoogle(id) {
    const names = ["Settings", "Trips", "Stops", "Costs", "Changes", "Problems", "Gallery"];
    const tabs = await Promise.all(
      names.map(function (name) {
        return fetchGoogleTab(id, name);
      })
    );
    return normalize({
      settings: tabs[0],
      trips: tabs[1],
      stops: tabs[2],
      costs: tabs[3],
      changes: tabs[4],
      problems: tabs[5],
      gallery: tabs[6],
      source: "google",
    });
  }

  async function loadExcel() {
    if (typeof XLSX === "undefined") throw new Error("Spreadsheet reader did not load.");
    const res = await fetch("content/safar-electrified.xlsx", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not open content/safar-electrified.xlsx");
    const book = XLSX.read(await res.arrayBuffer(), { type: "array" });
    function read(name) {
      const sheet = book.Sheets[name];
      if (!sheet) return [];
      return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }).map(normRow);
    }
    return normalize({
      settings: read("Settings"),
      trips: read("Trips"),
      stops: read("Stops"),
      costs: read("Costs"),
      changes: read("Changes"),
      problems: read("Problems"),
      gallery: read("Gallery"),
      source: "excel",
    });
  }

  async function load(config) {
    const id = String((config && config.googleSheetId) || "").trim();
    if (id) {
      try {
        return await loadGoogle(id);
      } catch (err) {
        const local = await loadExcel();
        local.warning = "The Google Sheet did not load, so this page is showing the Excel file saved with the site.";
        local.source = "excel-fallback";
        return local;
      }
    }
    return loadExcel();
  }

  window.SafarData = {
    load: load,
    num: num,
    imageUrl: imageUrl,
    driveView: driveView,
    drivePreview: drivePreview,
    youtubeId: youtubeId,
    external: external,
    formatDate: formatDate,
    slug: slug,
  };
})();
