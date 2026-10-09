
### 4.2 Hidden sessions: what the server needs (Mathis's hacking model)

Mathis's call: a successful hack doesn't trigger an alarm. It plants a subtle extra **session** on the victim's model, which shows up only as one more entry in its connections list. While the session stays connected, distillation builds up over time and never reaches 100%. The victim has to notice it and disconnect it. Tape owns the math (breach odds with a 1% floor, accrual curve, detection); Velvet owns the connections panel and how clues look. This section is the platform side.

**Sessions are world-state entities, owned by the victim's player partition:**
```
session(id, victim_model_id, attacker_char_id, opened_tick, strength, cover_label,
        distill_progress, clue_profile, status: active | frozen | disconnected)
```
- Each tick, in step 6, the victim's partition updates `distill_progress += f(strength, defense, progress) · presence_factor` with Tape's `f`, which tends toward a ceiling below 100%. Per-tick cost is a few arithmetic operations per session, so even a million open sessions is cheap.
- The attacker's copy improves from `distill_progress` (Ledger's student-model math), recomputed once per game hour, not every tick.
- The whole lifecycle goes into the event log for the court.

**Presence factor (copying slows while the victim is offline):**
- A victim counts as *present* if any of their clients has an open authenticated socket, or they sent an intent in the last 15 real minutes. Otherwise they're offline and accrual uses Tape's offline multiplier.
- Presence is computed server-side only. The attacker can't see or influence it. A victim who closes the app is genuinely offline, so there's nothing to fake.
- Dormant victims (30+ days) freeze all sessions on their models (§3.7).

**Clues have to be real, and they need noise around them:**
- The slowdown is real: an active session consumes a share of the victim AI's DU budget (Tape picks the %, e.g. 3–10% by strength), so the AI genuinely evaluates less. "Odd usage" appears as extra load in the model's usage graph.
- Clue events are generated server-side in step 6 from the session's `clue_profile`. The server also generates **benign anomalies** at a base rate (data-feed reconnects, a licensed renter's burst, a compute shortage slowdown) so a clue is evidence, not proof. Tape sets the false-alarm rate; Velvet shows both kinds the same way.

**Auto-scans by defense tier:**
- Higher-tier defense AIs scan more often (e.g. T1 every game day down to T5 every game hour; Tape's numbers). Each scan is scheduled in the AI phase, costs the defender DU, and has a detection chance from Tape's math. A hit marks the session in the victim's panel as "suspicious", never "hostile, from player X". Attribution needs a court case or an investigation.

**The connections list must not leak, client-side:**
- Hidden and legitimate connections are serialized **identically**: same fields, same ID format (random, rotating), no hostile flag, no attacker id, no opened-tick precision beyond what a legit entry shows. Anyone reading the network traffic or datamining the client learns nothing the panel doesn't show.
- **Legit churn:** a player's own AI workers, data feeds, alliance intel shares and licensed model renters open and close connections naturally, so "a new entry appeared" isn't an automatic tell. Velvet and Tape should tune how busy a typical list is per tier.
- **No scripted watching:** the connections list refreshes at most once per game hour through the API, and an external script diffing it gets the same churn a human sees. Noticing patterns is playing well; a bot that alerts instantly is what the churn and refresh limit blunt.

**Disconnecting has to cost something** (a proposal for Tape):
- If disconnecting were free, the dominant strategy is "disconnect everything every login", and the whole mechanic dies. So cutting a legit connection should break what it was doing (a data feed drops for a game day, a renter's license is refunded and they leave, an alliance share needs re-approval).
- **Lockdown** (disconnect all at once) is available as a panic button, but it pauses your own AIs for a few game hours and costs a fee.

**Limits** (Tape to set the numbers): maximum concurrent sessions per attacker and per victim model, a cooldown before the same attacker can re-plant on the same victim, and the rookie zone and protection window block planting entirely.
