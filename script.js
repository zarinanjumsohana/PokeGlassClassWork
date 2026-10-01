"use strict";

/* ===== Settings ===== */
const API_BASE = "https://pokeapi.co/api/v2";
const MAX_STAT = 255;          // highest normal base stat, used as a full bar
const UNIT_DIVISOR = 10;       // API gives decimeters and hectograms
const MAX_POKEMON_ID = 1025;   // update if PokeAPI adds more Pokemon
const SUCCESS_DELAY_MS = 700;  // how long "Loaded successfully" stays visible
const PAGE_SIZE = 48;          // gallery cards drawn at a time

const STAT_LABELS = {
  "hp": "HP",
  "attack": "Attack",
  "defense": "Defense",
  "special-attack": "Sp. Atk",
  "special-defense": "Sp. Def",
  "speed": "Speed"
};

const TYPE_NAMES = [
  "normal", "fire", "water", "electric", "grass", "ice",
  "fighting", "poison", "ground", "flying", "psychic", "bug",
  "rock", "ghost", "dragon", "dark", "steel", "fairy"
];

// Official artwork lives at an address that only needs the ID
const artUrl = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const spriteUrl = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

/* ===== Page elements, looked up once ===== */
const $ = (id) => document.getElementById(id);

const els = {
  // page 1
  form: $("searchForm"),
  input: $("searchInput"),
  searchBtn: $("searchBtn"),
  status: $("statusMessage"),
  quickList: $("quickList"),
  hero: $("hero"),
  brand: $("brandLink"),
  randomBtn: $("randomBtn"),

  // browse page
  browse: $("browse"),
  browseTitle: $("browseTitle"),
  browseBtn: $("browseBtn"),
  browseBackBtn: $("browseBackBtn"),
  browseFilter: $("browseFilter"),
  browseStatus: $("browseStatus"),
  dexGrid: $("dexGrid"),
  moreBtn: $("moreBtn"),

  // detail page
  detail: $("detail"),
  backBtn: $("backBtn"),
  prevBtn: $("prevBtn"),
  nextBtn: $("nextBtn"),
  card: $("card"),
  number: $("pokeNumber"),
  name: $("pokeName"),
  category: $("pokeCategory"),
  types: $("typeBadges"),
  description: $("pokeDescription"),
  height: $("pokeHeight"),
  weight: $("pokeWeight"),
  exp: $("pokeExp"),
  power: $("pokePower"),
  abilities: $("abilityList"),
  stats: $("statList"),
  statTotal: $("statTotal"),
  matchStatus: $("matchStatus"),
  matchGroups: $("matchGroups"),
  moveStatus: $("moveStatus"),
  moveList: $("moveList"),

  // right side
  image: $("pokeImage"),
  normalBtn: $("normalBtn"),
  shinyBtn: $("shinyBtn"),
  cryBtn: $("cryBtn"),
  legacyCryBtn: $("legacyCryBtn"),
  note: $("showcaseNote")
};

/* ===== State ===== */
let currentRequest = 0;   // counts searches, used to ignore outdated replies
let current = null;       // cleaned data of the Pokemon on screen
let showShiny = false;
let cryAudio = null;

let view = "hero";        // which page is showing: "hero", "browse" or "detail"
let returnView = "hero";  // where the detail page's Back button goes
let browseScroll = 0;     // remembers the scroll position in the gallery

let dex = null;           // all Pokemon: { id, name, types }
let dexPromise = null;    // stops two loads from starting at once
let dexFiltered = [];     // the list after the filter box is applied
let dexShown = 0;         // how many cards are currently drawn

