// Boards copy (M2-03 net-worth leaderboard). EN only for now (the shell has no locale switch yet; FR pending review).
export const LB = {
  title: "Net worth board",
  world: "Port Avalon",
  colRank: "Rank",
  colPlayer: "Player",
  colNw: "Net worth",
  you: "You",
  findMe: "Find my row",
  yourRank: (rank: number, players: number) => `Your rank: ${rank} of ${players}`,
  valuedAt: (day: number, hhmm: string, tick: number) => `Valued at Day ${day} · ${hhmm} · server tick ${tick}`,
  players: (n: number) => `${n} player${n === 1 ? "" : "s"}`,
  howRanked: "Net worth = cash + holdings at the server price. Ties share a rank, listed by name.",
  loading: "Loading the board",
  couldntLoad: "Couldn't load the board",
  couldntUpdate: "Couldn't update. Showing the last board.",
  retry: "Retry",
  empty: "No ranked players yet.",
  selfUnvalued: "Your account can't be valued right now.",
  signedOut: "Sign in to see the Port Avalon net worth board.",
  signIn: "Sign in",
  topOnly: (n: number) => `Top ${n} shown`,
  nextUpChip: "Next up",
  atTop: "You're at the top of the board.",
  tied: (others: number) => others === 1
    ? "Tied with 1 other player at the top of the board."
    : `Tied with ${others} other players at the top of the board.`,
} as const;
