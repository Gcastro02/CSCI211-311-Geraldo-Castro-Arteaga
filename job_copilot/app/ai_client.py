import os
from pathlib import Path
from openai import OpenAI

def _read_key_from_dotenv(dotenv_path: Path) -> str | None:
    if not dotenv_path.exists():
        return None

    for raw_line in dotenv_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#"):
            continue

        if line.startswith("export "):
            line = line[len("export "):].strip()

        if "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()

        if key != "OPENAI_API_KEY":
            continue

        value = value.strip().strip('"').strip("'")
        return value or None

    return None


def _get_openai_api_key() -> str:
    api_key = os.environ.get("OPENAI_API_KEY")
    if api_key:
        return api_key

    project_root = Path(__file__).resolve().parents[1]
    dotenv_key = _read_key_from_dotenv(project_root / ".env")

    if dotenv_key:
        os.environ["OPENAI_API_KEY"] = dotenv_key
        return dotenv_key

    raise ValueError(
        "OPENAI_API_KEY is not set. Set it in your environment or in job_copilot/.env"
    )


api_key = _get_openai_api_key()

client = OpenAI(api_key=api_key)