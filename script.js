/*
  script.js — The PokeBox
  How JS works: the browser runs this file top to bottom after the page loads.
  We define data, helper functions, and event handlers (onclick, oninput, onkeydown).
  When the user interacts with the page, those handlers fire and update the DOM —
  the live HTML elements the user sees — by changing their content or visibility.
  All Pokémon data comes from PokéAPI (https://pokeapi.co), fetched at runtime.
*/

/* ── TYPE EFFECTIVENESS CHART ───────────────────────────────────────────────
   Maps each defending type to its weaknesses, resistances, and immunities.
   Used by updateWeaknessChart() to calculate what attacking types hit hard.
   Each entry has three arrays:
     weak   — attacking types that deal 2x damage
     resist — attacking types that deal 0.5x damage
     immune — attacking types that deal 0x damage (no effect)
*/
const typeChart = {
  normal:   { weak: ["fighting"], resist: [], immune: ["ghost"] },
  fire:     { weak: ["water","ground","rock"], resist: ["fire","grass","ice","bug","steel","fairy"], immune: [] },
  water:    { weak: ["electric","grass"], resist: ["fire","water","ice","steel"], immune: [] },
  electric: { weak: ["ground"], resist: ["electric","flying","steel"], immune: [] },
  grass:    { weak: ["fire","ice","poison","flying","bug"], resist: ["water","electric","grass","ground"], immune: [] },
  ice:      { weak: ["fire","fighting","rock","steel"], resist: ["ice"], immune: [] },
  fighting: { weak: ["flying","psychic","fairy"], resist: ["bug","rock","dark"], immune: [] },
  poison:   { weak: ["ground","psychic"], resist: ["grass","fighting","poison","bug","fairy"], immune: [] },
  ground:   { weak: ["water","grass","ice"], resist: ["poison","rock"], immune: ["electric"] },
  flying:   { weak: ["electric","ice","rock"], resist: ["grass","fighting","bug"], immune: ["ground"] },
  psychic:  { weak: ["bug","ghost","dark"], resist: ["fighting","psychic"], immune: [] },
  bug:      { weak: ["fire","flying","rock"], resist: ["grass","fighting","ground"], immune: [] },
  rock:     { weak: ["water","grass","fighting","ground","steel"], resist: ["normal","fire","poison","flying"], immune: [] },
  ghost:    { weak: ["ghost","dark"], resist: ["poison","bug"], immune: ["normal","fighting"] },
  dragon:   { weak: ["ice","dragon","fairy"], resist: ["fire","water","electric","grass"], immune: [] },
  dark:     { weak: ["fighting","bug","fairy"], resist: ["ghost","dark"], immune: ["psychic"] },
  steel:    { weak: ["fire","fighting","ground"], resist: ["normal","grass","ice","flying","psychic","bug","rock","dragon","steel","fairy"], immune: ["poison"] },
  fairy:    { weak: ["poison","steel"], resist: ["fighting","bug","dark"], immune: ["dragon"] }
};

/* ── STAT LABEL MAP ─────────────────────────────────────────────────────────
   PokéAPI returns stat names like "special-attack". These are the short
   display labels we show in the stat bars instead.
*/
const statLabels = {
  "hp":             "HP",
  "attack":         "ATK",
  "defense":        "DEF",
  "special-attack": "SpATK",
  "special-defense":"SpDEF",
  "speed":          "SPD"
};

/* ── HELPER: STAT BAR COLOR ─────────────────────────────────────────────────
   Returns a color based on how high a base stat is.
   Green = excellent, yellow = average, red = low.
   Used inline when building the stat bar HTML.
*/
function getStatColor(val) {
  if (val >= 120) return "#4ade80"; /* green  — high */
  if (val >= 90)  return "#a3e635"; /* lime   — good */
  if (val >= 60)  return "#facc15"; /* yellow — average */
  if (val >= 40)  return "#fb923c"; /* orange — below average */
  return "#f87171";                 /* red    — low */
}

