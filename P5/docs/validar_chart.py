#!/usr/bin/env python3
"""Validador estatico del chart de Helm.

NO reemplaza a `helm lint` ni a `helm template`: no renderiza las
plantillas, solo las analiza como texto. Sirve para detectar antes de
instalar los errores mas frecuentes:

  1. Delimitadores {{ }} desbalanceados
  2. Bloques if/range/with sin su `end`
  3. `include` a plantillas nombradas que no existen
  4. Referencias a .Values.<clave> que no existen en values.yaml
  5. Subcharts que leen valores del padre fuera de `global` (no los ven)
  6. Objetos de Kubernetes sin los campos obligatorios
  7. Desfase entre values.yaml y values-dev/prod (rutas que ya no existen)
  8. Credenciales con aspecto de valor real en archivos versionados

Uso:  python3 docs/validar_chart.py charts/sa-platform
"""
from __future__ import annotations

import pathlib
import re
import sys

import yaml

CAMPOS_OBLIGATORIOS = {
    "Deployment": ["metadata", "spec"],
    "Service": ["metadata", "spec"],
    "ConfigMap": ["metadata"],
    "Secret": ["metadata"],
    "CronJob": ["metadata", "spec"],
    "Ingress": ["metadata", "spec"],
    "NetworkPolicy": ["metadata", "spec"],
    "HorizontalPodAutoscaler": ["metadata", "spec"],
    "PodDisruptionBudget": ["metadata", "spec"],
    "ServiceAccount": ["metadata"],
    "Role": ["metadata"],
    "RoleBinding": ["metadata", "roleRef"],
    "Namespace": ["metadata"],
    "ResourceQuota": ["metadata", "spec"],
    "LimitRange": ["metadata", "spec"],
}


class Reporte:
    def __init__(self) -> None:
        self.errores: list[str] = []
        self.avisos: list[str] = []

    def error(self, msg: str) -> None:
        self.errores.append(msg)

    def aviso(self, msg: str) -> None:
        self.avisos.append(msg)


def _rutas_de(datos, prefijo="") -> set[str]:
    """Devuelve todas las rutas tipo 'global.config.logLevel'."""
    rutas = set()
    if isinstance(datos, dict):
        for clave, valor in datos.items():
            ruta = f"{prefijo}.{clave}" if prefijo else str(clave)
            rutas.add(ruta)
            rutas |= _rutas_de(valor, ruta)
    return rutas


