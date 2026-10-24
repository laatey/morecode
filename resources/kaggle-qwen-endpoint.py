# Kaggle notebook source: Qwen2.5-Coder-14B -> a temporary MoreCode endpoint.
#
# How to use this file:
# 1. Create a Kaggle Notebook, turn Internet and an accelerator on, then paste this entire file
#    into one code cell and run it.
# 2. Wait for "MORECODE_ENDPOINT" and "MORECODE_TOKEN" to print.
# 3. In MoreCode: Settings > Models > choose "Qwen Coder 14B (Kaggle)" > Connect notebook.
#
# This is for one person's temporary development session, not a hosted service. The endpoint
# stops itself after IDLE_MINUTES without a request. Kaggle cannot be started remotely by MoreCode.

import asyncio
import json
import os
import re
import secrets
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any


MODEL_REPO = "Qwen/Qwen2.5-Coder-14B-Instruct-GGUF"
MODEL_FILE = "qwen2.5-coder-14b-instruct-q4_k_m.gguf"
PORT = 8000
IDLE_MINUTES = 20
CONTEXT_TOKENS = 8192


def install() -> None:
    # Kaggle sessions are disposable, so install the small server dependencies in the notebook.
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "fastapi", "uvicorn", "huggingface_hub"])
    env = os.environ | {"CMAKE_ARGS": "-DGGML_CUDA=on", "FORCE_CMAKE": "1"}
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "-q", "--no-binary", "llama-cpp-python", "llama-cpp-python"], env=env
    )


install()

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from huggingface_hub import snapshot_download
from llama_cpp import Llama


# The official Q4 model is shipped as one or more GGUF parts. llama.cpp accepts the first
# part and loads its siblings automatically, so download every matching part rather than
# assuming a single 9 GB file exists.
MODEL_DIR = snapshot_download(repo_id=MODEL_REPO, allow_patterns=f"*{MODEL_FILE.replace('.gguf', '')}*.gguf")
MODEL_PARTS = sorted(Path(MODEL_DIR).glob(f"*{MODEL_FILE.replace('.gguf', '')}*.gguf"))
if not MODEL_PARTS:
    raise RuntimeError("Could not download the Q4_K_M model files from Hugging Face.")
MODEL_PATH = str(MODEL_PARTS[0])
MODEL = Llama(
    model_path=MODEL_PATH,
    n_ctx=CONTEXT_TOKENS,
    n_gpu_layers=-1,
    n_threads=4,
    verbose=False,
)
TOKEN = secrets.token_urlsafe(32)
LAST_REQUEST = time.monotonic()
APP = FastAPI(docs_url=None, redoc_url=None)


def text_part(content: Any) -> str:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    out: list[str] = []
    for item in content:
        if not isinstance(item, dict):
            continue
        if item.get("type") == "text":
            out.append(str(item.get("text", "")))
        elif item.get("type") == "tool_result":
            out.append(f"<tool_response>\n{item.get('content', '')}\n</tool_response>")
    return "\n".join(out)


def qwen_prompt(body: dict[str, Any]) -> str:
    system = body.get("system", "")
    if isinstance(system, list):
        system = "\n".join(str(p.get("text", "")) for p in system if isinstance(p, dict))
    tools = body.get("tools", [])
    tool_notes = ""
    if tools:
        tool_notes = (
            "\n\n# Tools\nYou may call one or more functions. The definitions are:\n<tools>\n"
            + "\n".join(json.dumps({"name": t.get("name"), "description": t.get("description"), "parameters": t.get("input_schema")}) for t in tools)
            + "\n</tools>\nTo call a tool, return exactly:\n<tool_call>\n{\"name\": \"tool name\", \"arguments\": {}}\n</tool_call>"
        )
    pieces = [f"<|im_start|>system\n{system}{tool_notes}<|im_end|>"]
    for message in body.get("messages", []):
        role = message.get("role", "user")
        content = message.get("content", "")
        if role == "assistant" and isinstance(content, list):
            rendered: list[str] = []
            for block in content:
                if block.get("type") == "text":
                    rendered.append(str(block.get("text", "")))
                elif block.get("type") == "tool_use":
                    rendered.append("<tool_call>\n" + json.dumps({"name": block.get("name"), "arguments": block.get("input", {})}) + "\n</tool_call>")
            content = "\n".join(rendered)
        else:
            content = text_part(content)
        pieces.append(f"<|im_start|>{role}\n{content}<|im_end|>")
    pieces.append("<|im_start|>assistant\n")
    return "\n".join(pieces)


