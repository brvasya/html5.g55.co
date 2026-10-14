// Match rules are independent of rendering and of the existing wave mode.
export function createTeamDeathmatch(settings = {}) {
  const number = (value, fallback, min, max) => Number.isFinite(value)
    ? Math.min(max, Math.max(min, value)) : fallback;
  const options = {
    scoreLimit: Math.floor(number(settings.scoreLimit, 50, 1, 10000)),
    timeLimit: number(settings.timeLimit, 300, 1, 86400),
    respawnDelay: number(settings.respawnDelay, 3, 0.1, 60),
    spawnProtection: number(settings.spawnProtection, 2, 0, 30),
    playerTeam: settings.playerTeam === "red" ? "red" : "blue",
    teams: Object.fromEntries(["blue", "red"].map(team => [team, {
      type: settings.teams?.[team]?.type || (team === "blue" ? "soldier" : "zombie"),
      bots: Math.floor(number(settings.teams?.[team]?.bots, team === "blue" ? 3 : 8, 0, 24)),
      stats: { ...settings.teams?.[team]?.stats }
    }]))
  };
  let elapsed = 0, ended = false, winner = null;
  const scores = { blue: 0, red: 0 };

  function finish() {
    ended = true;
    winner = scores.blue === scores.red ? null : scores.blue > scores.red ? "blue" : "red";
  }

  return {
    options,
    get elapsed() { return elapsed; },
    get ended() { return ended; },
    get winner() { return winner; },
    get scores() { return { ...scores }; },
    reset() { elapsed = 0; ended = false; winner = null; scores.blue = scores.red = 0; },
    tick(delta) {
      if (ended || !Number.isFinite(delta) || delta <= 0) return;
      elapsed = Math.min(options.timeLimit, elapsed + delta);
      if (elapsed >= options.timeLimit) finish();
    },
    recordKill(attackerTeam, victimTeam) {
      if (ended || !Object.hasOwn(scores, attackerTeam) ||
          !Object.hasOwn(scores, victimTeam) || attackerTeam === victimTeam) return false;
      scores[attackerTeam] += 1;
      if (scores[attackerTeam] >= options.scoreLimit) finish();
      return true;
    },
    getHudState() {
      return { blueScore: scores.blue, redScore: scores.red,
        timeRemaining: Math.max(0, options.timeLimit - elapsed) };
    }
  };
}
