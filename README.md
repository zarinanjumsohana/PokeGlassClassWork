# PokeGlassClassWork
Interactive Pokemon Card Explorer

Name: Zarin Anjum Sohana
Id: 0812410105101064
CSE-19 BAUET

## Files

- index.html – structure
- style.css – glass theme, type tints, CSS 3D, backdrop scenes, effects
- script.js – fetching, rendering, interaction

## Features:
-Pokédex number and title 
-Type badges, colour tint, impact effects 
-height, weight
-stat bars and the power rating 
-Ability
-moves 
-3D artwork (normal and shiny) 
-Cry audi0
-Follow-up species request 

## API handling

- Input is trimmed, lowercased and hyphenated, then validated before any request.
- `fetch()` with `async`/`await`; `response.ok` is checked and a 404 is told apart from network failure.
- Loading, success, empty and error states each have their own UI and screen-reader announcements.
- A token guards against out-of-order responses when searches overlap.
- API text is inserted with `textContent`, never `innerHTML`.

## Extra features

- Two parallax backdrops (Sky and Space) that react to the pointer and scroll
- Floating 3D Pokémon in the hero; click one to search it
- Type-tinted glass theme that fades between Pokémon
- Extruded 3D Pokémon that flies in, hovers, tilts with the pointer and spins when dragged
- Click or press Enter on the stage to attack: shockwave, flash, screen shake, particles and cry
- Ambient particles per type (embers, bubbles, sparks, leaves, and so on)
- Shiny toggle, previous/next, random, ability details, type matchups, power rating
- List / Choose: every Pokémon in the API as type-tinted cards, sorted A to Z, with a name filter and letter buttons. Types come from the 18 `/type/{type}` endpoints, and cards load in batches of 60 as you scroll