/* ===== Small helpers ===== */
// Build an element in one line
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// "special-attack" becomes "Special Attack"
function prettify(text) {
  return text
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Trim, lowercase, remove a leading #, turn spaces into hyphens
function cleanQuery(raw) {
  return raw.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-");
}

// Species text contains line breaks and invisible characters
function cleanFlavorText(text) {
  return text.replace(/[\n\f\u00ad]/g, " ").replace(/\s+/g, " ").trim();
}

/* ===== Fetch helper: every request goes through here ===== */
async function fetchJson(url) {
  const response = await fetch(url);

  // A 404 is a normal reply to fetch, so response.ok must be checked
  if (!response.ok) {
    const error = new Error("Request failed");
    error.status = response.status;
    throw error;
  }

  return response.json();
}

/* ===== Status line and page switching ===== */
function setStatus(message, state) {
  if (!message) {
    els.status.hidden = true;
    els.status.textContent = "";
    delete els.status.dataset.state;
    return;
  }
  els.status.hidden = false;
  els.status.textContent = message;
  els.status.dataset.state = state;
}

// Messages go to whichever page the user is looking at
function notify(message, state) {
  if (view === "detail") {
    els.note.textContent = message;
  } else if (view === "browse") {
    els.browseStatus.textContent = message;
  } else {
    setStatus(message, state);
  }
}

function setBusy(isBusy) {
  els.searchBtn.disabled = isBusy;
  els.form.setAttribute("aria-busy", String(isBusy));
}

function showView(name) {
  // Remember the gallery scroll position before leaving it
  if (view === "browse") browseScroll = window.scrollY;

  // Remember which page the detail page was opened from
  if (name === "detail" && view !== "detail") returnView = view;

  view = name;
  els.hero.hidden = name !== "hero";
  els.browse.hidden = name !== "browse";
  els.detail.hidden = name !== "detail";

  window.scrollTo({ top: name === "browse" ? browseScroll : 0 });

  // Move keyboard focus so screen reader users know the page changed
  if (name === "detail") {
    els.name.tabIndex = -1;
    els.name.focus({ preventScroll: true });
  } else if (name === "browse") {
    updateBrowseStatus();
    els.browseTitle.tabIndex = -1;
    els.browseTitle.focus({ preventScroll: true });
  } else {
    els.input.focus();
  }
}

/* ===== Clean the API data (the only place that knows its shape) ===== */
function cleanPokemon(data) {
  const artwork = data.sprites.other?.["official-artwork"];

  return {
    id: data.id,
    name: data.name,
    height: data.height / UNIT_DIVISOR,
    weight: data.weight / UNIT_DIVISOR,
    baseExperience: data.base_experience,
    types: data.types
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .map((entry) => entry.type.name),
    stats: data.stats.map((entry) => ({
      key: entry.stat.name,
      value: entry.base_stat
    })),
    abilities: data.abilities.map((entry) => ({
      name: entry.ability.name,
      hidden: entry.is_hidden
    })),
    images: {
      normal: artwork?.front_default || data.sprites.front_default,
      shiny: artwork?.front_shiny || data.sprites.front_shiny
    },
    cries: {
      latest: data.cries?.latest || null,
      legacy: data.cries?.legacy || null
    },
    speciesUrl: data.species.url,
    moves: data.moves   // kept for the signature moves feature later
  };
}

/* ===== Draw the card ===== */
function renderPokemon(p) {
  stopCry();

  // Theme: the CSS reads this one word
  els.card.dataset.type = p.types[0] || "normal";

  // Identity
  els.number.textContent = `#${String(p.id).padStart(3, "0")}`;
  els.name.textContent = prettify(p.name);
  els.category.textContent = "";
  els.description.textContent = "Loading description...";

  els.types.replaceChildren(
    ...p.types.map((type) => {
      const badge = el("li", "badge", prettify(type));
      badge.dataset.type = type;
      return badge;
    })
  );

  // Measurements
  const total = p.stats.reduce((sum, stat) => sum + stat.value, 0);
  els.height.textContent = `${p.height.toFixed(1)} m`;
  els.weight.textContent = `${p.weight.toFixed(1)} kg`;
  els.exp.textContent = p.baseExperience ?? "Unknown";
  els.power.textContent = total;   // power rating = total of the six base stats

  // Abilities
  els.abilities.replaceChildren(
    ...p.abilities.map((ability) => {
      const item = el("li", "ability", prettify(ability.name));
      if (ability.hidden) item.append(el("span", "tag", "Hidden"));
      return item;
    })
  );

  // Stats
  els.stats.replaceChildren(
    ...p.stats.map((stat) => {
      const fill = el("div", "stat-fill");
      fill.style.setProperty("--pct", Math.min(100, (stat.value / MAX_STAT) * 100));

      const track = el("div", "stat-track");
      track.append(fill);

      const row = el("li", "stat");
      row.append(
        el("span", "stat-name", STAT_LABELS[stat.key] || prettify(stat.key)),
        el("span", "stat-value", stat.value),
        track
      );
      return row;
    })
  );
  els.statTotal.textContent = total;

  // Right side
  setupMedia(p);

  // Sections that a later round will fill
  els.matchStatus.textContent = "";
  els.matchGroups.replaceChildren();
  els.moveStatus.textContent = "";
  els.moveList.replaceChildren();
}

/* ===== Artwork, shiny, cries ===== */
function setupMedia(p) {
  const name = prettify(p.name);

  // Shiny is not available for every Pokemon
  els.shinyBtn.disabled = !p.images.shiny;
  els.note.textContent = p.images.shiny ? "" : "No shiny artwork is available for this Pokémon.";
  setShiny(false);

  // Cries
  els.cryBtn.disabled = !p.cries.latest;
  els.cryBtn.setAttribute("aria-label", `Play ${name}'s cry`);
  els.legacyCryBtn.hidden = !p.cries.legacy;
  els.legacyCryBtn.setAttribute("aria-label", `Play ${name}'s retro cry`);
}

function renderImage() {
  const src = showShiny ? current.images.shiny : current.images.normal;
  const style = showShiny ? "Shiny" : "Normal";
  els.image.src = src || "";
  els.image.alt = `${style} artwork of ${prettify(current.name)}`;
}

function setShiny(on) {
  showShiny = on;
  els.normalBtn.setAttribute("aria-pressed", String(!on));
  els.shinyBtn.setAttribute("aria-pressed", String(on));
  els.normalBtn.classList.toggle("is-active", !on);
  els.shinyBtn.classList.toggle("is-active", on);
  renderImage();
}

function playCry(url) {
  stopCry();
  cryAudio = new Audio(url);
  cryAudio.volume = 0.6;
  cryAudio.play().catch(() => {
    els.note.textContent = "Your browser could not play this sound.";
  });
}

function stopCry() {
  if (cryAudio) {
    cryAudio.pause();
    cryAudio = null;
  }
}

/* ===== Species: a side request that can fail on its own ===== */
async function loadSpecies(p, requestId) {
  try {
    const species = await fetchJson(p.speciesUrl);
    if (requestId !== currentRequest) return;   // a newer search exists

    // Category, such as "Mouse Pokémon"
    const genus = species.genera.find((g) => g.language.name === "en")?.genus || "";
    const flag = species.is_legendary ? "Legendary"
      : species.is_mythical ? "Mythical"
      : species.is_baby ? "Baby"
      : "";
    els.category.textContent = [genus, flag].filter(Boolean).join(", ");

    // Description: the last English entry is usually the newest game
    const english = species.flavor_text_entries.filter((e) => e.language.name === "en");
    const last = english[english.length - 1];
    els.description.textContent = last
      ? cleanFlavorText(last.flavor_text)
      : "No description is available for this Pokémon.";
  } catch (error) {
    if (requestId !== currentRequest) return;
    els.description.textContent = "The description could not be loaded.";
  }
}

/* ===== The main search ===== */
async function searchPokemon(rawQuery) {
  const query = cleanQuery(rawQuery);

  // Empty input: no request at all
  if (!query) {
    notify("Type a Pokémon name or number first.", "error");
    return;
  }

  const requestId = ++currentRequest;
  notify("Searching...", "loading");
  setBusy(true);

  try {
    const data = await fetchJson(`${API_BASE}/pokemon/${encodeURIComponent(query)}`);
    if (requestId !== currentRequest) return;

    current = cleanPokemon(data);
    renderPokemon(current);
    loadSpecies(current, requestId);   // not awaited, so the card shows right away

    if (view === "hero") {
      setStatus("Loaded successfully", "success");
      setTimeout(() => {
        if (requestId === currentRequest) showView("detail");
      }, SUCCESS_DELAY_MS);
    } else if (view === "browse") {
      showView("detail");
    }
  } catch (error) {
    if (requestId !== currentRequest) return;

    if (error.status === 404) {
      notify(`No Pokémon found for "${rawQuery.trim()}". Try again.`, "error");
    } else {
      notify("Could not reach PokeAPI. Check your connection and try again.", "error");
    }
  } finally {
    // Always turn loading off, whether it worked or failed
    if (requestId === currentRequest) setBusy(false);
  }
}

/* ===== All Pokemon gallery ===== */
async function buildDex() {
  // Request 1: every name and its link
  const list = await fetchJson(`${API_BASE}/pokemon?limit=${MAX_POKEMON_ID}`);

  const entries = list.results.map((item) => ({
    name: item.name,
    // The ID is the last piece of the address, such as ".../pokemon/25/"
    id: Number(item.url.split("/").filter(Boolean).pop()),
    types: []
  }));

  // Requests 2 to 19: one per type, sent at the same time
  const replies = await Promise.allSettled(
    TYPE_NAMES.map((type) => fetchJson(`${API_BASE}/type/${type}`))
  );

  // Flip the data around: each Pokemon name gets a list of its types
  const typesByName = new Map();
  replies.forEach((reply, index) => {
    if (reply.status !== "fulfilled") return;   // a failed type just leaves gaps
    reply.value.pokemon.forEach((entry) => {
      const found = typesByName.get(entry.pokemon.name) || [];
      found.push({ type: TYPE_NAMES[index], slot: entry.slot });
      typesByName.set(entry.pokemon.name, found);
    });
  });

  entries.forEach((entry) => {
    entry.types = (typesByName.get(entry.name) || [])
      .sort((a, b) => a.slot - b.slot)
      .map((found) => found.type);
  });

  // A to Z. For Pokedex number order, use: (a, b) => a.id - b.id
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

// Load once, then reuse. If it fails, allow another try.
function loadDex() {
  if (!dexPromise) {
    dexPromise = buildDex().catch((error) => {
      dexPromise = null;
      throw error;
    });
  }
  return dexPromise;
}

function createDexCard(entry) {
  const button = el("button", "dex-card");
  button.type = "button";
  button.dataset.pokemon = entry.name;
  if (entry.types[0]) button.dataset.type = entry.types[0];

  // Empty alt because the name is already written below the picture
  const image = document.createElement("img");
  image.src = artUrl(entry.id);
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  image.width = 475;
  image.height = 475;
  // If the big artwork is missing, use the small sprite once
  image.addEventListener("error", () => { image.src = spriteUrl(entry.id); }, { once: true });

  const art = el("div", "dex-art");
  art.append(image);

  const meta = el("span", "dex-meta");
  meta.append(
    el("span", "dex-number", `#${String(entry.id).padStart(3, "0")}`),
    el("span", "dex-name", prettify(entry.name))
  );

  const types = el("span", "dex-types");
  entry.types.forEach((type) => {
    const badge = el("span", "badge", prettify(type));
    badge.dataset.type = type;
    types.append(badge);
  });

  button.append(art, meta, types);

  const item = el("li", "dex-item");
  item.append(button);
  return item;
}

function updateBrowseStatus() {
  if (!dex) return;
  els.browseStatus.textContent = dexFiltered.length
    ? `Showing ${dexShown} of ${dexFiltered.length} Pokémon`
    : "No Pokémon match that name.";
}

function renderDexPage() {
  const next = dexFiltered.slice(dexShown, dexShown + PAGE_SIZE);
  els.dexGrid.append(...next.map(createDexCard));
  dexShown += next.length;
  els.moreBtn.hidden = dexShown >= dexFiltered.length;
  updateBrowseStatus();
}

function applyDexFilter() {
  const text = cleanQuery(els.browseFilter.value);
  dexFiltered = dex.filter((entry) => entry.name.includes(text));
  dexShown = 0;
  els.dexGrid.replaceChildren();
  renderDexPage();
}

async function openBrowse() {
  cancelPending();
  showView("browse");
  if (dex) return;   // already loaded

  els.browseStatus.textContent = "Loading all Pokémon...";
  els.moreBtn.hidden = true;

  try {
    dex = await loadDex();
    applyDexFilter();
  } catch (error) {
    els.browseStatus.textContent =
      "Could not load the Pokémon list. Check your connection and press All Pokémon to try again.";
  }
}

/* ===== Navigation helpers ===== */
// Cancel anything still loading when the user moves to another page
function cancelPending() {
  currentRequest++;
  stopCry();
  setBusy(false);
  setStatus("");
}

function goHome() {
  cancelPending();
  showView("hero");
}

function goBack() {
  cancelPending();
  showView(returnView);
}

// Previous and Next, wrapping around at both ends
function stepPokemon(delta) {
  if (!current) return;
  let id = current.id + delta;
  if (id < 1) id = MAX_POKEMON_ID;
  if (id > MAX_POKEMON_ID) id = 1;
  searchPokemon(String(id));
}

/* ===== Events ===== */
// Form: works for the Enter key and the Search button
els.form.addEventListener("submit", (event) => {
  event.preventDefault();   // stop the page from reloading
  searchPokemon(els.input.value);
});

// One listener handles all quick search buttons
els.quickList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-pokemon]");
  if (!button) return;
  els.input.value = button.dataset.pokemon;
  searchPokemon(button.dataset.pokemon);
});

