SILENT HILL 2: BEAT EM UP
An unofficial G55.CO arcade fan game.

PLAY
Extract the complete ZIP. Upload its contents into any static hosting folder,
then open index.html from that folder's web address. All runtime assets and
fonts are local; no external libraries, accounts, or services are required.
For a local web server, run: python -m http.server 8000
Then open http://localhost:8000 in a modern browser.
Direct file:// launch has not been browser-tested.

CONTROLS
WASD or arrow keys: move through the lanes
J: steel pipe combo; third hit knocks enemies back
K: heavy strike; uses stamina and breaks scenery in one hit
L: handgun; aim toward an enemy in your lane
R: reload
Space: dodge; uses stamina and avoids damage briefly
Esc or P: pause / resume
M: sound on / off
Touchscreen: movement stick and labeled action buttons

CAMPAIGN
Five chapters and fifteen areas: South Vale, Wood Side Apartments,
Brookhaven Hospital, Toluca Prison, and Lakeview Hotel.
Clear the enemies in each area and follow the arrow to the right.
Break each chapter's scenery for health and ammunition.
The last encounter is Pyramid Head. Dodge his marked attacks and strike
during his recovery. There is no time limit.

PROGRESS
Each chapter saves an entry checkpoint on this browser when storage is
available. Continue reloads that chapter. Retry restores chapter-entry
health, ammunition, and score. Pause or returning to the menu preserves
the active run until the page is closed. Starting a new game resets it.
Between chapters, health increases by 35 and ammunition increases by 16,
up to the carrying limits. The handgun is loaded for the next chapter.

PACKAGE
index.html, style.css, game.js: editable game source
assets/: 29 illustrated runtime PNGs and frame catalog
fonts/: locally packaged DejaVu Sans and its license
thumb.png: full-color 170 x 128 thumbnail with the game title

VERIFICATION
The campaign was exercised through all 15 areas and the final boss by an
automated player using the game's movement and combat actions. Focused
checks covered pause conservation, dodge recovery, ammunition accounting,
attack timing, lane reach, chapter transitions, and one-time prop rewards.
Browser checks covered loading, desktop and phone layouts, menu actions,
touch attack, pause, help, and outcomes. These checks are not a guarantee
of compatibility with every device, browser, or embedding configuration.

Silent Hill and its characters belong to their respective rights holders.
This is an unofficial fan-made arcade reinterpretation, not an official
Silent Hill release. Generated artwork and original game code are included.
See fonts/LICENSE.txt for the font licensing terms.
