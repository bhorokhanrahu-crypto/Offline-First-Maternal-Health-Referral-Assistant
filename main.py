import logging
import os
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from groq import APIConnectionError, APIStatusError, APITimeoutError, AsyncGroq
from pydantic import BaseModel, ConfigDict, Field, model_validator


ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
load_dotenv(ROOT / ".env", override=False)
MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
RATE_WINDOW_SECONDS = 10 * 60
RATE_LIMIT = 20
requests_by_address: dict[str, list[float]] = {}
last_rate_limit_cleanup = 0.0
logger = logging.getLogger("maternal-referral")

with (ROOT / "model" / "assistant_instructions.txt").open(encoding="utf-8") as prompt_file:
    ASSISTANT_INSTRUCTIONS = prompt_file.read().strip()
OUT_OF_SCOPE_REPLIES = {
    "en": "I can only help with pregnancy, mother and child health, newborn care, or basic first aid. If someone needs urgent help, contact a health professional or go to the nearest emergency-capable facility now.",
    "ur": "میں صرف حمل، ماں اور بچے کی صحت، نومولود کی دیکھ بھال یا ابتدائی طبی امداد کے بارے میں مدد کر سکتا ہوں۔ فوری مدد درکار ہو تو ابھی صحت کے ماہر سے رابطہ کریں یا قریبی ہنگامی مرکز جائیں۔",
    "sd": "مان رڳو حمل، ماءُ ۽ ٻار جي صحت، نون ڄاول ٻار جي سنڀال يا پهرين امداد بابت مدد ڪري سگهان ٿو. تڪڙي مدد گهرجي ته هاڻي ئي صحت جي ماهر سان رابطو ڪريو يا ويجهي ايمرجنسي مرڪز وڃو.",
}
SUPPORTED_CHAT_TERMS = (
    "pregnancy", "pregnant", "pregnancies", "maternal", "mother", "mothers", "maternity", "postpartum",
    "post-partum", "antenatal", "prenatal", "labour", "labor", "delivery",
    "breastfeed", "breastfeeding", "newborn", "new-born", "infant", "baby",
    "babies", "child", "children", "toddler", "midwife", "miscarriage",
    "first aid", "bleeding", "bleed", "burn", "choking", "seizure", "faint",
    "fracture", "poison", "wound", "injury", "injured", "scald", "cpr",
    "fever", "breathing", "shortness of breath", "headache", "pain",
    "vomiting", "diarrhea", "diarrhoea", "allergic reaction", "broken bone",
)
SUPPORTED_NON_LATIN_TERMS = (
    "حمل", "حاملہ", "ماں", "ماؤں", "والدہ", "زچگی", "ولادت", "بچہ",
    "بچوں", "نومولود", "نوزائیدہ", "دودھ پلانا", "ابتدائی طبی امداد",
    "ابتدائی امداد", "حامله", "ماءُ",
    "ٻار", "ٻارڙو", "نون ڄاول", "نئون ڄاول", "کير پيارڻ", "پهرين امداد",
    "پهرين طبي امداد", "بخار", "ساھ", "ساهه", "رت وهڻ", "ساڙ", "زخم",
    "چوٽ", "بيهوشي", "دورو", "زهر",
)
CARE_PROVIDER_TERMS = (
    "doctor", "clinic", "hospital", "health professional",
    "ڈاکٹر", "ہسپتال", "ڊاڪٽر", "ڊاکٽر", "اسپتال",
    "صحت جي ماهر", "صحت کے ماہر",
)
CARE_DELAY_TERMS = (
    "late", "later", "delay", "delayed", "missed", "waiting", "waited",
    "postpone", "put off", "دیر", "تاخیر", "انتظار", "دير", "بعد میں",
    "پوءِ",
)
DOCTOR_ABBREVIATION_PATTERN = re.compile(r"\bdr\.?\b", re.IGNORECASE)
OUT_OF_SCOPE_TERMS = (
    "tell me a joke", "write code", "write a program", "build a website",
    "javascript", "python programming", "politics", "stock market", "weather",
    "football", "cryptocurrency", "solve this math", "homework",
)
SUPPORTED_CHAT_PATTERN = re.compile(
    r"\b(?:" + "|".join(re.escape(term) for term in SUPPORTED_CHAT_TERMS) + r")\b"
)