def generate(body: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    raw = MODEL(
        qwen_prompt(body),
        max_tokens=min(int(body.get("max_tokens", 2048)), 3072),
        temperature=0.15,
        top_p=0.9,
        stop=["<|im_end|>", "<|im_start|>"],
    )["choices"][0]["text"].strip()
    calls: list[dict[str, Any]] = []
    for i, match in enumerate(re.finditer(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", raw, re.S)):
        try:
            call = json.loads(match.group(1))
            if isinstance(call.get("name"), str) and isinstance(call.get("arguments"), dict):
                calls.append({"id": f"toolu_kaggle_{i}_{secrets.token_hex(4)}", "name": call["name"], "input": call["arguments"]})
        except json.JSONDecodeError:
            pass
    visible = re.sub(r"<tool_call>\s*\{.*?\}\s*</tool_call>", "", raw, flags=re.S).strip()
    return visible, calls


def sse(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


def anthopic_events(body: dict[str, Any]):
    text, calls = generate(body)
    yield sse("message_start", {"type": "message_start", "message": {"usage": {"input_tokens": 0, "output_tokens": 0}}})
    index = 0
    if text:
        yield sse("content_block_start", {"type": "content_block_start", "index": index, "content_block": {"type": "text", "text": ""}})
        yield sse("content_block_delta", {"type": "content_block_delta", "index": index, "delta": {"type": "text_delta", "text": text}})
        yield sse("content_block_stop", {"type": "content_block_stop", "index": index})
        index += 1
    for call in calls:
        yield sse("content_block_start", {"type": "content_block_start", "index": index, "content_block": {"type": "tool_use", "id": call["id"], "name": call["name"]}})
        yield sse("content_block_delta", {"type": "content_block_delta", "index": index, "delta": {"type": "input_json_delta", "partial_json": json.dumps(call["input"])}})
        yield sse("content_block_stop", {"type": "content_block_stop", "index": index})
        index += 1
    yield sse("message_delta", {"type": "message_delta", "delta": {"stop_reason": "tool_use" if calls else "end_turn"}, "usage": {"output_tokens": 0}})
    yield sse("message_stop", {"type": "message_stop"})


def authorised(key: str | None) -> None:
    if not key or not secrets.compare_digest(key, TOKEN):
        raise HTTPException(status_code=401, detail="Invalid endpoint token")


@APP.get("/health")
def health(x_api_key: str | None = Header(default=None)) -> dict[str, bool]:
    authorised(x_api_key)
    return {"ok": True}


@APP.post("/v1/messages")
async def messages(request: Request, x_api_key: str | None = Header(default=None)):
    global LAST_REQUEST
    authorised(x_api_key)
    LAST_REQUEST = time.monotonic()
    body = await request.json()
    if not isinstance(body, dict):
        return JSONResponse({"error": {"message": "JSON body required"}}, status_code=400)
    # MoreCode expects Anthropic SSE. Generation happens first, then is emitted in valid SSE frames.
    return StreamingResponse(anthopic_events(body), media_type="text/event-stream", headers={"cache-control": "no-cache"})


def stop_when_idle() -> None:
    while True:
        time.sleep(30)
        if time.monotonic() - LAST_REQUEST > IDLE_MINUTES * 60:
            print(f"Idle for {IDLE_MINUTES} minutes. Stopping the notebook endpoint.", flush=True)
            os._exit(0)


threading.Thread(target=stop_when_idle, daemon=True).start()
threading.Thread(target=lambda: __import__("uvicorn").run(APP, host="127.0.0.1", port=PORT, log_level="warning"), daemon=True).start()

# Cloudflare Quick Tunnel makes a random HTTPS URL for this one notebook session. It is still
# protected by TOKEN; never post either value publicly. A new notebook run creates both anew.
subprocess.check_call(["bash", "-lc", "wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O /tmp/cloudflared && chmod +x /tmp/cloudflared"])
tunnel = subprocess.Popen(["/tmp/cloudflared", "tunnel", "--url", f"http://127.0.0.1:{PORT}"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
endpoint = None
for line in iter(tunnel.stdout.readline, ""):
    found = re.search(r"https://[-a-z0-9]+\.trycloudflare\.com", line)
    if found:
        endpoint = found.group(0)
        break
if not endpoint:
    raise RuntimeError("Cloudflare tunnel did not start. Run the last two cells again.")

print("\nMORECODE_ENDPOINT=" + endpoint)
print("MORECODE_TOKEN=" + TOKEN)
print("Keep this notebook tab open while using MoreCode. It will stop after 20 minutes with no request.")
