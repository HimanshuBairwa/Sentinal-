import asyncio
import asyncpg
import logging
from uuid import uuid4

logger = logging.getLogger(__name__)

# Database (raw asyncpg DSN)
DATABASE_URL = "postgresql://sentinel:sentinel_dev_secret@localhost:5432/sentinel"

RULES = [
    {
        "rule_id": "RULE_001",
        "name": "Impossible Travel",
        "expression": "geo_distance_from_last_login_km > 500 and hours_since_last_login < 2",
        "score_contribution": 95,
        "action": "BLOCK"
    },
    {
        "rule_id": "RULE_002",
        "name": "Velocity Breach - Failures",
        "expression": "v_login_failures_1m > 5",
        "score_contribution": 80,
        "action": "BLOCK"
    },
    {
        "rule_id": "RULE_003",
        "name": "TOR Exit Node",
        "expression": "ip_is_tor == 1",
        "score_contribution": 75,
        "action": "CHALLENGE"
    },
    {
        "rule_id": "RULE_004",
        "name": "New Device and New Country",
        "expression": "is_new_device == 1 and is_new_country == 1",
        "score_contribution": 60,
        "action": "CHALLENGE"
    },
    {
        "rule_id": "RULE_005",
        "name": "Off-Hours High Velocity",
        "expression": "is_off_hours == 1 and v_login_attempts_1h > 10",
        "score_contribution": 70,
        "action": "CHALLENGE"
    },
    {
        "rule_id": "RULE_006",
        "name": "Brute Force Attack",
        "expression": "v_login_failures_5m > 15",
        "score_contribution": 90,
        "action": "BLOCK"
    },
    {
        "rule_id": "RULE_007",
        "name": "Headless Browser",
        "expression": "is_headless_browser == 1",
        "score_contribution": 85,
        "action": "BLOCK"
    },
    {
        "rule_id": "RULE_008",
        "name": "Bot User Agent",
        "expression": "is_bot_user_agent == 1",
        "score_contribution": 85,
        "action": "BLOCK"
    },
    {
        "rule_id": "RULE_009",
        "name": "Datacenter IP New Device",
        "expression": "ip_is_datacenter == 1 and is_new_device == 1",
        "score_contribution": 55,
        "action": "CHALLENGE"
    },
    {
        "rule_id": "RULE_010",
        "name": "Repeated Lockouts",
        "expression": "locked_count_30d > 3",
        "score_contribution": 65,
        "action": "REVIEW"
    },
    {
        "rule_id": "RULE_011",
        "name": "VPN New Country",
        "expression": "ip_is_vpn == 1 and is_new_country == 1",
        "score_contribution": 65,
        "action": "CHALLENGE"
    },
    {
        "rule_id": "RULE_012",
        "name": "Multiple IPs One Hour",
        "expression": "v_unique_ips_1h > 5",
        "score_contribution": 70,
        "action": "CHALLENGE"
    },
    {
        "rule_id": "RULE_013",
        "name": "Excessive Sessions",
        "expression": "active_sessions_count > 5",
        "score_contribution": 40,
        "action": "REVIEW"
    },
    {
        "rule_id": "RULE_014",
        "name": "Extreme Velocity",
        "expression": "v_login_attempts_1m > 10",
        "score_contribution": 90,
        "action": "BLOCK"
    },
    {
        "rule_id": "RULE_015",
        "name": "New Device Off Hours",
        "expression": "is_new_device == 1 and is_off_hours == 1 and is_new_ip == 1",
        "score_contribution": 65,
        "action": "CHALLENGE"
    },
    {
        "rule_id": "RULE_016",
        "name": "High Failed Login Total",
        "expression": "total_failed_login_count > 50",
        "score_contribution": 45,
        "action": "REVIEW"
    },
    {
        "rule_id": "RULE_017",
        "name": "Unusual Login Hour",
        "expression": "login_hour_z_score > 3",
        "score_contribution": 40,
        "action": "REVIEW"
    },
    {
        "rule_id": "RULE_018",
        "name": "No Email Verification",
        "expression": "email_verified == 0 and account_age_days > 7",
        "score_contribution": 25,
        "action": "FLAG"
    },
    {
        "rule_id": "RULE_019",
        "name": "Weekend Off Hours New IP",
        "expression": "is_weekend == 1 and is_off_hours == 1 and is_new_ip == 1",
        "score_contribution": 45,
        "action": "REVIEW"
    },
    {
        "rule_id": "RULE_020",
        "name": "VPN Brute Force",
        "expression": "ip_is_vpn == 1 and v_login_failures_5m > 3",
        "score_contribution": 80,
        "action": "BLOCK"
    },
    {
        "rule_id": "RULE_021",
        "name": "Extreme Distance",
        "expression": "geo_distance_from_last_login_km > 1000 and hours_since_last_login < 6",
        "score_contribution": 95,
        "action": "BLOCK"
    },
    {
        "rule_id": "RULE_022",
        "name": "New Country High Risk",
        "expression": "is_new_country == 1 and country_risk_score > 60",
        "score_contribution": 55,
        "action": "CHALLENGE"
    },
    {
        "rule_id": "RULE_023",
        "name": "Proxy High Velocity",
        "expression": "ip_is_proxy == 1 and v_login_attempts_5m > 5",
        "score_contribution": 75,
        "action": "BLOCK"
    },
    {
        "rule_id": "RULE_024",
        "name": "New Account Suspicious",
        "expression": "account_age_days < 1 and v_login_attempts_1h > 3",
        "score_contribution": 50,
        "action": "REVIEW"
    },
    {
        "rule_id": "RULE_025",
        "name": "Mobile Datacenter",
        "expression": "is_mobile == 1 and ip_is_datacenter == 1",
        "score_contribution": 60,
        "action": "CHALLENGE"
    }
]

async def seed():
    print(f"Connecting to {DATABASE_URL}...")
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        for r in RULES:
            # Upsert logic based on rule_id
            exists = await conn.fetchval("SELECT id FROM fraud_rules WHERE rule_id = $1", r["rule_id"])
            if exists:
                print(f"Updating {r['rule_id']}...")
                await conn.execute("""
                    UPDATE fraud_rules
                    SET name=$2, expression=$3, score_contribution=$4, action=$5
                    WHERE rule_id=$1
                """, r["rule_id"], r["name"], r["expression"], r["score_contribution"], r["action"])
            else:
                print(f"Inserting {r['rule_id']}...")
                await conn.execute("""
                    INSERT INTO fraud_rules (id, rule_id, name, description, expression, score_contribution, action, is_enabled, priority)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                """, str(uuid4()), r["rule_id"], r["name"], "Autogenerated rule", r["expression"], r["score_contribution"], r["action"], True, 50)
        
        print("Successfully seeded all 25 rules!")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(seed())
