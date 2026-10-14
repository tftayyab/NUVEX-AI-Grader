"""
Thin wrapper around the Anthropic API for structured, tool-forced grading calls.

Using `tool_choice` to force a specific tool call guarantees the response is
valid JSON matching your schema -- no regex-parsing free text, no "please
respond in JSON" prompt hacks.
"""
import os
import time
import anthropic

# Model tiers -- pick based on stakes/cost tradeoff. See README for guidance.
MODEL_FAST = "claude-haiku-4-5-20251001"    # cheap first-pass / triage
MODEL_DEFAULT = "claude-sonnet-5"           # default grading model
MODEL_HIGH_STAKES = "claude-opus-5-5"       # borderline calls, disputes, finals


class GraderClient:
    def __init__(self, model: str = MODEL_DEFAULT, api_key: str = None, max_retries: int = 3):
        self.client = anthropic.Anthropic(api_key=api_key or os.environ.get("ANTHROPIC_API_KEY"))
        self.model = model
        self.max_retries = max_retries

    def call_with_tool(self, system: str, content_blocks: list, tool_schema: dict, max_tokens: int = 1500) -> dict:
        """
        Sends one message, forcing Claude to answer through `tool_schema`.
        Returns the tool's input dict directly (already-parsed JSON).
        """
        last_err = None
        for attempt in range(self.max_retries):
            try:
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=max_tokens,
                    system=system,
                    messages=[{"role": "user", "content": content_blocks}],
                    tools=[tool_schema],
                    tool_choice={"type": "tool", "name": tool_schema["name"]},
                )
                for block in response.content:
                    if block.type == "tool_use":
                        return block.input
                raise RuntimeError("No tool_use block in response")
            except Exception as e:
                last_err = e
                time.sleep(2 ** attempt)
        raise RuntimeError(f"Grading call failed after {self.max_retries} attempts: {last_err}")
