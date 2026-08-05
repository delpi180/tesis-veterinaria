"""Listas fijas que el formulario necesita para no depender de lo que se teclee.

Viven en el backend y no en el frontend a propósito: el mismo catálogo que
llena el desplegable es el que usa la consolidación de vacunas para agrupar.
Si estuviera duplicado en los dos lados, al agregar una vacuna se agregaría en
uno y el seguimiento seguiría contándola aparte.
"""
from fastapi import APIRouter

from core.vacunas import CATALOGO_ANTIPARASITARIOS, CATALOGO_VACUNAS

router = APIRouter(prefix="/api/catalogos", tags=["Catálogos"])


@router.get("/vacunas")
def listar_vacunas():
    return CATALOGO_VACUNAS


@router.get("/antiparasitarios")
def listar_antiparasitarios():
    return CATALOGO_ANTIPARASITARIOS
