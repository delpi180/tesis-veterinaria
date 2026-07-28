"""Tests del módulo de estadística inferencial (Tier 1 de tesis)."""
import pytest

from services import estadistica as E


# ── Distribución t: validada contra valores de tabla ─────────────────────────

def test_t_distribution_contra_tabla():
    # p a dos colas conocidos de la tabla t
    assert E.t_sf_two_tailed(2.228, 10) == pytest.approx(0.05, abs=0.002)
    assert E.t_sf_two_tailed(3.169, 10) == pytest.approx(0.01, abs=0.002)
    assert E.t_sf_two_tailed(2.0, 10) == pytest.approx(0.0734, abs=0.002)


def test_descriptivos():
    d = E.descriptivos([70, 75, 80, 85, 90])
    assert d["n"] == 5
    assert d["media"] == 80.0
    assert d["mediana"] == 80.0
    assert d["sd"] == pytest.approx(7.91, abs=0.05)
    # IC 95% simétrico alrededor de la media
    assert d["ic95_low"] < 80 < d["ic95_high"]


def test_descriptivos_casos_borde():
    assert E.descriptivos([])["n"] == 0
    uno = E.descriptivos([42])
    assert uno["n"] == 1 and uno["sd"] is None and uno["ic95_low"] is None


def test_cronbach_alpha():
    rows = [[3, 4, 3, 4], [4, 5, 4, 5], [2, 3, 2, 3], [5, 5, 5, 4], [3, 3, 4, 3]]
    a = E.cronbach_alpha(rows)
    assert 0 < a <= 1
    assert E.interpretar_alpha(0.85) == "Bueno"
    assert E.interpretar_alpha(0.5) == "Pobre"
    # menos de 2 evaluadores → None
    assert E.cronbach_alpha([[1, 2, 3]]) is None


def test_t_test_welch():
    r = E.t_test_welch([300, 280, 310, 295, 290], [90, 120, 80, 100, 95])
    assert r["significativo"] is True
    assert r["p"] < 0.001
    assert r["efecto"] == "grande"
    # grupos sin variación suficiente → None
    assert E.t_test_welch([1], [2]) is None


# ── Endpoint integrado ───────────────────────────────────────────────────────

def test_endpoint_estadisticas(client, admin):
    # Usa los fixtures de conftest (usuario qa creado directo en la BD) en vez de
    # credenciales hardcodeadas, para que pase igual en local y en CI.
    r = client.get("/api/encuestas/estadisticas", headers=admin)
    assert r.status_code == 200
    d = r.json()
    assert "sus" in d and "tam" in d
    assert "alpha" in d["sus"]
    assert "interpretacion" in d["sus"]
    assert "alpha_global" in d["tam"]
    assert "muestra_suficiente" in d