def validar(raiz: pathlib.Path, r: Reporte) -> None:
    # ---------- Cargar values ----------
    archivo_values = raiz / "values.yaml"
    if not archivo_values.exists():
        r.error("No existe values.yaml en el chart padre")
        return
    values = yaml.safe_load(archivo_values.read_text(encoding="utf-8")) or {}
    rutas_values = _rutas_de(values)

    # ---------- Plantillas nombradas disponibles ----------
    definidos: set[str] = set()
    for tpl in raiz.rglob("*.tpl"):
        definidos |= set(re.findall(r'define\s+"([^"]+)"', tpl.read_text(encoding="utf-8")))

    # Values propios de cada subchart: lo unico que ve, ademas de global
    rutas_subchart: dict[str, set[str]] = {}
    for sub in (raiz / "charts").glob("*/values.yaml"):
        datos_sub = yaml.safe_load(sub.read_text(encoding="utf-8")) or {}
        rutas_subchart[sub.parent.name] = _rutas_de(datos_sub)

    plantillas = sorted(raiz.rglob("templates/*.yaml"))
    if not plantillas:
        r.error("No se encontraron plantillas")
        return

    for f in plantillas:
        rel = f.relative_to(raiz)
        texto = f.read_text(encoding="utf-8")
        es_subchart = "charts/" in str(rel)

        # 1. Delimitadores
        if texto.count("{{") != texto.count("}}"):
            r.error(f"{rel}: delimitadores desbalanceados "
                    f"({texto.count('{{')} aperturas vs {texto.count('}}')} cierres)")

        # 2. Bloques sin end
        abre = len(re.findall(r"{{-?\s*(?:if|range|with)\b", texto))
        cierra = len(re.findall(r"{{-?\s*end\s*-?}}", texto))
        if abre != cierra:
            r.error(f"{rel}: {abre} bloques if/range/with pero {cierra} 'end'")

        # 3. Helpers inexistentes
        for nombre in re.findall(r'include\s+"([^"]+)"', texto):
            if nombre not in definidos:
                r.error(f"{rel}: include a plantilla inexistente '{nombre}'")

        # 4 y 5. Referencias a .Values
        # Referencias declaradas como opcionales: `.Values.X | default ...`
        opcionales = set(
            m.rstrip(".")
            for m in re.findall(r"\.Values\.([A-Za-z0-9_.]+)\s*\|\s*default", texto)
        )

        for ref in set(re.findall(r"\.Values\.([A-Za-z0-9_.]+)", texto)):
            ref = ref.rstrip(".")
            if ref in opcionales:
                # Sobreescritura opcional con respaldo: es intencional.
                continue
            if es_subchart:
                # Un subchart solo ve sus propios values y los de `global`.
                if ref.startswith("global."):
                    if ref not in rutas_values:
                        r.error(f"{rel}: usa .Values.{ref} pero no existe en values.yaml")
                else:
                    propios = rutas_subchart.get(f.parents[1].name, set())
                    if ref not in propios:
                        r.error(f"{rel}: usa .Values.{ref}, que el padre define fuera "
                                f"de 'global'. Un subchart NO puede verlo")
            else:
                if ref not in rutas_values and not ref.startswith("global."):
                    r.aviso(f"{rel}: .Values.{ref} no aparece en values.yaml "
                            f"(puede venir de --set)")

        # 6. Campos obligatorios por tipo de objeto
        for kind in re.findall(r"^kind:\s*(\w+)", texto, re.M):
            for campo in CAMPOS_OBLIGATORIOS.get(kind, []):
                if not re.search(rf"^{campo}:", texto, re.M):
                    r.aviso(f"{rel}: {kind} sin campo '{campo}' visible")

        # Indentacion: nindent con valor impar suele indicar un desfase
        for n in re.findall(r"nindent\s+(\d+)", texto):
            if int(n) % 2 != 0:
                r.aviso(f"{rel}: nindent {n} es impar, revise la indentacion")

    # ---------- 7. Desfase entre values base y por ambiente ----------
    for amb in raiz.glob("values-*.yaml"):
        if amb.name == "values.example.yaml":
            continue
        datos = yaml.safe_load(amb.read_text(encoding="utf-8")) or {}
        for clave in datos:
            if clave in values:
                continue
            if clave in values.get("global", {}):
                r.error(f"{amb.name}: '{clave}' esta en la raiz pero values.yaml "
                        f"lo define dentro de 'global' — nunca se aplicaria")
            else:
                r.aviso(f"{amb.name}: '{clave}' no existe en values.yaml")

    # ---------- 8. Credenciales con aspecto real ----------
    secretos = values.get("secrets", {})
    for clave, valor in secretos.items():
        texto_valor = str(valor or "")
        marcadores = ("CAMBIAR", "REEMPLAZAR", "EJEMPLO")
        if texto_valor and not any(m in texto_valor.upper() for m in marcadores):
            r.error(f"values.yaml: secrets.{clave} tiene un valor real. "
                    f"Las credenciales no deben versionarse")

    ejemplo = raiz / "values.example.yaml"
    if not ejemplo.exists():
        r.error("Falta values.example.yaml (lo exige el enunciado)")


def main() -> int:
    raiz = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "charts/sa-platform")
    if not raiz.exists():
        print(f"No existe la ruta {raiz}")
        return 2

    r = Reporte()
    validar(raiz, r)

    print(f"Chart analizado: {raiz}")
    print(f"Plantillas: {len(list(raiz.rglob('templates/*.yaml')))}\n")

    if r.errores:
        print(f"ERRORES ({len(r.errores)}):")
        for e in r.errores:
            print(f"  - {e}")
        print()
    if r.avisos:
        print(f"AVISOS ({len(r.avisos)}):")
        for a in r.avisos:
            print(f"  - {a}")
        print()
    if not r.errores and not r.avisos:
        print("Sin errores ni avisos.")

    print("Recuerde: esto NO sustituye a `helm lint` ni a `helm template`,")
    print("que son los unicos que detectan errores de renderizado real.")
    return 1 if r.errores else 0


if __name__ == "__main__":
    sys.exit(main())