/* ── HELPER: BUILD SPRITE URL FROM API URL ──────────────────────────────────
   PokéAPI's list endpoint returns URLs like:
     "https://pokeapi.co/api/v2/pokemon/6/"
   We extract the ID (6) and build the sprite URL directly from the
   raw GitHub sprite repo — this avoids making a full API call per suggestion.
*/
function getSpriteUrl(pokemonUrl) {
  let parts = pokemonUrl.split("/").filter(function(p) { return p.length > 0; });
  let id = parts[parts.length - 1]; /* last non-empty segment is the ID */
  return "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/" + id + ".png";
}

/* ── HELPER: CAPITALIZE ─────────────────────────────────────────────────────
   PokéAPI returns names in lowercase (e.g. "garchomp").
   This capitalizes the first letter for display.
*/
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* ── STATE ──────────────────────────────────────────────────────────────────
   allPokemon — the full list of Pokémon names + URLs from PokéAPI.
               Fetched once on load, used by autocomplete.
   teamTypes  — array of 6 entries, one per slot. Each entry is either
               an empty string (empty slot) or an array of type strings
               e.g. ["dragon","ground"] for Garchomp.
               Updated whenever a Pokémon is added or cleared.
               Read by updateWeaknessChart() to compute team coverage.
*/
let allPokemon = [];
let teamTypes  = ["", "", "", "", "", ""];

/* ── FETCH FULL POKÉMON LIST ON PAGE LOAD ───────────────────────────────────
   Fetches all ~1000 Pokémon names + API URLs in one request.
   limit=2000 ensures we get every Pokémon in a single call.
   Stored in allPokemon for autocomplete filtering — no re-fetching needed.
*/
fetch("https://pokeapi.co/api/v2/pokemon?limit=2000")
  .then(function(res) { return res.json(); })
  .then(function(data) {
    allPokemon = data.results; /* array of { name, url } objects */
  });

/* ── SETUP SLOT ─────────────────────────────────────────────────────────────
   Called once per slot (0–5) at the bottom of this file.
   Wires up all event handlers for that slot:
     - oninput  → filter autocomplete as the user types
     - onkeydown → keyboard navigation (arrows, enter, escape)
     - btn.onclick → trigger a search
     - clearBtn.onclick → reset the slot
*/
function setupSlot(index) {
  let btn      = document.getElementById("btn"   + index);
  let clearBtn = document.getElementById("clear" + index);
  let input    = document.getElementById("input" + index);
  let drop     = document.getElementById("drop"  + index);

  /* Tracks which dropdown item is highlighted by keyboard (-1 = none) */
  let activeIndex = -1;

  /* ── AUTOCOMPLETE: filter on every keystroke ── */
  input.oninput = function() {
    let query = input.value.toLowerCase().trim();
    activeIndex = -1;
    drop.innerHTML = ""; /* clear previous results */

    /* Don't show the dropdown until at least 2 characters are typed */
    if (query.length < 2) {
      drop.style.display = "none";
      return;
    }

    /* Filter allPokemon to names that START WITH the typed query.
       Stop at 8 matches to keep the dropdown short and fast. */
    let matches = [];
    for (let i = 0; i < allPokemon.length; i++) {
      if (allPokemon[i].name.startsWith(query)) {
        matches.push(allPokemon[i]);
      }
      if (matches.length >= 8) break;
    }

    if (matches.length === 0) {
      drop.style.display = "none";
      return;
    }

    /* Build a dropdown item for each match */
    for (let i = 0; i < matches.length; i++) {
      let match     = matches[i];
      let spriteUrl = getSpriteUrl(match.url);

      let item = document.createElement("div");
      item.className = "dropItem";
      item.innerHTML =
        "<img class='dropSprite' src='" + spriteUrl + "' alt='" + match.name + "'>" +
        "<span class='dropName'>" + match.name + "</span>";

      /* IIFE (immediately invoked function expression) captures the current
         pokeName value in a closure so each click handler uses the right name,
         not the last value of the loop variable. */
      (function(pokeName) {
        item.onclick = function() {
          input.value = pokeName;    /* fill input with selected name */
          drop.style.display = "none";
          drop.innerHTML = "";
          searchPokemon(index);      /* immediately fetch that Pokémon */
        };
      })(match.name);

      drop.appendChild(item);
    }

    drop.style.display = "block";
  };

  /* ── KEYBOARD NAVIGATION in the dropdown ── */
  input.onkeydown = function(e) {
    let items = drop.querySelectorAll(".dropItem");

    if (e.key === "ArrowDown") {
      e.preventDefault(); /* prevents the cursor moving in the input */
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      updateActive(items, activeIndex);

    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, -1);
      updateActive(items, activeIndex);

    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && items[activeIndex]) {
        items[activeIndex].click(); /* select the highlighted item */
      } else {
        /* No item highlighted — search whatever is typed */
        drop.style.display = "none";
        drop.innerHTML = "";
        searchPokemon(index);
      }

    } else if (e.key === "Escape") {
      /* Close dropdown without searching */
      drop.style.display = "none";
      drop.innerHTML = "";
      activeIndex = -1;
    }
  };

  /* Adds/removes the .active class to highlight the focused dropdown item */
  function updateActive(items, idx) {
    for (let i = 0; i < items.length; i++) {
      items[i].className = (i === idx) ? "dropItem active" : "dropItem";
    }
  }

  /* Close the dropdown when clicking anywhere outside the input */
  document.onclick = function(e) {
    if (e.target !== input) {
      drop.style.display = "none";
      activeIndex = -1;
    }
  };

  /* GO button click → close dropdown and search */
  btn.onclick = function() {
    drop.style.display = "none";
    drop.innerHTML = "";
    searchPokemon(index);
  };

  /* CLEAR button → reset the slot back to its empty state */
  clearBtn.onclick = function() {
    document.getElementById("card"  + index).style.display = "none";
    input.value = "";
    document.getElementById("error" + index).innerText = "";
    clearBtn.style.display = "none";
    drop.style.display = "none";
    drop.innerHTML = "";
    teamTypes[index] = ""; /* remove this slot from weakness calculations */
    updateWeaknessChart();
  };
}

