ELDEN RING: BEAT EM UP
HTML5 game - version 1.2

PLAY
Upload this folder to any static web host and open index.html.
For a local game, serve this folder over HTTP; for example, with Python:
    python3 -m http.server 8000
Then open http://localhost:8000 in a modern browser.
All runtime artwork, fonts, code and sounds are included or generated locally.
No installation, Flash plug-in, online game service or external asset CDN is required.

CONTROLS
WASD / arrow keys : move along the ground and between lanes
J                : sword attack; hold to chain the three-hit combo
K                : heavy strike; costs stamina and staggers foes
L                : cast glintstone magic; costs focus
Space / Shift    : dodge; costs stamina, briefly avoids damage
R                : healing flask; three per chapter
Escape           : pause / resume
M                : mute / unmute sound
F                : fullscreen
Phones and tablets also have a movement joystick and action buttons.

THE JOURNEY
Five chapters, each with three connected areas and a final boss:
Limgrave, Stormveil Castle, Liurnia, Caelid and Leyndell.
Defeat each area's foes, then follow the golden grace to the right.
Cleared areas remain open for backtracking during later encounters.
Break the themed supplies for health or focus. Debris stays behind.
Golden attack rings warn of incoming strikes. Dodge before impact.
Stamina and focus recover over time. Sword and magic power rise each chapter.
Health, focus and flasks refill between chapters.
Chapter checkpoints save in this browser when local storage is available.
Retry restarts the current chapter with its starting score and full supplies.

PACKAGE
index.html is the entry point. Keep assets/ and fonts/ beside the code files.
thumb.png is the titled full-color 170 x 128 portal thumbnail.
The game uses Canvas 2D, Web Audio, native transparent sprite sheets,
two distinct walking frames per actor and four continuous scenery layers per chapter.
The redesigned chapter panoramas scroll at different depths without repeating.
Each chapter's four layers now come from independently generated artwork,
with wider native source images and cleaner shading for sharper scenery.
Every in-game PNG uses an indexed palette of no more than 16 colors.
The thumbnail is intentionally full color.

CREDITS
An unofficial Elden Ring fan game made for G55.CO.
Elden Ring names and setting belong to their respective owners.
Illustrated artwork was generated for this project.
Sound effects are synthesized by the game.
DejaVu Serif is bundled under the license in fonts/LICENSE.txt.
