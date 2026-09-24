RESIDENT EVIL REQUIEM: BEAT EM UP
Version 1.2 — September 2026

VERSION 1.2 CHANGES
- Fixed palette conversion that created bright, jagged outlines in nine
  background layers. All 20 layers were audited and re-exported.
- Backgrounds retain their 16-color palettes, dimensions and transparency.

VERSION 1.1 CHANGES
- Chapter 2 hospital scenery rebuilt with proportionate doors and fittings.
- Chapter 4 foreground rebuilt with smaller shop fronts and human-sized doors.
- Foreground window openings in Chapters 2 and 5 are transparent.
- Ground artwork now extends behind the scenery to eliminate bottom gaps.

PLAY
Extract the entire ZIP, then open index.html in a modern browser.
Keep assets/, fonts/, and the JavaScript/CSS files beside index.html.
The game uses HTML5 Canvas and Web Audio; Adobe Flash is not required.
No build step, dependencies, account, or external assets are required.
For web hosting, upload the extracted contents to one directory and open
that directory's index.html. Mobile browsers should use the hosted game.

CONTROLS
WASD or arrow keys: move along the street and between lanes
J: three-hit hatchet combo (hold to continue attacking)
K: roundhouse kick
L: handgun (hold to fire)
R: reload
Space or Shift: dodge
E: first aid, two uses per chapter
Q: adrenaline strike when the meter reaches 100%
Escape: pause/resume
M: mute/unmute
F: fullscreen, when supported by the browser

On touch screens, use the movement joystick and labeled attack buttons.
Sound starts after a keyboard or pointer gesture. Sound preference is saved.
If fullscreen is unavailable, the game fits the browser window.

CAMPAIGN
1. Wrenwood Hotel — The Doorman
2. Rhodes Hill — Ward Overseer
3. Isolation Wing — Quarantine Carrier
4. Raccoon City — Ruin Stalker
5. ARK Facility — Requiem Tyrant

Each chapter has three connected areas and one boss. Clear the threats,
then move right. Cleared areas remain open for backtracking. Break supply
containers for health and ammunition. Match an enemy's lane to hit it.
Orange floor rings warn of incoming attacks; dodge or move away.

Health, ammunition and first aid are replenished between chapters.
Continue saves the start of the current chapter when local storage is
available. Retry restarts that chapter and restores its checkpoint score.
An active paused run can also be continued from the main menu.

CONTENTS
index.html, style.css: responsive menus, HUD, keyboard and touch interface
engine.js: combat, enemies, campaign, checkpoints and persistent areas
game.js: input, rendering and interface integration
audio.js: synthesized sound effects and sound activation
catalog.js: sprite frame sizes and ground anchors
backgrounds.js: independent panorama layers and parallax settings
assets/: 33 PNG files, each with at most 16 palette entries
fonts/: bundled Oswald fonts and their SIL Open Font License
thumb.png: 170 x 128 full-color promotional thumbnail
VALIDATION.txt: checks performed and remaining browser verification limit

ART
Clean illustrated Flash-style sprites with opaque bodies, two distinct
walk frames, separate attack frames, and intact/damaged/broken props.
Each chapter uses four independent panorama layers. The full-color source
artwork is supplied separately in the source-art ZIP.

CREDITS
Unofficial fan game inspired by Resident Evil Requiem.
Resident Evil names and characters belong to Capcom.
The arcade campaign and boss encounters are fan-made interpretations.
Project illustrations were generated for this game and exported to
indexed PNGs. Typography: Oswald, distributed under the SIL OFL 1.1.
G55.CO More Games links include the game title for attribution.
