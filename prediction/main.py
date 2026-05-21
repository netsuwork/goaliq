from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn
import os
from predictor import predict_match

app = FastAPI(title="GoalIQ Prediction Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class MatchRequest(BaseModel):
    homeTeam: str
    awayTeam: str
    leagueName: Optional[str] = "Premier League"
    homeForm: Optional[str] = ""
    awayForm: Optional[str] = ""
    homeGoalsAvg: Optional[float] = 1.5
    awayGoalsAvg: Optional[float] = 1.2
    homeGoalsConcededAvg: Optional[float] = 1.2
    awayGoalsConcededAvg: Optional[float] = 1.5
    h2hHomeWins: Optional[int] = 0
    h2hAwayWins: Optional[int] = 0
    h2hDraws: Optional[int] = 0

@app.get("/")
def root():
    return {"service": "GoalIQ Prediction Engine", "status": "running"}

@app.get("/health")
def health():
    return {"status": "ok", "model": "ready"}

@app.post("/predict")
def predict(req: MatchRequest):
    try:
        result = predict_match(
            home_team=req.homeTeam,
            away_team=req.awayTeam,
            home_form=req.homeForm or "",
            away_form=req.awayForm or "",
            home_goals_avg=req.homeGoalsAvg or 1.5,
            away_goals_avg=req.awayGoalsAvg or 1.2,
            home_goals_conceded_avg=req.homeGoalsConcededAvg or 1.2,
            away_goals_conceded_avg=req.awayGoalsConcededAvg or 1.5,
            h2h_home_wins=req.h2hHomeWins or 0,
            h2h_away_wins=req.h2hAwayWins or 0,
            h2h_draws=req.h2hDraws or 0,
        )
        return {"success": True, "prediction": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
