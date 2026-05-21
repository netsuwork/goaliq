from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import os
import json
from predictor import predict_match

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"service": "GoalIQ Prediction Engine", "status": "running"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/predict")
async def predict(request: dict):
    try:
        result = predict_match(
            home_team=request.get("homeTeam", "Home"),
            away_team=request.get("awayTeam", "Away"),
            home_form=request.get("homeForm", ""),
            away_form=request.get("awayForm", ""),
            home_goals_avg=float(request.get("homeGoalsAvg", 1.5)),
            away_goals_avg=float(request.get("awayGoalsAvg", 1.2)),
            home_goals_conceded_avg=float(request.get("homeGoalsConcededAvg", 1.2)),
            away_goals_conceded_avg=float(request.get("awayGoalsConcededAvg", 1.5)),
            h2h_home_wins=int(request.get("h2hHomeWins", 0)),
            h2h_away_wins=int(request.get("h2hAwayWins", 0)),
            h2h_draws=int(request.get("h2hDraws", 0)),
        )
        return {"success": True, "prediction": result}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
