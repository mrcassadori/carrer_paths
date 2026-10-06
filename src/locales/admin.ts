import type { Dict } from '.'

export default {
  // Adoção
  'Contas criadas': { en: 'Accounts created', es: 'Cuentas creadas' },
  'Começaram o cadastro': { en: 'Started their profile', es: 'Comenzaron el registro' },
  'Cadastros completos': { en: 'Completed profiles', es: 'Registros completos' },
  'Mapas enviados ao líder': { en: 'Maps sent to the lead', es: 'Mapas enviados al líder' },
  'Leitura de currículo': { en: 'Résumé reading', es: 'Lectura de currículum' },
  'Análise do perfil': { en: 'Profile analysis', es: 'Análisis del perfil' },
  'Números agregados do time. Ninguém aparece por nome aqui.': {
    en: 'Aggregate team numbers. No one is shown by name here.',
    es: 'Números agregados del equipo. Nadie aparece por nombre aquí.',
  },
  'Meta: {meta} cadastros completos de {total} pessoas': {
    en: 'Goal: {meta} completed profiles out of {total} people',
    es: 'Meta: {meta} registros completos de {total} personas',
  },
  'de {n}': { en: 'of {n}', es: 'de {n}' },
  'Gasto com IA': { en: 'AI spend', es: 'Gasto en IA' },
  'Tokens usados na leitura de currículo e na análise do perfil. O custo é uma estimativa em dólar pelo preço de tabela do modelo; a fatura oficial fica no console da Anthropic.': {
    en: 'Tokens used for résumé reading and profile analysis. The cost is a US dollar estimate based on the model\'s list price; the official invoice is in the Anthropic console.',
    es: 'Tokens usados en la lectura de currículum y en el análisis del perfil. El costo es una estimación en dólares según el precio de lista del modelo; la factura oficial está en la consola de Anthropic.',
  },
  'Custo no mês': { en: 'Cost this month', es: 'Costo del mes' },
  'Tokens no mês': { en: 'Tokens this month', es: 'Tokens del mes' },
  'Chamadas no mês': { en: 'Calls this month', es: 'Llamadas del mes' },
  'Custo desde o início': { en: 'Cost since launch', es: 'Costo desde el inicio' },
  'Uso': { en: 'Use', es: 'Uso' },
  'Desde o início': { en: 'Since launch', es: 'Desde el inicio' },
  'Por origem do link': { en: 'By link source', es: 'Por origen del enlace' },
  'Vem do {param} no link divulgado. Quem entrou sem etiqueta aparece como "{direto}".': {
    en: 'Comes from {param} in the shared link. People who joined without a tag show up as "{direto}".',
    es: 'Viene del {param} en el enlace compartido. Quien entró sin etiqueta aparece como "{direto}".',
  },
  'direto': { en: 'direct', es: 'directo' },
  'Origem': { en: 'Source', es: 'Origen' },
  'Contas': { en: 'Accounts', es: 'Cuentas' },
  'Completos': { en: 'Complete', es: 'Completos' },
  'Por gestor': { en: 'By manager', es: 'Por gestor' },
  'Quantas pessoas apontaram cada gestor. Ajuda a saber em qual time reforçar a divulgação.': {
    en: 'How many people named each manager. Helps you see which team needs more outreach.',
    es: 'Cuántas personas indicaron a cada gestor. Ayuda a saber en qué equipo reforzar la difusión.',
  },
  'Gestor': { en: 'Manager', es: 'Gestor' },
  'Sem nome': { en: 'No name', es: 'Sin nombre' },
  'Sem gestor informado': { en: 'No manager given', es: 'Sin gestor indicado' },

  // Pessoas
  'Colaborador': { en: 'Employee', es: 'Colaborador' },
  'Especialista': { en: 'Specialist', es: 'Especialista' },
  'Líder da prática': { en: 'Practice lead', es: 'Líder de práctica' },
  'Admin': { en: 'Admin', es: 'Admin' },
  '{name} agora é {role}.': { en: '{name} is now {role}.', es: '{name} ahora es {role}.' },
  'Esta tela é só para admin.': { en: 'This page is for admins only.', es: 'Esta pantalla es solo para admin.' },
  'Quem já criou conta. Torne gestor quem deve aparecer na lista de gestores do cadastro, e líder da prática quem vai validar as notas.': {
    en: 'Everyone who has created an account. Make someone a manager if they should appear in the sign-up manager list, and a practice lead if they will validate scores.',
    es: 'Quienes ya crearon una cuenta. Haz gestor a quien deba aparecer en la lista de gestores del registro, y líder de práctica a quien validará las notas.',
  },
  'Buscar por nome ou e-mail': { en: 'Search by name or email', es: 'Buscar por nombre o correo' },
  '{n} contas': { en: '{n} accounts', es: '{n} cuentas' },
  'Pessoa': { en: 'Person', es: 'Persona' },
  'Cargo · trilha · nível': { en: 'Role · track · level', es: 'Cargo · trayectoria · nivel' },
  'Cadastro': { en: 'Profile', es: 'Registro' },
  'Papel': { en: 'Access role', es: 'Rol' },
  'Completo': { en: 'Complete', es: 'Completo' },
  'Skills {a}/{b}': { en: 'Skills {a}/{b}', es: 'Skills {a}/{b}' },
  'Você não pode mudar o próprio papel': { en: 'You can\'t change your own role', es: 'No puedes cambiar tu propio rol' },
} satisfies Dict
