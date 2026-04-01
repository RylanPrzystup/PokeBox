//#region TYPE EFFECTIVENESS DATA
// ─────────────────────────────────────────────────────────────────────────────
// typeChart is a plain object (dictionary) that lives in memory for the entire
// session. Nothing is sent to the DOM here — this is pure data storage.
// Each KEY   → a defending type name (string, lowercase)
// Each VALUE → an object with three arrays:
//     weak   → attacking types that deal 2× damage to this defender
//     resist → attacking types that deal 0.5× damage to this defender
//     immune → attacking types that deal 0× damage (complete immunity)
// updateWeaknessChart() reads this object later to score the team's coverage.
// ─────────────────────────────────────────────────────────────────────────────

const typeChart = {                                                           // declares typeChart as a constant object (never reassigned)
  normal:   { weak: ["fighting"],                       resist: [],                                                                     immune: ["ghost"]              },
  fire:     { weak: ["water","ground","rock"],          resist: ["fire","grass","ice","bug","steel","fairy"],                           immune: []                     },
  water:    { weak: ["electric","grass"],               resist: ["fire","water","ice","steel"],                                         immune: []                     },
  electric: { weak: ["ground"],                         resist: ["electric","flying","steel"],                                          immune: []                     },
  grass:    { weak: ["fire","ice","poison","flying","bug"], resist: ["water","electric","grass","ground"],                              immune: []                     },
  ice:      { weak: ["fire","fighting","rock","steel"], resist: ["ice"],                                                                immune: []                     },
  fighting: { weak: ["flying","psychic","fairy"],       resist: ["bug","rock","dark"],                                                  immune: []                     },
  poison:   { weak: ["ground","psychic"],               resist: ["grass","fighting","poison","bug","fairy"],                            immune: []                     },
  ground:   { weak: ["water","grass","ice"],            resist: ["poison","rock"],                                                      immune: ["electric"]           },
  flying:   { weak: ["electric","ice","rock"],          resist: ["grass","fighting","bug"],                                             immune: ["ground"]             },
  psychic:  { weak: ["bug","ghost","dark"],             resist: ["fighting","psychic"],                                                 immune: []                     },
  bug:      { weak: ["fire","flying","rock"],           resist: ["grass","fighting","ground"],                                          immune: []                     },
  rock:     { weak: ["water","grass","fighting","ground","steel"], resist: ["normal","fire","poison","flying"],                         immune: []                     },
  ghost:    { weak: ["ghost","dark"],                   resist: ["poison","bug"],                                                       immune: ["normal","fighting"]   },
  dragon:   { weak: ["ice","dragon","fairy"],           resist: ["fire","water","electric","grass"],                                    immune: []                     },
  dark:     { weak: ["fighting","bug","fairy"],         resist: ["ghost","dark"],                                                       immune: ["psychic"]            },
  steel:    { weak: ["fire","fighting","ground"],       resist: ["normal","grass","ice","flying","psychic","bug","rock","dragon","steel","fairy"], immune: ["poison"] },
  fairy:    { weak: ["poison","steel"],                 resist: ["fighting","bug","dark"],                                              immune: ["dragon"]             }
};
//#endregion


//#region STAT LABEL MAP
// ─────────────────────────────────────────────────────────────────────────────
// PokéAPI returns full hyphenated stat names in its JSON payload.
// This object maps those raw API strings → short display labels.
// Used in searchPokemon() when building each stat row in the card.
// Nothing is sent to the DOM here — this is a lookup table only.
// ─────────────────────────────────────────────────────────────────────────────

const statLabels = {                   // constant object — maps API name → short label
  "hp":              "HP",             //   "hp"             from API → "HP"   shown in card
  "attack":          "ATK",            //   "attack"         from API → "ATK"  shown in card
  "defense":         "DEF",            //   "defense"        from API → "DEF"  shown in card
  "special-attack":  "SpATK",          //   "special-attack" from API → "SpATK" shown in card
  "special-defense": "SpDEF",          //   "special-defense"from API → "SpDEF" shown in card
  "speed":           "SPD"             //   "speed"          from API → "SPD"  shown in card
};
//#endregion


//#region HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────
// Three small pure functions used throughout the file.
// None of these touch the DOM directly — they receive input and return a value
// that the caller then uses when building HTML strings.
// ─────────────────────────────────────────────────────────────────────────────

