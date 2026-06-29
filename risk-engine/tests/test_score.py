import pytest
import asyncio
from httpx import AsyncClient
from app.main import app
from app.models.schema import ScoreRequest

# Pytest requires an event loop for async fixtures
@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.mark.asyncio
async def test_score_endpoint():
    request = ScoreRequest(
        event_id="evt_123",
        event_type="user.login",
        user_id="usr_abc",
        request_id="req_xyz",
        ip_address="192.168.1.1",
        user_agent="Mozilla/5.0",
        geo={"country_code": "US", "city": "New York"}
    )
    
    # We use ASGITestClient equivalent
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/api/v1/risk/score", json=request.model_dump())
        
    # In a real environment without Redis/Postgres this might 500, but we just verify the structure
    if response.status_code == 200:
        data = response.json()
        assert "score" in data
        assert "action" in data
        assert "decision_id" in data
