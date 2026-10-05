"""Gera seed-catalogo.sql a partir de trilhas/catalogo-skills.json.

Uso: python3 gerar_seed.py [caminho/do/catalogo.json] > seed-catalogo.sql
Idempotente: pode rodar de novo sempre que a frente de trilhas publicar uma versão nova.
"""
import json
import re
import sys
from pathlib import Path

PRACTICE = "Design & Produto"
SOFT_CATEGORY = ("soft-skills", "Soft skills")
CYCLE = ("2026.2 (linha de base)", "2026-10-05", "2027-03-31")


def q(v):
    if v is None:
        return "null"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def values(rows):
    return ",\n".join("  (" + ", ".join(q(c) for c in r) + ")" for r in rows)


def main():
    default = Path(__file__).resolve().parent.parent / "catalogo" / "catalogo-skills.json"
    cat = json.loads(Path(sys.argv[1] if len(sys.argv) > 1 else default).read_text())
    out = [f"-- Gerado por gerar_seed.py a partir do catálogo versão {cat['versao']} ({cat['data']}).",
           "begin;", "",
           f"insert into practices (name) values ({q(PRACTICE)}) on conflict (name) do nothing;", ""]

    out += ["insert into scale_levels (score, label, description, min_evidence) values",
            values([(e["nota"], e["rotulo"], e["descricao"], e.get("evidencia_minima")) for e in cat["escala"]]),
            "on conflict (score) do update set label = excluded.label, description = excluded.description,",
            "  min_evidence = excluded.min_evidence;", ""]

    out += ["insert into career_tracks (slug, practice_id, name, description)",
            "select v.slug, p.id, v.name, v.description from practices p, (values",
            values([(t["id"], t["nome"], t["descricao"]) for t in cat["trilhas"]]),
            ") as v(slug, name, description)",
            f"where p.name = {q(PRACTICE)}",
            "on conflict (slug) do update set name = excluded.name, description = excluded.description;", ""]

    levels = [(n["id"], n["nome"], int(re.search(r"\d", n["id"]).group()), n["descricao"],
               n.get("tempo_minimo_meses_no_nivel_anterior"), n.get("regra_extra")) for n in cat["niveis"]]
    out += ["insert into career_levels (code, name, rank, description, min_months_previous, extra_rule) values",
            values(levels),
            "on conflict (code) do update set name = excluded.name, rank = excluded.rank,",
            "  description = excluded.description, min_months_previous = excluded.min_months_previous,",
            "  extra_rule = excluded.extra_rule;", ""]

    cats = [(c["id"], c["nome"], "hard", i + 1) for i, c in enumerate(cat["categorias"])]
    cats.append((SOFT_CATEGORY[0], SOFT_CATEGORY[1], "soft", len(cats) + 1))
    out += ["insert into skill_categories (slug, name, kind, sort_order) values",
            values(cats),
            "on conflict (slug) do update set name = excluded.name, kind = excluded.kind,",
            "  sort_order = excluded.sort_order;", ""]

    skills = [(h["id"], h["categoria"], h["nome"], h["descricao"], h.get("origem"), i + 1)
              for i, h in enumerate(cat["hard_skills"])]
    skills += [(s["id"], SOFT_CATEGORY[0], s["nome"], s["descricao"], "trilhas", i + 1)
               for i, s in enumerate(cat["soft_skills"])]
    out += ["insert into skills (slug, category_id, name, description, origin, sort_order)",
            "select v.slug, c.id, v.name, v.description, v.origin, v.ord from (values",
            values(skills),
            ") as v(slug, category, name, description, origin, ord)",
            "join skill_categories c on c.slug = v.category",
            "on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,",
            "  description = excluded.description, origin = excluded.origin, sort_order = excluded.sort_order;", ""]

    # Skills que saíram do catálogo ficam inativas (histórico de avaliações é preservado)
    all_slugs = ", ".join(q(s[0]) for s in skills)
    out += [f"update skills set active = (slug in ({all_slugs}));", ""]

    weights = [(t, h["id"], w) for h in cat["hard_skills"] for t, w in h["peso_por_trilha"].items()]
    out += ["delete from skill_track_weights;",
            "insert into skill_track_weights (track_id, skill_id, weight)",
            "select t.id, s.id, v.weight::skill_weight from (values", values(weights), ") as v(track, skill, weight)",
            "join career_tracks t on t.slug = v.track join skills s on s.slug = v.skill;", ""]

    table = cat["nota_esperada_por_peso_e_nivel"]
    exp = [(t, lvl, h["id"], table[w][lvl])
           for h in cat["hard_skills"] for t, w in h["peso_por_trilha"].items() for lvl in table[w]]
    exp += [(t["id"], lvl, s["id"], nota)
            for s in cat["soft_skills"] for t in cat["trilhas"] for lvl, nota in s["nota_esperada_por_nivel"].items()]
    out += ["delete from skill_expectations;",
            "insert into skill_expectations (track_id, level_id, skill_id, expected_level)",
            "select t.id, l.id, s.id, v.expected from (values", values(exp), ") as v(track, level, skill, expected)",
            "join career_tracks t on t.slug = v.track join career_levels l on l.code = v.level",
            "join skills s on s.slug = v.skill;", ""]

    # Primeiro ciclo = linha de base das 30 pessoas de outubro (não gera promoção)
    out += ["insert into review_cycles (name, starts_on, ends_on, catalog_version, is_current, is_baseline)",
            f"select {q(CYCLE[0])}, {q(CYCLE[1])}, {q(CYCLE[2])}, {q(cat['versao'])}, true, true",
            "where not exists (select 1 from review_cycles);", "", "commit;", ""]
    print("\n".join(out))


if __name__ == "__main__":
    main()