/* ── SEARCH POKÉMON ─────────────────────────────────────────────────────────
   Fetches a single Pokémon from PokéAPI by name.
   On success: populates the card (sprite, name, types, stat bars).
   On failure: shows an error message below the input.
   Also updates teamTypes and refreshes the weakness chart.
*/
function searchPokemon(index) {
  let input = document.getElementById("input" + index);
  let name  = input.value.toLowerCase().trim();

  /* Reset any previous error or card */
  document.getElementById("error" + index).innerText = "";
  document.getElementById("card"  + index).style.display = "none";

  if (!name) return; /* do nothing if input is empty */

  fetch("https://pokeapi.co/api/v2/pokemon/" + name)
    .then(function(res) {
      if (!res.ok) throw new Error("Pokémon not found"); /* 404 = invalid name */
      return res.json();
    })
    .then(function(data) {

      /* ── NAME ── */
      document.getElementById("name" + index).innerText = capitalize(data.name);

      /* ── SPRITE ── data.sprites.front_default is the standard front sprite URL */
      document.getElementById("sprite" + index).src = data.sprites.front_default;

      /* ── TYPES ──
         data.types is an array like: [{ slot: 1, type: { name: "dragon", url: "..." } }]
         We map it to just the name strings, then create a badge element for each. */
      let types   = data.types.map(function(t) { return t.type.name; });
      let typesEl = document.getElementById("types" + index);
      typesEl.innerHTML = "";

      for (let i = 0; i < types.length; i++) {
        let badge = document.createElement("span");
        badge.className = "typeBadge type-" + types[i]; /* type-* class sets the color */
        badge.innerText = types[i];
        typesEl.appendChild(badge);
      }

      /* ── STAT BARS ──
         data.stats is an array of { base_stat, stat: { name } }.
         For each stat we build: label | colored bar | number.
         Bar width is base_stat / 255 * 100 (255 is the max possible base stat). */
      let statsEl = document.getElementById("stats" + index);
      statsEl.innerHTML = "";

      for (let i = 0; i < data.stats.length; i++) {
        let statName = data.stats[i].stat.name;
        let baseStat = data.stats[i].base_stat;
        let label    = statLabels[statName] || statName;
        let barWidth = Math.min(100, Math.round((baseStat / 255) * 100));
        let barColor = getStatColor(baseStat);

        let row = document.createElement("div");
        row.className = "statRow";
        row.innerHTML =
          "<span class='statName'>"  + label    + "</span>" +
          "<div class='statBarWrap'><div class='statBar' style='width:" + barWidth + "%;background:" + barColor + "'></div></div>" +
          "<span class='statVal'>"   + baseStat + "</span>";
        statsEl.appendChild(row);
      }

      /* Show the card and the clear button */
      document.getElementById("card"  + index).style.display = "flex";
      document.getElementById("clear" + index).style.display = "inline-block";

      /* Store this Pokémon's types and refresh the weakness chart */
      teamTypes[index] = types;
      updateWeaknessChart();
    })
    .catch(function(err) {
      document.getElementById("error" + index).innerText = err.message;
    });
}