// Surprise me
els.randomBtn.addEventListener("click", () => {
  const id = Math.floor(Math.random() * MAX_POKEMON_ID) + 1;
  els.input.value = String(id);
  searchPokemon(String(id));
});

els.prevBtn.addEventListener("click", () => stepPokemon(-1));
els.nextBtn.addEventListener("click", () => stepPokemon(1));

// Navigation
els.backBtn.addEventListener("click", goBack);
els.browseBackBtn.addEventListener("click", goHome);
els.brand.addEventListener("click", (event) => {
  event.preventDefault();
  goHome();
});

// Shiny and cries
els.normalBtn.addEventListener("click", () => setShiny(false));
els.shinyBtn.addEventListener("click", () => setShiny(true));
els.cryBtn.addEventListener("click", () => {
  if (current?.cries.latest) playCry(current.cries.latest);
});
els.legacyCryBtn.addEventListener("click", () => {
  if (current?.cries.legacy) playCry(current.cries.legacy);
});

// Gallery
els.browseBtn.addEventListener("click", openBrowse);

els.browseFilter.addEventListener("input", () => {
  if (dex) applyDexFilter();
});

els.moreBtn.addEventListener("click", () => {
  const before = els.dexGrid.children.length;
  renderDexPage();
  // Keep keyboard focus inside the new cards so it does not get lost
  els.dexGrid.children[before]?.querySelector("button").focus({ preventScroll: true });
});

// One listener for every gallery card (event delegation)
els.dexGrid.addEventListener("click", (event) => {
  const card = event.target.closest(".dex-card");
  if (!card) return;
  searchPokemon(card.dataset.pokemon);
});