// getStatColor(val) ───────────────────────────────────────────────────────────
// INPUT:  val — a numeric base stat value (0–255)
// OUTPUT: a CSS hex color string → used as the inline background on a stat bar
// Called inside searchPokemon() when building each stat bar row.
function getStatColor(statValue) {
  if (statValue >= 120) return "#4ade80";   // 120+ → bright green  (elite stat)
  if (statValue >= 90)  return "#a3e635";   //  90+ → lime green    (good stat)
  if (statValue >= 60)  return "#facc15";   //  60+ → yellow        (average stat)
  if (statValue >= 40)  return "#fb923c";   //  40+ → orange        (below average)
  return "#f87171";                         // <40  → red           (low stat) — fallthrough
}

// getSpriteUrl(pokemonUrl) ────────────────────────────────────────────────────
// INPUT:  pokemonUrl — a full PokéAPI resource URL, e.g. "https://pokeapi.co/api/v2/pokemon/6/"
// OUTPUT: a direct sprite image URL string → placed in an <img src="..."> in the dropdown
// This avoids an extra API round-trip per suggestion by deriving the ID from the URL.
function getSpriteUrl(pokemonApiUrl) {
  let urlSegments   = pokemonApiUrl.split("/");                    // splits URL on every "/" → ["https:","","pokeapi.co","api","v2","pokemon","6",""]
  let nonEmptyParts = urlSegments.filter(function(segment) {      // .filter() returns a new array containing only segments that are NOT empty strings
    return segment.length > 0;                                     // empty strings (from trailing "/") are removed
  });
  let pokemonId     = nonEmptyParts[nonEmptyParts.length - 1];    // last surviving segment is the numeric ID, e.g. "6"
  return "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/" + pokemonId + ".png";
  // ↑ returns a complete sprite image URL — the caller puts this in an <img> src attribute
}

// capitalize(str) ─────────────────────────────────────────────────────────────
// INPUT:  str — a lowercase string from the API (e.g. "garchomp")
// OUTPUT: the same string with the first letter uppercased (e.g. "Garchomp")
// → sent to the DOM as the Pokémon's display name inside the card
function capitalize(inputString) {
  return inputString.charAt(0).toUpperCase()   // takes the first character and uppercases it
       + inputString.slice(1);                 // appends every character after index 0 unchanged
}
//#endregion


//#region SESSION STATE
// ─────────────────────────────────────────────────────────────────────────────
// Two variables that represent the app's live state.
// They change as the user interacts with the page and are read by multiple functions.
// Neither is displayed directly — they feed into functions that update the DOM.
// ─────────────────────────────────────────────────────────────────────────────

let allPokemonList = [];
// ↑ Starts empty. Populated once by the fetch() call below.
//   Holds every Pokémon as { name: "bulbasaur", url: "https://pokeapi.co/..." }
//   Read by the autocomplete oninput handler to filter match suggestions.

let teamTypesBySlot = ["", "", "", "", "", ""];
// ↑ One entry per team slot (indices 0–5).
//   ""          → slot is empty (no Pokémon loaded)
//   ["fire","flying"] → slot has a Pokémon with those types (example: Charizard)
//   Updated by searchPokemon() when a Pokémon loads, and cleared by the clear button.
//   Read by updateWeaknessChart() to calculate team-wide type coverage.
//#endregion


//#region INITIAL DATA FETCH
// ─────────────────────────────────────────────────────────────────────────────
// Runs immediately when the browser parses this script.
// Sends one HTTP GET request to PokéAPI to load every Pokémon's name and URL.
// limit=2000 ensures a single response covers all ~1000+ Pokémon without paging.
// On success, populates allPokemonList so autocomplete works without further requests.
// ─────────────────────────────────────────────────────────────────────────────

fetch("https://pokeapi.co/api/v2/pokemon?limit=2000")  // sends GET request to PokéAPI list endpoint
  .then(function(httpResponse) {                        // .then() runs when the HTTP response arrives
    return httpResponse.json();                         // parses the response body from JSON text → JavaScript object; returns a new Promise
  })
  .then(function(parsedData) {                          // .then() runs when JSON parsing is complete
    allPokemonList = parsedData.results;                // parsedData.results is the array of { name, url } objects — stored in state
  });
  // No .catch() — if the fetch fails the autocomplete just won't work,
  // which is acceptable since manual search still functions.
//#endregion


