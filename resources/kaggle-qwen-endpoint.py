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
import socket
import subprocess
import sys
import threading
import time
from typing import Any


# This is the same Qwen model in an already-quantized 4-bit Transformers format. Downloading
# pre-quantized weights avoids compiling llama.cpp, which Kaggle's Python 3.13 image rejects.
MODEL_REPO = "unsloth/Qwen2.5-Coder-14B-Instruct-bnb-4bit"
PORT = 8000
IDLE_MINUTES = 20


def install() -> None:
    # Kaggle already includes PyTorch, FastAPI, Transformers and Accelerate. Do not upgrade the
    # shared notebook environment: doing so can break Kaggle's Gradio and telemetry packages.
    # bitsandbytes is the only extra runtime this notebook needs.
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "--no-deps", "bitsandbytes"])


install()

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, TextIteratorStreamer


if not torch.cuda.is_available():
    raise RuntimeError("Enable a GPU accelerator in Kaggle before running this notebook.")
TOKENIZER = AutoTokenizer.from_pretrained(MODEL_REPO)
MODEL = AutoModelForCausalLM.from_pretrained(
    MODEL_REPO,
    device_map="auto",
    torch_dtype=torch.float16,
    # Kaggle may provide a P100, which supports FP16 but not BF16.
    quantization_config=BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True,
    ),
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
            + "\n</tools>\nWhen you need a tool, do not explain what you are about to do. Return exactly one or more <tool_call> blocks and nothing else. Never use Markdown fences or a JSON code block.\n<tool_call>\n{\"name\": \"tool name\", \"arguments\": {}}\n</tool_call>"
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


def model_chunks(body: dict[str, Any]):
    inputs = TOKENIZER(qwen_prompt(body), return_tensors="pt").to(MODEL.device)
    streamer = TextIteratorStreamer(TOKENIZER, skip_prompt=True, skip_special_tokens=True)
    kwargs = {
        **inputs,
        "max_new_tokens": min(int(body.get("max_tokens", 2048)), 3072),
        "do_sample": True,
        "temperature": 0.15,
        "top_p": 0.9,
        "pad_token_id": TOKENIZER.eos_token_id,
        "eos_token_id": TOKENIZER.eos_token_id,
        "use_cache": True,
        "streamer": streamer,
    }
    def run_generation() -> None:
        with torch.inference_mode():
            MODEL.generate(**kwargs)

    worker = threading.Thread(target=run_generation, daemon=True)
    worker.start()
    yield from streamer
    worker.join()


def parse_calls(raw: str, tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    allowed = {str(tool.get("name")) for tool in tools}
    calls: list[dict[str, Any]] = []
    candidates = re.findall(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", raw, re.S)
    # Qwen sometimes wraps a valid call in a Markdown JSON fence despite being instructed not to.
    # Accept that one harmless variant rather than rendering a shell command as chat text.
    candidates += re.findall(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.S)
    for i, candidate in enumerate(candidates):
        try:
            call = json.loads(candidate)
            if isinstance(call.get("name"), str) and call["name"] in allowed and isinstance(call.get("arguments"), dict):
                calls.append({"id": f"toolu_kaggle_{i}_{secrets.token_hex(4)}", "name": call["name"], "input": call["arguments"]})
        except json.JSONDecodeError:
            pass
    return calls


def sse(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


def anthopic_events(body: dict[str, Any]):
    yield sse("message_start", {"type": "message_start", "message": {"usage": {"input_tokens": 0, "output_tokens": 0}}})
    raw = ""
    index = 0
    text_started = False
    for chunk in model_chunks(body):
        raw += chunk
        probe = raw.lstrip()
        # Hold known tool prefixes so the command never flashes as ordinary chat prose.
        if not text_started and (probe.startswith("<tool_call") or probe.startswith("```") or probe.startswith("jsonCopy")):
            continue
        if not text_started and probe:
            text_started = True
            yield sse("content_block_start", {"type": "content_block_start", "index": index, "content_block": {"type": "text", "text": ""}})
        if text_started:
            yield sse("content_block_delta", {"type": "content_block_delta", "index": index, "delta": {"type": "text_delta", "text": chunk}})

    calls = parse_calls(raw, body.get("tools", []))
    if text_started:
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


def port_is_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        return sock.connect_ex(("127.0.0.1", port)) == 0


if port_is_open(PORT):
    print(f"Reusing the existing MoreCode server on port {PORT}.")
else:
    threading.Thread(target=stop_when_idle, daemon=True).start()
    threading.Thread(
        target=lambda: __import__("uvicorn").run(APP, host="127.0.0.1", port=PORT, log_level="warning"),
        daemon=True,
    ).start()

# Cloudflare Quick Tunnel makes a random HTTPS URL for this one notebook session. It is still
# protected by TOKEN; never post either value publicly. A new notebook run creates both anew.
# A per-run filename avoids overwriting an active Cloudflare process when the cell is rerun.
tunnel_bin = f"/tmp/cloudflared-morecode-{secrets.token_hex(5)}"
subprocess.check_call(
    ["wget", "-q", "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64", "-O", tunnel_bin]
)
os.chmod(tunnel_bin, 0o755)
tunnel = subprocess.Popen([tunnel_bin, "tunnel", "--url", f"http://127.0.0.1:{PORT}"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
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