/* ── UPDATE WEAKNESS CHART ──────────────────────────────────────────────────
   Loops through all 6 slots' types and calculates how many Pokémon on the
   team are weak to each attacking type.

   For each slot with types, we loop over every possible attacking type and
   calculate the damage multiplier against that Pokémon:
     - Start at 1x
     - Multiply by 2 for each weakness
     - Multiply by 0.5 for each resistance
     - Set to 0 and break if any immunity applies

   If multiplier >= 2, that Pokémon is weak to this attacker — increment count.
   Results are sorted by count (most common weakness first) then rendered as badges.
*/
function updateWeaknessChart() {
  let weaknessCount = {}; /* { typeName: count } */

  for (let i = 0; i < teamTypes.length; i++) {
    let types = teamTypes[i];
    if (!types || types.length === 0) continue; /* skip empty slots */

    let allTypes = Object.keys(typeChart);

    for (let a = 0; a < allTypes.length; a++) {
      let attacker   = allTypes[a];
      let multiplier = 1;

      /* Apply effectiveness for each of this Pokémon's types */
      for (let d = 0; d < types.length; d++) {
        let chart = typeChart[types[d]];
        if (chart.immune.includes(attacker))  { multiplier = 0; break; } /* immune — stop */
        if (chart.weak.includes(attacker))    multiplier *= 2;            /* weakness */
        if (chart.resist.includes(attacker))  multiplier *= 0.5;          /* resistance */
      }

      /* Only count as a weakness if net multiplier is 2x or more */
      if (multiplier >= 2) {
        weaknessCount[attacker] = (weaknessCount[attacker] || 0) + 1;
      }
    }
  }

  let section = document.getElementById("weaknessSection");
  let chart   = document.getElementById("weaknessChart");
  chart.innerHTML = "";

  /* Check if any slot has a Pokémon — hide section if team is empty */
  let hasAny = false;
  for (let i = 0; i < teamTypes.length; i++) {
    if (teamTypes[i] && teamTypes[i].length > 0) { hasAny = true; break; }
  }

  if (!hasAny) { section.style.display = "none"; return; }

  section.style.display = "block";

  /* Sort types by count descending so the biggest weaknesses show first */
  let sorted = Object.keys(weaknessCount).sort(function(a, b) {
    return weaknessCount[b] - weaknessCount[a];
  });

  /* Build a badge for each weakness type */
  for (let i = 0; i < sorted.length; i++) {
    let type  = sorted[i];
    let count = weaknessCount[type];
    let badge = document.createElement("div");
    badge.className = "weaknessBadge type-" + type;
    badge.innerHTML = type + "<span class='weakCount'>×" + count + "</span>";
    chart.appendChild(badge);
  }
}

/* ── INITIALIZE ALL 6 SLOTS ─────────────────────────────────────────────────
   Calls setupSlot() for each index 0–5.
   This wires up all buttons, inputs, and dropdowns on page load.
*/
for (let i = 0; i < 6; i++) {
  setupSlot(i);
}