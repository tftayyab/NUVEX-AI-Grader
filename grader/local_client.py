"""
FREE alternative to grader/client.py -- runs models on your own machine via
Ollama (https://ollama.com) instead of calling the paid Anthropic API.

No API key, no bill, ever. The tradeoffs:
- Noticeably weaker judgment than Claude, especially on the CAD image reviews.
- Slower, especially without a GPU -- grading 90+ teams could take hours on a
  plain laptop CPU.
- You need a reasonably capable machine: 16GB+ RAM is a comfortable minimum
  for the model sizes below; a GPU (even a modest one) speeds this up a lot.

Setup:
    1. Install Ollama: https://ollama.com/download
    2. In a terminal:
         ollama pull llama3.1:8b        # for text answers
         ollama pull llama3.2-vision    # for CAD image review
    3. pip install ollama
    4. python run_grading.py --provider local

Same interface as grader.client.GraderClient (call_with_tool), so
text_grader.py and cad_grader.py don't need to know or care which one
they're talking to.
"""
import json
import ollama

DEFAULT_TEXT_MODEL = "llama3.1:8b"
DEFAULT_VISION_MODEL = "llama3.2-vision"


class LocalGraderClient:
    def __init__(self, text_model: str = DEFAULT_TEXT_MODEL, vision_model: str = DEFAULT_VISION_MODEL):
        self.text_model = text_model
        self.vision_model = vision_model

    def call_with_tool(self, system: str, content_blocks: list, tool_schema: dict, max_tokens: int = 1500) -> dict:
        text_parts, images = [], []
        for block in content_blocks:
            if block["type"] == "text":
                text_parts.append(block["text"])
            elif block["type"] == "image":
                images.append(block["source"]["data"])  # base64 string -- ollama accepts this directly

        model = self.vision_model if images else self.text_model
        user_message = {"role": "user", "content": "\n".join(text_parts)}
        if images:
            user_message["images"] = images

        response = ollama.chat(
            model=model,
            messages=[{"role": "system", "content": system}, user_message],
            format=tool_schema["input_schema"],  # constrains output to match our JSON schema
            options={"temperature": 0, "num_predict": max_tokens},
        )
        return json.loads(response["message"]["content"])
