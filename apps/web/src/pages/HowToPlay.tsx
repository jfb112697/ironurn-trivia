export function HowToPlay() {
  return (
    <div className="stack">
      <div>
        <span className="kicker">How to play</span>
        <h1 style={{ marginBottom: 6 }}>Pinpoint</h1>
        <p className="lede">
          You get a statistic, a span of seasons and a pool of players. Name the players who rank highest and you keep
          the points attached to each rank.
        </p>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>The board</h2>
          <p>
            The game shows a ranked board of the top <b>N</b> players for the criteria. Rank 1 is worth the most points
            (N points), and the last rank is worth 1. A Daily board is 100 deep — that's 5,050 points available in
            total.
          </p>
          <p>
            Type a name and hit <b>Guess</b>. Correct answers fill their slot and pay out that rank's points. Ties in
            the underlying statistic share the same rank and the same points.
          </p>
        </div>

        <div className="card">
          <h2>Strikes</h2>
          <p>
            You have three strikes. A wrong name, or a surname shared by more than one player on the board, costs a
            strike. Repeating a name you've already found is free.
          </p>
          <p>
            <b>To qualify you need one third of the points.</b> That's 1,684 points on a Daily (100-deep) board. Miss
            that and the game is a loss, even if you found plenty of names.
          </p>
        </div>

        <div className="card">
          <h2>Statistics</h2>
          <p>
            Counting stats (hits, home runs, RBI, strikeouts, wins, saves…) are simply summed across the season range.
            So "home runs, 1990–2026" means career home runs from 1990 onward.
          </p>
          <p>
            Rate stats (batting average, OBP, slugging, OPS, ERA, WHIP) are weighted by plate appearances or innings
            and require a minimum workload — about 502 plate appearances per full season — so a 3-for-4 cameo can't
            win a category.
          </p>
        </div>

        <div className="card">
          <h2>Pools and WAR</h2>
          <p>
            The pool narrows the board to one league or a set of franchises, evaluated season by season. WAR comes from
            Baseball Reference and covers hitters, pitchers and both combined.
          </p>
          <p>
            Free Play lets you pick all of it yourself, including board depth, strike count, a timer and same-screen
            two-player.
          </p>
        </div>
      </div>

      <div className="card">
        <h2>Tips</h2>
        <ul style={{ color: "var(--muted)", lineHeight: 1.75, margin: 0, paddingLeft: 20 }}>
          <li>Start with the obvious names — a single surname is enough if only one player on the board shares it.</li>
          <li>Use "Show remaining ranks" when you're stuck: it reveals the seasons and clubs behind each open slot without giving the name away.</li>
          <li>On rate-stat boards, deep-career volume players are usually a safer bet than one huge half-season.</li>
          <li>Your score only counts if you clear one third of the available points — so take the safe top-10 names first.</li>
        </ul>
      </div>
    </div>
  );
}
