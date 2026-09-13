import os
import json
import pickle
from datetime import datetime
from BACKEND.emails.email_sender import send,broadcast

CACHE_FILE = "newsletter_cache.toshare"

# ---------------------------------------------------------------------------
# Task 1: Database Analytics Queries
# ---------------------------------------------------------------------------
def fetch_project_analytics(cursor) -> dict:
    """
    Queries `projects` and `master` tables for:
    - Overall risk distribution histogram
    - Average risks grouped by department and state
    - Key metrics (progress, budgets, overruns)
    """
    # a. Histogramical status of projects as per overall_risk
    cursor.execute("""
        SELECT 
            CASE 
                WHEN overall_risk < 0.3 THEN 'Low Risk (< 0.3)'
                WHEN overall_risk >= 0.3 AND overall_risk < 0.7 THEN 'Medium Risk (0.3 - 0.7)'
                ELSE 'High Risk (>= 0.7)'
            END AS risk_category,
            COUNT(*) AS project_count
        FROM projects
        GROUP BY risk_category
    """)
    risk_histogram = cursor.fetchall()

    # b. Average risks based on departments and states
    cursor.execute("""
        SELECT 
            m.department,
            m.state,
            ROUND(AVG(p.overall_risk), 3) AS avg_overall_risk,
            ROUND(AVG(p.time_risk), 3) AS avg_time_risk,
            ROUND(AVG(p.cost_risk), 3) AS avg_cost_risk,
            COUNT(DISTINCT p.code) AS total_projects
        FROM projects p
        JOIN master m ON p.code = m.code
        GROUP BY m.department, m.state
    """)
    dept_state_risks = cursor.fetchall()

    # c. Overall summary and financial info
    cursor.execute("""
        SELECT 
            COUNT(*) AS total_projects,
            ROUND(AVG(progress), 2) AS avg_progress_pct,
            ROUND(SUM(cspend), 2) AS total_spent_cr,
            ROUND(SUM(project_budget), 2) AS total_budget_cr,
            ROUND(SUM(cspend) - SUM(project_budget), 2) AS net_cost_variance_cr
        FROM projects
    """)
    overall_info = cursor.fetchone()

    return {
        "overall_summary": overall_info,
        "risk_histogram": risk_histogram,
        "department_state_risks": dept_state_risks
    }


# ---------------------------------------------------------------------------
# Tasks 2 & 3: LLM Prompting & Schema Formatting
# ---------------------------------------------------------------------------
def generate_llm_newsletter(analytics_data: dict,call_llm) -> list:
    """
    Formats DB metrics into a prompt, invokes call_llm(), 
    and returns parsed JSON schema: [{heading: content}, ...]
    """
    prompt = f"""
    You are an AI analyst for the Kab Tak Project Monitoring System (Ministry of Statistics and Programme Implementation).
    Analyze the following database analytics JSON:

    {json.dumps(analytics_data, indent=2, default=str)}

    Generate a comprehensive executive newsletter breakdown covering key risks, top-performing/underperforming states & departments, and recommendations.

    CRITICAL INSTRUCTION:
    Return ONLY a JSON array of single-key dictionaries matching this exact schema:
    [
      {{"Executive Risk Summary": "Detailed insights here..."}},
      {{"Overall Risk Distribution": "Detailed insights here..."}},
      {{"Department & State Risk Analysis": "Detailed insights here..."}},
      {{"Actionable Recommendations": "Detailed insights here..."}}
    ]

    Do NOT wrap response in markdown standard text outside the JSON array.
    """

    # call_llm() is provided in environment execution context
    raw_response = call_llm(prompt)

    # Clean potential markdown wrapping (e.g., ```json ... ```)
    cleaned = raw_response.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    cleaned = cleaned.strip()

    return json.loads(cleaned)


# ---------------------------------------------------------------------------
# Tasks 4, 5 & 6: Cache Validation, Auto-Refresh & Monthly Broadcast
# ---------------------------------------------------------------------------
def is_cache_expired(filepath: str) -> bool:
    """Returns True if file does not exist or was created in a previous month/year."""
    if not os.path.exists(filepath):
        return True
    
    file_mtime = os.path.getmtime(filepath)
    file_date = datetime.fromtimestamp(file_mtime)
    current_date = datetime.now()

    return (file_date.year, file_date.month) != (current_date.year, current_date.month)


def process_monthly_newsletter(cursor,call_llm) -> list:
    """
    Checks cache date. If missing or from a previous month:
    1. Re-queries DB
    2. Calls LLM & validates schema
    3. Serializes result to .toshare pickle file
    4. Broadcasts email to all subscribers via BCC
    """
    if is_cache_expired(CACHE_FILE):
        print("🔄 Cache stale or missing. Re-querying database and generating new report...")
        
        # 1. Fetch metrics & generate LLM newsletter content
        analytics = fetch_project_analytics(cursor)
        newsletter_json = generate_llm_newsletter(analytics,call_llm=call_llm)

        # 2. Save/Dump into .toshare pickle file
        with open(CACHE_FILE, "wb") as f:
            pickle.dump(newsletter_json, f)
        print(f"💾 Dumped new report to '{CACHE_FILE}'")

        # 3. Broadcast to subscribers
        broadcast(
            subject="Kab Tak | Monthly Project Intelligence & Risk Report",
            content_json=newsletter_json,
            cursor=cursor
        )
        return newsletter_json
    else:
        print("⚡ Cache valid for current month. Loading from .toshare...")
        with open(CACHE_FILE, "rb") as f:
            return pickle.load(f)


# ---------------------------------------------------------------------------
# Task 7: Onboarding New Subscribers
# ---------------------------------------------------------------------------
def forward_latest_newsletter_to_new_user(email: str, cursor,call_llm):
    """
    Ensures cached dataset is active, loads cached .toshare data,
    and emails it directly to a newly registered user.
    """
    # Ensure monthly cache is up to date
    newsletter_json = process_monthly_newsletter(cursor,call_llm=call_llm)

    # Send directly to the new subscriber
    send(
        recipient=email,
        subject="Welcome to Kab Tak | Latest Project Intelligence Report",
        content_json=newsletter_json
    )