from pathlib import Path
from dotenv import load_dotenv
import os
from sqlalchemy import create_engine, text

load_dotenv(Path(__file__).resolve().parent / ".env")

url = os.getenv("DATABASE_URL")
print("URL leída:", url)

engine = create_engine(url)
with engine.connect() as conn:
    version = conn.execute(text("SELECT version();")).scalar()
    print("Conectado OK:", version)
