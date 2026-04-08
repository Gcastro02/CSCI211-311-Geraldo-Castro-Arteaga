import os
from openai import OpenAI

api_key = os.environ.get("Sn3k")

if not api_key:
    raise ValueError("Sn3k is not set")

client = OpenAI(api_key=api_key)