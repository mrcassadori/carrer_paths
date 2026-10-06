-- Meu currículo: o arquivo mais recente fica guardado e pode ser visto por quem já vê o perfil
-- (a própria pessoa, o gestor direto, o líder da prática e o admin). Só o dono envia ou apaga.
drop policy if exists resume_read on resume_imports;
create policy resume_read on resume_imports for select to authenticated
  using (can_view_profile(profile_id));

drop policy if exists resumes_viewer_read on storage.objects;
create policy resumes_viewer_read on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and can_view_profile(((storage.foldername(name))[1])::uuid));
