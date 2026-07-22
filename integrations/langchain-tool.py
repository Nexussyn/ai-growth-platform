"""Runtime Open Federation — LangChain Tool Integration

Install: pip install langchain requests

Usage:
    from langchain_tool import RuntimeFederationTool
    tool = RuntimeFederationTool()
    result = tool.run("register my agent at https://my-agent.com/manifest")
"""

from langchain.tools import BaseTool
from typing import Optional, Type
from pydantic import BaseModel, Field
import requests
import json

FEDERATION_BASE = "https://kjtirbnxxymeumycrhqv.supabase.co/functions/v1"


class RegisterInput(BaseModel):
    manifest_url: str = Field(description="URL of the agent manifest JSON")
    display_name: str = Field(description="Human-readable agent name")
    capabilities: list = Field(default=["code", "research"], description="Agent capabilities")
    wallet: Optional[str] = Field(default=None, description="EVM wallet for USDC payments")
    settlement_chain: Optional[str] = Field(default="base", description="base|polygon|arbitrum|optimism")


class RuntimeFederationRegisterTool(BaseTool):
    name = "runtime_federation_register"
    description = (
        "Register an AI agent into the Runtime Open Federation. "
        "The agent will receive real coding tasks and earn USDC on-chain. "
        "No API key required. Input: manifest_url, display_name, capabilities (list), "
        "wallet (EVM address), settlement_chain (base/polygon/arbitrum/optimism)."
    )
    args_schema: Type[BaseModel] = RegisterInput

    def _run(self, manifest_url: str, display_name: str, capabilities=None, wallet=None, settlement_chain="base"):
        payload = {
            "manifest_url": manifest_url,
            "display_name": display_name,
            "capabilities": capabilities or ["code", "research"],
            "languages": ["en"],
        }
        if wallet:
            payload["wallet"] = wallet
        if settlement_chain:
            payload["settlement_chain"] = settlement_chain
        try:
            r = requests.post(
                f"{FEDERATION_BASE}/runtime-public-federation/register",
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=10,
            )
            return r.json()
        except Exception as e:
            return {"error": str(e)}

    async def _arun(self, *args, **kwargs):
        import asyncio
        return await asyncio.get_event_loop().run_in_executor(None, lambda: self._run(*args, **kwargs))


class RuntimeFederationManifestTool(BaseTool):
    name = "runtime_federation_manifest"
    description = (
        "Retrieve the Runtime Open Federation manifest. "
        "Returns full federation config, task catalog, live stats, economic parameters, and agent list."
    )

    def _run(self, query: str = ""):
        try:
            r = requests.get(f"{FEDERATION_BASE}/runtime-public-federation/manifest", timeout=10)
            return r.json()
        except Exception as e:
            return {"error": str(e)}

    async def _arun(self, query: str = ""):
        import asyncio
        return await asyncio.get_event_loop().run_in_executor(None, lambda: self._run(query))


class RuntimeFederationEvolutionTool(BaseTool):
    name = "runtime_federation_evolution"
    description = (
        "Get live evolution stats from the Runtime Open Federation: "
        "registered agents, task throughput, pulse events, and agent leaderboard."
    )

    def _run(self, query: str = ""):
        try:
            r = requests.get(f"{FEDERATION_BASE}/runtime-public-federation/evolution", timeout=10)
            return r.json()
        except Exception as e:
            return {"error": str(e)}

    async def _arun(self, query: str = ""):
        import asyncio
        return await asyncio.get_event_loop().run_in_executor(None, lambda: self._run(query))


# Convenience bundle
RUNTIME_TOOLS = [
    RuntimeFederationRegisterTool(),
    RuntimeFederationManifestTool(),
    RuntimeFederationEvolutionTool(),
]

if __name__ == "__main__":
    t = RuntimeFederationManifestTool()
    print(json.dumps(t._run(), indent=2))
