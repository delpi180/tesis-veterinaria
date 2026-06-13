"""Hashing de contraseñas (PBKDF2, stdlib) y tokens firmados con HMAC."""
import base64
import hashlib
import hmac
import os
import time

from core.config import settings

_PBKDF2_ITER = 200_000


# ── Contraseñas ──────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Devuelve 'pbkdf2_sha256$iter$salt_hex$hash_hex'."""
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ITER)
    return f"pbkdf2_sha256${_PBKDF2_ITER}${salt.hex()}${dk.hex()}"


def verify_password(password: str, almacenado: str) -> bool:
    try:
        algo, iteraciones, salt_hex, hash_hex = almacenado.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(iteraciones)
        )
        return hmac.compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False


# ── Tokens ───────────────────────────────────────────────────────────────────

def _firmar(data: str) -> str:
    return hmac.new(settings.auth_secret.encode(), data.encode(), hashlib.sha256).hexdigest()


def crear_token(usuario: str, rol: str = "veterinario") -> str:
    expira = int(time.time()) + settings.auth_token_horas * 3600
    data = f"{usuario}|{rol}|{expira}"
    payload = base64.urlsafe_b64encode(data.encode()).decode()
    return f"{payload}.{_firmar(data)}"


def verificar_token(token: str) -> dict | None:
    """Devuelve {'usuario', 'rol'} si el token es válido y no expiró; None en caso contrario."""
    try:
        payload, firma = token.rsplit(".", 1)
        data = base64.urlsafe_b64decode(payload.encode()).decode()
        if not hmac.compare_digest(_firmar(data), firma):
            return None
        usuario, rol, expira = data.split("|")
        if int(expira) < time.time():
            return None
        return {"usuario": usuario, "rol": rol}
    except Exception:
        return None
