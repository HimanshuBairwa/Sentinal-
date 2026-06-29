from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.repository.rules_repo import RulesRepo, get_rules_repo
from app.domain.rules_engine import get_rules_engine
from app.models.schema import RuleResponse

router = APIRouter()

@router.get("/", response_model=List[RuleResponse])
async def get_all_rules(repo: RulesRepo = Depends(get_rules_repo)):
    rules = await repo.get_all_enabled()
    return rules

@router.post("/reload")
async def reload_rules_cache():
    engine = get_rules_engine()
    await engine.reload_rules()
    return {"status": "success", "message": "Rules cache reloaded"}
