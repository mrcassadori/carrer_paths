import { NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { supabaseConfigured } from './lib/supabase'
import { hasBasics } from './lib/types'
import Adocao from './pages/Adocao'
import Entrar from './pages/Entrar'
import MapaSkills from './pages/MapaSkills'
import Onboarding from './pages/Onboarding'
import Perfil from './pages/Perfil'
import Pessoas from './pages/Pessoas'
import Projetos from './pages/Projetos'

function Layout() {
  const { session, profile, loading, signOut } = useAuth()
  const { pathname } = useLocation()
  if (loading) return <p className="p-8 text-apoio">Carregando…</p>
  if (!session) return <Navigate to="/entrar" replace />
  const link = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md font-card font-semibold text-sm ${isActive ? 'bg-white text-midnight' : 'text-white/90 hover:text-white'}`
  return (
    <div className="min-h-screen">
      <header className="bg-midnight text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-4">
          <span className="font-titulo font-extrabold text-xl mr-4">Career Paths</span>
          <nav className="flex gap-1 flex-wrap">
            <NavLink to="/" end className={link}>Meu perfil</NavLink>
            <NavLink to="/cadastro" className={link}>Sobre você</NavLink>
            <NavLink to="/skills" className={link}>Mapa de skills</NavLink>
            <NavLink to="/projetos" className={link}>Projetos</NavLink>
            {profile && profile.app_role !== 'colaborador' && <NavLink to="/adocao" className={link}>Adoção</NavLink>}
            {profile?.app_role === 'admin' && <NavLink to="/pessoas" className={link}>Pessoas</NavLink>}
          </nav>
          <button onClick={signOut} className="ml-auto text-sm text-white/80 hover:text-white">Sair</button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8">
        {profile && !hasBasics(profile) && pathname !== '/cadastro'
          ? <Navigate to="/cadastro" replace />
          : <Outlet />}
      </main>
    </div>
  )
}

export default function App() {
  const { session } = useAuth()
  if (!supabaseConfigured) {
    return <p className="p-8">Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (veja .env.example).</p>
  }
  return (
    <Routes>
      <Route path="/entrar" element={session ? <Navigate to="/" replace /> : <Entrar />} />
      <Route element={<Layout />}>
        <Route index element={<Perfil />} />
        <Route path="/cadastro" element={<Onboarding />} />
        <Route path="/skills" element={<MapaSkills />} />
        <Route path="/projetos" element={<Projetos />} />
        <Route path="/experiencia" element={<Navigate to="/projetos" replace />} />
        <Route path="/extras" element={<Navigate to="/#curriculo" replace />} />
        <Route path="/curriculo" element={<Navigate to="/#curriculo" replace />} />
        <Route path="/adocao" element={<Adocao />} />
        <Route path="/pessoas" element={<Pessoas />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
