from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from py_expression_eval import Parser
from app.core.config import settings
from typing import List, Optional
from app.repository.rules_repo import RulesRepo, get_rules_repo
from app.domain.rules_engine import get_rules_engine
from app.models.schema import RuleResponse, RuleCreate, RuleUpdate
from app.metrics.metrics import RULE_HITS, RULES_EVALUATED

import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Security model
# ---------------------------------------------------------------------------
# The gateway verifies the JWT and forwards the *verified* role claim in
# X-User-Role (it strips any client-supplied value first). Service-to-service
# callers can present the ADMIN_SERVICE_TOKEN instead. Mutations require
# admin; reads are available to any authenticated user (operators need to
# see rules; only admins change them).


async def require_admin(request: Request, x_service_token: Optional[str] = Header(default=None)):
    """Admin RBAC: gateway-verified role claim OR service token."""
    if settings.ADMIN_SERVICE_TOKEN and x_service_token == settings.ADMIN_SERVICE_TOKEN:
        return "service"
    role = request.headers.get("X-User-Role", "")
    if role == "admin":
        return "admin"
    raise HTTPException(status_code=403, detail="admin role required")


def validate_expression(expression: str) -> None:
    """Reject expressions that don't compile against the safe AST parser.

    Also bounds length and blocks field-less constant expressions (they can
    never match anything and usually indicate a typo'd feature name).
    """
    if not expression or len(expression) > 512:
        raise HTTPException(status_code=422, detail="expression must be 1-512 characters")
    try:
        ast = Parser().parse(expression)
        variables = set(ast.variables())
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"expression does not compile: {exc}",
        )
    from app.domain.features import Features
    known = set(Features.FEATURE_NAMES)
    unknown = variables - known
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=f"unknown feature(s): {', '.join(sorted(unknown))}. See /api/v1/rules/features",
        )
    if not variables:
        raise HTTPException(status_code=422, detail="expression must reference at least one feature")


# ---------------------------------------------------------------------------
# Read endpoints
# ---------------------------------------------------------------------------

@router.get("/", response_model=List[RuleResponse])
async def get_all_rules(
    repo: RulesRepo = Depends(get_rules_repo),
):
    """List every rule (enabled AND disabled) for management."""
    rules = await repo.get_all()
    return rules


@router.get("/features", response_model=List[str])
async def list_features():
    """The feature vocabulary rules may reference — the rules-authoring contract."""
    from app.domain.features import Features
    return Features.FEATURE_NAMES


# ---------------------------------------------------------------------------
# Mutations (admin only)
# ---------------------------------------------------------------------------

@router.post("/", response_model=RuleResponse, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_admin)])
async def create_rule(
    rule: RuleCreate,
    repo: RulesRepo = Depends(get_rules_repo),
):
    validate_expression(rule.expression)
    try:
        created = await repo.create(rule)
    except Exception as exc:
        detail = str(exc)
        if "unique" in detail.lower() or "duplicate" in detail.lower():
            raise HTTPException(status_code=409, detail="rule_id already exists")
        raise HTTPException(status_code=500, detail="failed to create rule")
    await get_rules_engine().reload_rules()
    return created


@router.put("/{rule_id}", response_model=RuleResponse,
            dependencies=[Depends(require_admin)])
async def update_rule(
    rule_id: str,
    rule: RuleUpdate,
    repo: RulesRepo = Depends(get_rules_repo),
):
    validate_expression(rule.expression)
    updated = await repo.update_by_rule_id(rule_id, rule)
    if updated is None:
        raise HTTPException(status_code=404, detail="rule not found")
    await get_rules_engine().reload_rules()
    return updated


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_admin)])
async def delete_rule(
    rule_id: str,
    repo: RulesRepo = Depends(get_rules_repo),
):
    deleted = await repo.delete_by_rule_id(rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="rule not found")
    await get_rules_engine().reload_rules()


@router.post("/reload", dependencies=[Depends(require_admin)])
async def reload_rules_cache():
    """Force a hot-reload of the compiled rules cache from Postgres."""
    engine = get_rules_engine()
    await engine.reload_rules()
    return {"status": "success", "message": f"Rules cache reloaded: {engine.rule_count()} rules active"}
