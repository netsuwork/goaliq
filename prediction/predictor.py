from math import exp, factorial, sqrt
from typing import Optional
import random

def parse_form(form: str) -> float:
    if not form:
        return 0.5
    chars = [c.upper() for c in form if c.upper() in ('W', 'D', 'L')]
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

def poisson_prob(lam: float, k: int) -> float:
    if lam <= 0:
        return 1.0 if k == 0 else 0.0
    return (exp(-lam) * (lam ** k)) / factorial(k)

def dixon_coles_probs(xg_home: float, xg_away: float) -> dict:
    max_goals = 7
    prob_home_win = 0.0
    prob_draw = 0.0
    prob_away_win = 0.0

    for home_goals in range(max_goals):
        for away_goals in range(max_goals):
            p = poisson_prob(xg_home, home_goals) * poisson_prob(xg_away, away_goals)
            if home_goals == 0 and away_goals == 0:
                p *= 1.1
            elif home_goals == 1 and away_goals == 1:
                p *= 1.05
            if home_goals > away_goals:
                prob_home_win += p
            elif home_goals == away_goals:
                prob_draw += p
            else:
                prob_away_win += p

    total = prob_home_win + prob_draw + prob_away_win
    if total == 0:
        return {'home': 33, 'draw': 33, 'away': 34}

    return {
        'home': round((prob_home_win / total) * 100),
        'draw': round((prob_draw / total) * 100),
        'away': round((prob_away_win / total) * 100),
    }

def calculate_btts(xg_home: float, xg_away: float) -> int:
    prob_home_scores = 1 - exp(-xg_home)
    prob_away_scores = 1 - exp(-xg_away)
    return round(prob_home_scores * prob_away_scores * 100)

def calculate_over25(xg_home: float, xg_away: float) -> int:
    prob_under = 0.0
    for h in range(3):
        for a in range(3 - h):
            prob_under += poisson_prob(xg_home, h) * poisson_prob(xg_away, a)
    return round((1 - prob_under) * 100)

def predict_scoreline(xg_home: float, xg_away: float) -> str:
    best_prob = 0
    best_score = "1-1"
    for h in range(6):
        for a in range(6):
            p = poisson_prob(xg_home, h) * poisson_prob(xg_away, a)
            if p > best_prob:
                best_prob = p
                best_score = f"{h}-{a}"
    return best_score

def calculate_confidence(home_form: float, away_form: float, prob_winner: float) -> int:
    form_diff = abs(home_form - away_form)
    base = 50 + (form_diff * 30) + ((prob_winner - 33) * 0.5)
    return round(min(95, max(45, base)))

def predict_match(
    home_team: str,
    away_team: str,
    home_form: str = "",
    away_form: str = "",
    home_goals_avg: float = 1.5,
    away_goals_avg: float = 1.2,
    home_goals_conceded_avg: float = 1.2,
    away_goals_conceded_avg: float = 1.5,
    h2h_home_wins: int = 0,
    h2h_away_wins: int = 0,
    h2h_draws: int = 0,
) -> dict:
    home_form_rating = parse_form(home_form)
    away_form_rating = parse_form(away_form)

    home_attack = (home_goals_avg + (1 / max(away_goals_conceded_avg, 0.5))) / 2
    away_attack = (away_goals_avg + (1 / max(home_goals_conceded_avg, 0.5))) / 2

    home_attack *= (0.7 + home_form_rating * 0.6)
    away_attack *= (0.7 + away_form_rating * 0.6)

    home_attack *= 1.15
    away_attack *= 0.92

    total_h2h = h2h_home_wins + h2h_away_wins + h2h_draws
    if total_h2h > 0:
        h2h_home_rate = h2h_home_wins / total_h2h
        h2h_away_rate = h2h_away_wins / total_h2h
        home_attack *= (0.9 + h2h_home_rate * 0.2)
        away_attack *= (0.9 + h2h_away_rate * 0.2)

    xg_home = round(max(0.3, min(4.0, home_attack)), 2)
    xg_away = round(max(0.3, min(4.0, away_attack)), 2)

    probs = dixon_coles_probs(xg_home, xg_away)

    total = probs['home'] + probs['draw'] + probs['away']
    if total != 100:
        probs['home'] += 100 - total

    if probs['home'] > probs['away'] and probs['home'] > probs['draw']:
        winner = 'home'
        winner_prob = probs['home']
    elif probs['away'] > probs['home'] and probs['away'] > probs['draw']:
        winner = 'away'
        winner_prob = probs['away']
    else:
        winner = 'draw'
        winner_prob = probs['draw']

    btts = calculate_btts(xg_home, xg_away)
    over25 = calculate_over25(xg_home, xg_away)
    scoreline = predict_scoreline(xg_home, xg_away)
    confidence = calculate_confidence(home_form_rating, away_form_rating, winner_prob)

    home_form_desc = "good" if home_form_rating > 0.6 else "poor" if home_form_rating < 0.35 else "mixed"
    away_form_desc = "good" if away_form_rating > 0.6 else "poor" if away_form_rating < 0.35 else "mixed"
    winner_name = home_team if winner == 'home' else away_team if winner == 'away' else 'Neither side'

    verdict = (
        f"{home_team} are in {home_form_desc} form while {away_team} have shown {away_form_desc} recent form. "
        f"Our Poisson model gives {home_team} a {probs['home']}% chance of winning with xG of {xg_home} vs {xg_away}. "
        f"{winner_name} are predicted to {'win' if winner != 'draw' else 'draw'} with {confidence}% model confidence."
    )

    return {
        "probHome": probs['home'],
        "probDraw": probs['draw'],
        "probAway": probs['away'],
        "winner": winner,
        "confidence": confidence,
        "xgHome": xg_home,
        "xgAway": xg_away,
        "btts": btts,
        "over25": over25,
        "scoreline": scoreline,
        "verdict": verdict,
        "model": "Poisson/Dixon-Coles v1.0",
        "inputs": {
            "homeForm": home_form,
            "awayForm": away_form,
            "homeFormRating": round(home_form_rating, 3),
            "awayFormRating": round(away_form_rating, 3),
            "homeGoalsAvg": home_goals_avg,
            "awayGoalsAvg": away_goals_avg,
        }
    }