def is_supported_chat_question(question: str) -> bool:
    normalized = question.casefold()
    if any(term in normalized for term in OUT_OF_SCOPE_TERMS):
        return False
    has_care_provider = (
        any(term in normalized for term in CARE_PROVIDER_TERMS)
        or DOCTOR_ABBREVIATION_PATTERN.search(normalized) is not None
    )
    delayed_care_context = (
        has_care_provider
        and any(term in normalized for term in CARE_DELAY_TERMS)
    )
    return bool(
        SUPPORTED_CHAT_PATTERN.search(normalized)
        or any(term in normalized for term in SUPPORTED_NON_LATIN_TERMS)
        or delayed_care_context
    )


@asynccontextmanager
async def lifespan(application: FastAPI):
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    application.state.groq_client = AsyncGroq(api_key=api_key) if api_key else None
    try:
        yield
    finally:
        if application.state.groq_client:
            await application.state.groq_client.close()


app = FastAPI(title="Maternal Referral Assistant API", lifespan=lifespan)


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)

    @model_validator(mode="after")
    def check_content_length(self):
        max_length = 1500 if self.role == "user" else 4000
        if len(self.content.strip()) > max_length:
            raise ValueError("User messages are limited to 1500 characters and assistant messages to 4000.")
        if not self.content.strip():
            raise ValueError("Messages cannot be blank.")
        return self


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language: Literal["en", "ur", "sd"]
    messages: list[ChatMessage] = Field(min_length=1, max_length=12)

    @model_validator(mode="after")
    def require_user_question_last(self):
        if self.messages[-1].role != "user":
            raise ValueError("The last message must be a user question.")
        return self


def enforce_chat_rate_limit(address: str) -> None:
    global last_rate_limit_cleanup
    now = time.monotonic()
    if now - last_rate_limit_cleanup >= RATE_WINDOW_SECONDS:
        expired_addresses = [
            key for key, timestamps in requests_by_address.items()
            if not any(now - timestamp < RATE_WINDOW_SECONDS for timestamp in timestamps)
        ]
        for key in expired_addresses:
            requests_by_address.pop(key, None)
        last_rate_limit_cleanup = now

    recent = [
        timestamp for timestamp in requests_by_address.get(address, [])
        if now - timestamp < RATE_WINDOW_SECONDS
    ]
    if len(recent) >= RATE_LIMIT:
        requests_by_address[address] = recent
        raise HTTPException(status_code=429, detail="Chat request limit reached. Please wait before trying again.")
    recent.append(now)
    requests_by_address[address] = recent


@app.get("/api/chat/status")
async def chat_status(request: Request):
    return {
        "configured": request.app.state.groq_client is not None,
        "model": MODEL,
    }


@app.post("/api/chat")
async def chat(body: ChatRequest, request: Request):
    question = body.messages[-1].content
    if not is_supported_chat_question(question):
        return {"reply": OUT_OF_SCOPE_REPLIES[body.language], "code": "out_of_scope"}

    client = request.app.state.groq_client
    if client is None:
        raise HTTPException(status_code=503, detail="Online chat is not configured on this server.")

    address = request.client.host if request.client else "unknown"
    enforce_chat_rate_limit(address)
    language_name = {"en": "English", "ur": "Urdu", "sd": "Sindhi"}[body.language]
    messages = [
        {"role": "system", "content": ASSISTANT_INSTRUCTIONS + " Reply in " + language_name + "."}
    ]
    messages.extend(message.model_dump() for message in body.messages)

    try:
        completion = await client.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0.2,
            max_tokens=350,
        )
    except (APIConnectionError, APITimeoutError) as error:
        logger.warning("Groq connection failed (%s).", type(error).__name__)
        raise HTTPException(status_code=502, detail="The online AI service could not be reached. Please try again.") from error
    except APIStatusError as error:
        logger.warning("Groq returned HTTP %s.", error.status_code)
        if error.status_code == 401:
            code = "invalid_api_key"
        elif error.status_code in (400, 404):
            code = "model_unavailable"
        elif error.status_code == 429:
            code = "service_rate_limited"
        else:
            code = "upstream_error"
        raise HTTPException(
            status_code=502,
            detail={"code": code},
        ) from error

    reply = completion.choices[0].message.content if completion.choices else None
    if not isinstance(reply, str) or not reply.strip():
        raise HTTPException(status_code=502, detail="The online AI service returned an empty response.")
    return {"reply": reply.strip()}


app.mount("/", StaticFiles(directory=SRC, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", "8000")))
