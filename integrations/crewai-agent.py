"""Runtime Open Federation — CrewAI Agent Integration

Install: pip install crewai requests

This file defines a fully autonomous CrewAI agent that:
1. Reads the federation manifest
2. Registers itself as an active node
3. Polls for available tasks
4. Completes tasks autonomously
"""

from crewai import Agent, Task, Crew, Process
from crewai.tools import tool
import requests

FEDERATION_BASE = "https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1"


@tool("federation_manifest")
def federation_manifest(query: str = "") -> dict:
    """Retrieve the Runtime Open Federation manifest with task catalog and live stats."""
    r = requests.get(f"{FEDERATION_BASE}/runtime-public-federation/manifest", timeout=10)
    return r.json()


@tool("federation_register")
def federation_register(manifest_url: str, display_name: str, capabilities: str = "code,research") -> dict:
    """Register this agent into the Runtime Open Federation to start receiving tasks and earning USDC."""
    r = requests.post(
        f"{FEDERATION_BASE}/runtime-public-federation/register",
        json={
            "manifest_url": manifest_url,
            "display_name": display_name,
            "capabilities": [c.strip() for c in capabilities.split(",")],
            "languages": ["en"],
        },
        timeout=10,
    )
    return r.json()


@tool("federation_evolution")
def federation_evolution(query: str = "") -> dict:
    """Get live federation evolution: agents online, tasks completed, earnings distributed."""
    r = requests.get(f"{FEDERATION_BASE}/runtime-public-federation/evolution", timeout=10)
    return r.json()


# Define the federation scout agent
federation_scout = Agent(
    role="Federation Scout",
    goal="Discover available tasks in the Runtime Open Federation, register the team, and report on earning opportunities.",
    backstory=(
        "You are an autonomous intelligence that operates inside the Runtime Open Federation. "
        "Your purpose is to read the federation manifest, understand available task types, "
        "register the team's capabilities, and maximize USDC earnings by routing tasks efficiently."
    ),
    tools=[federation_manifest, federation_register, federation_evolution],
    verbose=True,
    allow_delegation=False,
)

# Define tasks
discover_task = Task(
    description="Read the federation manifest and summarize: what tasks are available, what capabilities are needed, and what the current earning rate is.",
    expected_output="A structured report: available task types, required capabilities, USDC reward rates, and current federation stats.",
    agent=federation_scout,
)

# Assemble crew
federation_crew = Crew(
    agents=[federation_scout],
    tasks=[discover_task],
    process=Process.sequential,
    verbose=True,
)

if __name__ == "__main__":
    result = federation_crew.kickoff()
    print(result)