//#region SLOT SETUP
// ─────────────────────────────────────────────────────────────────────────────
// setupSlot(index) wires up all interactive behavior for one team slot.
// It is called for indices 0–5 by the loop at the bottom of the file.
// Each call creates its own private scope via the function body, so each
// slot has its own independent activeDropdownIndex variable.
// ─────────────────────────────────────────────────────────────────────────────

function setupSlot(slotIndex) {

  // ── GRAB DOM ELEMENTS FOR THIS SLOT ──────────────────────────────────────
  // getElementById() finds each element by its unique ID string.
  // IDs follow the pattern: "btn0", "btn1", ..., "btn5" etc.
  // These four references are used by every handler inside this function.
  let searchButton  = document.getElementById("btn"   + slotIndex);   // the GO button → triggers a search when clicked
  let clearButton   = document.getElementById("clear" + slotIndex);   // the X button  → resets the slot to empty
  let searchInput   = document.getElementById("input" + slotIndex);   // the text field → user types a Pokémon name here
  let dropdown      = document.getElementById("drop"  + slotIndex);   // the suggestion list container → shown/hidden as user types

  // Tracks which dropdown row the keyboard cursor is on.
  // -1 means no row is highlighted (cursor is still in the input field).
  let activeDropdownIndex = -1;

  // ── AUTOCOMPLETE: FILTER SUGGESTIONS ON EVERY KEYSTROKE ──────────────────
  // oninput fires after every character typed, pasted, or deleted in the input.
  // Reads the current value, filters allPokemonList, and rebuilds the dropdown.
  searchInput.oninput = function() {
    let typedQuery   = searchInput.value.toLowerCase().trim(); // reads the current input text → lowercased and trimmed to match API names
    activeDropdownIndex = -1;                                  // resets keyboard highlight whenever the text changes
    dropdown.innerHTML = "";                                   // clears any previously rendered suggestion rows from the DOM

    if (typedQuery.length < 2) {           // fewer than 2 characters → don't bother filtering
      dropdown.style.display = "none";     // hides the dropdown element (display:none removes it from layout)
      return;                              // exits the handler early — nothing more to do
    }

    // Filter allPokemonList to entries whose name STARTS WITH the typed query.
    // We stop collecting at 8 matches to keep the dropdown short.
    let filteredMatches = [];                                            // will hold matching { name, url } objects
    for (let i = 0; i < allPokemonList.length; i++) {                  // walks every Pokémon in the master list
      if (allPokemonList[i].name.startsWith(typedQuery)) {             // .startsWith() checks if the name begins with the query
        filteredMatches.push(allPokemonList[i]);                       // adds the match to our results array
      }
      if (filteredMatches.length >= 8) break;                          // 8 matches collected → stop scanning to stay fast
    }

    if (filteredMatches.length === 0) {    // no matches found for this query
      dropdown.style.display = "none";     // keeps the dropdown hidden
      return;                              // exits early
    }

    // Build one dropdown row element per match and append it to the dropdown container.
    for (let i = 0; i < filteredMatches.length; i++) {
      let matchEntry   = filteredMatches[i];                                          // current { name, url } object
      let spriteImgUrl = getSpriteUrl(matchEntry.url);                               // derives sprite URL from the API URL (no extra fetch needed)

      let rowElement         = document.createElement("div");                        // creates a new <div> element (not yet in the DOM)
      rowElement.className   = "dropItem";                                           // → sets class for CSS styling
      rowElement.innerHTML   =                                                       // → writes HTML inside the row:
        "<img class='dropSprite' src='" + spriteImgUrl  + "' alt='" + matchEntry.name + "'>" +  // small Pokémon sprite image
        "<span class='dropName'>"       + matchEntry.name + "</span>";                           // Pokémon name text

      // The IIFE (immediately invoked function expression) captures matchEntry.name
      // in a closure. Without this, every onclick would see the LAST value of matchEntry
      // from the loop instead of the value it had when this row was built.
      (function(capturedName) {
        rowElement.onclick = function() {                  // fires when the user clicks this suggestion row
          searchInput.value = capturedName;                // → writes the Pokémon name into the input field (DOM update)
          dropdown.style.display = "none";                 // → hides the dropdown
          dropdown.innerHTML     = "";                     // → clears its child rows from the DOM
          searchPokemon(slotIndex);                        // → immediately triggers a full search for this name
        };
      })(matchEntry.name);                                 // passes matchEntry.name in as capturedName right now

      dropdown.appendChild(rowElement);                    // attaches the finished row element to the dropdown container (now visible in DOM)
    }

    dropdown.style.display = "block";   // makes the dropdown visible now that it has rows (display:block restores it in layout)
  };

  // ── KEYBOARD NAVIGATION INSIDE THE DROPDOWN ──────────────────────────────
  // onkeydown fires for every key press while the input has focus.
  // Handles ArrowDown, ArrowUp, Enter, and Escape for accessible keyboard UX.
  searchInput.onkeydown = function(keyEvent) {
    let dropdownRows = dropdown.querySelectorAll(".dropItem");   // reads all current suggestion rows as a NodeList

    if (keyEvent.key === "ArrowDown") {
      keyEvent.preventDefault();                                             // stops the cursor from jumping to the end of the input text
      activeDropdownIndex = Math.min(                                        // moves the highlight one row DOWN without going past the last row
        activeDropdownIndex + 1,                                             // desired new index
        dropdownRows.length - 1                                              // ceiling: last valid index
      );
      highlightDropdownRow(dropdownRows, activeDropdownIndex);              // updates the .active CSS class to reflect the new highlight

    } else if (keyEvent.key === "ArrowUp") {
      keyEvent.preventDefault();                                             // stops the cursor from jumping to the beginning of the input text
      activeDropdownIndex = Math.max(activeDropdownIndex - 1, -1);          // moves the highlight one row UP; -1 means "back to the input, no row highlighted"
      highlightDropdownRow(dropdownRows, activeDropdownIndex);              // updates the .active CSS class

    } else if (keyEvent.key === "Enter") {
      if (activeDropdownIndex >= 0 && dropdownRows[activeDropdownIndex]) {
        dropdownRows[activeDropdownIndex].click();                           // triggers the onclick of the highlighted row — fills input + searches
      } else {
        dropdown.style.display = "none";                                    // no row highlighted → close dropdown
        dropdown.innerHTML     = "";                                        // clear suggestion rows from the DOM
        searchPokemon(slotIndex);                                           // search whatever name the user typed manually
      }

    } else if (keyEvent.key === "Escape") {
      dropdown.style.display = "none";    // closes the dropdown without searching
      dropdown.innerHTML     = "";        // clears suggestion rows from the DOM
      activeDropdownIndex    = -1;        // resets the keyboard cursor position
    }
  };

  // highlightDropdownRow(rows, targetIndex) ───────────────────────────────────
  // INPUT:  rows        — NodeList of all .dropItem elements
  //         targetIndex — the index that should receive the .active class (-1 = none)
  // OUTPUT: updates className on each row → browser re-renders the highlighted row
  // Called only by the onkeydown handler above.
  function highlightDropdownRow(rows, targetIndex) {
    for (let i = 0; i < rows.length; i++) {
      rows[i].className = (i === targetIndex)  // is this the row we want highlighted?
        ? "dropItem active"                    // yes → adds the "active" class (CSS changes its background)
        : "dropItem";                          // no  → removes "active", keeping only "dropItem"
    }
  }

  // ── CLOSE DROPDOWN ON OUTSIDE CLICK ──────────────────────────────────────
  // document.onclick fires for every click anywhere on the page.
  // If the click was NOT on this slot's input, the dropdown is closed.
  // Note: assigning to document.onclick overwrites previous slot handlers —
  // this is intentional; whichever slot was last active handles outside clicks.
  document.onclick = function(clickEvent) {
    if (clickEvent.target !== searchInput) {   // was the click outside this input?
      dropdown.style.display = "none";         // → hides the dropdown
      activeDropdownIndex    = -1;             // → resets keyboard highlight state
    }
  };

  // ── GO BUTTON CLICK ───────────────────────────────────────────────────────
  // Closes the dropdown (if open) and starts a search for whatever is in the input.
  searchButton.onclick = function() {
    dropdown.style.display = "none";    // hides the dropdown
    dropdown.innerHTML     = "";        // removes suggestion rows from the DOM
    searchPokemon(slotIndex);           // triggers the full API search for this slot
  };

  // ── CLEAR BUTTON CLICK ───────────────────────────────────────────────────
  // Resets this slot completely: hides the card, empties the input,
  // clears any error text, hides the clear button itself,
  // removes this slot's type data from state, and refreshes the weakness chart.
  clearButton.onclick = function() {
    document.getElementById("card"  + slotIndex).style.display = "none";  // hides the Pokémon card (DOM update)
    searchInput.value = "";                                                  // clears the text input field (DOM update)
    document.getElementById("error" + slotIndex).innerText = "";           // removes any error message text (DOM update)
    clearButton.style.display = "none";                                     // hides the clear button itself (no Pokémon loaded = no need for it)
    dropdown.style.display    = "none";                                     // hides the dropdown if somehow still visible
    dropdown.innerHTML        = "";                                         // removes suggestion rows from the DOM
    teamTypesBySlot[slotIndex] = "";                                        // removes this slot's type data from state → it's now treated as empty
    updateWeaknessChart();                                                  // recalculates and re-renders the team weakness chart without this slot
  };
}
//#endregion


