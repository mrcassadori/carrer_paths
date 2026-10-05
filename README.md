# Career Paths

Plataforma para o time de Design e Produto registrar cargo, tempo de casa, projetos, cursos, idiomas e o mapa de skills (0 a 5), com validação pelo líder da prática.

Stack: React + Vite + TypeScript + Tailwind, Supabase (banco, login por link mágico, arquivos) e Vercel.

## Estado atual: marco 1 (cadastro mínimo)

- Entrada pelo link com e-mail corporativo; a etiqueta `?origem=` do link fica gravada no perfil.
- Sobre você: nome, gestor, cargo, descrição, datas de entrada na empresa e no cargo (tempo calculado), trilha e nível.
- Mapa de skills: 48 skills por categoria, nota de hoje e meta de 0 a 5, nota esperada para o nível, escala ao lado, salvamento automático.
- Idiomas e resumo do perfil com o checklist de cadastro completo.

## Configurar o Supabase (uma vez)

1. No SQL Editor, rode `supabase/migrations/0001_schema.sql` e depois `supabase/seed-catalogo.sql`.
2. Libere o domínio do e-mail da empresa e a prática atribuída no cadastro:
   ```sql
   insert into allowed_email_domains (domain, practice_id)
   select 'empresa.com', id from practices where name = 'Design & Produto';
   ```
3. Authentication > Hooks: ligue **Before User Created** apontando para `public.hook_before_user_created`.
4. Authentication > URL Configuration: coloque a URL da Vercel em Site URL e em Redirect URLs.
5. Antes de divulgar o link, peça para o líder e os gestores entrarem uma vez e defina os papéis (senão a lista de gestores do cadastro fica vazia):
   ```sql
   update profiles set app_role = 'admin' where email = 'lider@empresa.com';
   update profiles set app_role = 'gestor' where email in ('gestor1@empresa.com', 'gestor2@empresa.com');
   ```

## Rodar localmente

```bash
cp .env.example .env   # preencha URL e anon key (Project Settings > API)
npm install
npm run dev
```

## Vercel

Importe o repositório (framework Vite) e cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em Environment Variables. O `vercel.json` já manda todas as rotas para o app.

## Catálogo de skills

`catalogo/catalogo-skills.json` vem da frente de trilhas. Quando sair uma versão nova:

```bash
python3 scripts/gerar_seed.py > supabase/seed-catalogo.sql   # depois rode o arquivo no SQL Editor
```

## Testes do banco

`supabase/tests/` aplica o schema e o seed num Postgres 15+ local e roda 17 verificações de permissão e do fluxo de validação. Cada erro esperado aparece logo abaixo do teste correspondente:

```bash
PSQL="sudo -u postgres psql" bash supabase/tests/rodar.sh
```
