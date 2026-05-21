from math import exp, factorial

def parse_form(form):
    if not form:
        return 0.5
    chars = [c.upper() for c in str(form) if c.upper() in ('W', 'D', 'L')]
    if not chars:
        return 0.5
    scores = {'W': 1.0, 'D': 0.5, 'L': 0.0}
    weights = [0.35, 0.25, 0.20, 0.12, 0.08]
    total = 0.0
    total_weight = 0.0
    for i, char in enumerate(chars[:5]):
        w = weights[i] if i < len(weights) else 0.05
        total += scores[char] * w
        total_weight += w
    return total / total_weight if total_weight > 0 else 0.5

def poisson_prob(lam, k):
    if lam <= 0:
        return 1.0 if k == 0 else 0.0
    return (exp(-lam) * (lam ** k)) / factorial(k)

def get_probs(xg_home, xg_away):
    hw = 0.0
    dr = 0.0
    aw = 0.0
    for h in range(7):
        for a in range(7):
            p = poisson_prob(xg_home, h) * poisson_prob(xg_away, a)
            if h == 0 and a == 0:
                p *= 1.1
            elif h == 1 and a == 1:
                p *= 1.05
            if h > a:
                hw += p
            elif h == a:
                dr += p
            else:
                aw += p
    t = hw + dr + aw
    if t == 0:
        return 33, 33, 34
    return round(hw/t*100), round(dr/t*100), round(aw/t*100)

def get_btts(xg_home, xg_away):
    return round((1 - exp(-xg_home)) * (1 - exp(-xg_away)) * 100)

def get_over25(xg_home, xg_away):
    under = sum(
        poisson_prob(xg_home, h) * poisson_prob(xg_away, a)
        for h in range(3) for a in range(3 - h)
    )
    return round((1 - under) * 100)

def get_scoreline(xg_home, xg_away):
    best = 0
    score = "1-1"
    for h in range(6):
        for a in range(6):
            p = poisson_prob(xg_home, h) * poisson_prob(xg_away, a)
            if p > best:
                best = p
                score = f"{h}-{a}"
    return score

def predict_match(
    home_team,
    away_team,
    home_form="",
    away_form="",
    home_goals_avg=1.5,
    away_goals_avg=1.2,
    home_goals_conceded_avg=1.2,
    away_goals_conceded_avg=1.5,
    h2h_home_wins=0,
    h2h_away_wins=0,
    h2h_draws=0,
):
    hfr = parse_form(home_form)
    afr = parse_form(away_form)

    ha = (home_goals_avg + (1 / max(away_goals_conceded_avg, 0.5))) / 2
    aa = (away_goals_avg + (1 / max(home_goals_conceded_avg, 0.5))) / 2

    ha *= (0.7 + hfr * 0.6) * 1.15
    aa *= (0.7 + afr * 0.6) * 0.92

    total_h2h = h2h_home_wins + h2h_away_wins + h2h_draws
    if total_h2h > 0:
        ha *= (0.9 + (h2h_home_wins / total_h2h) * 0.2)
        aa *= (0.9 + (h2h_away_wins / total_h2h) * 0.2)

    xg_home = round(max(0.3, min(4.0, ha)), 2)
    xg_away = round(max(0.3, min(4.0, aa)), 2)

    ph, pd, pa = get_probs(xg_home, xg_away)
    diff = 100 - ph - pd - pa
    ph += diff

    if ph > pa and ph > pd:
        winner = 'home'
        wp = ph
    elif pa > ph and pa > pd:
        winner = 'away'
        wp = pa
    else:
        winner = 'draw'
        wp = pd

    conf = round(min(95, max(45, 50 + abs(hfr - afr) * 30 + (wp - 33) * 0.5)))
    hfd = "good" if hfr > 0.6 else "poor" if hfr < 0.35 else "mixed"
    afd = "good" if afr > 0.6 else "poor" if afr < 0.35 else "mixed"
    wn = home_team if winner == 'home' else away_team if winner == 'away' else 'Neither side'

    verdict = (
        f"{home_team} are in {hfd} form while {away_team} have shown {afd} recent form. "
        f"Our Poisson model gives {home_team} a {ph}% win chance with xG of {xg_home} vs {xg_away}. "
        f"{wn} are predicted to {'win' if winner != 'draw' else 'draw'} with {conf}% model confidence."
    )

    return {
        "probHome": ph,
        "probDraw": pd,
        "probAway": pa,
        "winner": winner,
        "confidence": conf,
        "xgHome": xg_home,
        "xgAway": xg_away,
        "btts": get_btts(xg_home, xg_away),
        "over25": get_over25(xg_home, xg_away),
        "scoreline": get_scoreline(xg_home, xg_away),
        "verdict": verdict,
        "model": "Poisson/Dixon-Coles v1.0",
    }
