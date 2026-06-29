from pydantic import BaseModel, Field
from datetime import datetime
from typing import Dict, List, Optional

class GeoInfo(BaseModel):
    country_code: str = "XX"
    country_name: str = "Unknown"
    region: str = ""
    city: str = ""
    lat: float = 0.0
    lon: float = 0.0
    timezone: str = ""
    asn: str = ""
    isp: str = ""

class DeviceInfo(BaseModel):
    fingerprint: str = ""
    browser: str = ""
    browser_version: str = ""
    os: str = ""
    os_version: str = ""
    is_mobile: bool = False
    is_headless: bool = False
    screen_resolution: str = ""
    language: str = ""

class ScoreRequest(BaseModel):
    event_id: str
    event_type: str
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    request_id: str
    ip_address: str
    user_agent: str = ""
    geo: GeoInfo = Field(default_factory=GeoInfo)
    device: DeviceInfo = Field(default_factory=DeviceInfo)
    metadata: Dict = Field(default_factory=dict)

class ShapContribution(BaseModel):
    feature: str
    contribution: float

class ScoreResponse(BaseModel):
    decision_id: str
    request_id: str
    score: float                    # 0.0 to 100.0
    action: str                     # ALLOW, REVIEW, CHALLENGE, BLOCK
    processing_time_ms: float
    triggered_rules: List[str]
    shap_top5: Optional[List[ShapContribution]] = None
    scores: Dict[str, float]        # rules, ml, ip, velocity breakdown

class RuleCreate(BaseModel):
    rule_id: str
    name: str
    description: str = ""
    expression: str
    score_contribution: int         # 0-100
    action: str                     # BLOCK, CHALLENGE, REVIEW, FLAG
    is_enabled: bool = True
    priority: int = 50

class RuleResponse(BaseModel):
    id: str
    rule_id: str
    name: str
    description: str
    expression: str
    score_contribution: int
    action: str
    is_enabled: bool
    priority: int
    hit_count: int
    last_triggered_at: Optional[datetime]
    created_at: datetime

class DecisionExplanation(BaseModel):
    decision_id: str
    score: float
    action: str
    shap_top5: List[ShapContribution]
    triggered_rules: List[str]
    scores: Dict[str, float]
    created_at: datetime