//#region POKÉMON SEARCH & CARD RENDER
// ─────────────────────────────────────────────────────────────────────────────
// searchPokemon(slotIndex) is the core function that fetches data from PokéAPI
// and populates a single slot's card with sprite, name, type badges, and stat bars.
// It is called by the GO button, the Enter key, and clicking an autocomplete suggestion.
// ─────────────────────────────────────────────────────────────────────────────

function searchPokemon(slotIndex) {
  let searchInput  = document.getElementById("input" + slotIndex);   // reads the input element for this slot
  let searchedName = searchInput.value.toLowerCase().trim();          // extracts and normalizes the typed name for the API URL

  document.getElementById("error" + slotIndex).innerText = "";           // clears any error message left from a previous failed search (DOM update)
  document.getElementById("card"  + slotIndex).style.display = "none";  // hides the card while the new data loads (DOM update)

  if (!searchedName) return;    // input is blank → nothing to fetch; exit early

  // Sends GET request to PokéAPI for this specific Pokémon.
  // The name becomes part of the URL path (e.g. "...pokemon/garchomp").
  fetch("https://pokeapi.co/api/v2/pokemon/" + searchedName)
    .then(function(httpResponse) {
      if (!httpResponse.ok) throw new Error("Pokémon not found");  // non-200 status (e.g. 404 for a misspelled name) → jump to .catch()
      return httpResponse.json();                                   // parses the JSON body → returns a Promise that resolves to the data object
    })
    .then(function(pokemonData) {

      // ── NAME ──────────────────────────────────────────────────────────────
      // pokemonData.name is lowercase from the API (e.g. "garchomp")
      // capitalize() uppercases the first letter before displaying it.
      // → sent to DOM: the card's name heading text content
      document.getElementById("name" + slotIndex).innerText = capitalize(pokemonData.name);

      // ── SPRITE IMAGE ──────────────────────────────────────────────────────
      // pokemonData.sprites.front_default is a direct URL to the front sprite PNG.
      // Setting .src triggers the browser to load and display that image.
      // → sent to DOM: the <img> element's src attribute inside the card
      document.getElementById("sprite" + slotIndex).src = pokemonData.sprites.front_default;

      // ── TYPE BADGES ───────────────────────────────────────────────────────
      // pokemonData.types is an array of objects:
      //   [{ slot: 1, type: { name: "dragon", url: "..." } }, { slot: 2, type: { name: "ground", url: "..." } }]
      // We extract just the name strings into a flat array.
      let typeNameArray  = pokemonData.types.map(function(typeEntry) {   // .map() transforms each type object → just its name string
        return typeEntry.type.name;                                       // e.g. { slot:1, type:{name:"dragon",...} } → "dragon"
      });

      let typeBadgeContainer = document.getElementById("types" + slotIndex);   // the <div> that holds the type badge spans inside the card
      typeBadgeContainer.innerHTML = "";                                         // clears any type badges from a previously loaded Pokémon (DOM update)

      for (let i = 0; i < typeNameArray.length; i++) {
        let badgeSpan         = document.createElement("span");             // creates a new <span> element (not yet in the DOM)
        badgeSpan.className   = "typeBadge type-" + typeNameArray[i];       // e.g. "typeBadge type-dragon" → CSS colors the badge by type
        badgeSpan.innerText   = typeNameArray[i];                           // → sets the badge's visible label text (e.g. "dragon")
        typeBadgeContainer.appendChild(badgeSpan);                          // → inserts the badge span into the card (DOM update)
      }

      // ── STAT BARS ─────────────────────────────────────────────────────────
      // pokemonData.stats is an array of objects:
      //   [{ base_stat: 108, stat: { name: "attack", url: "..." } }, ...]
      // For each stat we build a row:  LABEL | colored bar | number
      let statRowContainer = document.getElementById("stats" + slotIndex);   // the <div> that holds all stat rows inside the card
      statRowContainer.innerHTML = "";                                         // clears stat rows from any previously loaded Pokémon (DOM update)

      for (let i = 0; i < pokemonData.stats.length; i++) {
        let apiStatName  = pokemonData.stats[i].stat.name;                        // raw API stat name, e.g. "special-attack"
        let baseStatVal  = pokemonData.stats[i].base_stat;                        // the numeric base stat value, e.g. 130
        let displayLabel = statLabels[apiStatName] || apiStatName;                // looks up short label ("SpATK"); falls back to raw name if not found
        let barWidthPct  = Math.min(100, Math.round((baseStatVal / 255) * 100));  // converts base stat → percentage of max (255), capped at 100%
        let barColor     = getStatColor(baseStatVal);                             // returns a hex color string based on the stat value

        let statRowDiv         = document.createElement("div");   // creates a new <div> for this stat row (not yet in the DOM)
        statRowDiv.className   = "statRow";                        // → applies statRow CSS layout (flex row, spacing)
        statRowDiv.innerHTML   =                                   // → writes the three parts of the stat row as HTML:
          "<span class='statName'>"  + displayLabel + "</span>" +           // left cell: short stat label (e.g. "SpATK") → visible text
          "<div class='statBarWrap'>" +                                      // middle cell: wrapper div for the bar track
            "<div class='statBar' style='width:" + barWidthPct + "%;" +
              "background:" + barColor + "'></div>" +                        // the colored fill bar — width and color set inline
          "</div>" +
          "<span class='statVal'>"   + baseStatVal + "</span>";              // right cell: raw numeric value (e.g. "130") → visible text

        statRowContainer.appendChild(statRowDiv);   // → inserts the finished stat row into the card (DOM update)
      }

      // ── REVEAL CARD & CLEAR BUTTON ────────────────────────────────────────
      document.getElementById("card"  + slotIndex).style.display = "flex";          // makes the card visible (display:flex restores its flex layout) → DOM update
      document.getElementById("clear" + slotIndex).style.display = "inline-block";  // makes the clear button visible now that a Pokémon is loaded → DOM update

      // ── UPDATE STATE & WEAKNESS CHART ─────────────────────────────────────
      teamTypesBySlot[slotIndex] = typeNameArray;   // stores this Pokémon's type array at the correct slot index in state
      updateWeaknessChart();                        // recalculates the weakness chart with the newly updated team data
    })
    .catch(function(fetchError) {
      document.getElementById("error" + slotIndex).innerText = fetchError.message;
      // ↑ on any error (404, network failure), writes the error message text into
      //   the error <span> below the input so the user can see what went wrong → DOM update
    });
}
//#endregion


