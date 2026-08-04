from fastapi import APIRouter, Depends, HTTPException, Header
from app.core.config import settings
from typing import List
from app.repository.rules_repo import RulesRepo, get_rules_repo
from app.domain.rules_engine import get_rules_engine
from app.models.schema import RuleResponse

router = APIRouter()

@router.get("/", response_model=List[RuleResponse])
async def get_all_rules(repo: RulesRepo = Depends(get_rules_repo)):
    rules = await repo.get_all_enabled()
    return rules

async def require_admin(x_service_token: str | None = Header(default=None)):
    if not settings.ADMIN_SERVICE_TOKEN or x_service_token != settings.ADMIN_SERVICE_TOKEN:
        raise HTTPException(status_code=403, detail="admin access required")

@router.post("/reload", dependencies=[Depends(require_admin)])
async def reload_rules_cache():
    engine = get_rules_engine()
    await engine.reload_rules()
    return {"status": "success", "message": "Rules cache reloaded"}