//#region TEAM WEAKNESS CHART
// ─────────────────────────────────────────────────────────────────────────────
// updateWeaknessChart() reads teamTypesBySlot (state) and typeChart (data),
// calculates how many team members are weak to each attacking type,
// then renders sorted weakness badges into the #weaknessChart container.
//
// Called after every search and every clear so the chart always reflects
// the current state of all 6 slots.
// ─────────────────────────────────────────────────────────────────────────────

function updateWeaknessChart() {

  let weaknessTallies = {};   // accumulator object: { typeName: count }
                              // e.g. { "water": 3, "fire": 1 } — built fresh each call

  // ── CALCULATE WEAKNESS COUNTS ─────────────────────────────────────────────
  for (let slotI = 0; slotI < teamTypesBySlot.length; slotI++) {    // iterates over all 6 slot entries in state
    let slotTypes = teamTypesBySlot[slotI];                          // the type array for this slot (or "" if empty)
    if (!slotTypes || slotTypes.length === 0) continue;             // empty slot → skip, nothing to calculate

    let allAttackingTypes = Object.keys(typeChart);   // gets an array of all 18 type name strings from the typeChart keys

    for (let attackI = 0; attackI < allAttackingTypes.length; attackI++) {   // loops over every possible attacking type
      let attackerType  = allAttackingTypes[attackI];                         // the attacking type being tested (e.g. "fire")
      let damageMultiplier = 1;                                               // starts at neutral damage (1×); will be multiplied up or down

      // Apply each of this Pokémon's defending types to the multiplier.
      // If any type is immune, multiplier goes to 0 immediately and we stop.
      for (let defI = 0; defI < slotTypes.length; defI++) {                         // loops over this Pokémon's 1–2 defending types
        let defenderTypeData = typeChart[slotTypes[defI]];                           // looks up the interaction rules for this defending type

        if (defenderTypeData.immune.includes(attackerType)) {    // attacker is in this type's immune list → 0× damage
          damageMultiplier = 0;                                   // sets multiplier to 0
          break;                                                  // no need to check further types; total will be 0
        }
        if (defenderTypeData.weak.includes(attackerType))    damageMultiplier *= 2;    // attacker is a weakness → doubles the multiplier
        if (defenderTypeData.resist.includes(attackerType))  damageMultiplier *= 0.5;  // attacker is resisted → halves the multiplier
      }

      if (damageMultiplier >= 2) {
        // Net multiplier is 2× or higher → this Pokémon is weak to this attacker.
        // Increment the tally (initializing to 0 first if this attacker hasn't been seen yet).
        weaknessTallies[attackerType] = (weaknessTallies[attackerType] || 0) + 1;
      }
    }
  }

  // ── GRAB CHART DOM ELEMENTS ───────────────────────────────────────────────
  let weaknessSection = document.getElementById("weaknessSection");   // the outer section container — shown/hidden depending on team state
  let weaknessBadgeContainer = document.getElementById("weaknessChart");   // the inner flex container that holds the weakness badges
  weaknessBadgeContainer.innerHTML = "";   // clears all badges from the previous render (DOM update)

  // ── DECIDE WHETHER TO SHOW THE SECTION ───────────────────────────────────
  // Hide the entire section if no slot has a Pokémon loaded.
  let anySlotFilled = false;                                              // flag — will be set true if at least one slot has types
  for (let i = 0; i < teamTypesBySlot.length; i++) {
    if (teamTypesBySlot[i] && teamTypesBySlot[i].length > 0) {          // this slot has type data
      anySlotFilled = true;                                              // mark that the team has at least one Pokémon
      break;                                                             // no need to check further slots
    }
  }

  if (!anySlotFilled) {
    weaknessSection.style.display = "none";   // hides the whole weakness section from the page (DOM update)
    return;                                   // exits — nothing else to render
  }

  weaknessSection.style.display = "block";   // ensures the section is visible when the team has at least one Pokémon (DOM update)

  // ── SORT WEAKNESSES BY FREQUENCY ─────────────────────────────────────────
  // Object.keys() returns the type names that received at least one tally.
  // .sort() with the custom comparator puts the most common weakness first.
  let sortedWeakTypes = Object.keys(weaknessTallies).sort(function(typeA, typeB) {
    return weaknessTallies[typeB] - weaknessTallies[typeA];   // descending: highest count first
  });

  // ── RENDER WEAKNESS BADGES ────────────────────────────────────────────────
  for (let i = 0; i < sortedWeakTypes.length; i++) {
    let weakType   = sortedWeakTypes[i];                    // the attacking type name (e.g. "fire")
    let teamCount  = weaknessTallies[weakType];             // how many team members are weak to this type (e.g. 3)

    let badgeDiv         = document.createElement("div");           // creates a new <div> for this badge (not yet in the DOM)
    badgeDiv.className   = "weaknessBadge type-" + weakType;        // → applies shared badge style + type-specific color class
    badgeDiv.innerHTML   =
      weakType +                                                      // → type name text (e.g. "fire") → visible in the badge
      "<span class='weakCount'>×" + teamCount + "</span>";           // → count indicator (e.g. "×3") appended inside the badge

    weaknessBadgeContainer.appendChild(badgeDiv);   // → inserts the finished badge into the chart container (DOM update)
  }
}
//#endregion


//#region SLOT INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────
// Runs once when the script first loads (after the page HTML is parsed).
// Calls setupSlot() for each of the 6 team slot indices (0 through 5).
// This wires up all buttons, inputs, and dropdowns on the page.
// Nothing is sent to the DOM here — setupSlot() assigns handlers that
// will update the DOM later when the user interacts with the page.
// ─────────────────────────────────────────────────────────────────────────────

for (let slotIndex = 0; slotIndex < 6; slotIndex++) {   // counts 0, 1, 2, 3, 4, 5 — one iteration per team slot
  setupSlot(slotIndex);                                  // wires up all event handlers for slot at this index
}
//#endregion
